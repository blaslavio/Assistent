"""Opt-in dating helpers. These rules are not a substitute for server-side identity checks."""
from datetime import date


def draft_date(title: str, when: date, location: str = "") -> dict:
    if not isinstance(title, str) or not title.strip() or len(title) > 120:
        raise ValueError("Geef een geldige titel op.")
    if when < date.today():
        raise ValueError("Kies een datum in de toekomst.")
    return {"titel": title.strip(), "datum": when.isoformat(),
            "locatie": location.strip()[:160], "status": "concept",
            "uitnodiging_verzonden": False}


def mutual_consent(first_opt_in: bool, second_opt_in: bool,
                   first_liked: bool, second_liked: bool, blocked: bool = False) -> bool:
    return bool(first_opt_in and second_opt_in and first_liked and second_liked and not blocked)
