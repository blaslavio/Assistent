"""Winkelkaart: alle winkels in de buurt (OpenStreetMap, gratis) met de winkels uit de app voorop."""

import math
import os
import re
import time


import reizen


# OpenStreetMap-soort winkel: (omschrijving, icoon)
SOORTEN = {
    "supermarket": ("Supermarkt", "shopping_cart"), "convenience": ("Buurtwinkel", "storefront"), "bakery": ("Bakker", "bakery_dining"),
    "pastry": ("Banketbakker", "cake"), "butcher": ("Slager", "kebab_dining"), "greengrocer": ("Groenteboer", "nutrition"),
    "cheese": ("Kaaswinkel", "lunch_dining"), "seafood": ("Vishandel", "set_meal"), "deli": ("Delicatessen", "restaurant"),
    "confectionery": ("Snoepwinkel", "cookie"), "chocolate": ("Chocolaterie", "cookie"), "coffee": ("Koffie", "local_cafe"),
    "tea": ("Thee", "emoji_food_beverage"), "alcohol": ("Slijterij", "wine_bar"), "wine": ("Wijnwinkel", "wine_bar"), "beverages": ("Dranken", "local_drink"),
    "tobacco": ("Tabak", "smoking_rooms"), "kiosk": ("Kiosk", "newspaper"), "newsagent": ("Tijdschriften", "newspaper"),
    "clothes": ("Kleding", "apparel"), "shoes": ("Schoenen", "steps"), "bag": ("Tassen", "shopping_bag"), "boutique": ("Boetiek", "checkroom"),
    "jewelry": ("Sieraden", "diamond"), "watches": ("Horloges", "watch"), "fashion_accessories": ("Accessoires", "checkroom"),
    "second_hand": ("Tweedehands", "recycling"), "charity": ("Kringloop", "recycling"), "tailor": ("Kleermaker", "content_cut"),
    "hairdresser": ("Kapper", "content_cut"), "beauty": ("Schoonheidssalon", "spa"), "cosmetics": ("Cosmetica", "spa"),
    "chemist": ("Drogist", "sanitizer"), "optician": ("Opticien", "eyeglasses"), "hearing_aids": ("Hoortoestellen", "hearing"),
    "medical_supply": ("Zorgwinkel", "medical_services"), "perfumery": ("Parfumerie", "local_florist"),
    "bicycle": ("Fietsenwinkel", "pedal_bike"), "car": ("Autobedrijf", "directions_car"), "car_repair": ("Garage", "build"),
    "car_parts": ("Auto-onderdelen", "build"), "motorcycle": ("Motoren", "two_wheeler"),
    "electronics": ("Elektronica", "electrical_services"), "mobile_phone": ("Telefoons", "smartphone"), "computer": ("Computers", "computer"),
    "hifi": ("Audio", "headphones"), "appliance": ("Witgoed", "local_laundry_service"), "photo": ("Foto", "photo_camera"), "video_games": ("Games", "sports_esports"),
    "books": ("Boekwinkel", "menu_book"), "stationery": ("Kantoorartikelen", "edit"), "gift": ("Cadeauwinkel", "redeem"),
    "toys": ("Speelgoed", "toys"), "games": ("Spellen", "casino"), "music": ("Muziek", "music_note"), "musical_instrument": ("Instrumenten", "piano"),
    "art": ("Kunst", "image"), "craft": ("Hobbywinkel", "palette"), "fabric": ("Stoffen", "content_cut"), "frame": ("Lijstenmaker", "image"),
    "sports": ("Sportwinkel", "sports_soccer"), "outdoor": ("Buitensport", "camping"), "pet": ("Dierenwinkel", "pets"),
    "florist": ("Bloemist", "local_florist"), "garden_centre": ("Tuincentrum", "yard"),
    "hardware": ("IJzerwaren", "hardware"), "doityourself": ("Bouwmarkt", "handyman"), "paint": ("Verf", "format_paint"),
    "furniture": ("Meubels", "chair"), "interior_decoration": ("Woonwinkel", "potted_plant"), "houseware": ("Huishoudwinkel", "skillet"),
    "bed": ("Bedden", "bed"), "kitchen": ("Keukens", "restaurant"), "lighting": ("Verlichting", "lightbulb"), "carpet": ("Vloeren", "grid_view"),
    "department_store": ("Warenhuis", "store"), "variety_store": ("Allerlei", "storefront"), "general": ("Winkel", "storefront"),
    "dry_cleaning": ("Stomerij", "dry_cleaning"), "laundry": ("Wasserette", "local_laundry_service"), "travel_agency": ("Reisbureau", "flight"),
    "copyshop": ("Copyshop", "print"), "funeral_directors": ("Uitvaart", "local_florist"), "pawnbroker": ("Pandjeshuis", "savings"),
    "ticket": ("Kaartverkoop", "confirmation_number"), "lottery": ("Loterij", "confirmation_number"), "e-cigarette": ("Vape", "air"),
}

_cache: dict[tuple, tuple[float, list]] = {}


def afstand_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))


def _naam(tekst: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (tekst or "").lower())


def plek(adres: str) -> tuple[float, float, str]:
    """Coördinaten van een plaats of adres (Nominatim)."""
    return reizen.coordinaten(adres)


def osm_winkels(lat: float, lon: float, straal_km: float = 2) -> list[dict]:
    """Alle winkels met een naam rond een plek, dichtstbij eerst. Een dag bewaard."""
    sleutel = (round(lat, 3), round(lon, 3), straal_km)
    if sleutel in _cache and time.time() - _cache[sleutel][0] < 24 * 60 * 60:
        return _cache[sleutel][1]
    vraag = f"[out:json][timeout:25];nwr(around:{int(straal_km * 1000)},{lat},{lon})[shop][name];out center tags 600;"
    antwoord = reizen.overpass(vraag)
    winkels = []
    for e in antwoord.get("elements", []):
        tags = e.get("tags", {})
        p = e.get("center") or e
        if "lat" not in p or tags.get("shop") in ("vacant", "no"):
            continue
        soort, icoon = SOORTEN.get(tags.get("shop", ""), ("Winkel", "storefront"))
        straat = " ".join(filter(None, [tags.get("addr:street"), tags.get("addr:housenumber")]))
        winkels.append({
            "naam": tags["name"], "soort": soort, "icoon": icoon, "lat": p["lat"], "lon": p["lon"],
            "adres": ", ".join(filter(None, [straat, tags.get("addr:city")])),
            "openingstijden": tags.get("opening_hours", ""), "website": tags.get("website") or tags.get("contact:website", ""),
            "afstand_km": round(afstand_km(lat, lon, p["lat"], p["lon"]), 2),
        })
    winkels.sort(key=lambda w: w["afstand_km"])
    _cache[sleutel] = (time.time(), winkels)
    return winkels


def samenvoegen(onze: list[dict], osm: list[dict], lat: float, lon: float, straal_km: float,
                zoekterm: str = "") -> tuple[list[dict], list[dict]]:
    """Winkels uit de app eerst (met vestiging in de buurt dichtstbij, daarna online), dan de rest.

    Staat een winkel uit de app ook in OpenStreetMap (zelfde naam, vlakbij), dan telt hij één keer: als die van ons.
    """
    eigen = []
    for w in onze:
        w = dict(w)
        if w.get("lat") is not None and w.get("lon") is not None:
            w["afstand_km"] = round(afstand_km(lat, lon, w["lat"], w["lon"]), 2)
            if w["afstand_km"] > max(straal_km * 3, 10):
                w["lat"] = w["lon"] = None  # ver weg: alleen online laten zien
        eigen.append(w)
    eigen.sort(key=lambda w: (w.get("lat") is None, w.get("afstand_km") or 0, w["naam"].lower()))
    dubbel = {(_naam(w["naam"])) for w in eigen if w.get("lat") is not None}
    overig = []
    for w in osm:
        if _naam(w["naam"]) in dubbel and any(
                e.get("lat") is not None and _naam(e["naam"]) == _naam(w["naam"])
                and afstand_km(e["lat"], e["lon"], w["lat"], w["lon"]) < 0.3 for e in eigen):
            continue
        overig.append(w)
    if zoekterm := zoekterm.strip().lower():
        overig = [w for w in overig if zoekterm in w["naam"].lower() or zoekterm in w["soort"].lower()]
    return eigen, overig
