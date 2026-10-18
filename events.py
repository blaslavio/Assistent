"""Evenementen in de buurt via de Ticketmaster Discovery API.

Daarvoor is een gratis sleutel nodig (developer.ticketmaster.com). Kopen gaat op
de site van Ticketmaster zelf: daar staan je gegevens in je account en betaal je
met bijvoorbeeld Apple Pay of iDEAL. De assistent rekent zelf nooit iets af.
"""

import os
import time
from datetime import datetime, timedelta, timezone

import httpx

import opslag
import reizen

TICKETMASTER_URL = os.environ.get("TICKETMASTER_URL", "https://app.ticketmaster.com")

_cache: dict[tuple, tuple[float, list]] = {}


def sleutel() -> str:
    return opslag.instellingen().get("ticketmaster_sleutel", "")


def zoeken(adres: str = "", dagen: int = 14, straal_km: int = 30, trefwoord: str = "", aantal: int = 20) -> list[dict]:
    """Evenementen rond een adres (standaard het thuisadres) in de komende dagen."""
    lat, lon, _ = reizen.coordinaten(adres or opslag.instellingen().get("thuisadres", "") or "Amsterdam")
    sleutel_cache = (round(lat, 2), round(lon, 2), dagen, straal_km, trefwoord, aantal)
    if sleutel_cache in _cache and time.time() - _cache[sleutel_cache][0] < 60 * 60:
        return _cache[sleutel_cache][1]
    nu = datetime.now(timezone.utc).replace(microsecond=0)
    params = {
        "apikey": sleutel(), "latlong": f"{lat},{lon}", "radius": straal_km, "unit": "km", "locale": "*",
        "startDateTime": nu.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "endDateTime": (nu + timedelta(days=dagen)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sort": "date,asc", "size": aantal,
    }
    if trefwoord:
        params["keyword"] = trefwoord
    r = httpx.get(f"{TICKETMASTER_URL}/discovery/v2/events.json", params=params, timeout=15)
    r.raise_for_status()
    resultaat = [_omzetten(e) for e in r.json().get("_embedded", {}).get("events", [])]
    _cache[sleutel_cache] = (time.time(), resultaat)
    return resultaat


def _omzetten(e: dict) -> dict:
    start = e.get("dates", {}).get("start", {})
    zaal = (e.get("_embedded", {}).get("venues") or [{}])[0]
    adres = ", ".join(filter(None, [zaal.get("name"), zaal.get("address", {}).get("line1"), zaal.get("city", {}).get("name")]))
    prijs = (e.get("priceRanges") or [{}])[0]
    afbeeldingen = sorted((a for a in e.get("images", []) if a.get("ratio") == "16_9"), key=lambda a: a.get("width", 0))
    soort = ((e.get("classifications") or [{}])[0].get("segment") or {}).get("name", "")
    return {
        "naam": e.get("name", ""),
        "datum": start.get("localDate", ""),
        "tijd": (start.get("localTime") or "")[:5],
        "locatie": adres,
        "soort": soort,
        "prijs": f"€ {prijs['min']:.0f}" + (f" tot € {prijs['max']:.0f}" if prijs.get("max", 0) > prijs["min"] else "")
                 if prijs.get("min") else "",
        "tickets": e.get("url", ""),
        "afbeelding": next((a["url"] for a in afbeeldingen if a.get("width", 0) >= 500), afbeeldingen[-1]["url"] if afbeeldingen else ""),
    }
