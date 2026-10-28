"""Conservative universal intent routing; never execute side effects from chat text."""
import re
from dataclasses import dataclass

@dataclass(frozen=True)
class Route:
    kind: str
    destination: str
    description: str

_RULES = (
    ("betaling", "geld", r"\b(betaal|overmaken|betaalverzoek|factuur)\b", "Open de betaalomgeving en controleer gegevens."),
    ("communicatie", "assistent", r"\b(verstuur|verzend|mail naar|stuur bericht)\b", "Bereid een bericht voor; verzending vraagt bevestiging."),
    ("dating", "dating", r"\b(date|daten|singles|speeddate|dating)\b", "Bereid een date of singles-evenement voor."),
    ("marketplace", "winkel", r"\b(verkoop|te koop|advertentie|marketplace|webshop)\b", "Open de winkelomgeving; niets wordt automatisch gepubliceerd."),
    ("agenda", "agenda", r"\b(afspraak|agenda|inplannen|plan een|vergadering)\b", "Open de agenda en bevestig de afspraak."),
    ("zoeken", "zoekhub", r"\b(zoek|vinden|locatie|kaart|in de buurt)\b", "Zoek in toegestane bronnen."),
)

def classify(text: str) -> Route | None:
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 500:
        return None
    for kind, destination, pattern, description in _RULES:
        if re.search(pattern, text, flags=re.I):
            return Route(kind, destination, description)
    return None
