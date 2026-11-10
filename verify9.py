import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Intercept firebase network requests to simulate no firebase,
        # so onSnapshot doesn't fire with empty data.
        page = await browser.new_page(viewport={"width": 1280, "height": 1000})

        async def block_firebase(route):
            await route.abort()

        await page.route("**/*firestore*", block_firebase)
        await page.route("**/*firebase*", block_firebase)

        await page.goto("http://localhost:8080/index.html")
        await page.evaluate("window.localStorage.clear();")
        await page.reload()
        await page.wait_for_timeout(2000)

        grid_items = await page.locator("#productsGrid > div").count()
        print("Grid items count after blocking Firebase:", grid_items)

        await page.screenshot(path="/home/jules/verification/index_blocked_firebase.png", full_page=True)
        await browser.close()

asyncio.run(run())
