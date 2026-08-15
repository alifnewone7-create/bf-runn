"""Unit tests for the server-side Binance Pay verification.

Mocks the Binance /sapi/v1/pay/transactions response — no network, no DB.
Run: python3 /app/tests/test_binance_pay.py
"""
import asyncio
import os
import sys
from decimal import Decimal

sys.path.insert(0, '/app/backend')
os.environ.setdefault('BINANCE_API_KEY', 'k')
os.environ.setdefault('BINANCE_API_SECRET', 's')
os.environ.setdefault('BFG_BINANCE_ID', '728424294')
os.environ.setdefault('BFG_BINANCE_NAME', 'Binary Fund Global')

import binance_pay  # noqa: E402


def row(**over):
    base = {
        "orderType": "C2C",
        "transactionId": "264928374018273645",
        "transactionTime": 1755100000000,
        "amount": "25",
        "currency": "USDT",
        "walletType": 1,
        "payerInfo": {"name": "Rahim Uddin", "binanceId": "512345678", "accountId": "512345678"},
        "receiverInfo": {"name": "Binary Fund Global", "binanceId": "728424294"},
    }
    base.update(over)
    return base


async def run_case(label, rows, order_id, amount, expect_ok, expect_msg=""):
    binance_pay._fetch_transactions = lambda: _rows(rows)  # noqa: SLF001
    try:
        info = await binance_pay.verify_payment(order_id, amount)
        ok, msg = True, ""
    except binance_pay.PaymentError as e:
        ok, msg, info = False, str(e), None
    good = ok == expect_ok and (not expect_msg or expect_msg.lower() in msg.lower())
    print(f"{'PASS' if good else 'FAIL'} — {label}: ok={ok} msg={msg[:80]}")
    if good and ok:
        print(f"        payer={info['payer_binance_id']} name={info['payer_name']} amount={info['amount']}")
    return good


async def _rows(rows):
    return rows


async def main():
    results = []
    results.append(await run_case("valid $25 C2C USDT payment", [row()], "264928374018273645", Decimal("25"), True))
    results.append(await run_case("unknown order id", [row()], "999999999999", Decimal("25"), False, "not found"))
    results.append(await run_case("wrong amount", [row(amount="20")], "264928374018273645", Decimal("25"), False, "Amount mismatch"))
    results.append(await run_case("wrong currency", [row(currency="BUSD")], "264928374018273645", Decimal("25"), False, "must be in USDT"))
    results.append(await run_case("not C2C", [row(orderType="PAY")], "264928374018273645", Decimal("25"), False, "C2C"))
    results.append(await run_case("outgoing (negative amount)", [row(amount="-25")], "264928374018273645", Decimal("25"), False, "outgoing"))
    results.append(await run_case(
        "receiver is someone else",
        [row(receiverInfo={"name": "Other", "binanceId": "111111111"})],
        "264928374018273645", Decimal("25"), False, "not sent to"))
    results.append(await run_case(
        "matches on orderId field instead of transactionId",
        [row(transactionId="abc", orderId="264928374018273645")],
        "264928374018273645", Decimal("25"), True))
    results.append(await run_case(
        "amount with decimals still matches", [row(amount="25.00")],
        "264928374018273645", Decimal("25"), True))
    results.append(await run_case(
        "premium $80 plan", [row(amount="80")], "264928374018273645", Decimal("80"), True))

    print(f"\nlookback window hours = {binance_pay.LOOKBACK_MS / 3600000}")
    ok = all(results) and binance_pay.LOOKBACK_MS == 24 * 3600 * 1000
    print("RESULT:", "ALL PASS" if ok else "FAILURES PRESENT")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
