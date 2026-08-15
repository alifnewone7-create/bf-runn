"""Binance Pay verification — server side only.

Looks up a C2C Pay transaction by the Order ID the buyer pasted and validates it
against the expected challenge price. Nothing is trusted from the client except
the order id itself.

Env (backend/.env):
    BINANCE_API_KEY / BINANCE_API_SECRET   keys of the RECEIVING Binance account
    BFG_BINANCE_ID                         our Binance Pay ID (receiver)
    BFG_BINANCE_NAME                       our Binance account name
"""
import hashlib
import hmac
import logging
import os
import time
from decimal import Decimal
from urllib.parse import urlencode

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://api.binance.com"
# Only the last 24 hours of Pay history are considered.
LOOKBACK_MS = 24 * 60 * 60 * 1000
REQUIRED_CURRENCY = "USDT"
REQUIRED_ORDER_TYPE = "C2C"


class PaymentError(Exception):
    """Verification failed — the message is safe to show to the buyer."""


def receiver_id() -> str:
    return (os.environ.get("BFG_BINANCE_ID") or "").strip()


def receiver_name() -> str:
    return (os.environ.get("BFG_BINANCE_NAME") or "Binary Fund Global").strip()


def _sign(params: dict, secret: str) -> str:
    return hmac.new(secret.encode(), urlencode(params).encode(), hashlib.sha256).hexdigest()


async def _fetch_transactions() -> list:
    key = os.environ.get("BINANCE_API_KEY")
    secret = os.environ.get("BINANCE_API_SECRET")
    if not key or not secret:
        raise PaymentError("Payment verification is not configured. Contact support.")

    now_ms = int(time.time() * 1000)
    params = {
        "timestamp": now_ms,
        "startTime": now_ms - LOOKBACK_MS,
        "endTime": now_ms,
        "limit": 100,
    }
    params["signature"] = _sign(params, secret)
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(
                f"{BASE_URL}/sapi/v1/pay/transactions",
                params=params,
                headers={"X-MBX-APIKEY": key},
            )
        data = r.json()
    except Exception as e:  # noqa: BLE001 — network/parse
        logger.error(f"binance pay fetch failed: {e}")
        raise PaymentError("Could not reach Binance right now. Try again in a moment.")

    if r.status_code != 200 or not isinstance(data, dict) or data.get("data") is None:
        logger.error(f"binance pay error status={r.status_code} body={str(data)[:400]}")
        raise PaymentError("Could not read the Binance payment history. Try again shortly.")
    return data.get("data") or []


def _ids(row: dict) -> set:
    """Every identifier a buyer could copy out of the Binance app for this row."""
    out = set()
    for k in ("transactionId", "orderId", "payerId", "id", "transactionOrderId"):
        v = row.get(k)
        if v not in (None, ""):
            out.add(str(v).strip())
    return out


def _info(row: dict, key: str) -> dict:
    v = row.get(key)
    return v if isinstance(v, dict) else {}


def _party_id(info: dict) -> str:
    for k in ("binanceId", "accountId", "payerAccountId", "userId", "id"):
        v = info.get(k)
        if v not in (None, ""):
            return str(v).strip()
    return ""


def _party_name(info: dict) -> str:
    for k in ("name", "nickName", "firstName", "unifiedAccountName"):
        v = info.get(k)
        if v:
            return str(v).strip()
    return ""


async def verify_payment(order_id: str, expected_amount: Decimal) -> dict:
    """Validate one Pay transaction. Raises PaymentError with a buyer-safe message."""
    order_id = str(order_id).strip()
    rows = await _fetch_transactions()

    row = next((t for t in rows if order_id in _ids(t)), None)
    if row is None:
        raise PaymentError(
            "This Order ID was not found in the last 24 hours of payments. "
            "Make sure the payment is complete and the ID is correct."
        )

    order_type = str(row.get("orderType") or "").upper()
    if order_type != REQUIRED_ORDER_TYPE:
        raise PaymentError(f"Only Binance Pay C2C transfers are accepted (this one is {order_type or 'unknown'}).")

    currency = str(row.get("currency") or "").upper()
    if currency != REQUIRED_CURRENCY:
        raise PaymentError(f"Payment must be in {REQUIRED_CURRENCY} (received {currency or 'unknown'}).")

    try:
        amount = Decimal(str(row.get("amount")))
    except Exception:  # noqa: BLE001
        raise PaymentError("Could not read the payment amount. Contact support.")
    if amount <= 0:
        raise PaymentError("This Order ID belongs to an outgoing payment, not a payment to us.")
    if amount.quantize(Decimal("0.01")) != Decimal(str(expected_amount)).quantize(Decimal("0.01")):
        raise PaymentError(f"Amount mismatch — this challenge costs exactly {expected_amount} USDT, you sent {amount}.")

    payer = _info(row, "payerInfo")
    receiver = _info(row, "receiverInfo")
    got_receiver = _party_id(receiver)
    ours = receiver_id()
    if ours and got_receiver and got_receiver != ours:
        raise PaymentError("This payment was not sent to the Binary Fund Global Binance account.")

    return {
        "order_id": order_id,
        "amount": amount,
        "currency": currency,
        "order_type": order_type,
        "transaction_time": row.get("transactionTime"),
        "payer_binance_id": _party_id(payer),
        "payer_name": _party_name(payer),
        "receiver_binance_id": got_receiver or ours,
        "receiver_name": _party_name(receiver) or receiver_name(),
        "raw": row,
    }
