import unittest
from assistant_learning import detect_topics, update_patterns, top_suggestions


class AssistantLearningTests(unittest.TestCase):
    def test_opt_out(self):
        self.assertEqual(update_patterns({}, "maak factuur", consent=False), {})

    def test_topics_only(self):
        result = update_patterns({}, "Mail naar jan@example.com over een factuur", consent=True)
        self.assertEqual(result, {"betalingen": 1, "communicatie": 1})
        self.assertNotIn("jan@example.com", str(result))

    def test_suggestions_require_consent(self):
        self.assertEqual(top_suggestions({"planning": 3}, consent=False), [])
        self.assertEqual(top_suggestions({"planning": 3}, consent=True), ["Bekijk je planning"])

    def test_no_raw_content_retention(self):
        self.assertEqual(detect_topics("Hallo ik ben Jan"), set())


if __name__ == "__main__":
    unittest.main()
