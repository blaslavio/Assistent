"""Uitjes in de buurt uit OpenStreetMap (gratis, geen sleutel nodig)."""

import math
import os
import time
from concurrent.futures import Future, ThreadPoolExecutor


import opslag
import reizen


# Voorkeuren waarop de gebruiker kan sorteren.
VOORKEUREN = ["Cultuur", "Muziek", "Film", "Natuur", "Dieren", "Actief", "Sport", "Familie", "Bezienswaardigheden"]

# OpenStreetMap-soort: (omschrijving, symbool (Material Symbols), binnen?, voorkeur)
SOORTEN = {
    "museum": ("Museum", "museum", True, "Cultuur"), "gallery": ("Galerie", "image", True, "Cultuur"),
    "theatre": ("Theater", "theater_comedy", True, "Cultuur"), "arts_centre": ("Cultuurcentrum", "palette", True, "Cultuur"),
    "music_venue": ("Muziekpodium", "music_note", True, "Muziek"), "concert_hall": ("Concertzaal", "music_note", True, "Muziek"),
    "cinema": ("Bioscoop", "movie", True, "Film"),
    "nature_reserve": ("Natuurgebied", "park", False, "Natuur"), "park": ("Park", "park", False, "Natuur"),
    "beach_resort": ("Strand", "beach_access", False, "Natuur"),
    "zoo": ("Dierentuin", "pets", False, "Dieren"), "aquarium": ("Aquarium", "set_meal", True, "Dieren"),
    "farm": ("Kinderboerderij", "pets", False, "Dieren"),
    "bowling_alley": ("Bowling", "sports_score", True, "Actief"), "escape_game": ("Escaperoom", "lock", True, "Actief"),
    "trampoline_park": ("Trampolinepark", "sports_gymnastics", True, "Actief"), "ice_rink": ("IJsbaan", "ice_skating", True, "Actief"),
    "climbing": ("Klimhal", "landscape", True, "Actief"), "miniature_golf": ("Midgetgolf", "golf_course", False, "Actief"),
    "water_park": ("Zwemparadijs", "pool", True, "Familie"), "swimming_pool": ("Zwembad", "pool", True, "Sport"),
    "stadium": ("Stadion", "stadium", False, "Sport"),
    "theme_park": ("Pretpark", "attractions", False, "Familie"), "playground": ("Speeltuin", "toys", False, "Familie"),
    "attraction": ("Bezienswaardigheid", "photo_camera", False, "Bezienswaardigheden"),
    "viewpoint": ("Uitzichtpunt", "visibility", False, "Bezienswaardigheden"),
    "castle": ("Kasteel", "castle", False, "Bezienswaardigheden"), "monument": ("Monument", "account_balance", False, "Bezienswaardigheden"),
    "restaurant": ("Restaurant", "restaurant", True, "Eten"), "cafe": ("Café", "local_cafe", True, "Eten"),
    "bar": ("Bar", "local_bar", True, "Eten"), "pub": ("Kroeg", "sports_bar", True, "Eten"), "ice_cream": ("IJssalon", "icecream", True, "Eten"),
    "indoor_play": ("Binnenspeeltuin", "toys", True, "Familie"),
}

_cache: dict[tuple, tuple[float, list]] = {}
_bezig: dict[tuple, Future] = {}
_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="activiteiten")


def op_achtergrond(soort: str, adres: str = "") -> list[dict] | None:
    """Plekken rond een adres zonder te wachten: de lijst als hij er al is, anders None (dan wordt hij nu
    opgehaald). soort is "uitjes" of "eten". Lukt ophalen niet, dan een lege lijst en na twee minuten een nieuwe
    poging; een onbekend adres geeft AdresNietGevonden."""
    adres = adres or opslag.instellingen().get("thuisadres", "") or "Amsterdam"
    sleutel = (soort, adres)
    taak = _bezig.get(sleutel)
    if taak is not None and taak.done():
        oud = time.time() - taak.gestart
        if (taak.exception() and oud > 120) or oud > 24 * 60 * 60:
            taak = None
    if taak is None:
        taak = _pool.submit(in_de_buurt if soort == "uitjes" else eten_en_spelen, adres)
        taak.gestart = time.time()
        _bezig[sleutel] = taak
    if not taak.done():
        return None
    if isinstance(taak.exception(), reizen.AdresNietGevonden):
        raise taak.exception()
    return [] if taak.exception() else taak.result()


def _afstand_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))


def in_de_buurt(adres: str = "", straal_km: int = 10) -> list[dict]:
    """Uitjes rond een adres (standaard het thuisadres), dichtstbij eerst. Een dag bewaard."""
    lat, lon, _ = reizen.coordinaten(adres or opslag.instellingen().get("thuisadres", "") or "Amsterdam")
    sleutel = (round(lat, 2), round(lon, 2), straal_km)
    if sleutel in _cache and time.time() - _cache[sleutel][0] < 24 * 60 * 60:
        return _cache[sleutel][1]
    rond = f"(around:{straal_km * 1000},{lat},{lon})"
    vraag = f"""[out:json][timeout:15];
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
        antwoord = reizen.overpass(vraag, timeout=20)
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


def eten_en_spelen(adres: str = "", straal_km: int = 3) -> list[dict]:
    """Restaurants, cafés, ijssalons en speeltuinen dichtbij (voor een date, etentje of speelafspraak). Een dag bewaard."""
    lat, lon, _ = reizen.coordinaten(adres or opslag.instellingen().get("thuisadres", "") or "Amsterdam")
    sleutel = ("eten", round(lat, 2), round(lon, 2), straal_km)
    if sleutel in _cache and time.time() - _cache[sleutel][0] < 24 * 60 * 60:
        return _cache[sleutel][1]
    rond = f"(around:{straal_km * 1000},{lat},{lon})"
    vraag = f"""[out:json][timeout:15];
(
  nwr{rond}[amenity~"^(restaurant|cafe|bar|pub|ice_cream)$"][name];
  nwr{rond}[leisure~"^(playground|indoor_play)$"][name];
);
out center tags 400;"""
    try:
        antwoord = reizen.overpass(vraag, timeout=20)
    except Exception:
        if sleutel in _cache:
            return _cache[sleutel][1]
        raise
    resultaat, gezien = [], set()
    for e in antwoord.get("elements", []):
        tags = e.get("tags", {})
        soort = tags.get("amenity") if tags.get("amenity") in SOORTEN else tags.get("leisure")
        plek = e.get("center") or e
        if soort not in SOORTEN or "lat" not in plek or tags["name"] in gezien:
            continue
        gezien.add(tags["name"])
        omschrijving, icoon, binnen, voorkeur = SOORTEN[soort]
        if tags.get("cuisine"):
            omschrijving += ", " + tags["cuisine"].replace(";", ", ").replace("_", " ")
        adres_delen = [" ".join(filter(None, [tags.get("addr:street"), tags.get("addr:housenumber")])), tags.get("addr:city")]
        resultaat.append({
            "naam": tags["name"], "soort": omschrijving, "icoon": icoon, "binnen": binnen, "voorkeur": voorkeur,
            "afstand_km": round(_afstand_km(lat, lon, plek["lat"], plek["lon"]), 1),
            "adres": ", ".join(filter(None, adres_delen)), "lat": plek["lat"], "lon": plek["lon"],
            "website": tags.get("website") or tags.get("contact:website") or "",
            "telefoon": tags.get("phone") or tags.get("contact:phone") or "",
            "email": tags.get("email") or tags.get("contact:email") or "",
            "reserveren": soort == "restaurant" or tags.get("reservation") in ("yes", "required", "recommended"),
        })
    resultaat.sort(key=lambda a: a["afstand_km"])
    _cache[sleutel] = (time.time(), resultaat)
    return resultaat


def sorteren(lijst: list[dict], voorkeuren: list[str], regen: bool = False) -> list[dict]:
    """Eerst wat bij de voorkeuren past, bij regen eerst binnen, daarna dichtstbij."""
    return sorted(lijst, key=lambda a: (a["voorkeur"] not in voorkeuren, regen and not a["binnen"], a["afstand_km"]))
