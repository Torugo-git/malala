import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 1000})

        page.on("console", lambda msg: print(f"Console {msg.type}: {msg.text}"))

        await page.goto("http://localhost:8080/index.html")
        await page.evaluate("window.localStorage.clear();")
        await page.reload()
        await page.wait_for_timeout(2000)

        # print length of window.products
        try:
            products_len = await page.evaluate("window.products ? window.products.length : 'window.products undefined'")
            print("Products length:", products_len)
        except Exception as e:
            print("Eval error:", e)

        await page.screenshot(path="/home/jules/verification/index6.png", full_page=True)
        await browser.close()

asyncio.run(run())
