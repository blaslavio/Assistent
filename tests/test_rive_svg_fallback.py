import unittest
from rive_assistant import build_svg_fallback_html


class TestSvgFallback(unittest.TestCase):
    def test_valid_svg_and_status(self):
        svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'
        html = build_svg_fallback_html(svg, "thinking")
        self.assertIn("sway 1.6s", html)
        self.assertIn("prefers-reduced-motion", html)

    def test_unsafe_svg_is_rejected(self):
        for svg in ('<svg><script>alert(1)</script></svg>',
                    '<svg onload="bad()"></svg>',
                    '<svg><foreignObject/></svg>'):
            with self.assertRaises(ValueError):
                build_svg_fallback_html(svg)


if __name__ == "__main__":
    unittest.main()
