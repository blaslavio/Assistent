"""Privacy-scoped unified search helpers; no fabricated location coordinates."""
from datetime import date, timedelta


def clean_query(query: str) -> str:
    if not isinstance(query, str) or not 1 <= len(query.strip()) <= 120:
        raise ValueError("Zoekterm moet 1 tot 120 tekens bevatten")
    return query.strip().casefold()


def search_agenda(query: str, appointments: list[dict], limit: int = 20) -> list[dict]:
    needle = clean_query(query)
    results = []
    for appointment in appointments:
        if not isinstance(appointment, dict):
            continue
        haystack = " ".join(str(appointment.get(k) or "") for k in ("titel", "locatie", "omschrijving"))
        if needle in haystack.casefold():
            results.append(appointment)
        if len(results) >= limit:
            break
    return results


def agenda_window(today: date | None = None, days: int = 365) -> tuple[str, str]:
    today = today or date.today()
    return (today - timedelta(days=30)).isoformat(), (today + timedelta(days=days)).isoformat()


def location_from_record(record: dict) -> tuple[float, float] | None:
    try:
        lat = float(record["lat"])
        lon = float(record.get("lon", record.get("lng")))
    except (KeyError, TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return lat, lon
