"""Release gate: verify that the deployed Streamlit entrypoint can actually render.

Syntax-only checks are insufficient: this executes app.py in Streamlit's
simulated session, without accessing production accounts or external services.
"""
import unittest
from pathlib import Path

from streamlit.testing.v1 import AppTest

ROOT = Path(__file__).resolve().parent


class StreamlitStartupTests(unittest.TestCase):
    def test_embedded_web_build_exists(self):
        for path in ("nieuwe_app/app.js", "nieuwe_app/app.css"):
            with self.subTest(path=path):
                file = ROOT / path
                self.assertTrue(file.is_file(), f"Missing embedded web asset: {path}")
                self.assertGreater(file.stat().st_size, 0, f"Empty embedded web asset: {path}")

    def test_streamlit_entrypoint_renders_without_exception(self):
        app = AppTest.from_file(str(ROOT / "app.py"), default_timeout=45).run()
        messages = [getattr(item, "message", str(item)) for item in app.exception]
        self.assertFalse(messages, "Streamlit startup exceptions: " + "; ".join(messages))


if __name__ == "__main__":
    unittest.main()
