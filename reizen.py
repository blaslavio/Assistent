"""Adressen opzoeken en reistijden berekenen met gratis OpenStreetMap-diensten.

- Nominatim zet een adres om in coördinaten (maximaal 1 verzoek per seconde).
- OSRM berekent de route met de auto. Voor fiets en lopen schatten we de tijd
  op basis van de afstand over de weg.

Deze openbare diensten zijn bedoeld voor licht gebruik. Voor veel gebruikers
is een betaalde dienst (bijvoorbeeld Google Maps of OpenRouteService) nodig.
"""

import os
import threading
import time
from functools import lru_cache

import httpx

NOMINATIM_URL = os.environ.get("NOMINATIM_URL", "https://nominatim.openstreetmap.org")
OSRM_URL = os.environ.get("OSRM_URL", "https://router.project-osrm.org")
USER_AGENT = "persoonlijke-assistent/0.1 (github.com/blaslavio/assistent)"

# Gemiddelde snelheden in km/u voor schattingen zonder eigen routeplanner.
SNELHEID = {"fiets": 15, "lopen": 5}

_nominatim_slot = threading.Lock()
_laatste_verzoek = 0.0


class AdresNietGevonden(Exception):
    pass


@lru_cache(maxsize=256)
def coordinaten(adres: str) -> tuple[float, float, str]:
    """Geeft (breedtegraad, lengtegraad, volledig adres) voor een adres."""
    global _laatste_verzoek
    with _nominatim_slot:
        wacht = 1.0 - (time.monotonic() - _laatste_verzoek)
        if wacht > 0:
            time.sleep(wacht)
        r = httpx.get(
            f"{NOMINATIM_URL}/search",
            params={"q": adres, "format": "jsonv2", "limit": 1},
            headers={"User-Agent": USER_AGENT, "Accept-Language": "nl"},
            timeout=15,
        )
        _laatste_verzoek = time.monotonic()
    r.raise_for_status()
    resultaten = r.json()
    if not resultaten:
        raise AdresNietGevonden(adres)
    eerste = resultaten[0]
    return float(eerste["lat"]), float(eerste["lon"]), eerste["display_name"]


def reistijd(van: str, naar: str, vervoer: str = "auto") -> dict:
    """Reistijd en afstand tussen twee adressen.

    vervoer: "auto", "fiets" of "lopen".
    """
    lat1, lon1, adres_van = coordinaten(van)
    lat2, lon2, adres_naar = coordinaten(naar)
    r = httpx.get(
        f"{OSRM_URL}/route/v1/driving/{lon1},{lat1};{lon2},{lat2}",
        params={"overview": "false"},
        headers={"User-Agent": USER_AGENT},
        timeout=15,
    )
    r.raise_for_status()
    route = r.json()["routes"][0]
    km = route["distance"] / 1000
    if vervoer in SNELHEID:
        minuten = km / SNELHEID[vervoer] * 60
    else:
        vervoer = "auto"
        minuten = route["duration"] / 60
    return {
        "van": adres_van,
        "naar": adres_naar,
        "vervoer": vervoer,
        "afstand_km": round(km, 1),
        "reistijd_minuten": max(1, round(minuten)),
    }
