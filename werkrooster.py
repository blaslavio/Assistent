"""Basisregels voor gedeelde werkroosters; onafhankelijk van Streamlit en database.

Dit is de validatielaag, niet de volledige werkrooster-dienst. De server moet
lidmaatschap, rechten en gelijktijdige boekingen apart afdwingen.
"""
from datetime import datetime
from zoneinfo import ZoneInfo

TIJDZONE = ZoneInfo("Europe/Amsterdam")
ROLLEN = frozenset({"eigenaar", "planner", "medewerker"})
ACTIES = {
    "rooster_bekijken": ROLLEN,
    "dienst_aanmaken": frozenset({"eigenaar", "planner"}),
    "rooster_publiceren": frozenset({"eigenaar", "planner"}),
    "dienst_toewijzen": frozenset({"eigenaar", "planner"}),
    "ruilverzoek_indienen": ROLLEN,
    "ruilverzoek_goedkeuren": frozenset({"eigenaar", "planner"}),
}


class RoosterFout(ValueError):
    pass


def mag(rol: str, actie: str) -> bool:
    """Rol is alleen een UI-hint; de database moet autorisatie opnieuw controleren."""
    return rol in ACTIES.get(actie, frozenset())


def dienst_controleren(start: str, einde: str, pauze_minuten: int = 0) -> dict:
    """Valideer een dienst inclusief overnachting en zomertijd."""
    try:
        van = datetime.fromisoformat(start)
        tot = datetime.fromisoformat(einde)
    except (TypeError, ValueError) as fout:
        raise RoosterFout("Kies geldige start- en eindtijden.") from fout
    if van.tzinfo is None or tot.tzinfo is None:
        raise RoosterFout("Een dienst moet een tijdzone bevatten.")
    minuten = int((tot - van).total_seconds() / 60)
    if not 1 <= minuten <= 24 * 60:
        raise RoosterFout("Een dienst moet tussen 1 minuut en 24 uur duren.")
    if type(pauze_minuten) is not int or not 0 <= pauze_minuten < minuten:
        raise RoosterFout("De pauze moet korter zijn dan de dienst.")
    return {"start": van.isoformat(), "einde": tot.isoformat(),
            "minuten": minuten, "betaalde_minuten": minuten - pauze_minuten}


def overlap(eerste: dict, tweede: dict) -> bool:
    """Aaneensluitende diensten overlappen niet."""
    a, b = (datetime.fromisoformat(eerste["start"]), datetime.fromisoformat(eerste["einde"]))
    c, d = (datetime.fromisoformat(tweede["start"]), datetime.fromisoformat(tweede["einde"]))
    if any(t.tzinfo is None for t in (a, b, c, d)):
        raise RoosterFout("Tijdzone ontbreekt.")
    return a < d and c < b
