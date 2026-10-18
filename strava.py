"""Koppeling met Strava, om trainingen automatisch over te nemen.

Strava haalt zelf trainingen op uit Apple Gezondheid, een Apple Watch of Garmin.
De gebruiker maakt een eigen Strava-API-app aan en vult Client ID en Client Secret
in de assistent in. Die staan, net als de Anthropic-sleutel, in de beveiligde gegevens.
"""

import os
import time
from datetime import datetime, timedelta
from urllib.parse import urlencode

import httpx

import opslag

STRAVA_URL = os.environ.get("STRAVA_URL", "https://www.strava.com")

SOORT = {
    "Run": "hardlopen", "TrailRun": "hardlopen", "VirtualRun": "hardlopen",
    "Ride": "fietsen", "VirtualRide": "fietsen", "GravelRide": "fietsen", "MountainBikeRide": "fietsen",
    "EBikeRide": "fietsen", "Swim": "zwemmen", "Walk": "wandelen", "Hike": "wandelen",
    "WeightTraining": "fitness", "Workout": "fitness", "Crossfit": "fitness", "HighIntensityIntervalTraining": "fitness",
    "Elliptical": "fitness", "StairStepper": "fitness", "Rowing": "roeien", "Yoga": "yoga", "Pilates": "yoga",
    "Soccer": "voetbal", "Tennis": "tennis", "Padel": "padel",
}


def gekoppeld() -> bool:
    return bool(opslag.instellingen().get("strava_tokens"))


def koppel_link(client_id: str, terug_url: str) -> str:
    return f"{STRAVA_URL}/oauth/authorize?" + urlencode({
        "client_id": client_id, "redirect_uri": terug_url, "response_type": "code",
        "approval_prompt": "auto", "scope": "activity:read_all",
    })


def _tokens_bewaren(antwoord: dict) -> None:
    tokens = {k: antwoord[k] for k in ("access_token", "refresh_token", "expires_at")}
    opslag.instellingen_bijwerken(strava_tokens=tokens)


def code_inwisselen(code: str) -> str:
    """Rondt de koppeling af met de code die Strava terugstuurt. Geeft de naam van de sporter."""
    inst = opslag.instellingen()
    r = httpx.post(f"{STRAVA_URL}/oauth/token", data={
        "client_id": inst["strava_client_id"], "client_secret": inst["strava_client_secret"],
        "code": code, "grant_type": "authorization_code",
    }, timeout=15)
    r.raise_for_status()
    antwoord = r.json()
    _tokens_bewaren(antwoord)
    sporter = antwoord.get("athlete", {})
    naam = " ".join(filter(None, [sporter.get("firstname"), sporter.get("lastname")]))
    opslag.instellingen_bijwerken(strava_naam=naam)
    return naam


def ontkoppelen() -> None:
    opslag.instellingen_bijwerken(strava_tokens=None, strava_naam="")


def _toegangscode() -> str:
    inst = opslag.instellingen()
    tokens = inst["strava_tokens"]
    if tokens["expires_at"] > time.time() + 60:
        return tokens["access_token"]
    r = httpx.post(f"{STRAVA_URL}/oauth/token", data={
        "client_id": inst["strava_client_id"], "client_secret": inst["strava_client_secret"],
        "refresh_token": tokens["refresh_token"], "grant_type": "refresh_token",
    }, timeout=15)
    r.raise_for_status()
    _tokens_bewaren(r.json())
    return r.json()["access_token"]


def trainingen(dagen: int = 14) -> list[dict]:
    na = int((datetime.now() - timedelta(days=dagen)).timestamp())
    r = httpx.get(f"{STRAVA_URL}/api/v3/athlete/activities", params={"after": na, "per_page": 100},
                  headers={"Authorization": f"Bearer {_toegangscode()}"}, timeout=15)
    r.raise_for_status()
    return r.json()


def bijwerken(dagen: int = 14) -> int:
    """Haalt trainingen op en koppelt ze aan sportafspraken. Geeft het aantal nieuwe trainingen."""
    nieuw = 0
    for training in trainingen(dagen):
        start = training["start_date_local"].rstrip("Z")[:16]
        sport = SOORT.get(training.get("sport_type") or training.get("type"), (training.get("sport_type") or "sport").lower())
        resultaat = {
            "minuten": round(training.get("moving_time") or training.get("elapsed_time") or 0) // 60,
            "afstand_km": round((training.get("distance") or 0) / 1000, 1),
            "bron": "strava",
        }
        if opslag.training_koppelen(training["id"], training.get("name") or sport, start, sport, resultaat):
            nieuw += 1
    return nieuw
