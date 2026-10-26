"""Regression tests for Pay-in-Chat draft intent detection (no payment is executed)."""
from integraties_voorbereiding import intent_naar_concept
import pytest


@pytest.mark.parametrize("opdracht,centen", [
    ("Maak een betaalverzoek van 75 euro voor een intake", 7500),
    ("Betaalverzoek €25", 2500),
    ("betaling vragen voor 19,95 euro", 1995),
    ("Factuur voor 12.50 euro", 1250),
    ("betaalverzoek van 0,01 euro", 1),
    ("factuur voor 1000000 euro", 100000000),
])
def test_geldige_betaalconcepten(opdracht, centen):
    resultaat = intent_naar_concept(opdracht)
    assert resultaat["type"] == "betaalconcept"
    assert resultaat["bedrag_cent"] == centen


@pytest.mark.parametrize("opdracht", [
    "Maak een betaalverzoek van 0 euro",
    "Betaalverzoek van 1000000,01 euro",
    "Betaalverzoek van -25 euro",
    "Betaalverzoek van abc euro",
    "Betaalverzoek van 12,345 euro",
    "Plan een afspraak van 25 euro",
    "",
])
def test_ongeldige_of_niet_betaalopdrachten(opdracht):
    assert intent_naar_concept(opdracht)["type"] == "onbekend"
