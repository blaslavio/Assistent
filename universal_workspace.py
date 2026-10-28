"""Universal Workspace role profiles and safe context selection.

Profiles are display preferences, never authorization or entitlement checks.
"""
from dataclasses import dataclass

@dataclass(frozen=True)
class Profile:
    label: str
    tools: tuple[str, ...]
    description: str

PROFILES = {
    "ondernemer": Profile("Ondernemer / zelfstandige", ("agenda", "zaak", "werk", "geld", "communicatie"), "Klanten, diensten, administratie en afspraken"),
    "horeca": Profile("Horeca / medewerker", ("agenda", "planning", "werk", "communicatie"), "Diensten, roosters en samenwerking"),
    "detailhandel": Profile("Ambacht / detailhandel", ("agenda", "zaak", "winkelen", "geld"), "Producten, voorraad en klanten"),
    "student": Profile("Student / lerende", ("agenda", "cursus", "documenten", "assistent"), "Studie, opdrachten en kennis"),
    "docent": Profile("Docent / opleider", ("agenda", "cursus", "documenten", "communicatie"), "Lessen, lesmateriaal en communicatie"),
    "professional": Profile("Zelfstandig professional", ("agenda", "zaak", "werk", "communicatie"), "Boekingen, klanten en dienstverlening"),
    "persoonlijk": Profile("Persoonlijk", ("agenda", "planning", "gezondheid", "communicatie"), "Persoonlijke planning en dagelijks leven"),
}
DEFAULT = "persoonlijk"


def normalize_roles(roles) -> list[str]:
    if not isinstance(roles, (list, tuple, set)):
        return [DEFAULT]
    chosen = [key for key in PROFILES if key in roles]
    return chosen or [DEFAULT]


def active_role(roles, requested: str | None) -> str:
    allowed = normalize_roles(roles)
    return requested if requested in allowed else allowed[0]


def visible_tools(roles, requested: str | None) -> tuple[str, ...]:
    return PROFILES[active_role(roles, requested)].tools


def role_context(roles, requested: str | None, *, consent: bool = False) -> str:
    if not consent:
        return ""
    role = active_role(roles, requested)
    return f"Actieve werkruimte: {PROFILES[role].label}. {PROFILES[role].description}. Dit is een voorkeur, geen toegangsrecht."
