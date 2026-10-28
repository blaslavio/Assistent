"""Opt-in, read-only context suggestions. Never predict payments or reveal private data."""
from datetime import datetime, timezone


def next_appointment(items: list[dict], now: datetime | None = None) -> dict | None:
    now = now or datetime.now().astimezone()
    if now.tzinfo is None:
        raise ValueError("Timezone-aware now required")
    upcoming = []
    for item in items:
        try:
            raw = item.get("start")
            if not isinstance(raw, str):
                continue
            start = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            if start.tzinfo is None:
                start = start.replace(tzinfo=now.tzinfo)
            if start >= now:
                upcoming.append((start, item))
        except (TypeError, ValueError, AttributeError):
            continue
    return min(upcoming, key=lambda pair: pair[0])[1] if upcoming else None


def location_points(items: list[dict], limit: int = 25) -> list[dict]:
    from universal_search import location_from_record
    points = []
    for item in items:
        coords = location_from_record(item)
        if coords:
            points.append({"lat": coords[0], "lon": coords[1]})
        if len(points) >= limit:
            break
    return points
