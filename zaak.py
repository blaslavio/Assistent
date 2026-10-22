"""Zakelijk: groepslessen, afspraken afvinken, saldo per klant en een eenvoudige boekhouding.
Zie sql/chat_boeken.sql en sql/zaak.sql. Bedragen zijn in centen en inclusief btw.

Een 'post' is een regel in de boekhouding: een geleverde dienst (de klant moet betalen), een ontvangen betaling of
eigen kosten. Saldo per klant = betalingen - diensten: positief is tegoed, negatief nog te betalen.
"""

import csv
import io
from datetime import date, datetime, timedelta

import boekpagina
import opslag
import samen

SOORTEN_ZAAK = {"gym": "Gym of club", "trainer": "Personal trainer", "dienst": "Dienstverlener"}
STANDAARD = {"soort": "gym", "groepslessen": True, "afspraken": True, "btw": 21, "naam": ""}
BTW = [0, 9, 21]
KOSTEN = ["Huur", "Materiaal", "Marketing", "Verzekering", "Software", "Vervoer", "Opleiding", "Overig"]


def instellingen() -> dict:
    return STANDAARD | (opslag.instellingen().get("zaak") or {})


def btw() -> int:
    b = instellingen().get("btw", 21)
    return b if b in BTW else 21


def bedrag(centen: int) -> str:
    tekst = f"{abs(centen) / 100:,.2f}".replace(",", " ").replace(".", ",").replace(" ", ".")
    return ("- " if centen < 0 else "") + "€ " + tekst


def centen(tekst) -> int:
    """'12,50' of 12.5 → 1250."""
    if isinstance(tekst, (int, float)):
        return round(tekst * 100)
    s = str(tekst).strip().replace("€", "").replace(" ", "")
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return round(float(s) * 100)
    except ValueError:
        return 0


def zorg_voor_profiel() -> str:
    """Een zaak heeft een adres nodig (dat van de boekingspagina). Bestaat het nog niet, dan maken we het (uit)."""
    m = boekpagina.mijn()
    if m.get("pagina"):
        return m["pagina"]["adres"]
    p = dict(boekpagina.STANDAARD, adres=boekpagina.voorstel_adres(), aan=False)
    return boekpagina.instellen(p)["adres"]


# --- Groepslessen -----------------------------------------------------------------------------------------------------

def les_maken(naam: str, start: datetime, minuten: int, plekken: int, prijs: int, locatie: str = "",
              herhaal: bool = False, aantal: int = 12) -> int:
    r = samen._ok(opslag._rpc_ik("zaak_les_maken", p_les={
        "naam": naam, "start": start.strftime("%Y-%m-%dT%H:%M"), "minuten": minuten, "plekken": plekken,
        "prijs": prijs, "locatie": locatie, "herhaal": "week" if herhaal else "", "aantal": aantal}))
    return r["aantal"]


def lessen(van: date, tot: date) -> list[dict]:
    return samen._ok(opslag._rpc_ik("zaak_lessen", p_van=van.isoformat(), p_tot=tot.isoformat()))["lessen"]


def les_weg(les_id: int, volgende: bool = False) -> int:
    return samen._ok(opslag._rpc_ik("zaak_les_weg", p_id=les_id, p_volgende=volgende))["aantal"]


def deelnemer_erbij(les_id: int, naam: str) -> None:
    samen._ok(opslag._rpc_ik("zaak_les_deelnemer", p_les=les_id, p_wie=naam))


def les_afvinken(deelnemer_id: int, afvink: str) -> None:
    samen._ok(opslag._rpc_ik("zaak_les_afvinken", p_deelnemer=deelnemer_id, p_afvink=afvink, p_btw=btw()))


# --- Afspraken en boekhouding -----------------------------------------------------------------------------------------

def afvinken(boeking_id: int, afvink: str, rekenen: bool = False) -> int:
    return samen._ok(opslag._rpc_ik("zaak_afvinken", p_boeking=boeking_id, p_afvink=afvink, p_rekenen=rekenen,
                                    p_btw=btw()))["saldo"]


def overzicht(van: date, tot: date) -> dict:
    return samen._ok(opslag._rpc_ik("zaak_overzicht", p_van=van.isoformat(), p_tot=tot.isoformat()))


def post(soort: str, bedrag_centen: int, omschrijving: str = "", klant: str = "", klant_id: int | None = None,
         btw_pct: int | None = None, categorie: str = "", datum: date | None = None) -> dict:
    return samen._ok(opslag._rpc_ik("zaak_post", p_post={
        "soort": soort, "bedrag": bedrag_centen, "omschrijving": omschrijving, "klant": klant, "klant_id": klant_id,
        "btw": btw() if btw_pct is None else btw_pct, "categorie": categorie,
        "datum": (datum or date.today()).isoformat()}))["post"]


def post_weg(post_id: int) -> None:
    samen._ok(opslag._rpc_ik("zaak_post_weg", p_id=post_id))


def betaling_ontvangen(ids: list[int], bedrag_centen: int | None = None) -> int:
    return samen._ok(opslag._rpc_ik("zaak_betaling_ontvangen", p_ids=ids, p_bedrag=bedrag_centen))["saldo"]


def btw_deel(centen_incl: int, pct: int) -> int:
    return round(centen_incl * pct / (100 + pct)) if pct else 0


def cijfers(posten: list[dict]) -> dict:
    """Omzet (geleverde diensten), ontvangen, kosten, winst en btw over een lijst regels."""
    omzet = sum(p["bedrag"] for p in posten if p["soort"] == "dienst")
    ontvangen = sum(p["bedrag"] for p in posten if p["soort"] == "betaling")
    kosten = sum(p["bedrag"] for p in posten if p["soort"] == "kosten")
    btw_af = sum(btw_deel(p["bedrag"], p["btw"]) for p in posten if p["soort"] == "dienst")
    btw_voor = sum(btw_deel(p["bedrag"], p["btw"]) for p in posten if p["soort"] == "kosten")
    return {"omzet": omzet, "ontvangen": ontvangen, "kosten": kosten,
            "winst": (omzet - btw_af) - (kosten - btw_voor), "btw_af": btw_af, "btw_voor": btw_voor,
            "btw_saldo": btw_af - btw_voor}


def periode(soort: str, vandaag: date | None = None) -> tuple[date, date]:
    d = vandaag or date.today()
    if soort == "Maand":
        van = d.replace(day=1)
        tot = (van + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    elif soort == "Kwartaal":
        van = date(d.year, 3 * ((d.month - 1) // 3) + 1, 1)
        tot = (date(d.year + (van.month == 10), (van.month + 3 - 1) % 12 + 1, 1)) - timedelta(days=1)
    else:
        van, tot = date(d.year, 1, 1), date(d.year, 12, 31)
    return van, tot


SOORT_NAAM = {"dienst": "Geleverd", "betaling": "Ontvangen", "kosten": "Kosten"}


def csv_bestand(posten: list[dict]) -> bytes:
    """Alle regels als CSV (puntkomma, Nederlandse komma), voor je boekhouder of Excel."""
    uit = io.StringIO()
    w = csv.writer(uit, delimiter=";")
    w.writerow(["Datum", "Soort", "Klant", "Omschrijving", "Categorie", "Bedrag incl. btw", "Btw %", "Btw"])
    for p in sorted(posten, key=lambda p: (p["datum"], p["id"])):
        w.writerow([p["datum"], SOORT_NAAM.get(p["soort"], p["soort"]), p["klant"], p["omschrijving"], p["categorie"],
                    f"{p['bedrag'] / 100:.2f}".replace(".", ","), p["btw"],
                    f"{btw_deel(p['bedrag'], p['btw']) / 100:.2f}".replace(".", ",")])
    return ("﻿" + uit.getvalue()).encode()


def nog_afvinken(o: dict | None = None) -> list[dict]:
    """Afspraken die voorbij zijn en nog niet afgevinkt (laatste 60 dagen)."""
    o = o or overzicht(date.today(), date.today())
    return [b for b in o["afvinken"] if not b.get("afgevinkt")]
