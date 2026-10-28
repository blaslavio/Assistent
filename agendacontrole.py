"""Overlap en alternatieven voor de opgeslagen appagenda; geen externe aanvragen."""

from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import intenties

NL = ZoneInfo("Europe/Amsterdam")


class ControleOnvolledig(ValueError):
    """Onleesbare agendagegevens mogen geen schijnbaar vrije tijden opleveren."""


class Overlap(ValueError):
    def __init__(self, controle: dict):
        super().__init__("Er staat al een afspraak op dit tijdstip. Kies een andere tijd.")
        self.controle = controle


def _tijd(waarde: str) -> datetime:
    tijd = datetime.fromisoformat(waarde)
    if tijd.tzinfo is None:
        opties = {tijd.replace(tzinfo=NL, fold=f).astimezone(timezone.utc) for f in (0, 1)
                  if tijd.replace(tzinfo=NL, fold=f).astimezone(timezone.utc).astimezone(NL).replace(tzinfo=None) == tijd}
        if len(opties) != 1:
            raise ValueError("Niet-bestaande of dubbele lokale kloktijd")
        return tijd.replace(tzinfo=NL)
    return tijd.astimezone(NL)


def interval(afspraak: dict) -> tuple[datetime, datetime]:
    try:
        begin = _tijd(afspraak["start"])
        if afspraak.get("einde"):
            einde = _tijd(afspraak["einde"])
        else:
            einde = begin + (timedelta(days=1) if len(afspraak["start"]) == 10 else timedelta(hours=1))
        begin, einde = begin.astimezone(timezone.utc), einde.astimezone(timezone.utc)
        if einde <= begin:
            raise ValueError("Einde ligt vóór begin")
        return begin, einde
    except (KeyError, TypeError, ValueError, OverflowError):
        raise ControleOnvolledig("Een opgeslagen afspraak heeft ongeldige tijden. Controleer je afspraken in Agenda.") from None


def controleer(voorstel: dict, afspraken: list[dict], uren: dict | None = None,
              nu: datetime | None = None) -> dict:
    """Halfopen intervallen: een afspraak mag aansluiten op de vorige."""
    if not isinstance(voorstel, dict) or not isinstance(voorstel.get("wat"), str) or voorstel.get("wat") not in {"taak", "afspraak"}:
        raise ValueError("Kies een geldig taak- of afspraakvoorstel.")
    if voorstel["wat"] != "afspraak":
        return {"conflicten": [], "alternatieven": []}
    voorstel = intenties.valideer(voorstel)
    begin, einde = interval(voorstel)
    bezet = [(a, *interval(a)) for a in afspraken]
    conflicten = [{"titel": a.get("titel", "Afspraak"),
                  "start": van.astimezone(NL).isoformat(timespec="minutes"),
                  "einde": tot.astimezone(NL).isoformat(timespec="minutes")}
                 for a, van, tot in bezet if van < einde and begin < tot]
    if not conflicten:
        return {"conflicten": [], "alternatieven": []}
    try:
        if uren is not None and not isinstance(uren, dict):
            raise ValueError("Ongeldige planningsuren")
        uren = {"van": "09:00", "tot": "18:00", "weekend": False, **(uren or {})}
        vanaf, tot_uur = time.fromisoformat(uren["van"]), time.fromisoformat(uren["tot"])
        if (vanaf.tzinfo or tot_uur.tzinfo or vanaf >= tot_uur or type(uren["weekend"]) is not bool
                or any((vanaf.second, vanaf.microsecond, tot_uur.second, tot_uur.microsecond))):
            raise ValueError("Ongeldige planuren")
    except (KeyError, TypeError, ValueError):
        return {"conflicten": conflicten, "alternatieven": [],
                "melding": "Controleer je planningsuren om vrije tijden te kunnen voorstellen."}
    gewenst = datetime.fromisoformat(voorstel["start"])
    duur = datetime.fromisoformat(voorstel["einde"]) - gewenst
    if duur > datetime.combine(gewenst.date(), tot_uur) - datetime.combine(gewenst.date(), vanaf):
        return {"conflicten": conflicten, "alternatieven": [], "melding": "Deze afspraakduur past niet binnen één ingestelde werkdag."}
    nu = nu or datetime.now(NL)
    nu = nu.replace(tzinfo=NL) if nu.tzinfo is None else nu.astimezone(NL)
    kandidaten = []
    for offset in range(7):
        try:
            dag = gewenst.date() + timedelta(days=offset)
        except OverflowError:
            break
        if dag.weekday() >= 5 and not uren["weekend"]:
            continue
        kandidaat = datetime.combine(dag, vanaf)
        grens = datetime.combine(dag, tot_uur)
        # Begin op een kwartier, binnen de gekozen planningsuren.
        if kandidaat.minute % 15 or kandidaat.second or kandidaat.microsecond:
            kandidaat = kandidaat.replace(second=0, microsecond=0) + timedelta(minutes=15 - kandidaat.minute % 15)
        while kandidaat + duur <= grens:
            alternatief = {**voorstel, "start": kandidaat.isoformat(timespec="minutes"),
                           "einde": (kandidaat + duur).isoformat(timespec="minutes")}
            try:
                intenties.valideer(alternatief)  # sla ongeldige klokwisseltijden over
                van, tot = interval(alternatief)
                if van >= nu.astimezone(timezone.utc) and not any(b < tot and van < e for _, b, e in bezet):
                    kandidaten.append(alternatief)
            except ValueError:
                pass
            try:
                kandidaat += timedelta(minutes=15)
            except OverflowError:
                break
    kandidaten.sort(key=lambda a: (abs(datetime.fromisoformat(a["start"]) - gewenst),
                                   datetime.fromisoformat(a["start"]) < gewenst, a["start"]))
    alternatieven = []
    for kandidaat in kandidaten:
        van, tot = interval(kandidaat)
        if not any(b < tot and van < e for b, e in map(interval, alternatieven)):
            alternatieven.append(kandidaat)
        if len(alternatieven) == 3:
            break
    return {"conflicten": sorted(conflicten, key=lambda a: a["start"]), "alternatieven": alternatieven}
