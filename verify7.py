import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 1000})

        await page.goto("http://localhost:8080/index.html")
        await page.evaluate("window.localStorage.clear();")
        await page.reload()
        await page.wait_for_timeout(2000)

        # print length of window.products
        try:
            products_len = await page.evaluate("products.length")
            print("Products length:", products_len)

            # Print count of items in grid
            grid_items = await page.locator("#productsGrid > div").count()
            print("Grid items count:", grid_items)

        except Exception as e:
            print("Eval error:", e)

        await browser.close()

asyncio.run(run())
