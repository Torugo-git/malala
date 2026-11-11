import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 1000})
        await page.goto("http://localhost:8080/index.html")

        try:
            dp_len = await page.evaluate("defaultProducts.length")
            print("defaultProducts length:", dp_len)
        except Exception as e:
            print("Eval error:", e)

        await browser.close()

asyncio.run(run())
