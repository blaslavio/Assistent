"""Uitjes in de buurt uit OpenStreetMap (gratis, geen sleutel nodig)."""

import math
import os
import time


import opslag
import reizen


# Voorkeuren waarop de gebruiker kan sorteren.
VOORKEUREN = ["Cultuur", "Muziek", "Film", "Natuur", "Dieren", "Actief", "Sport", "Familie", "Bezienswaardigheden"]

# OpenStreetMap-soort: (omschrijving, icoon, binnen?, voorkeur)
SOORTEN = {
    "museum": ("Museum", "🏛️", True, "Cultuur"), "gallery": ("Galerie", "🖼️", True, "Cultuur"),
    "theatre": ("Theater", "🎭", True, "Cultuur"), "arts_centre": ("Cultuurcentrum", "🎨", True, "Cultuur"),
    "music_venue": ("Muziekpodium", "🎵", True, "Muziek"), "concert_hall": ("Concertzaal", "🎻", True, "Muziek"),
    "cinema": ("Bioscoop", "🎬", True, "Film"),
    "nature_reserve": ("Natuurgebied", "🌳", False, "Natuur"), "park": ("Park", "🌳", False, "Natuur"),
    "beach_resort": ("Strand", "🏖️", False, "Natuur"),
    "zoo": ("Dierentuin", "🦁", False, "Dieren"), "aquarium": ("Aquarium", "🐠", True, "Dieren"),
    "farm": ("Kinderboerderij", "🐐", False, "Dieren"),
    "bowling_alley": ("Bowling", "🎳", True, "Actief"), "escape_game": ("Escaperoom", "🔐", True, "Actief"),
    "trampoline_park": ("Trampolinepark", "🤸", True, "Actief"), "ice_rink": ("IJsbaan", "⛸️", True, "Actief"),
    "climbing": ("Klimhal", "🧗", True, "Actief"), "miniature_golf": ("Midgetgolf", "⛳", False, "Actief"),
    "water_park": ("Zwemparadijs", "🌊", True, "Familie"), "swimming_pool": ("Zwembad", "🏊", True, "Sport"),
    "stadium": ("Stadion", "🏟️", False, "Sport"),
    "theme_park": ("Pretpark", "🎢", False, "Familie"), "playground": ("Speeltuin", "🛝", False, "Familie"),
    "attraction": ("Bezienswaardigheid", "📸", False, "Bezienswaardigheden"),
    "viewpoint": ("Uitzichtpunt", "🔭", False, "Bezienswaardigheden"),
    "castle": ("Kasteel", "🏰", False, "Bezienswaardigheden"), "monument": ("Monument", "🗿", False, "Bezienswaardigheden"),
}

_cache: dict[tuple, tuple[float, list]] = {}


def _afstand_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))


def in_de_buurt(adres: str = "", straal_km: int = 15) -> list[dict]:
    """Uitjes rond een adres (standaard het thuisadres), dichtstbij eerst. Een dag bewaard."""
    lat, lon, _ = reizen.coordinaten(adres or opslag.instellingen().get("thuisadres", "") or "Amsterdam")
    sleutel = (round(lat, 2), round(lon, 2), straal_km)
    if sleutel in _cache and time.time() - _cache[sleutel][0] < 24 * 60 * 60:
        return _cache[sleutel][1]
    rond = f"(around:{straal_km * 1000},{lat},{lon})"
    vraag = f"""[out:json][timeout:25];
(
  nwr{rond}[tourism~"^(museum|gallery|aquarium|zoo|theme_park)$"][name];
  nwr{rond}[tourism~"^(attraction|viewpoint)$"][name][wikidata];
  nwr{rond}[amenity~"^(cinema|theatre|arts_centre|music_venue|concert_hall)$"][name];
  nwr{rond}[leisure~"^(bowling_alley|escape_game|trampoline_park|water_park|miniature_golf|nature_reserve|ice_rink|beach_resort|stadium)$"][name];
  nwr{rond}[leisure=park][name][wikidata];
  nwr{rond}[leisure=sports_centre][sport=climbing][name];
  nwr{rond}[leisure=swimming_pool][access!=private][name];
  nwr{rond}[historic~"^(castle|monument)$"][name][wikidata];
  nwr{rond}[amenity=animal_farm][name];
);
out center tags 600;"""
    try:
        antwoord = reizen.overpass(vraag)
    except Exception:
        if sleutel in _cache:  # liever een oudere lijst dan niets
            return _cache[sleutel][1]
        raise
    resultaat, gezien = [], set()
    for e in antwoord.get("elements", []):
        tags = e.get("tags", {})
        soort = next((tags.get(k) for k in ("tourism", "amenity", "leisure", "historic") if tags.get(k) in SOORTEN), None)
        if tags.get("sport") == "climbing":
            soort = "climbing"
        elif tags.get("amenity") == "animal_farm":
            soort = "farm"
        plek = e.get("center") or e
        if not soort or "lat" not in plek or tags["name"] in gezien:
            continue
        gezien.add(tags["name"])
        omschrijving, icoon, binnen, voorkeur = SOORTEN[soort]
        adres_delen = [" ".join(filter(None, [tags.get("addr:street"), tags.get("addr:housenumber")])), tags.get("addr:city")]
        resultaat.append({
            "naam": tags["name"], "soort": omschrijving, "icoon": icoon, "binnen": binnen, "voorkeur": voorkeur,
            "afstand_km": round(_afstand_km(lat, lon, plek["lat"], plek["lon"]), 1),
            "adres": ", ".join(filter(None, adres_delen)), "lat": plek["lat"], "lon": plek["lon"],
            "website": tags.get("website") or tags.get("contact:website") or "",
        })
    resultaat.sort(key=lambda a: a["afstand_km"])
    _cache[sleutel] = (time.time(), resultaat)
    return resultaat


def sorteren(lijst: list[dict], voorkeuren: list[str], regen: bool = False) -> list[dict]:
    """Eerst wat bij de voorkeuren past, bij regen eerst binnen, daarna dichtstbij."""
    return sorted(lijst, key=lambda a: (a["voorkeur"] not in voorkeuren, regen and not a["binnen"], a["afstand_km"]))
