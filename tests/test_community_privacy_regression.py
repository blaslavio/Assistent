"""Regression tests for privacy defaults and report validation."""
import unittest

from community_privacy import (
    PRIVACY_DEFAULTS,
    prepare_data_request,
    prepare_report,
    update_privacy_preferences,
)


class PrivacyRegressionTests(unittest.TestCase):
    def test_defaults_are_opt_out(self):
        self.assertTrue(all(value is False for value in PRIVACY_DEFAULTS.values()))

    def test_unknown_preference_rejected(self):
        with self.assertRaises(ValueError):
            update_privacy_preferences({}, {"admin": True})

    def test_non_boolean_preference_rejected(self):
        with self.assertRaises(ValueError):
            update_privacy_preferences({}, {"analytics_opt_in": "yes"})

    def test_private_message_scanning_cannot_be_enabled(self):
        with self.assertRaises(ValueError):
            update_privacy_preferences({}, {"private_messages_server_scanning": True})

    def test_explicit_opt_in(self):
        result = update_privacy_preferences({}, {"analytics_opt_in": True})
        self.assertTrue(result["analytics_opt_in"])
        self.assertFalse(result["marketing_opt_in"])

    def test_report_requires_identity(self):
        with self.assertRaises(PermissionError):
            prepare_report(" ", "post-1", "privacy")

    def test_report_note_size_limit(self):
        with self.assertRaises(ValueError):
            prepare_report("user-1", "post-1", "privacy", "x" * 1001)

    def test_data_request_requires_identity(self):
        with self.assertRaises(PermissionError):
            prepare_data_request("", "export")

    def test_data_request_requires_supported_kind(self):
        with self.assertRaises(ValueError):
            prepare_data_request("user-1", "unknown")


if __name__ == "__main__":
    unittest.main()
