"""Life Swarm: private-by-default, advisory life-role classification.

No publication, geocoding, external AI call or calendar action happens here.
A life role is a user-selected lens, not a claim about the user's identity.
"""
import re

LIFE_ROLES = (
    "Community & Nalatenschap", "Verkoop & Initiatief", "Vader & Gezin",
    "Trainer & Sport", "Leerling & Studie", "Dating & Verbinding",
)
SENSITIVE_ROLES = frozenset(("Vader & Gezin", "Dating & Verbinding", "Community & Nalatenschap"))

_RULES = (
    ("Vader & Gezin", r"\b(kinderen?|vader|gezin|zoon|dochter|ouderschap)\b"),
    ("Dating & Verbinding", r"\b(dating|date|liefde|relatie|partner|verkering)\b"),
    ("Community & Nalatenschap", r"\b(nalatenschap|eerbetoon|herinnering|herdenken|overledene)\b"),
    ("Leerling & Studie", r"\b(studie|studeren|leerling|huiswerk|opleiding|examen)\b"),
    ("Trainer & Sport", r"\b(trainer|training|sport|boksen|wedstrijd)\b"),
    ("Verkoop & Initiatief", r"\b(verkoop|verkopen|ruil|initiatief|advertentie)\b"),
)

def classify_life_role(text: str) -> str | None:
    """Suggest a role; ambiguous inputs remain unclassified."""
    if not isinstance(text, str) or not text.strip():
        return None
    matches = [role for role, pattern in _RULES if re.search(pattern, text, re.I)]
    return matches[0] if len(matches) == 1 else None

def validate_life_role(role: str) -> str:
    if role not in LIFE_ROLES:
        raise ValueError("Onbekende levensrol.")
    return role

def life_draft_profile(role: str) -> str:
    """All life-role drafts are private, including community-themed drafts."""
    validate_life_role(role)
    return "Privé"

def may_publish_life_draft(*, explicitly_confirmed: bool = False) -> bool:
    """Never auto-publish; publishing requires a separate reviewed workflow."""
    return False
