"""Je eigen indeling: wat er bovenaan staat, je favorieten en de volgorde van de groepen in Instellingen.

Bewaard per account in instellingen.indeling = {"bovenaan": [url], "favorieten": [url], "groepen": [naam]}.
Vandaag, de assistent en Instellingen staan altijd bovenaan; de rest kies je zelf.
"""

import re

import beroep
import opslag

VOORPAGINA = {"ochtend": "Ochtendoverzicht ('s ochtends, met voorlezen)", "weer": "Weer naast de datum", "startpunt": "Snel aan de slag (verkopen, dienst aanbieden, leren, winkels)",
              "afspraken": "Geplande afspraken (dagschema)",
              "meldingen": "Meldingen (verkocht, bestellingen, berichten, gedeeld)",
              "saldo": "Saldo van de marktplaats", "budget": "Budget: wat je deze maand nog vrij kunt besteden",
              "taken": "Taken",
              "seintjes": "Korte seintjes (herhalen, sportresultaat)",
              "woning": "Knoppen voor Apple Woning (als je scènes hebt ingesteld)"}
# Wat je in het menu aan of uit kunt zetten (de sleutels staan zo in je instellingen).
ONDERDELEN = {"Chat": "Chat (end-to-end versleuteld)", "Documenten": "Documenten", "Bestanden": "Bestanden", "Mail": "Mail", "Leren": "Leren en schrijven", "Samen": "Projecten en delen",
              "DIY": "DIY en hobby", "Hulpmiddelen": "Hulpmiddelen (notities, timer, rekenen)",
              "Scannen": "Foto scannen", "VR-ruimtes": "VR-ruimtes (projecten in 3D)",
              "Boodschappen": "Boodschappen",
              "Lijstjes": "Kooplijst en wenslijst", "Marktplaats": "Marktplaats (kopen en verkopen bij elkaar)",
              "Budget": "Budget (uitgaven, vaste lasten, sparen)", "Beleggen": "Beleggen (alleen meekijken)",
              "Zakelijk": "Zakelijk (lessen, klanten, boekhouding)"}
# Nieuwe onderdelen die voor bestaande gebruikers uit staan tot ze ze zelf aanzetten.
NIEUW_UIT = ["Zakelijk"]
VOORPAGINA_KORT = {"ochtend": "Ochtendoverzicht", "weer": "Weer", "startpunt": "Snel aan de slag", "afspraken": "Dagschema",
                   "meldingen": "Meldingen", "saldo": "Saldo marktplaats", "budget": "Budget", "taken": "Taken",
                   "seintjes": "Seintjes", "woning": "Apple Woning"}
# Wat standaard uit staat op de voorpagina (aan te zetten bij Instellingen › Weergave).
VOORPAGINA_UIT = {"startpunt"}


def voorpagina() -> dict:
    return {k: k not in VOORPAGINA_UIT for k in VOORPAGINA} | opslag.instellingen().get("voorpagina", {})


def onderdelen_uit() -> list[str]:
    inst = opslag.instellingen()
    uit = inst.get("onderdelen_uit", inst.get("tabbladen_uit", []))
    # Oudere instellingen bewaarden de namen met een emoji ervoor ("🏪 Marktplaats").
    uit = [re.sub(r"^[^\w]+", "", o) for o in uit]
    uit += [o for o in NIEUW_UIT if o not in inst.get("onderdelen_bekend", []) and o not in uit]
    return ["Leren" if o == "Leren en schrijven" else o for o in uit]


# Alle pagina's die je kunt vastzetten, op url. Dezelfde namen als in het menu.
PAGINAS = {"agenda": "Agenda", "chat": "Chat", "winkelen": "Winkelen", "zakelijk": "Zakelijk", "boekingen": "Boekingen",
           "prikken": "Datum prikken", "mail": "Mail", "documenten": "Documenten", "bestanden": "Bestanden", "leren": "Leren",
           "samen": "Samen", "budget": "Budget", "beleggen": "Beleggen", "zoeken": "Marktplaats",
           "winkels": "Winkels", "verkopen": "Verkopen", "bestellingen": "Bestellingen", "berichten": "Berichten",
           "webshop": "Mijn webshop", "verkoopoverzicht": "Verkoopoverzicht", "lijstjes": "Lijstjes",
           "hulpmiddelen": "Hulpmiddelen", "ruimtes": "VR-ruimtes",
           "buurt": "In de buurt", "inzamelen": "Inzamelen", "browser": "Browser",
           "sport": "Sport"}
GROEPEN = ["Kopen en verkopen", "Afspreken", "Leren en werk", "Geld", "Zakelijk", "Sport en gezondheid", "Thuis en handig"]
STANDAARD_BOVENAAN = ["agenda", "chat", "winkelen"]
MAX_BOVENAAN = 4
MAX_FAVORIETEN = 8


def huidig() -> dict:
    i = opslag.instellingen().get("indeling") or {}
    groepen = [g for g in i.get("groepen", []) if g in GROEPEN]
    if not groepen and beroep.huidig()["soort"]:
        # Met een beroep komen je zaak en je afspraken eerst.
        groepen = ["Zakelijk", "Afspreken"]
    bovenaan = list(i.get("bovenaan", STANDAARD_BOVENAAN))
    if "winkelen" not in bovenaan and not i.get("winkelen_gezien"):
        bovenaan.append("winkelen")  # nieuw: staat er ook bij wie zijn indeling al eerder koos, tot hij het weghaalt
    return {"bovenaan": [u for u in bovenaan if u in PAGINAS][:MAX_BOVENAAN],
            "favorieten": [u for u in i.get("favorieten", []) if u in PAGINAS][:MAX_FAVORIETEN],
            "groepen": groepen + [g for g in GROEPEN if g not in groepen]}


def url_van(naam: str) -> str | None:
    """'Mail', 'mail' of 'Mijn webshop' → url, of None."""
    n = (naam or "").strip().lower()
    for url, titel in PAGINAS.items():
        if n in (url, titel.lower()):
            return url
    for url, titel in PAGINAS.items():
        if n and (n in titel.lower() or titel.lower() in n):
            return url
    return None


def groep_van(naam: str) -> str | None:
    n = (naam or "").strip().lower()
    return next((g for g in GROEPEN if g.lower() == n), None) or next((g for g in GROEPEN if n and n in g.lower()), None)


def bijwerken(bovenaan: list[str] | None = None, favorieten: list[str] | None = None,
              groepen: list[str] | None = None) -> list[str]:
    """Past de indeling aan; namen of urls mogen. Geeft wat niet herkend werd."""
    nu = opslag.instellingen().get("indeling") or {}
    onbekend: list[str] = []

    def urls(namen: list[str], maximaal: int) -> list[str]:
        uit = []
        for n in namen:
            if (u := url_van(n)) and u not in uit:
                uit.append(u)
            elif not u:
                onbekend.append(n)
        return uit[:maximaal]

    if bovenaan is not None:
        nu["bovenaan"] = urls(bovenaan, MAX_BOVENAAN)
        nu["winkelen_gezien"] = True
    if favorieten is not None:
        nu["favorieten"] = urls(favorieten, MAX_FAVORIETEN)
    if groepen is not None:
        gevonden = []
        for g in groepen:
            if (x := groep_van(g)) and x not in gevonden:
                gevonden.append(x)
            elif not x:
                onbekend.append(g)
        nu["groepen"] = gevonden
    opslag.instellingen_bijwerken(indeling=nu)
    return onbekend


def herstellen() -> None:
    opslag.instellingen_bijwerken(indeling={})
