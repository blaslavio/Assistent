"""Feestdagen (Nederland of België) en schoolvakanties (Nederland, per regio) in de agenda.

Feestdagen rekenen we zelf uit. Schoolvakanties komen uit de open data van de Rijksoverheid; lukt dat even niet,
dan laten we ze weg (nooit zelf verzinnen).
"""

import threading
import time
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx

import opslag

LANDEN = {"NL": "Nederland", "BE": "België"}
REGIO_S = {"noord": "Noord", "midden": "Midden", "zuid": "Zuid"}
VAKANTIES_URL = "https://opendata.rijksoverheid.nl/v1/sources/rijksoverheid/infotypes/schoolholidays/schoolyear/{}?output=json"
REGIO_UITLEG = "https://www.rijksoverheid.nl/themas/onderwijs/schoolvakanties/regios-schoolvakantie"
AMS = ZoneInfo("Europe/Amsterdam")

# Overgenomen van rijksoverheid.nl (Overzicht schoolvakanties 2026-2027 en 2027-2028), voor als de open data
# even niet bereikbaar is. (naam, {regio: (van, tot)})
_BEKEND = {
    "2026-2027": [
        ("Herfstvakantie", {"noord": ("2026-10-10", "2026-10-18"), "midden": ("2026-10-17", "2026-10-25"),
                            "zuid": ("2026-10-17", "2026-10-25")}),
        ("Kerstvakantie", {r: ("2026-12-19", "2027-01-03") for r in ("noord", "midden", "zuid")}),
        ("Voorjaarsvakantie", {"noord": ("2027-02-20", "2027-02-28"), "midden": ("2027-02-20", "2027-02-28"),
                               "zuid": ("2027-02-13", "2027-02-21")}),
        ("Meivakantie", {r: ("2027-04-24", "2027-05-02") for r in ("noord", "midden", "zuid")}),
        ("Zomervakantie", {"noord": ("2027-07-10", "2027-08-22"), "midden": ("2027-07-17", "2027-08-29"),
                           "zuid": ("2027-07-24", "2027-09-05")}),
    ],
    "2027-2028": [
        ("Herfstvakantie", {"noord": ("2027-10-16", "2027-10-24"), "midden": ("2027-10-16", "2027-10-24"),
                            "zuid": ("2027-10-23", "2027-10-31")}),
        ("Kerstvakantie", {r: ("2027-12-25", "2028-01-09") for r in ("noord", "midden", "zuid")}),
        ("Voorjaarsvakantie", {"noord": ("2028-02-19", "2028-02-27"), "midden": ("2028-02-26", "2028-03-05"),
                               "zuid": ("2028-02-26", "2028-03-05")}),
        ("Meivakantie", {r: ("2028-04-29", "2028-05-07") for r in ("noord", "midden", "zuid")}),
        ("Zomervakantie", {"noord": ("2028-07-15", "2028-08-27"), "midden": ("2028-07-08", "2028-08-20"),
                           "zuid": ("2028-07-22", "2028-09-03")}),
    ],
}


def _bekend(schooljaar: str) -> list[dict]:
    return [{"naam": naam, "regio": regio, "van": date.fromisoformat(v), "tot": date.fromisoformat(t)}
            for naam, regios in _BEKEND.get(schooljaar, []) for regio, (v, t) in regios.items()]


_vakanties: dict[str, tuple[float, list[dict]]] = {}
_slot = threading.Lock()


def pasen(jaar: int) -> date:
    """Eerste paasdag (gregoriaans, anonieme algoritme)."""
    a, b, c = jaar % 19, jaar // 100, jaar % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    maand = (h + l - 7 * m + 114) // 31
    return date(jaar, maand, (h + l - 7 * m + 114) % 31 + 1)


def _zondag(jaar: int, maand: int, welke: int) -> date:
    eerste = date(jaar, maand, 1)
    return eerste + timedelta(days=(6 - eerste.weekday()) % 7 + 7 * (welke - 1))


def feestdagen(jaar: int, land: str = "NL", extra: bool = True) -> list[tuple[date, str]]:
    p = pasen(jaar)
    if land == "BE":
        dagen = [(date(jaar, 1, 1), "Nieuwjaar"), (p, "Pasen"), (p + timedelta(1), "Paasmaandag"),
                 (date(jaar, 5, 1), "Feest van de Arbeid"), (p + timedelta(39), "O.L.H. Hemelvaart"),
                 (p + timedelta(49), "Pinksteren"), (p + timedelta(50), "Pinkstermaandag"),
                 (date(jaar, 7, 21), "Nationale feestdag"), (date(jaar, 8, 15), "O.L.V. Hemelvaart"),
                 (date(jaar, 11, 1), "Allerheiligen"), (date(jaar, 11, 11), "Wapenstilstand"),
                 (date(jaar, 12, 25), "Kerstmis")]
        if extra:
            dagen += [(_zondag(jaar, 5, 2), "Moederdag"), (_zondag(jaar, 6, 2), "Vaderdag"),
                      (date(jaar, 12, 6), "Sinterklaas"), (date(jaar, 12, 31), "Oudejaarsavond")]
    else:
        koningsdag = date(jaar, 4, 27)
        if koningsdag.weekday() == 6:
            koningsdag -= timedelta(days=1)
        dagen = [(date(jaar, 1, 1), "Nieuwjaarsdag"), (p - timedelta(2), "Goede Vrijdag"), (p, "Eerste paasdag"),
                 (p + timedelta(1), "Tweede paasdag"), (koningsdag, "Koningsdag"), (p + timedelta(39), "Hemelvaartsdag"),
                 (p + timedelta(49), "Eerste pinksterdag"), (p + timedelta(50), "Tweede pinksterdag"),
                 (date(jaar, 12, 25), "Eerste kerstdag"), (date(jaar, 12, 26), "Tweede kerstdag")]
        dagen.append((date(jaar, 5, 5), "Bevrijdingsdag"))
        if extra:
            dagen += [(_zondag(jaar, 5, 2), "Moederdag"), (_zondag(jaar, 6, 3), "Vaderdag"),
                      (date(jaar, 12, 5), "Sinterklaasavond"), (date(jaar, 12, 31), "Oudejaarsavond")]
    return sorted(dagen)


def _schooljaren(van: date, tot: date) -> list[str]:
    eerste = van.year - (1 if van.month < 8 else 0)
    laatste = tot.year - (1 if tot.month < 8 else 0)
    return [f"{j}-{j + 1}" for j in range(eerste, laatste + 1)]


def _lokaal(iso: str) -> date:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(AMS).date()


def _vakanties_lezen(data) -> list[dict]:
    """Zoek alle vakanties in het antwoord van de Rijksoverheid (de vorm verschilt wat per jaar)."""
    uit = []
    if isinstance(data, list):
        for x in data:
            uit += _vakanties_lezen(x)
    elif isinstance(data, dict):
        if isinstance(data.get("vacations"), list):
            for v in data["vacations"]:
                for r in v.get("regions", []):
                    try:
                        uit.append({"naam": str(v.get("type", "")).strip(), "regio": str(r.get("region", "")).strip().lower(),
                                    "van": _lokaal(r["startdate"]), "tot": _lokaal(r["enddate"])})
                    except (KeyError, ValueError, TypeError):
                        continue
        else:
            for x in data.values():
                if isinstance(x, (list, dict)):
                    uit += _vakanties_lezen(x)
    return uit


_bezig: set[str] = set()


def _ophalen(schooljaar: str) -> None:
    try:
        r = httpx.get(VAKANTIES_URL.format(schooljaar), timeout=8, follow_redirects=True)
        r.raise_for_status()
        lijst = _vakanties_lezen(r.json())
    except Exception:
        lijst = None
    with _slot:
        oud = _vakanties.get(schooljaar)
        if not lijst:
            lijst = oud[1] if oud and oud[1] else _bekend(schooljaar)
        _vakanties[schooljaar] = (time.time(), lijst)
        _bezig.discard(schooljaar)


def _haal(schooljaar: str, wachten: float = 1.0) -> list[dict]:
    """Uit het geheugen; is het er niet (of oud), dan op de achtergrond ophalen en heel even wachten."""
    with _slot:
        bewaard = _vakanties.get(schooljaar)
        vers = bewaard and time.time() - bewaard[0] < (86400 if bewaard[1] else 1800)
        if vers:
            return bewaard[1]
        if schooljaar not in _bezig:
            _bezig.add(schooljaar)
            draad = threading.Thread(target=_ophalen, args=(schooljaar,), daemon=True)
            draad.start()
        else:
            draad = None
    if not bewaard and _BEKEND.get(schooljaar):
        return _bekend(schooljaar)
    if draad and not bewaard:
        draad.join(wachten)
    with _slot:
        bewaard = _vakanties.get(schooljaar)
    return bewaard[1] if bewaard else []


def vakanties(regio: str, van: date, tot: date) -> list[dict]:
    uit = []
    for jaar in _schooljaren(van, tot):
        for v in _haal(jaar):
            if (v["regio"] == regio or "heel" in v["regio"]) and v["van"] <= tot and v["tot"] >= van:
                uit.append(v)
    return uit


def instellingen() -> dict:
    return {"land": "NL", "regio": "", "extra": False, **opslag.instellingen().get("feestdagen", {})}


def items(van: str, tot: str) -> list[dict]:
    """Feestdagen en schooldagen-vrij als (alleen te lezen) afspraken voor de hele dag."""
    i = instellingen()
    if not i["land"]:
        return []
    # Sommige aanroepen vragen "alles tot 9999"; meer dan een paar jaar heeft geen zin.
    vandaag = date.today()
    begin = max(date.fromisoformat(van[:10]), vandaag - timedelta(days=400))
    eind = min(date.fromisoformat(tot[:10]), vandaag + timedelta(days=800))
    if begin > eind:
        return []
    uit = []
    for jaar in range(begin.year, eind.year + 1):
        for dag, naam in feestdagen(jaar, i["land"], i["extra"]):
            if begin <= dag <= eind:
                uit.append({"id": f"ext:fd:{dag.isoformat()}:{naam}", "titel": naam, "start": dag.isoformat(),
                            "einde": None, "locatie": "", "notitie": "", "soort": "vrij", "extern": True,
                            "bron": "feestdagen"})
    if i["land"] == "NL" and i["regio"] in REGIO_S:
        for v in vakanties(i["regio"], begin, eind):
            dag = max(v["van"], begin)
            while dag <= min(v["tot"], eind):
                uit.append({"id": f"ext:sv:{dag.isoformat()}:{v['naam']}", "titel": v["naam"], "start": dag.isoformat(),
                            "einde": None, "locatie": "", "notitie": "", "soort": "vrij", "extern": True,
                            "bron": "schoolvakanties"})
                dag += timedelta(days=1)
    return uit
