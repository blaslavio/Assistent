"""Regression contracts for the production business navigation mapping.

These tests deliberately import the real module rather than checking invented menu lists.
They do not claim to prove database RBAC or live browser navigation.
"""
from unittest.mock import patch


class FakeSessionState(dict):
    def __getattr__(self, key):
        try:
            return self[key]
        except KeyError as exc:
            raise AttributeError(key) from exc

    def __setattr__(self, key, value):
        self[key] = value

import zaak_scherm


def test_business_routes_have_valid_targets():
    mapping = zaak_scherm._OPENEN
    assert mapping, "Business tool routes must exist"
    assert all(isinstance(key, str) and key for key in mapping)
    assert all(isinstance(value, tuple) and len(value) == 2 for value in mapping.values())
    assert all(all(isinstance(item, str) and item for item in value) for value in mapping.values())


def test_critical_business_routes_reach_expected_sections():
    mapping = zaak_scherm._OPENEN
    assert mapping["werkrooster"] == ("zaak_deel", "Rooster")
    assert mapping["klanten"] == ("zaak_deel", "Klanten")
    assert mapping["webshop"] == ("webshop_deel", "Winkel")
    assert mapping["integraties"] == ("inst_groep", "Koppelingen")


def test_openen_sets_real_navigation_state():
    state = FakeSessionState()
    with patch.object(zaak_scherm.st, "session_state", state):
        zaak_scherm._openen("zaak", "werkrooster")
        assert state["zaak_deel"] == "Rooster"
        assert state["ga_naar"] == "zaak"
        zaak_scherm._openen("instellingen", "integraties")
        assert state["inst_groep"] == "Koppelingen"
        assert state["ga_naar"] == "instellingen"


def test_unknown_tool_only_changes_destination():
    state = FakeSessionState()
    with patch.object(zaak_scherm.st, "session_state", state):
        zaak_scherm._openen("assistent", "onbekend")
    assert state == {"ga_naar": "assistent"}
