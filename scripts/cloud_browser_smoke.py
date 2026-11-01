"""Browser-level verification of hosted Streamlit + embedded React app.

An HTTP 200 or an existing '#root' is not enough; we require visible app text
and a nonblank viewport screenshot. No user credentials or writes.
"""
from pathlib import Path
import sys
import time

from PIL import Image
from playwright.sync_api import sync_playwright

URL = "https://eisreyyrtvlgtjpqiyhpm2.streamlit.app/"
SCREENSHOT = Path("streamlit-cloud-smoke.png")


def nonwhite_pixels(path: Path) -> int:
    with Image.open(path) as image:
        pixels = image.convert("RGB").resize((78, 168)).getdata()
        return sum(1 for red, green, blue in pixels if min(red, green, blue) < 230)


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
            deadline = time.monotonic() + 95
            woke = False
            last_text = ""
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
                        if not root.count() or not root.first.is_visible():
                            continue
                        rendered = root.first.inner_text(timeout=5000).strip()
                        if len(rendered) > len(last_text):
                            last_text = rendered[:300]
                        if len(rendered) < 20:
                            continue
                        page.wait_for_timeout(1500)
                        page.screenshot(path=str(SCREENSHOT), full_page=False)
                        visual = nonwhite_pixels(SCREENSHOT)
                        print(f"Candidate app visible text length={len(rendered)}; screenshot non-white pixels={visual}")
                        if visual > 35:
                            print("Browser UI verified: app text and visible pixels present")
                            print("Browser JavaScript errors:", errors[:3])
                            return 0
                    except Exception:
                        continue
                page.wait_for_timeout(2500)
            print(f"::error::Cloud UI did not become visibly usable. url={page.url}; title={page.title()!r}")
            print("Last root text snippet:", repr(last_text))
            print("Browser JavaScript errors:", errors[:5])
            return 1
        except Exception as exc:
            print(f"::error::Browser launch/navigation failure: {type(exc).__name__}: {str(exc)[:500]}")
            return 1
        finally:
            try:
                page.screenshot(path=str(SCREENSHOT), full_page=False, timeout=10000)
                print("Final screenshot non-white pixels:", nonwhite_pixels(SCREENSHOT))
            except Exception as exc:
                print("Screenshot not available:", type(exc).__name__)
            browser.close()


if __name__ == "__main__":
    sys.exit(main())
