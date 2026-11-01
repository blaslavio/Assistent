"""Read-only browser smoke of the public Streamlit Cloud app.

Avoid plain HTTP health probes: Streamlit Cloud can redirect non-browser clients
in a loop while normal browser sessions work. No account credentials are used.
"""
from pathlib import Path
import sys
import time

from playwright.sync_api import sync_playwright

URL = "https://eisreyyrtvlgtjpqiyhpm2.streamlit.app/"
SCREENSHOT = Path("streamlit-cloud-smoke.png")


def main() -> int:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 390, "height": 844}, locale="nl-NL")
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda err: errors.append(str(err)[:220]))
        try:
            page.goto(URL, wait_until="domcontentloaded", timeout=60000)
            print(f"Browser URL: {page.url}")
            deadline = time.monotonic() + 105
            woke = False
            while time.monotonic() < deadline:
                if not woke:
                    button = page.get_by_text("Yes, get this app back up!", exact=False)
                    if button.count() and button.first.is_visible():
                        button.first.click(timeout=10000)
                        woke = True
                        print("Streamlit sleeper wake button clicked")
                if "share.streamlit.io/-/auth" in page.url:
                    print("::error::Cloud app redirected to Streamlit sign-in rather than public test page")
                    return 1
                for frame in page.frames:
                    try:
                        root = frame.locator("#root")
                        if root.count() and root.first.locator(":scope > *").count():
                            print(f"Webapp rendered: title={page.title()!r}, frames={len(page.frames)}")
                            print("Browser JavaScript errors:", errors[:3])
                            return 0
                    except Exception:
                        continue
                page.wait_for_timeout(2500)
            print(f"::error::Browser could not render app after loading: url={page.url}; title={page.title()!r}")
            print("Browser JavaScript errors:", errors[:5])
            return 1
        except Exception as exc:
            print(f"::error::Browser launch/navigation failure: {type(exc).__name__}: {str(exc)[:500]}")
            return 1
        finally:
            try:
                page.screenshot(path=str(SCREENSHOT), full_page=False, timeout=10000)
            except Exception as exc:
                print("Screenshot not available:", type(exc).__name__)
            browser.close()


if __name__ == "__main__":
    sys.exit(main())
