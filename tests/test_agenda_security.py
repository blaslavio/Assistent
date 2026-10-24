"""Tests voor externe agenda-URL's, zonder netwerk of echte gebruikersgegevens."""
import importlib
import sys
import types
import unittest
from unittest.mock import patch


class AgendaURLTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.oud = sys.modules.get("opslag")
        opslag = types.ModuleType("opslag")
        opslag.instellingen = lambda: {}
        sys.modules["opslag"] = opslag
        sys.modules.pop("agendas", None)
        cls.agendas = importlib.import_module("agendas")

    @classmethod
    def tearDownClass(cls):
        sys.modules.pop("agendas", None)
        if cls.oud is None:
            sys.modules.pop("opslag", None)
        else:
            sys.modules["opslag"] = cls.oud

    def test_lokaal_adres_geblokkeerd(self):
        for url in ("http://localhost:8000/a.ics", "http://127.0.0.1/a.ics",
                    "http://169.254.169.254/latest/meta-data", "http://10.0.0.1/a.ics",
                    "http://[::1]/a.ics", "file:///etc/passwd", "http://example.local/a.ics"):
            with self.subTest(url=url), self.assertRaises(self.agendas.Fout):
                self.agendas._veilige_agenda_url(url)

    def test_openbaar_adres_toegestaan(self):
        with patch.object(self.agendas.socket, "getaddrinfo",
                          return_value=[(2, 1, 6, "", ("93.184.215.14", 443))]):
            self.agendas._veilige_agenda_url("https://example.com/calendar.ics")

    def test_gebruikersinfo_in_url_geblokkeerd(self):
        with self.assertRaises(self.agendas.Fout):
            self.agendas._veilige_agenda_url("https://user:pass@example.com/a.ics")


if __name__ == "__main__":
    unittest.main()
