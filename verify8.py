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

        try:
            ls = await page.evaluate("window.localStorage.getItem('malala_products')")
            print("Local storage:", ls[:100] if ls else ls)
        except Exception as e:
            print("Eval error:", e)

        await browser.close()

asyncio.run(run())
