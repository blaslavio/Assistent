from pathlib import Path
import unittest

source = Path("zaak_scherm.py").read_text(encoding="utf-8")

class ResponsiveBusinessLayoutTests(unittest.TestCase):
    def test_stacked_full_width_business_tools(self):
        self.assertIn('with st.container(border=True):', source)
        self.assertIn('width="stretch"', source)
        self.assertIn('st.caption(uitleg)', source)
        self.assertNotIn('st.container(horizontal=True, vertical_alignment="center", key=f"tool_{t}")', source)

if __name__ == "__main__":
    unittest.main()
