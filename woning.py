"""Apple Woning via de app Opdrachten: elke scène is een opdracht met dezelfde naam, een tik in de app start hem.

Apple laat een website lampen of sloten niet zelf schakelen. Een link naar shortcuts://run-shortcut opent de
opdracht op de iPhone of iPad zelf; die bedient de Woning-app. Zo blijft de gebruiker altijd zelf degene die tikt.
"""

from urllib.parse import quote

import streamlit as st

import opslag

VOORBEELDEN = ["Licht uit", "Thuiskomen", "Welterusten", "Film kijken", "Verwarming aan"]


def scenes() -> list[str]:
    return [s for s in opslag.instellingen().get("woning", []) if s.strip()]


def link(naam: str) -> str:
    return "shortcuts://run-shortcut?name=" + quote(naam)


def icoon(naam: str) -> str:
    laag = naam.lower()
    for woorden, teken in ((("licht", "lamp"), "lightbulb"), (("welterusten", "slapen", "nacht"), "bedtime"),
                           (("thuis", "aankom"), "cottage"), (("weg", "vertrek"), "door_open"), (("film", "tv"), "tv"),
                           (("verwarming", "warm", "thermostaat"), "thermostat"), (("slot", "deur"), "lock"),
                           (("muziek", "speaker"), "speaker"), (("gordijn", "rolluik"), "blinds")):
        if any(w in laag for w in woorden):
            return f":material/{teken}:"
    return ":material/home:"


def knoppen(namen: list[str], key: str) -> None:
    """Een rij knoppen die elk een opdracht op het apparaat starten."""
    if not namen:
        return
    kolommen = st.columns(min(len(namen), 3))
    for i, naam in enumerate(namen):
        kolommen[i % len(kolommen)].link_button(naam, link(naam), icon=icoon(naam), width="stretch")


def zoek(naam: str) -> str | None:
    """De scène die het best bij een naam past (hoofdletters maken niet uit)."""
    laag = naam.strip().lower()
    alle = scenes()
    return next((s for s in alle if s.lower() == laag), None) or next(
        (s for s in alle if laag in s.lower() or s.lower() in laag), None)
