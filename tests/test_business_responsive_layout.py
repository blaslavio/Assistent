from pathlib import Path
import unittest

source = Path("zaak_scherm.py").read_text(encoding="utf-8")
start = source.index(":is(.st-key-onderneming_snel, .st-key-onderneming_planning) button {")
end = source.index("    </style>", start)
css = source[start:end]

class ResponsiveBusinessLayoutTests(unittest.TestCase):
    def test_no_grid_shrinking_labels(self):
        self.assertNotIn("grid-template-columns:", css)
        self.assertIn("position: absolute !important;", css)
        self.assertIn("padding: 12px 20px 12px 62px !important;", css)
        self.assertIn("width: 100% !important;", css)
        self.assertIn("word-break: normal !important;", css)
        self.assertIn("text-align: left !important;", css)

if __name__ == "__main__":
    unittest.main()
