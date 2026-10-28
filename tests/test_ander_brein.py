"""Regressietests voor AI-providerafhandeling; geen echte API-sleutels nodig."""
import importlib
import os
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

    def test_toolgeschiedenis_bij_wissel_brein(self):
        berichten = [
            {"role": "assistant", "content": [
                {"type": "text", "text": "Ik zoek het op."},
                {"type": "tool_use", "id": "t1", "name": "agenda_lezen", "input": {"dag": "morgen"}}]},
            {"role": "user", "content": [
                {"type": "tool_result", "tool_use_id": "t1", "content": "Training om 10:00"},
                {"type": "text", "text": "Wanneer is mijn training?"}]},
        ]
        historie = self.mod._geschiedenis(berichten)
        self.assertEqual(historie[0]["tool_calls"][0]["function"]["name"], "agenda_lezen")
        self.assertEqual(historie[1]["role"], "tool")
        self.assertEqual(historie[1]["content"], "Training om 10:00")
        self.assertEqual(historie[2]["content"], "Wanneer is mijn training?")
        with patch.object(self.mod.httpx, "post",
                          return_value=FakeResponse({"role": "assistant", "content": "10 uur"})) as post:
            self.mod.antwoord("ChatGPT", berichten)
        self.assertEqual(post.call_args.kwargs["json"]["messages"][2]["role"], "tool")

    def test_tekst_en_losse_resultaten(self):
        self.assertEqual(self.mod._tekst([{"type": "text", "text": "Hallo"}]), "Hallo")
        historie = self.mod._geschiedenis([{"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": "onbekend", "content": "Geheim"},
            {"type": "text", "text": "Vraag"}]}])
        self.assertEqual(historie, [{"role": "user", "content": "Vraag"}])

    def test_auth_fout(self):
        r = FakeResponse({})
        r.status_code = 401
        with patch.object(self.mod.httpx, "post", return_value=r):
            with self.assertRaisesRegex(self.mod.Fout, "sleutel"):
                self.mod.antwoord("ChatGPT", [{"role": "user", "content": "Hoi"}])

    def test_azure_gebruikt_serverdeployment_en_bestaande_chatroute(self):
        with patch.dict(os.environ, {"AZURE_OPENAI_API_KEY": "server-secret",
                                     "AZURE_OPENAI_DEPLOYMENT": "gpt-5-mini"}):
            with patch.object(self.mod.httpx, "post", return_value=FakeResponse(
                    {"role": "assistant", "content": "Azure antwoord"})) as post:
                self.assertEqual(self.mod.antwoord("Azure OpenAI", [{"role": "user", "content": "Hoi"}]),
                                 "Azure antwoord")
        self.assertTrue(post.call_args.args[0].startswith("https://blaslavio-7458-resource.openai.azure.com/"))
        self.assertEqual(post.call_args.kwargs["json"]["model"], "gpt-5-mini")
        self.assertNotIn("tools", post.call_args.kwargs["json"])

    def test_azure_zonder_serversleutel_doet_geen_api_aanroep(self):
        with patch.dict(os.environ, {"AZURE_OPENAI_API_KEY": ""}):
            with patch.object(self.mod.httpx, "post") as post:
                with self.assertRaisesRegex(self.mod.Fout, "niet geconfigureerd"):
                    self.mod.antwoord("Azure OpenAI", [{"role": "user", "content": "Hoi"}])
                post.assert_not_called()

    def test_ongeldig_providerantwoord_wordt_gebruikersmelding(self):
        for payload in ({"choices": []}, {"choices": [{"message": None}]},
                        {"choices": [{"message": {"content": ["unexpected"]}}]}):
            with self.subTest(payload=payload):
                response = FakeResponse({})
                response.json = lambda: payload
                with patch.object(self.mod.httpx, "post", return_value=response):
                    with self.assertRaisesRegex(self.mod.Fout, "ongeldig antwoord"):
                        self.mod.antwoord("ChatGPT", [{"role": "user", "content": "Hoi"}])

    def test_provider_met_ongeldige_json_geeft_geen_crash(self):
        response = FakeResponse({})
        response.json = lambda: (_ for _ in ()).throw(ValueError("invalid JSON"))
        with patch.object(self.mod.httpx, "post", return_value=response):
            with self.assertRaisesRegex(self.mod.Fout, "ongeldig antwoord"):
                self.mod.antwoord("ChatGPT", [{"role": "user", "content": "Hoi"}])


if __name__ == "__main__":
    unittest.main()
