import unittest
from azure_readiness import inspect_azure_config

class AzureReadinessTests(unittest.TestCase):
    def test_empty_config(self):
        self.assertFalse(inspect_azure_config({}).ready_for_live_probe)

    def test_entra_config(self):
        result = inspect_azure_config({
            "AZURE_OPENAI_ENDPOINT": "https://sample.openai.azure.com/openai/v1/",
            "AZURE_OPENAI_DEPLOYMENT": "deployment",
            "AZURE_AUTH_MODE": "entra",
        })
        self.assertTrue(result.ready_for_live_probe)
        self.assertFalse(result.monitoring_configured)

    def test_untrusted_host(self):
        result = inspect_azure_config({
            "AZURE_OPENAI_ENDPOINT": "https://example.org/",
            "AZURE_OPENAI_DEPLOYMENT": "deployment",
            "AZURE_AUTH_MODE": "entra",
        })
        self.assertFalse(result.ready_for_live_probe)
