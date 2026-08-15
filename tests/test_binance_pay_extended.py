"""Extended edge cases for Binance Pay verification.

Adds gaps flagged during code review:
  * amount 25.5 vs expected 25 must fail (Amount mismatch)
  * empty transaction list must fail (not found)
  * missing receiverInfo but our env is set → must PASS (nothing to compare against)
  * API returns non-200 → must fail with the safe reachability message
  * whitespace / non-digit input at verify_payment level (route already strips)
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
        "transactionId": "T1",
        "transactionTime": 1755100000000,
        "amount": "25",
        "currency": "USDT",
        "payerInfo": {"name": "P", "binanceId": "1"},
        "receiverInfo": {"name": "Binary Fund Global", "binanceId": "728424294"},
    }
    base.update(over)
    return base


async def _wrap(rows):
    return rows


async def case(label, rows, order_id, amt, expect_ok, expect_msg=""):
    async def fake_fetch():
        if isinstance(rows, Exception):
            raise rows
        return rows
    binance_pay._fetch_transactions = fake_fetch
    try:
        info = await binance_pay.verify_payment(order_id, amt)
        ok, msg = True, ""
    except binance_pay.PaymentError as e:
        ok, msg, info = False, str(e), None
    good = ok == expect_ok and (not expect_msg or expect_msg.lower() in msg.lower())
    print(f"{'PASS' if good else 'FAIL'} — {label}: ok={ok} msg={msg[:90]}")
    return good


async def main():
    results = []
    # 25.5 vs 25 must fail (0.01 quantized comparison)
    results.append(await case("25.5 vs 25 mismatch", [row(amount="25.5")], "T1", Decimal("25"), False, "Amount mismatch"))
    # empty tx list
    results.append(await case("empty list -> not found", [], "T1", Decimal("25"), False, "not found"))
    # missing receiverInfo → still accepts (we only reject when receiver present and different)
    results.append(await case(
        "missing receiverInfo passes",
        [row(receiverInfo=None)], "T1", Decimal("25"), True))
    # API error propagates as PaymentError
    results.append(await case(
        "binance api down",
        binance_pay.PaymentError("Could not reach Binance right now. Try again in a moment."),
        "T1", Decimal("25"), False, "Could not reach Binance"))
    # 25.00 quantization already covered; also test 24.99 must fail
    results.append(await case("24.99 mismatch", [row(amount="24.99")], "T1", Decimal("25"), False, "Amount mismatch"))
    # Order id matching should ignore leading/trailing whitespace on input
    results.append(await case("id with leading space", [row()], "  T1  ", Decimal("25"), True))

    ok = all(results)
    print("RESULT:", "ALL PASS" if ok else "FAILURES PRESENT")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
