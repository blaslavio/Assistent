"""Het weer via Open-Meteo (gratis, geen sleutel nodig)."""

import os
import time

import httpx

import reizen
import symbool

WEER_URL = os.environ.get("WEER_URL", "https://api.open-meteo.com")
STANDAARD_PLAATS = "Amsterdam"

# WMO-weercodes naar symbool (Material Symbols, zie symbool.py) en omschrijving.
CODES = {
    0: ("sunny", "zonnig"), 1: ("partly_cloudy_day", "overwegend zonnig"), 2: ("partly_cloudy_day", "half bewolkt"),
    3: ("cloud", "bewolkt"), 45: ("foggy", "mist"), 48: ("foggy", "mist met rijp"),
    51: ("rainy_light", "lichte motregen"), 53: ("rainy_light", "motregen"), 55: ("rainy", "dichte motregen"),
    56: ("rainy", "ijzel"), 57: ("rainy", "ijzel"),
    61: ("rainy_light", "lichte regen"), 63: ("rainy", "regen"), 65: ("rainy_heavy", "zware regen"),
    66: ("rainy", "ijzel"), 67: ("rainy", "ijzel"),
    71: ("weather_snowy", "lichte sneeuw"), 73: ("weather_snowy", "sneeuw"), 75: ("ac_unit", "zware sneeuw"),
    77: ("weather_snowy", "sneeuwkorrels"),
    80: ("rainy_light", "buien"), 81: ("rainy", "buien"), 82: ("thunderstorm", "zware buien"),
    85: ("weather_snowy", "sneeuwbuien"), 86: ("weather_snowy", "zware sneeuwbuien"),
    95: ("thunderstorm", "onweer"), 96: ("weather_hail", "onweer met hagel"), 99: ("weather_hail", "onweer met hagel"),
}

_cache: dict[tuple[float, float], tuple[float, dict]] = {}


def omschrijving(code: int) -> tuple[str, str]:
    """Symbool (voor markdown) en omschrijving van een weercode."""
    naam, tekst = CODES.get(code, ("thermostat", "onbekend"))
    return symbool.md(naam), tekst


def voorspelling(adres: str) -> dict:
    """Weer nu, per uur en per dag (7 dagen) voor een adres. Een half uur bewaard."""
    lat, lon, naam = reizen.coordinaten(adres or STANDAARD_PLAATS)
    sleutel = (round(lat, 2), round(lon, 2))
    if sleutel in _cache and time.time() - _cache[sleutel][0] < 30 * 60:
        return _cache[sleutel][1]
    r = httpx.get(f"{WEER_URL}/v1/forecast", params={
        "latitude": lat, "longitude": lon, "timezone": "Europe/Amsterdam", "forecast_days": 7,
        "current": "temperature_2m,weather_code,wind_speed_10m,precipitation",
        "hourly": "temperature_2m,precipitation_probability,weather_code",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
    }, timeout=15)
    r.raise_for_status()
    data = r.json()
    data["plaats"] = naam.split(",")[0] if adres else STANDAARD_PLAATS
    _cache[sleutel] = (time.time(), data)
    return data


def op_moment(adres: str, moment: str) -> dict | None:
    """Verwachting voor een adres op een tijdstip (JJJJ-MM-DDTHH:MM), of None als het te ver weg is."""
    data = voorspelling(adres)
    uur = moment[:13] + ":00"
    uren = data["hourly"]["time"]
    if uur not in uren:
        return None
    i = uren.index(uur)
    icoon, tekst = omschrijving(data["hourly"]["weather_code"][i])
    return {
        "temperatuur": round(data["hourly"]["temperature_2m"][i]),
        "kans_op_regen": data["hourly"]["precipitation_probability"][i],
        "icoon": icoon,
        "omschrijving": tekst,
    }


def samenvatting(adres: str, datum: str = "") -> dict:
    """Korte verwachting voor één dag (standaard vandaag), voor de assistent."""
    data = voorspelling(adres)
    dagen = data["daily"]["time"]
    i = dagen.index(datum) if datum in dagen else 0
    icoon, tekst = omschrijving(data["daily"]["weather_code"][i])
    return {
        "plaats": data["plaats"],
        "datum": dagen[i],
        "omschrijving": tekst,
        "min": round(data["daily"]["temperature_2m_min"][i]),
        "max": round(data["daily"]["temperature_2m_max"][i]),
        "kans_op_regen": data["daily"]["precipitation_probability_max"][i],
    }
