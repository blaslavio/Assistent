"""Simulatietests voor de nieuwe werkrooster-basis."""
import unittest

import werkrooster as w


class WerkroosterTests(unittest.TestCase):
    def test_rechten(self):
        self.assertTrue(w.mag("planner", "rooster_publiceren"))
        self.assertFalse(w.mag("medewerker", "dienst_toewijzen"))
        self.assertFalse(w.mag("planner", "onbekende_actie"))

    def test_nachtdienst(self):
        dienst = w.dienst_controleren("2026-11-02T22:00:00+01:00", "2026-11-03T06:00:00+01:00", 30)
        self.assertEqual(dienst["minuten"], 480)
        self.assertEqual(dienst["betaalde_minuten"], 450)

    def test_ongeldige_diensten(self):
        gevallen = [
            ("2026-11-02T10:00", "2026-11-02T12:00+01:00", 0),
            ("2026-11-02T12:00+01:00", "2026-11-02T10:00+01:00", 0),
            ("2026-11-02T10:00+01:00", "2026-11-02T12:00+01:00", 120),
            ("2026-11-02T10:00+01:00", "2026-11-02T12:00+01:00", -1),
        ]
        for start, einde, pauze in gevallen:
            with self.subTest(start=start, einde=einde, pauze=pauze):
                with self.assertRaises(w.RoosterFout):
                    w.dienst_controleren(start, einde, pauze)

    def test_overlap_en_aansluitend(self):
        a = w.dienst_controleren("2026-11-02T09:00+01:00", "2026-11-02T13:00+01:00")
        b = w.dienst_controleren("2026-11-02T12:00+01:00", "2026-11-02T17:00+01:00")
        c = w.dienst_controleren("2026-11-02T13:00+01:00", "2026-11-02T17:00+01:00")
        self.assertTrue(w.overlap(a, b))
        self.assertFalse(w.overlap(a, c))


if __name__ == "__main__":
    unittest.main()
