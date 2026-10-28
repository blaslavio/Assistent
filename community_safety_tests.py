import unittest
from community_safety import Action, decide_moderation
from community_privacy import PRIVACY_DEFAULTS, prepare_report, prepare_data_request, update_privacy_preferences


class CommunitySafetyTests(unittest.TestCase):
    def test_private_by_default(self):
        self.assertFalse(PRIVACY_DEFAULTS["public_profile"])
        self.assertFalse(PRIVACY_DEFAULTS["personalized_recommendations"])

    def test_no_private_chat_scanning(self):
        with self.assertRaises(ValueError):
            update_privacy_preferences({}, {"private_messages_server_scanning": True})

    def test_threat_block(self):
        self.assertEqual(decide_moderation({"credible_threat"}, 0.95).action, Action.BLOCK)

    def test_quoted_or_reported_exception(self):
        self.assertEqual(decide_moderation({"racist_abuse"}, 0.99, contextual_exception=True).action, Action.ALLOW)

    def test_borderline_human_review(self):
        self.assertEqual(decide_moderation({"targeted_harassment"}, 0.8).action, Action.REVIEW)

    def test_report(self):
        self.assertEqual(prepare_report("u1", "post1", "racism").status, "pending_review")

    def test_export_request_needs_identity_verification(self):
        self.assertEqual(prepare_data_request("u1", "export")["status"], "pending_identity_verification")


if __name__ == "__main__":
    unittest.main()
