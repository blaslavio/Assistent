"""Local command suggestions. Roles are UI context, never authorization.

No seed records, automatic publication, reservations, geocoding, API calls,
learning or message history. Input stays in this request's processing path.
"""
from dataclasses import dataclass
import unicodedata
import master_hub_core
import multistream_core

ROLES = ("Trainer, masseur en coach", "Ondernemer", "Ouder en gezin",
         "Clubbeheerder en organisator", "Communitylid")

@dataclass(frozen=True)
class CommandSuggestion:
    category: str
    message: str
    route: master_hub_core.Route | None
    status: str = "suggestie"

_MESSAGES = {
    "Herstel & Coaching": "Je kunt een kennismaking of informatie over de werkwijze voorbereiden bij Dienstverlening - intake. Voor individuele klachten is beoordeling door een passende professional nodig.",
    "Dienstverlening": "Bereid je dienst voor bij Dienstverlening - intake of open de winkelomgeving om je aanbod te beheren.",
    "Verkoop": "Open de winkelomgeving om je aanbod en publicatie-instellingen te controleren.",
    "Community": "Werk je activiteit uit bij Evenementen en controleer zelf de deelnemers en zichtbaarheid.",
    "Sport": "Open de sportomgeving of bereid een training voor. Je planning blijft ongewijzigd.",
    "Verhuur / Rooster": "Beheer je voorziening en controleer beschikbaarheid bij Verhuur en rooster.",
    "Video Project": "Open de videoprojecten om je materiaal en reviewnotities te beheren.",
    "Projecten": "Open de werkruimte om je project en taken uit te werken.",
    "Chat": "Omschrijf wat je wilt voorbereiden: een dienst, aanbod, activiteit, project of planning.",
}


def suggest(prompt: str, role: str) -> CommandSuggestion:
    if type(role) is not str or role not in ROLES:
        raise ValueError("Kies een geldige rol.")
    if type(prompt) is not str or not 1 <= len(prompt) <= 500 or not prompt.strip():
        raise ValueError("Schrijf een verzoek van 1 tot 500 tekens.")
    if any(unicodedata.category(c) == 'Cc' and c not in '\n\t' for c in prompt):
        raise ValueError("Gebruik geldige tekst.")
    category = multistream_core.classify(prompt)
    route = master_hub_core.classify(prompt)
    if route is None:
        target = {"Verkoop": "winkel", "Dienstverlening": "winkel",
                  "Sport": "sport", "Projecten": "werkruimte"}.get(category)
        if target:
            route = master_hub_core.Route(category, target, _MESSAGES[category])
    # The role deliberately never changes permissions, storage scope or destination.
    return CommandSuggestion(category, _MESSAGES[category], route)


def classify_intent(prompt: str) -> str:
    return multistream_core.classify(prompt)


def infinite_swarm_neural_engine(prompt: str, role: str, category=None) -> str:
    """Compatibility entry point; local rule matching, not a learning AI engine."""
    return suggest(prompt, role).message
