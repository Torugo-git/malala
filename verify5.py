from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.on("console", lambda msg: print(f"Console: {msg.text}"))
    page.on("pageerror", lambda err: print(f"Error: {err}"))
    page.goto('http://localhost:8080')
    page.evaluate("window.localStorage.clear()")
    page.reload()
    page.wait_for_timeout(3000)
    page.screenshot(path="/home/jules/verification/index5.png", full_page=True)
    print("Products length from window: ", page.evaluate("window.products ? window.products.length : 'no products'"))
    browser.close()
