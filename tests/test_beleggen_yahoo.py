"""Koersen en zoeken met echte antwoorden van Yahoo Finance (opgehaald op 27-10-2026, tijdens de handel)."""
import json
from pathlib import Path

import httpx

import beleggen

DATA = Path(__file__).parent / "yahoo"


def _nep(monkeypatch, bestand):
    tekst = (DATA / bestand).read_text()
    monkeypatch.setattr(beleggen, "_verbinding",
                        httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, text=tekst))))


def test_koers_tijdens_handel_vergelijkt_met_slot_van_gisteren(monkeypatch):
    _nep(monkeypatch, "yahoo_chart_asml.json")
    k = beleggen._ophalen("ASML.AS")
    assert k["prijs"] == 1470.0 and k["valuta"] == "EUR" and k["naam"] == "ASML Holding N.V."
    # Yahoo zelf: +2,8% t.o.v. het slot van gisteren (1430), niet t.o.v. eergisteren.
    assert k["vandaag_pct"] == 2.8


def test_zonder_procent_van_yahoo_rekent_het_met_gisteren(monkeypatch):
    data = json.loads((DATA / "yahoo_chart_asml.json").read_text())
    del data["chart"]["result"][0]["meta"]["regularMarketChangePercent"]
    monkeypatch.setattr(beleggen, "_verbinding", httpx.Client(transport=httpx.MockTransport(
        lambda r: httpx.Response(200, json=data))))
    assert beleggen._ophalen("ASML.AS")["vandaag_pct"] == round((1470 / 1430 - 1) * 100, 2)


def test_zoeken(monkeypatch):
    _nep(monkeypatch, "yahoo_search_shell.json")
    gevonden = beleggen.zoeken("shell")
    assert {"symbool": "SHELL.AS", "naam": "Shell plc", "beurs": "Amsterdam", "soort": "EQUITY"} in gevonden
