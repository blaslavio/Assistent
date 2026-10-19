"""Slim inplannen: open taken automatisch in vrije stukken van de agenda zetten.

Eerst de taak met de vroegste deadline, in het eerste vrije gat dat lang genoeg is,
binnen de uren waarop de gebruiker wil werken. Lange taken worden in blokken van
hoogstens twee uur verdeeld. Er wordt niets opgeslagen tot de gebruiker het voorstel goedkeurt.
"""

from datetime import date, datetime, time, timedelta

import opslag

STANDAARD_MINUTEN = 30
MAX_BLOK = 120
PAUZE = timedelta(minutes=10)
STANDAARD_UREN = {"van": "09:00", "tot": "18:00", "weekend": False}


def planuren() -> dict:
    return {**STANDAARD_UREN, **opslag.instellingen().get("planuren", {})}


def _tijdstip(waarde: str) -> datetime | None:
    try:
        return datetime.fromisoformat(waarde) if waarde and "T" in waarde else None
    except ValueError:
        return None


def _bezet(van: date, tot: date) -> list[tuple[datetime, datetime]]:
    """Tijden waarop al iets in de agenda staat, met een korte pauze ervoor en erna."""
    bezet = []
    for a in opslag.afspraken_tussen(van.isoformat(), tot.isoformat()):
        if start := _tijdstip(a["start"]):
            einde = _tijdstip(a.get("einde") or "") or start + timedelta(hours=1)
            bezet.append((start - PAUZE, einde + PAUZE))
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
    nu = nu or datetime.now()
    uren = planuren()
    eerste, laatste = nu.date(), nu.date() + timedelta(days=dagen - 1)
    al_gepland = {a["taak_id"] for a in opslag.afspraken_tussen(eerste.isoformat(), "9999-12-31")
                  if a.get("taak_id") and a["start"] >= nu.isoformat(timespec="minutes")}
    bezet = _bezet(eerste, laatste)
    resultaat = []
    for taak in opslag.open_taken():
        if taak["id"] in al_gepland:
            continue
        minuten = int(taak.get("minuten") or STANDAARD_MINUTEN)
        uiterlijk = laatste
        if taak.get("deadline") and eerste <= date.fromisoformat(taak["deadline"]) < laatste:
            uiterlijk = date.fromisoformat(taak["deadline"])
        blokken, rest = [], minuten
        while rest > 0:
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
        if rest > 0:
            regel["past_niet"] = (f"Er is te weinig vrije tijd vóór de deadline ({taak['deadline']})."
                                  if uiterlijk < laatste else f"Er is te weinig vrije tijd in de komende {dagen} dagen.")
        if taak.get("deadline") and date.fromisoformat(taak["deadline"]) < eerste:
            regel["te_laat"] = True
        resultaat.append(regel)
    return resultaat


def vastleggen(plan: list[dict]) -> int:
    """Zet de blokken uit een voorstel als 🎯 focusblokken in de agenda. Geeft het aantal blokken."""
    aantal = 0
    for regel in plan:
        for blok in regel["blokken"]:
            opslag.afspraak_toevoegen(regel["titel"], blok["start"], blok["einde"], soort="focus",
                                      notitie="Ingepland door je assistent.", taak_id=regel["taak_id"])
            aantal += 1
    return aantal
