"""Opt-in assistant preference learning. No raw chat transcripts or personal identifiers.

This module does not anonymize arbitrary user text or promise zero-knowledge privacy.
"""
from collections import Counter

CATEGORIES = {
    "planning": ("agenda", "afspraak", "planning", "rooster"),
    "betalingen": ("factuur", "betaalverzoek", "betaling"),
    "ontwikkeling": ("code", "script", "programmeren"),
    "communicatie": ("mail", "bericht", "antwoord"),
}


def detect_topics(text: str) -> set[str]:
    words = set(__import__("re").findall(r"\w+", text.casefold()))
    return {topic for topic, terms in CATEGORIES.items() if words.intersection(terms)}


def update_patterns(current: dict, text: str, *, consent: bool) -> dict:
    """Aggregate topic counts only when explicitly opted in."""
    counts = Counter({k: int(v) for k, v in current.items() if k in CATEGORIES and isinstance(v, int) and v >= 0})
    if consent:
        counts.update(detect_topics(text))
    return {key: min(value, 100000) for key, value in counts.items()}


def top_suggestions(patterns: dict, *, consent: bool) -> list[str]:
    if not consent:
        return []
    labels = {"planning": "Bekijk je planning", "betalingen": "Maak een factuurconcept",
              "ontwikkeling": "Controleer code", "communicatie": "Stel een bericht op"}
    return [labels[key] for key, count in sorted(patterns.items(), key=lambda kv: -kv[1])
            if key in labels and isinstance(count, int) and count >= 2][:3]
