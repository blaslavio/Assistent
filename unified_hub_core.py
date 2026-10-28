"""Pure, testable presentation helpers for the unified hub.

This module does not access Streamlit state or execute external actions.
"""
from html import escape
from collections.abc import Iterable, Mapping

CATEGORIES = ("Video Project", "Verhuur / Rooster", "Sport", "Verkoop", "Project", "Community", "Chat")
KEYWORDS = (
    ("Video Project", ("video", "film", "timeline", "reel", "montage")),
    ("Verhuur / Rooster", ("verhuur", "zaal", "rooster", "materiaal")),
    ("Sport", ("wedstrijd", "training", "sport", "bardienst")),
    ("Verkoop", ("verkoop", "webshop", "prijs", "winkel")),
    ("Project", ("project", "taak", "deadline")),
    ("Community", ("community", "evenement", "borrel")),
)


def classify(text: str) -> str:
    """Return a suggested category, never a confirmed action."""
    if not isinstance(text, str):
        return "Chat"
    normalized = text.casefold()
    for category, terms in KEYWORDS:
        if any(term in normalized for term in terms):
            return category
    return "Chat"


def safe_html(value: object) -> str:
    """Escape user-controlled text before insertion into HTML markup."""
    return escape(str(value), quote=True)


def filter_items(items: Iterable[Mapping], category: str | None = None) -> list[dict]:
    """Filter without changing source data or triggering side effects."""
    return [dict(item) for item in items if category is None or item.get("type") == category]


def map_points(items: Iterable[Mapping]) -> list[dict]:
    """Collect valid coordinates for one map, skipping incomplete entries."""
    result = []
    for item in items:
        try:
            lat, lon = float(item["lat"]), float(item["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        if -90 <= lat <= 90 and -180 <= lon <= 180:
            result.append({"lat": lat, "lon": lon})
    return result
