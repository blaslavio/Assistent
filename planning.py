"""Dagplanning: afspraken op een dag met reistijd en vertrektijd ertussen."""

from datetime import date, datetime, time, timedelta

import httpx

import opslag
import reizen

BUFFER_MINUTEN = 10


def _tijd(waarde: str) -> datetime | None:
    try:
        return datetime.fromisoformat(waarde) if "T" in waarde else None
    except ValueError:
        return None


def dagplanning(datum: str, vervoer: str = "auto") -> dict:
    """Afspraken van één dag, met per afspraak reistijd vanaf de vorige plek en vertrektijd.

    De dag begint op het thuisadres (als dat is ingesteld). Vervoer: auto, fiets of lopen.
    """
    thuis = opslag.instellingen().get("thuisadres", "")
    afspraken = opslag.afspraken_tussen(datum, datum)
    vorige_plek, vorige_einde = thuis, None
    planning = []
    for afspraak in afspraken:
        regel = {
            "id": afspraak["id"],
            "titel": afspraak["titel"],
            "start": afspraak["start"],
            "einde": afspraak.get("einde"),
            "locatie": afspraak.get("locatie", ""),
        }
        for veld in ("tijden", "sport", "sport_resultaat", "soort", "extern", "bron"):
            if afspraak.get(veld):
                regel[veld] = afspraak[veld]
        if contact := opslag.contact(afspraak.get("contact_id")):
            regel["contact"] = {k: v for k, v in contact.items() if v and k != "id"}

        start = _tijd(afspraak["start"])
        locatie = afspraak.get("locatie", "")
        if locatie and vorige_plek and locatie != vorige_plek:
            try:
                reis = reizen.reistijd(vorige_plek, locatie, vervoer)
            except reizen.AdresNietGevonden as fout:
                regel["waarschuwing"] = f"Adres niet gevonden: {fout}"
            except httpx.HTTPError:
                regel["waarschuwing"] = "Reistijd kon niet worden berekend (routedienst niet bereikbaar)."
            else:
                regel["reis"] = reis
                regel["van_adres"] = vorige_plek
                if start:
                    vertrek = start - timedelta(minutes=reis["reistijd_minuten"] + BUFFER_MINUTEN)
                    regel["vertrek_om"] = vertrek.strftime("%H:%M")
                    if vorige_einde and vertrek < vorige_einde:
                        tekort = round((vorige_einde - vertrek).total_seconds() / 60)
                        regel["waarschuwing"] = f"Te krap: je komt ongeveer {tekort} {'minuut' if tekort == 1 else 'minuten'} te laat."
        planning.append(regel)

        if locatie:
            vorige_plek = locatie
        einde = _tijd(afspraak.get("einde") or "")
        vorige_einde = einde or (start + timedelta(hours=1) if start else vorige_einde)

    resultaat = {"datum": datum, "vervoer": vervoer, "afspraken": planning}
    if not thuis:
        resultaat["tip"] = "Er is nog geen thuisadres ingesteld; de reis naar de eerste afspraak ontbreekt."
    return resultaat


def vrije_momenten(personen: list[int], duur: timedelta, behalve=None, dagen: int = 7, aantal: int = 6) -> list[datetime]:
    """Momenten (per half uur, 8:00-22:00) waarop jij en deze personen (die hun agenda met je delen) vrij zijn."""
    import samen

    van = date.today()
    tot = van + timedelta(days=dagen)
    bezet: list[tuple[datetime, datetime]] = []

    def erbij(lijst: list[dict]) -> None:
        for a in lijst:
            if a.get("id") == behalve or "T" not in a["start"]:
                continue
            b = datetime.fromisoformat(a["start"][:16])
            e = datetime.fromisoformat(a["einde"][:16]) if a.get("einde") and "T" in a["einde"] else b + timedelta(hours=1)
            bezet.append((b, e))

    erbij(opslag.afspraken_tussen(van.isoformat(), tot.isoformat()))
    for p in personen:
        erbij(samen.gedeelde_agenda(p, van.isoformat(), tot.isoformat())["afspraken"])
    nu = datetime.now()
    moment = max(nu.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1),
                 datetime.combine(van, time(8)))
    gevonden = []
    while moment.date() < tot and len(gevonden) < aantal:
        if moment.hour < 8 or moment + duur > datetime.combine(moment.date(), time(22)):
            moment = datetime.combine(moment.date() + timedelta(days=1), time(8))
            continue
        if not any(b < moment + duur and moment < e for b, e in bezet):
            gevonden.append(moment)
            moment += timedelta(hours=3)  # niet zes keer hetzelfde middagje
        else:
            moment += timedelta(minutes=30)
    return gevonden
