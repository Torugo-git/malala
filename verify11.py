import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 1000})

        page.on("console", lambda msg: print(f"Console: {msg.text}"))

        await page.goto("http://localhost:8080/index.html")
        await page.evaluate("window.localStorage.clear();")
        await page.reload()
        await page.wait_for_timeout(2000)

        # print defaultProducts
        try:
            dp_len = await page.evaluate("defaultProducts.length")
            print("defaultProducts length:", dp_len)

            ls = await page.evaluate("window.localStorage.getItem('malala_products')")
            print("Local storage length:", len(ls) if ls else 0, "content preview:", ls[:50] if ls else "")

            prods = await page.evaluate("products.length")
            print("Products length:", prods)
        except Exception as e:
            print("Eval error:", e)

        await browser.close()

asyncio.run(run())
