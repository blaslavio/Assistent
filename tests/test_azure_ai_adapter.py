import unittest
from types import SimpleNamespace
from azure_ai_adapter import _base_url, generate_text


class FakeResponses:
    def __init__(self):
        self.called = None

    def create(self, **kwargs):
        self.called = kwargs
        return SimpleNamespace(output_text="360")


class AzureAdapterTests(unittest.TestCase):
    def test_endpoint(self):
        self.assertEqual(_base_url("https://example.openai.azure.com/"), "https://example.openai.azure.com/openai/v1/")
        with self.assertRaises(ValueError):
            _base_url("http://example.openai.azure.com")

    def test_model_call_uses_deployment_without_storage(self):
        responses = FakeResponses()
        client = SimpleNamespace(responses=responses)
        output = generate_text("15 * 24", client=client, config={"AZURE_OPENAI_DEPLOYMENT": "gpt-5-mini"})
        self.assertEqual(output, "360")
        self.assertEqual(responses.called, {"model": "gpt-5-mini", "input": "15 * 24", "store": False})

    def test_missing_deployment_fails_closed(self):
        with self.assertRaises(RuntimeError):
            generate_text("hello", client=SimpleNamespace(), config={})
