import unittest
from datetime import datetime, timedelta
from unittest.mock import patch
import handelsafspraak

class TradeCalendarTests(unittest.TestCase):
    def setUp(self):
        self.order = {"id": 42, "status": "geaccepteerd", "titel": "Jas", "ander": "koper123"}

    def test_no_appointment_before_acceptance(self):
        order = dict(self.order, status="aangevraagd")
        with self.assertRaises(ValueError):
            handelsafspraak.plannen(order, datetime.now() + timedelta(days=2))

    def test_invitation_and_no_duplicate(self):
        item = {"id": 7, "titel": "Overdracht: Jas", "notitie": handelsafspraak.sleutel(42)}
        with patch("handelsafspraak.opslag.laden", return_value={"afspraken": []}), \
             patch("handelsafspraak.opslag.afspraak_toevoegen", return_value=item) as save, \
             patch("handelsafspraak.samen.uitnodigen") as invite:
            result = handelsafspraak.plannen(self.order, datetime.now() + timedelta(days=2))
            self.assertTrue(result["uitgenodigd"])
            save.assert_called_once()
            invite.assert_called_once_with(7, "koper123")
        with patch("handelsafspraak.opslag.laden", return_value={"afspraken": [item]}):
            result = handelsafspraak.plannen(self.order, datetime.now() + timedelta(days=2))
            self.assertFalse(result["nieuw"])

    def test_failed_invitation_rolls_back(self):
        item = {"id": 7}
        with patch("handelsafspraak.opslag.laden", return_value={"afspraken": []}), \
             patch("handelsafspraak.opslag.afspraak_toevoegen", return_value=item), \
             patch("handelsafspraak.samen.uitnodigen", side_effect=RuntimeError("fail")), \
             patch("handelsafspraak.opslag.afspraak_verwijderen") as delete:
            with self.assertRaises(RuntimeError):
                handelsafspraak.plannen(self.order, datetime.now() + timedelta(days=2))
            delete.assert_called_once_with(7)

if __name__ == "__main__":
    unittest.main()
