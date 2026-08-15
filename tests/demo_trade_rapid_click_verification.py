"""
Focused Playwright verification for the /demo-trade rapid-click bug.

This stores the test logic used by the MCP browser automation runner. The
`run(page)` function registers a fresh demo user, delays trade-place API
responses to expose any transient disabled state, then checks UP/DOWN disabled
properties, rapid-click request counts, badge counts, and optimistic balance
debit.
"""

import asyncio
import re
import time


def parse_money(text):
    """Parse a currency string such as '$10,000.00' into a float."""
    match = re.search(r"-?[0-9][0-9,]*(?:\.\d+)?", text or "")
    return float(match.group(0).replace(",", "")) if match else None


async def run(page):
    """Run the focused verification with a Playwright `page`."""
    try:
        await page.set_viewport_size({"width": 1920, "height": 1080})
        # Use the Emergent preview origin because the live VPS API allows this
        # frontend origin; localhost is blocked by CORS in this project.
        await page.goto("https://bg-vps-ready.preview.emergentagent.com/registration")
        await page.evaluate("localStorage.clear()")
        await page.reload()
        await page.wait_for_load_state("domcontentloaded")

        email = f"bfgtest.qa{int(time.time() * 1000)}@mailinator.com"
        password = "StrongPass123!"
        print(f"Registering fresh demo user: {email}")

        await page.get_by_test_id("register-country-input").fill("Bangladesh")
        await page.wait_for_timeout(200)
        await page.get_by_test_id("country-option-bangladesh").click(force=True)
        await page.get_by_test_id("register-email-input").fill(email)
        await page.get_by_test_id("register-password-input").fill(password)
        await page.get_by_test_id("register-terms-checkbox").check(force=True)
        await page.get_by_test_id("register-submit-button").click()
        await page.wait_for_url("**/demo-trade", timeout=30000)
        print("Registration succeeded and navigated to /demo-trade")

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
                body = req.post_data or ""
                trade_requests.append({"url": req.url, "body": body, "t": time.time()})
                await asyncio.sleep(1.4)
            await route.continue_()

        await page.route("**/api/trade/place", delayed_trade_route)
        higher = page.locator('[data-testid="trade-higher-button"]').first
        lower = page.locator('[data-testid="trade-lower-button"]').first

        balance_before = parse_money(await page.get_by_test_id("balance-value").inner_text())
        print(f"Initial balance: {balance_before}")

        await higher.click()
        await page.wait_for_timeout(60)
        balance_after_up = parse_money(await page.get_by_test_id("balance-value").inner_text())
        up_disabled_samples = []
        start = time.monotonic()
        while time.monotonic() - start < 2.0:
            up_disabled_samples.append(await higher.evaluate("(el) => el.disabled"))
            await page.wait_for_timeout(25)
        print(f"UP disabled samples true count: {sum(bool(x) for x in up_disabled_samples)} / {len(up_disabled_samples)}")
        print(f"Balance after UP click: {balance_after_up}")

        await page.wait_for_timeout(400)

        await lower.click()
        down_disabled_samples = []
        start = time.monotonic()
        while time.monotonic() - start < 2.0:
            down_disabled_samples.append(await lower.evaluate("(el) => el.disabled"))
            await page.wait_for_timeout(25)
        print(f"DOWN disabled samples true count: {sum(bool(x) for x in down_disabled_samples)} / {len(down_disabled_samples)}")

        await page.wait_for_function(
            """() => {
                const el = document.querySelector('[data-testid="trade-higher-button"]');
                return el && !el.disabled;
            }""",
            timeout=10000,
        )
        await page.wait_for_timeout(200)

        async def visible_box(locator):
            box = await locator.bounding_box()
            if not box:
                raise RuntimeError("No bounding box for locator")
            return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2

        async def count_badges():
            return await page.locator('[data-testid^="trade-badge-"]').count()

        up_req_before = len(trade_requests)
        badge_before_up = await count_badges()
        hx, hy = await visible_box(higher)
        for _ in range(5):
            await page.mouse.click(hx, hy)
            await page.wait_for_timeout(80)
        await page.wait_for_timeout(250)
        up_req_after = len(trade_requests)
        badge_after_up = await count_badges()
        print(f"Rapid UP requests delta: {up_req_after - up_req_before}; badge delta: {badge_after_up - badge_before_up}")

        await page.wait_for_timeout(1800)

        down_req_before = len(trade_requests)
        badge_before_down = await count_badges()
        lx, ly = await visible_box(lower)
        for _ in range(5):
            await page.mouse.click(lx, ly)
            await page.wait_for_timeout(80)
        await page.wait_for_timeout(250)
        down_req_after = len(trade_requests)
        badge_after_down = await count_badges()
        print(f"Rapid DOWN requests delta: {down_req_after - down_req_before}; badge delta: {badge_after_down - badge_before_down}")

        error_text = await page.evaluate(
            """() => {
                const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
                return errorElements.map(el => el.textContent).join(", ");
            }"""
        )
        if error_text:
            print(f"Found error message: {error_text}")
        else:
            print("No error messages found on the page")

        result = {
            "email": email,
            "up_disabled_seen": any(up_disabled_samples),
            "down_disabled_seen": any(down_disabled_samples),
            "up_rapid_requests": up_req_after - up_req_before,
            "down_rapid_requests": down_req_after - down_req_before,
            "up_rapid_badge_delta": badge_after_up - badge_before_up,
            "down_rapid_badge_delta": badge_after_down - badge_before_down,
            "balance_before": balance_before,
            "balance_after_up": balance_after_up,
            "balance_decreased_after_up": balance_after_up is not None
            and balance_before is not None
            and balance_after_up < balance_before,
            "total_trade_requests": len(trade_requests),
        }
        print(result)
        return result
    except Exception as exc:
        print(f"TEST FAILURE: {type(exc).__name__}: {exc}")
        error_text = await page.evaluate(
            """() => {
                const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
                return errorElements.map(el => el.textContent).join(", ");
            }"""
        )
        if error_text:
            print(f"Found error message: {error_text}")
        else:
            print("No error messages found on the page")
        raise