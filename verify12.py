import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Block firebase so we can see the default products
        page = await browser.new_page(viewport={"width": 1280, "height": 1000})

        async def block_firebase(route):
            await route.abort()

        await page.route("**/*firestore*", block_firebase)

        await page.goto("http://localhost:8080/index.html")
        await page.evaluate("window.localStorage.clear();")
        await page.reload()
        await page.wait_for_timeout(2000)

        try:
            ls = await page.evaluate("window.localStorage.getItem('malala_products')")
            print("Local storage length:", len(ls) if ls else 0)

            prods = await page.evaluate("products.length")
            print("Products length:", prods)

            # Print title of first product
            title = await page.evaluate("products[0].title")
            print("First product title:", title)

        except Exception as e:
            print("Eval error:", e)

        await page.screenshot(path="/home/jules/verification/index_firebase_blocked.png", full_page=True)
        await browser.close()

asyncio.run(run())
