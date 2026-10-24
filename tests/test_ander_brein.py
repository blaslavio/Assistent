"""Regressietests voor AI-providerafhandeling; geen echte API-sleutels nodig."""
import importlib
import sys
import types
import unittest
from unittest.mock import patch


class FakeResponse:
    status_code = 200

    def __init__(self, message):
        self.message = message

    def json(self):
        return {"choices": [{"message": self.message}]}


class BreinTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Vermijd het initialiseren van de echte app, database en providerclients.
        agent = types.ModuleType("agent")
        agent.SYSTEEM = "Test"
        agent.SPRAAK = ""
        agent.context = lambda: ""
        agent.HULPMIDDELEN = []
        opslag = types.ModuleType("opslag")
        opslag.GeenToegang = type("GeenToegang", (Exception,), {})
        opslag.instellingen = lambda: {"openai_sleutel": "dummy"}
        cls._originals = {name: sys.modules.get(name) for name in ("agent", "opslag", "ander_brein")}
        sys.modules["agent"] = agent
        sys.modules["opslag"] = opslag
        sys.modules.pop("ander_brein", None)
        cls.mod = importlib.import_module("ander_brein")

    @classmethod
    def tearDownClass(cls):
        for name, value in cls._originals.items():
            if value is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = value

    def test_normaal_antwoord(self):
        berichten = [{"role": "user", "content": "Hoi"}]
        with patch.object(self.mod.httpx, "post", return_value=FakeResponse({"role": "assistant", "content": "Hallo"})):
            self.assertEqual(self.mod.antwoord("ChatGPT", berichten), "Hallo")
        self.assertEqual(berichten[-1]["content"], "Hallo")

    def test_tool_limiet_is_geen_succes(self):
        berichten = [{"role": "user", "content": "Doe iets"}]
        response = FakeResponse({"role": "assistant", "content": None, "tool_calls": [
            {"id": "call1", "type": "function", "function": {"name": "onbekend", "arguments": "{}"}}
        ]})
        with patch.object(self.mod.httpx, "post", return_value=response) as post:
            with self.assertRaisesRegex(self.mod.Fout, "te veel opeenvolgende"):
                self.mod.antwoord("ChatGPT", berichten)
        self.assertEqual(post.call_count, self.mod.MAX_RONDES)
        self.assertEqual(len(berichten), 1, "Mislukte run mag niet als afgerond opgeslagen worden")

    def test_leeg_modelantwoord_geen_klaar(self):
        with patch.object(self.mod.httpx, "post", return_value=FakeResponse({"role": "assistant", "content": ""})):
            self.assertIn("geen antwoord", self.mod.antwoord("ChatGPT", [{"role": "user", "content": "Hoi"}]))

    def test_auth_fout(self):
        r = FakeResponse({})
        r.status_code = 401
        with patch.object(self.mod.httpx, "post", return_value=r):
            with self.assertRaisesRegex(self.mod.Fout, "sleutel"):
                self.mod.antwoord("ChatGPT", [{"role": "user", "content": "Hoi"}])


if __name__ == "__main__":
    unittest.main()
