import unittest

from rive_chat_state import AssistantEvent, state_for_event


class TestChatAdapter(unittest.TestCase):
    def test_known_events(self):
        self.assertEqual(state_for_event(AssistantEvent.REQUEST_STARTED), "thinking")
        self.assertEqual(state_for_event("response_received"), "speaking")
        self.assertEqual(state_for_event("action_succeeded"), "success")
        self.assertEqual(state_for_event("action_failed"), "error")

    def test_unknown_event_is_idle(self):
        self.assertEqual(state_for_event("not_an_event"), "idle")
        self.assertEqual(state_for_event(None), "idle")

    def test_no_unverified_state(self):
        for event in AssistantEvent:
            self.assertIn(state_for_event(event), {
                "idle", "listening", "thinking", "speaking", "success", "error"
            })


if __name__ == "__main__":
    unittest.main()
