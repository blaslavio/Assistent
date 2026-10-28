import unittest
from rive_assistant import build_character_html, normalized_state, render_assistant_character


class TestRiveAssistant(unittest.TestCase):
    def test_state_whitelist(self):
        self.assertEqual(normalized_state("thinking"), "thinking")
        self.assertEqual(normalized_state("<script>"), "idle")

    def test_html_uses_state_machine(self):
        html = build_character_html(b"sample-bytes", "listening")
        self.assertIn('stateMachines:"Assistant"', html)
        self.assertIn('const desired = "listening"', html)
        self.assertIn("c2FtcGxlLWJ5dGVz", html)

    def test_empty_file_rejected(self):
        with self.assertRaises(ValueError):
            build_character_html(b"")

    def test_no_asset_is_nonfatal(self):
        self.assertFalse(render_assistant_character(asset_path="/nonexistent/approved.riv"))


if __name__ == "__main__":
    unittest.main()
