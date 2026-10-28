import unittest

from os_navigation import DESTINATIONS, destination_by_key, destinations_for


class NavigationTests(unittest.TestCase):
    def test_all_destinations_visible_without_query(self):
        self.assertEqual(destinations_for(""), DESTINATIONS)

    def test_aliases_work(self):
        self.assertEqual([d.key for d in destinations_for("webshop")], ["winkelen"])
        self.assertEqual([d.key for d in destinations_for("AFSPRAAK")], ["agenda"])

    def test_no_duplicate_keys(self):
        keys = [d.key for d in DESTINATIONS]
        self.assertEqual(len(keys), len(set(keys)))

    def test_unknown_destination_rejected(self):
        with self.assertRaises(KeyError):
            destination_by_key("invalid")


if __name__ == "__main__":
    unittest.main()
