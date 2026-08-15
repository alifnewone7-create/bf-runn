"""
Focused Playwright verification for the /demo-trade rapid-click bug (iteration 22).

Manual runner notes:
- Use https://bg-vps-ready.preview.emergentagent.com/registration as the browser origin.
- The test registers a fresh demo user, delays POST /api/trade/place by 1.4s,
  then verifies UP/DOWN are never disabled, rapid-clicks create 5 requests and
  5 chart badges, and the header balance debits optimistically after each click.
"""

import re
import time


def parse_money(text):
    match = re.search(r"-?[0-9][0-9,]*(?:\.\d+)?", text or "")
    return float(match.group(0).replace(",", "")) if match else None


async def run(page):
    """Run inside an async Playwright context with an existing page object."""
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.goto("https://bg-vps-ready.preview.emergentagent.com/registration")
    await page.evaluate("localStorage.clear()")
    await page.reload()
    await page.wait_for_load_state("domcontentloaded")

    email = f"bfgtest.qa{int(time.time() * 1000)}@mailinator.com"
    password = "StrongPass123!"

    await page.get_by_test_id("register-country-input").fill("Bangladesh")
    await page.wait_for_timeout(200)
    await page.get_by_test_id("country-option-bangladesh").click(force=True)
    await page.get_by_test_id("register-email-input").fill(email)
    await page.get_by_test_id("register-password-input").fill(password)
    await page.get_by_test_id("register-terms-checkbox").check(force=True)
    await page.get_by_test_id("register-submit-button").click()
    await page.wait_for_url("**/demo-trade", timeout=30000)

    await page.wait_for_selector('[data-testid="trade-higher-button"]', state="visible", timeout=30000)
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

    higher = page.locator('[data-testid="trade-higher-button"]').first
    lower = page.locator('[data-testid="trade-lower-button"]').first

    async def disabled_samples(locator, duration_ms=2000, interval_ms=25):
        samples = []
        start = time.monotonic()
        while (time.monotonic() - start) * 1000 < duration_ms:
            samples.append(await locator.evaluate("el => ({disabled: el.disabled, attr: el.hasAttribute('disabled')})"))
            await page.wait_for_timeout(interval_ms)
        return samples

    async def balance_value():
        return parse_money(await page.get_by_test_id("balance-value").inner_text())

    async def badge_count():
        return await page.locator('[data-testid^="trade-badge-"]').count()

    async def click_center(locator):
        box = await locator.bounding_box()
        if not box:
            raise RuntimeError("No bounding box for trade button")
        await page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)

    initial_balance = await balance_value()

    await higher.click()
    await page.wait_for_timeout(60)
    balance_after_single_up = await balance_value()
    up_samples = await disabled_samples(higher)
    await page.wait_for_timeout(500)

    await lower.click()
    await page.wait_for_timeout(60)
    balance_after_single_down = await balance_value()
    down_samples = await disabled_samples(lower)
    await page.wait_for_timeout(500)

    up_req_before = len(trade_requests)
    up_badges_before = await badge_count()
    up_balances_after_each_click = []
    for _ in range(5):
        await click_center(higher)
        await page.wait_for_timeout(60)
        up_balances_after_each_click.append(await balance_value())
        await page.wait_for_timeout(20)
    await page.wait_for_timeout(250)
    up_req_delta = len(trade_requests) - up_req_before
    up_badge_delta = await badge_count() - up_badges_before
    await page.wait_for_timeout(1800)

    down_req_before = len(trade_requests)
    down_badges_before = await badge_count()
    down_balances_after_each_click = []
    for _ in range(5):
        await click_center(lower)
        await page.wait_for_timeout(60)
        down_balances_after_each_click.append(await balance_value())
        await page.wait_for_timeout(20)
    await page.wait_for_timeout(250)
    down_req_delta = len(trade_requests) - down_req_before
    down_badge_delta = await badge_count() - down_badges_before

    return {
        "email": email,
        "initial_balance": initial_balance,
        "balance_after_single_up": balance_after_single_up,
        "balance_after_single_down": balance_after_single_down,
        "up_disabled_true_count": sum(1 for s in up_samples if s["disabled"]),
        "up_disabled_attr_count": sum(1 for s in up_samples if s["attr"]),
        "up_sample_count": len(up_samples),
        "down_disabled_true_count": sum(1 for s in down_samples if s["disabled"]),
        "down_disabled_attr_count": sum(1 for s in down_samples if s["attr"]),
        "down_sample_count": len(down_samples),
        "up_rapid_requests": up_req_delta,
        "up_rapid_badge_delta": up_badge_delta,
        "up_balances_after_each_click": up_balances_after_each_click,
        "down_rapid_requests": down_req_delta,
        "down_rapid_badge_delta": down_badge_delta,
        "down_balances_after_each_click": down_balances_after_each_click,
        "total_trade_requests": len(trade_requests),
    }