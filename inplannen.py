"""Slim inplannen: open taken automatisch in vrije stukken van de agenda zetten.

Eerst de taak met de vroegste deadline, in het eerste vrije gat dat lang genoeg is,
binnen de uren waarop de gebruiker wil werken. Lange taken worden in blokken van
hoogstens twee uur verdeeld. Er wordt niets opgeslagen tot de gebruiker het voorstel goedkeurt.
"""

from datetime import date, datetime, time, timedelta

import opslag
import hashlib
import json
from zoneinfo import ZoneInfo
import agendacontrole
import taakvolgorde

STANDAARD_MINUTEN = 30
MAX_BLOK = 120
PAUZE = timedelta(minutes=10)
STANDAARD_UREN = {"van": "09:00", "tot": "18:00", "weekend": False}


def planuren() -> dict:
    import dagplan
    return dagplan._uren(opslag.laden(vers=True))


def _tijdstip(waarde: str) -> datetime | None:
    try:
        return datetime.fromisoformat(waarde) if waarde and "T" in waarde else None
    except ValueError:
        return None


def _bezet(van: date, tot: date) -> list[tuple[datetime, datetime]]:
    """Tijden waarop al iets in de agenda staat, met een korte pauze ervoor en erna."""
    bezet = []
    for a in opslag.afspraken_tussen(van.isoformat(), tot.isoformat()):
        b, e = agendacontrole.interval(a)
        begin = b.astimezone(ZoneInfo("Europe/Amsterdam")).replace(tzinfo=None)
        einde = e.astimezone(ZoneInfo("Europe/Amsterdam")).replace(tzinfo=None)
        bezet.append((begin - PAUZE, einde + PAUZE))
    return sorted(bezet)


def _gat(dag: date, minuten: int, bezet: list, uren: dict, niet_voor: datetime) -> datetime | None:
    """Het eerste moment op een dag waarop er `minuten` vrij is."""
    begin = datetime.combine(dag, time.fromisoformat(uren["van"]))
    einde = datetime.combine(dag, time.fromisoformat(uren["tot"]))
    if niet_voor > begin:
        # Afronden op het volgende kwartier.
        kwartier = (niet_voor.minute // 15 + 1) * 15
        begin = niet_voor.replace(minute=0, second=0, microsecond=0) + timedelta(minutes=kwartier)
    duur = timedelta(minutes=minuten)
    for van, tot in bezet:
        if tot <= begin or van >= einde:
            continue
        if van - begin >= duur:
            return begin
        begin = max(begin, tot)
    return begin if einde - begin >= duur else None


def voorstel(dagen: int = 7, nu: datetime | None = None) -> list[dict]:
    """Per open taak de blokken waarin hij past. Taken die al ingepland zijn, blijven buiten beschouwing."""
    nu = nu or datetime.now(ZoneInfo("Europe/Amsterdam")).replace(tzinfo=None)
    import dagplan
    gegevens = opslag.laden(vers=True)
    uren = dagplan._uren(gegevens)
    eerste, laatste = nu.date(), nu.date() + timedelta(days=dagen - 1)
    al_gepland = dagplan._gepland(gegevens, nu)
    bezet = _bezet(eerste, laatste)
    resultaat = []
    # open_taken staat al op deadline; belangrijke taken zonder deadline gaan voor de rest zonder deadline.
    alle_taken = gegevens["taken"]
    open_taken = sorted((t for t in alle_taken if not t.get("klaar")),
                        key=lambda t: (t.get("deadline") or "9999", t.get("prioriteit") != "hoog", t["id"]))
    for taak in open_taken:
        if taak["id"] in al_gepland:
            continue
        blokkades = taakvolgorde.blokkades(taak, alle_taken)
        minuten = dagplan._minuten(taak)
        uiterlijk = laatste
        if taak.get("deadline") and eerste <= date.fromisoformat(taak["deadline"]) < laatste:
            uiterlijk = date.fromisoformat(taak["deadline"])
        blokken, rest = [], minuten
        while rest > 0 and not blokkades:
            blok = min(rest, MAX_BLOK)
            dag, start = eerste, None
            while dag <= uiterlijk and not start:
                if uren.get("weekend") or dag.weekday() < 5:
                    start = _gat(dag, blok, bezet, uren, nu)
                dag += timedelta(days=1)
            if not start:
                break
            einde = start + timedelta(minutes=blok)
            blokken.append({"start": start.isoformat(timespec="minutes"), "einde": einde.isoformat(timespec="minutes")})
            bezet = sorted(bezet + [(start - PAUZE, einde + PAUZE)])
            rest -= blok
        regel = {"taak_id": taak["id"], "titel": taak["titel"], "deadline": taak.get("deadline"),
                 "minuten": minuten, "blokken": sorted(blokken, key=lambda b: b["start"])}
        if blokkades:
            regel["past_niet"] = "Wacht op: " + ", ".join(b["titel"] for b in blokkades)
        elif rest > 0:
            regel["past_niet"] = (f"Er is te weinig vrije tijd vóór de deadline ({taak['deadline']})."
                                  if uiterlijk < laatste else f"Er is te weinig vrije tijd in de komende {dagen} dagen.")
        if taak.get("deadline") and date.fromisoformat(taak["deadline"]) < eerste:
            regel["te_laat"] = True
        resultaat.append(regel)
    return resultaat


def vastleggen(plan: list[dict]) -> int:
    """Zet de blokken uit een voorstel als focusblokken in de agenda. Geeft het aantal blokken."""
    opdracht_id = "focus-" + hashlib.sha256(json.dumps(plan, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()).hexdigest()
    ontvangst = opslag.focusplan_bevestigen(opdracht_id, plan)
    return 0 if ontvangst.get("ongedaan") else len(ontvangst["items"])
