"""Unified, predictable navigation for existing Universal People's OS routes.

Pure helpers only: no widget state, network or side effects.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Destination:
    key: str
    label: str
    description: str
    aliases: tuple[str, ...] = ()


DESTINATIONS = (
    Destination("chat", "Assistent", "Vragen en taken", ("ai", "gesprek")),
    Destination("agenda", "Agenda", "Afspraken en beschikbaarheid", ("planning", "afspraak")),
    Destination("zaak", "Onderneming", "Klanten, diensten en beheer", ("bedrijf", "zakelijk")),
    Destination("winkelen", "Winkelen", "Producten en bestellingen", ("winkel", "webshop")),
    Destination("geld", "Financiën", "Betalingen en overzichten", ("betaling", "budget")),
    Destination("documenten", "Documenten", "Bestanden en informatie", ("bestanden", "bestand")),
)


def destinations_for(query: str) -> tuple[Destination, ...]:
    """Stable navigation order and forgiving matching."""
    if not isinstance(query, str):
        raise TypeError("Query must be a string")
    term = query.strip().casefold()
    if not term:
        return DESTINATIONS
    return tuple(d for d in DESTINATIONS
                 if any(term in value.casefold() for value in (d.label, d.description, *d.aliases)))


def destination_by_key(key: str) -> Destination:
    for destination in DESTINATIONS:
        if destination.key == key:
            return destination
    raise KeyError("Unknown destination")
