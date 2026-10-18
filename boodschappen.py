"""Boodschappenlijst met prijsvergelijking tussen supermarkten.

Prijzen komen uit de open data van Checkjebon.nl (dagelijks bijgewerkt, vrij te
gebruiken). Supermarkten in de buurt komen uit OpenStreetMap.
"""

import math
import os
import re
import threading
import time

import httpx

import opslag
import reizen

PRIJZEN_URL = os.environ.get("PRIJZEN_URL", "https://raw.githubusercontent.com/supermarkt/checkjebon/main/data/supermarkets.json")
OVERPASS_URL = os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter")

# Merknaam in OpenStreetMap naar code in de prijsgegevens.
MERKEN = {
    "albert heijn": "ah", "ah": "ah", "jumbo": "jumbo", "lidl": "lidl", "aldi": "aldi", "plus": "plus",
    "dirk": "dirk", "dirk van den broek": "dirk", "dekamarkt": "dekamarkt", "hoogvliet": "hoogvliet",
    "spar": "spar", "vomar": "vomar", "poiesz": "poiesz", "ekoplaza": "ekoplaza",
}
NAMEN = {"ah": "Albert Heijn", "lidl": "Lidl"}

_slot = threading.Lock()
_prijzen: dict = {"tijd": 0.0, "winkels": []}
_buurt_cache: dict[tuple, tuple[float, list]] = {}


def prijzen() -> list[dict]:
    """Alle producten per supermarkt. Wordt twaalf uur bewaard."""
    with _slot:
        if time.time() - _prijzen["tijd"] > 12 * 60 * 60:
            r = httpx.get(PRIJZEN_URL, timeout=60, follow_redirects=True)
            r.raise_for_status()
            winkels = []
            for w in r.json():
                if not w.get("d"):
                    continue
                producten = [(p["n"].lower(), p) for p in w["d"] if p.get("p")]
                winkels.append({"code": w["n"], "naam": NAMEN.get(w["n"], w["c"]), "url": w.get("u", ""),
                                "producten": producten})
            _prijzen.update(tijd=time.time(), winkels=winkels)
        return _prijzen["winkels"]


EENHEDEN = re.compile(r"^(\d+([,.]\d+)?(-|x)?|\d*(g|gr|gram|kg|kilo|ml|cl|l|liter|st|stuks?|pak|zak|blik|fles|stuk))$")


def _woorden(tekst: str) -> list[str]:
    return [w for w in re.split(r"[^\w%,.-]+", tekst.lower()) if w]


def _score(naam: str, zoekwoorden: list[str]) -> tuple | None:
    """Hoe goed een productnaam past; None als hij niet past. Lager is beter."""
    woorden = [w for w in _woorden(naam) if not EENHEDEN.match(w)]
    if not woorden:
        return None
    # Ieder zoekwoord moet een los woord zijn, of het einde van een samenstelling (scharrel-eieren).
    samenstellingen = 0
    for z in zoekwoorden:
        if z in woorden:
            continue
        if not any(w.endswith(z) for w in woorden):
            return None
        samenstellingen += 1
    # Hoe minder extra woorden, hoe beter het past ("AH Roomboter" boven "AH Bladerdeeg roomboter").
    extra = len(woorden) - len(zoekwoorden)
    kern_mis = not woorden[-1].endswith(zoekwoorden[-1])
    return (samenstellingen, extra, kern_mis)


def beste_product(winkel: dict, zoekterm: str) -> dict | None:
    """Het product dat het best bij de zoekterm past; bij gelijke pasvorm het goedkoopste."""
    zoekwoorden = [w for w in _woorden(zoekterm) if not EENHEDEN.match(w)]
    if not zoekwoorden:
        return None
    beste, beste_sleutel = None, None
    for naam, p in winkel["producten"]:
        if p["p"] < 0.10 or not all(z in naam for z in zoekwoorden):
            continue
        score = _score(naam, zoekwoorden)
        if score is None:
            continue
        sleutel = (*score, p["p"])
        if beste_sleutel is None or sleutel < beste_sleutel:
            beste, beste_sleutel = p, sleutel
    if not beste:
        return None
    return {"naam": beste["n"], "prijs": beste["p"], "hoeveelheid": beste.get("s", ""),
            "link": winkel["url"] + beste["l"] if beste.get("l") and winkel["code"] != "spar" else ""}


def vergelijken(lijst: list[str]) -> list[dict]:
    """Totaalprijs per supermarkt, goedkoopste eerst. Ontbrekende producten worden geschat."""
    winkels = prijzen()
    per_winkel = []
    for w in winkels:
        regels = [{"zoekterm": term, "product": beste_product(w, term)} for term in lijst]
        per_winkel.append({"code": w["code"], "naam": w["naam"], "regels": regels})
    # Schatting voor wat een winkel niet heeft: gemiddelde prijs bij de andere winkels.
    for i, term in enumerate(lijst):
        gevonden = [w["regels"][i]["product"]["prijs"] for w in per_winkel if w["regels"][i]["product"]]
        schatting = sum(gevonden) / len(gevonden) if gevonden else 0
        for w in per_winkel:
            w["regels"][i]["schatting"] = None if w["regels"][i]["product"] else round(schatting, 2)
    for w in per_winkel:
        w["gevonden"] = sum(1 for r in w["regels"] if r["product"])
        w["totaal"] = round(sum(r["product"]["prijs"] if r["product"] else r["schatting"] for r in w["regels"]), 2)
    per_winkel = [w for w in per_winkel if w["gevonden"]]
    # Winkels die veel niet hebben, zakken: de schatting is minder betrouwbaar.
    per_winkel.sort(key=lambda w: (w["gevonden"] < len(lijst) * 0.7, w["totaal"]))
    return per_winkel


def _afstand_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))


def winkels_in_de_buurt(adres: str = "", straal_km: int = 5) -> dict[str, dict]:
    """De dichtstbijzijnde vestiging per supermarktketen."""
    lat, lon, _ = reizen.coordinaten(adres or opslag.instellingen().get("thuisadres", "") or "Amsterdam")
    sleutel = (round(lat, 3), round(lon, 3), straal_km)
    if sleutel in _buurt_cache and time.time() - _buurt_cache[sleutel][0] < 24 * 60 * 60:
        return _buurt_cache[sleutel][1]
    vraag = f"[out:json][timeout:25];nwr(around:{straal_km * 1000},{lat},{lon})[shop=supermarket];out center tags 300;"
    r = httpx.post(OVERPASS_URL, data={"data": vraag}, headers={"User-Agent": reizen.USER_AGENT}, timeout=40)
    r.raise_for_status()
    dichtst: dict[str, dict] = {}
    for e in r.json().get("elements", []):
        tags = e.get("tags", {})
        merk = (tags.get("brand") or tags.get("name") or "").lower()
        code = MERKEN.get(merk) or next((c for m, c in MERKEN.items() if merk.startswith(m + " ")), None)
        plek = e.get("center") or e
        if not code or "lat" not in plek:
            continue
        afstand = round(_afstand_km(lat, lon, plek["lat"], plek["lon"]), 1)
        if code not in dichtst or afstand < dichtst[code]["afstand_km"]:
            straat = " ".join(filter(None, [tags.get("addr:street"), tags.get("addr:housenumber")]))
            dichtst[code] = {"naam": tags.get("name", merk.title()), "adres": ", ".join(filter(None, [straat, tags.get("addr:city")])),
                             "afstand_km": afstand, "lat": plek["lat"], "lon": plek["lon"],
                             "openingstijden": tags.get("opening_hours", "")}
    _buurt_cache[sleutel] = (time.time(), dichtst)
    return dichtst
