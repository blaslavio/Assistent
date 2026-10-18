"""Persoonlijke tijdregistratie per afspraak.

De gebruiker tikt vier momenten aan: vertrokken, aangekomen, weg en terug.
Daaruit volgt per afspraak:
- reistijd heen en terug (blauw),
- tijd op locatie binnen de geplande tijd (groen),
- uitloop: langer gebleven dan gepland (rood).
"""

from datetime import datetime, timedelta

import opslag

MOMENTEN = ["vertrokken", "aangekomen", "weg", "terug"]


def volgend_moment(afspraak: dict) -> str | None:
    """Het moment dat als eerste nog moet worden aangetikt, of None als alles er is."""
    vastgelegd = afspraak.get("tijden", {})
    return next((m for m in MOMENTEN if m not in vastgelegd), None)


def _minuten(van: datetime, tot: datetime) -> int:
    return max(0, round((tot - van).total_seconds() / 60))


def berekening(afspraak: dict) -> dict | None:
    """Minuten per kleur voor één afspraak. None als er nog niets is vastgelegd."""
    tijden = {m: datetime.fromisoformat(t) for m, t in afspraak.get("tijden", {}).items()}
    if not tijden:
        return None
    start = datetime.fromisoformat(afspraak["start"]) if "T" in afspraak["start"] else None
    if afspraak.get("einde") and "T" in afspraak["einde"]:
        gepland_einde = datetime.fromisoformat(afspraak["einde"])
    else:
        gepland_einde = start + timedelta(hours=1) if start else None

    uitkomst = {"heen": 0, "op_locatie": 0, "uitloop": 0, "terug": 0}
    if "vertrokken" in tijden and "aangekomen" in tijden:
        uitkomst["heen"] = _minuten(tijden["vertrokken"], tijden["aangekomen"])
    if "aangekomen" in tijden and "weg" in tijden:
        weg = tijden["weg"]
        grens = max(gepland_einde, tijden["aangekomen"]) if gepland_einde else weg
        uitkomst["op_locatie"] = _minuten(tijden["aangekomen"], min(weg, grens))
        uitkomst["uitloop"] = _minuten(grens, weg)
    if "weg" in tijden and "terug" in tijden:
        uitkomst["terug"] = _minuten(tijden["weg"], tijden["terug"])
    uitkomst["reistijd"] = uitkomst["heen"] + uitkomst["terug"]
    if "vertrokken" in tijden and start and "aangekomen" in tijden:
        uitkomst["te_laat"] = _minuten(start, tijden["aangekomen"])
    return uitkomst


def tijdsbesteding(van: str, tot: str) -> dict:
    """Overzicht per afspraak en totalen tussen twee datums (JJJJ-MM-DD)."""
    regels, totaal = [], {"reistijd": 0, "op_locatie": 0, "uitloop": 0}
    for afspraak in opslag.afspraken_tussen(van, tot):
        if uitkomst := berekening(afspraak):
            regels.append({"id": afspraak["id"], "titel": afspraak["titel"], "start": afspraak["start"], **uitkomst})
            for sleutel in totaal:
                totaal[sleutel] += uitkomst[sleutel]
    return {"van": van, "tot": tot, "afspraken": regels, "totaal_minuten": totaal}
