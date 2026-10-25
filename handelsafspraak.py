"""Afspraken na een akkoord op de marktplaats of in een webshop.

De koper/verkoper plant een tijd en nodigt de andere partij uit via de
bestaande beveiligde agenda-uitnodigingen. Pas na accepteren is het wederzijds
bevestigd. Alle gegevens blijven in de eigen accountopslag.
"""
from datetime import datetime, timedelta
import opslag
import samen

AFSPRAAK_STATUSES = frozenset({"geaccepteerd", "betaald", "geleverd", "afgerond"})


def sleutel(bestelling_id: int) -> str:
    return f"handelsafspraak:bestelling:{int(bestelling_id)}"


def bestaande(bestelling_id: int) -> dict | None:
    code = sleutel(bestelling_id)
    return next((a for a in opslag.laden().get("afspraken", [])
                 if code in (a.get("notitie") or "")), None)


def plannen(bestelling: dict, start: datetime, minuten: int = 30,
            locatie: str = "") -> dict:
    if bestelling.get("status") not in AFSPRAAK_STATUSES:
        raise ValueError("De bestelling is nog niet door beide partijen overeengekomen.")
    if not bestelling.get("ander"):
        raise ValueError("De andere partij is niet bekend.")
    if start.tzinfo is not None:
        start = start.astimezone().replace(tzinfo=None)
    if start <= datetime.now() or minuten < 15 or minuten > 240:
        raise ValueError("Kies een geldig toekomstig moment (15 tot 240 minuten).")
    eerder = bestaande(bestelling["id"])
    if eerder:
        return {"afspraak": eerder, "nieuw": False, "uitgenodigd": False}
    einde = start + timedelta(minutes=minuten)
    van = start.strftime("%Y-%m-%dT%H:%M")
    tot = einde.strftime("%Y-%m-%dT%H:%M")
    # Een afspraak is pas definitief wanneer de uitgenodigde de uitnodiging aanneemt.
    titel = f"Overdracht: {str(bestelling.get('titel') or 'Bestelling')[:100]}"
    notitie = f"{sleutel(bestelling['id'])}\nAfspraakvoorstel voor {bestelling['ander']}."
    afspraak = opslag.afspraak_toevoegen(titel, van, tot, notitie, locatie[:250])
    try:
        samen.uitnodigen(afspraak["id"], bestelling["ander"])
    except Exception:
        opslag.afspraak_verwijderen(afspraak["id"])
        raise
    return {"afspraak": afspraak, "nieuw": True, "uitgenodigd": True}
