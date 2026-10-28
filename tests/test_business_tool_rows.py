import ast
from pathlib import Path
import unittest

src = Path("zaak_scherm.py").read_text(encoding="utf-8")
fn = next(n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name == "beroep_instellingen")
body = ast.get_source_segment(src, fn)

class BusinessToolRowsTests(unittest.TestCase):
    def test_all_business_tools_have_routes(self):
        # Elk zakelijk hulpmiddel opent een bestaande route; geen schijnfunctionaliteit.
        for route in ('"zakelijk", "werkrooster"', '"webshop", "webshop"', '"instellingen", "integraties"',
                      '"zakelijk", "omzet"', '"zakelijk", "klanten"', '"zakelijk", "boekhouding"',
                      '"webshop", "verzenden"', '"boekingen", "boekingen"'):
            self.assertIn(f"_openen({route})", body)

    def test_customer_balance_is_not_promised(self):
        self.assertIn("klantsaldo is nog niet beschikbaar", body)

if __name__ == "__main__":
    unittest.main()
