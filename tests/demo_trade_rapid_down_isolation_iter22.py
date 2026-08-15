"""
Isolated DOWN rapid-click check for the /demo-trade button-clickability bug.

This companion test removes cross-sequence noise by registering a fresh demo user,
installing the same 1.4s POST /api/trade/place delay, then immediately clicking
DOWN 5 times and measuring request count, chart badge delta, and balance updates.
"""

import re
import time


def parse_money(text):
    match = re.search(r"-?[0-9][0-9,]*(?:\.\d+)?", text or "")
    return float(match.group(0).replace(",", "")) if match else None


async def run(page):
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.goto("https://bg-vps-ready.preview.emergentagent.com/registration")
    await page.evaluate("localStorage.clear()")
    await page.reload()
    await page.wait_for_load_state("domcontentloaded")

    email = f"bfgtest.qa{int(time.time() * 1000)}@mailinator.com"
    await page.get_by_test_id("register-country-input").fill("Bangladesh")
    await page.wait_for_timeout(200)
    await page.get_by_test_id("country-option-bangladesh").click(force=True)
    await page.get_by_test_id("register-email-input").fill(email)
    await page.get_by_test_id("register-password-input").fill("StrongPass123!")
    await page.get_by_test_id("register-terms-checkbox").check(force=True)
    await page.get_by_test_id("register-submit-button").click()
    await page.wait_for_url("**/demo-trade", timeout=30000)

    await page.wait_for_selector('[data-testid="trade-lower-button"]', state="visible", timeout=30000)
    await page.wait_for_function(
        """() => {
            const el = document.querySelector('[data-testid="balance-value"]');
            return el && !el.textContent.includes('—');
        }""",
        timeout=30000,
    )

    trade_requests = []

    async def delayed_trade_route(route):
        req = route.request
        if req.method == "POST" and "/api/trade/place" in req.url:
            trade_requests.append({"url": req.url, "body": req.post_data or "", "t": time.time()})
            await page.wait_for_timeout(1400)
        await route.continue_()

    await page.route("**/api/trade/place", delayed_trade_route)

    lower = page.locator('[data-testid="trade-lower-button"]').first

    async def balance_value():
        return parse_money(await page.get_by_test_id("balance-value").inner_text())

    async def badge_count():
        return await page.locator('[data-testid^="trade-badge-"]').count()

    box = await lower.bounding_box()
    if not box:
        raise RuntimeError("No bounding box for DOWN button")
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2

    balance_before = await balance_value()
    badges_before = await badge_count()
    balances_after_each_click = []
    for _ in range(5):
        await page.mouse.click(x, y)
        await page.wait_for_timeout(60)
        balances_after_each_click.append(await balance_value())
        await page.wait_for_timeout(20)
    await page.wait_for_timeout(250)

    return {
        "email": email,
        "balance_before": balance_before,
        "balances_after_each_click": balances_after_each_click,
        "down_rapid_requests": len(trade_requests),
        "down_rapid_badge_delta": await badge_count() - badges_before,
    }