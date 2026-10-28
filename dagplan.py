"""Een bewerkbaar voorstel voor vandaag, zonder opslag of externe agenda-aanvragen."""

import copy
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import agendacontrole
import inplannen
import intenties
import taakvolgorde

NL = ZoneInfo("Europe/Amsterdam")


class PlanOngeldig(ValueError):
    """Het voorstel kan niet ongewijzigd worden opgeslagen."""


def nu() -> datetime:
    return datetime.now(NL).replace(tzinfo=None)


def _uren(gegevens: dict) -> dict:
    try:
        instellingen = gegevens.get("instellingen") or {}
        if not isinstance(instellingen, dict):
            raise ValueError
        uren = {**inplannen.STANDAARD_UREN, **(instellingen.get("planuren") or {})}
        begin, einde = time.fromisoformat(uren["van"]), time.fromisoformat(uren["tot"])
        if begin.tzinfo or einde.tzinfo or begin >= einde or any((begin.second, einde.second, begin.microsecond, einde.microsecond)) or type(uren["weekend"]) is not bool:
            raise ValueError
        return uren
    except (TypeError, ValueError):
        raise PlanOngeldig("Controleer je planningsuren bij Agenda voordat je een dagvoorstel maakt.") from None


def _bezet(gegevens: dict) -> list[tuple[datetime, datetime]]:
    return [(b.astimezone(NL).replace(tzinfo=None) - inplannen.PAUZE,
             e.astimezone(NL).replace(tzinfo=None) + inplannen.PAUZE)
            for b, e in map(agendacontrole.interval, gegevens["afspraken"])]


def _gepland(gegevens: dict, moment: datetime) -> set[int]:
    return {a["taak_id"] for a in gegevens["afspraken"] if a.get("taak_id")
            and agendacontrole.interval(a)[1].astimezone(NL).replace(tzinfo=None) > moment}


def _minuten(taak: dict) -> int:
    minuten = taak.get("resterend_minuten") if taak.get("resterend_minuten") is not None else taak.get("minuten")
    if minuten is None:
        return inplannen.STANDAARD_MINUTEN
    if type(minuten) is not int or minuten < 1:
        raise PlanOngeldig("Een taak heeft een ongeldige duur. Pas die eerst aan in Taken.")
    return minuten


def voorstel(gegevens: dict, moment: datetime | None = None, taak_ids: set[int] | None = None) -> dict:
    moment = moment or nu()
    uren, bezet = _uren(gegevens), sorted(_bezet(gegevens))
    gepland = _gepland(gegevens, moment)
    taken = [t for t in gegevens["taken"] if not t.get("klaar") and t["id"] not in gepland
             and (taak_ids is None or t["id"] in taak_ids)]
    for taak in taken:
        if taak.get("deadline"):
            try:
                date.fromisoformat(taak["deadline"])
            except (TypeError, ValueError):
                raise PlanOngeldig("Een taak heeft een ongeldige deadline. Pas die eerst aan in Taken.") from None
    taken.sort(key=lambda t: (t.get("deadline") or "9999", t.get("prioriteit") != "hoog", t["id"]))
    regels = []
    for taak in taken:
        minuten = rest = _minuten(taak)
        regel = {"taak": copy.deepcopy(taak), "minuten": minuten, "blokken": [],
                 "geblokkeerd_door": taakvolgorde.blokkades(taak, gegevens["taken"]),
                 "te_laat": bool(taak.get("deadline") and taak["deadline"] < moment.date().isoformat())}
        while rest and not regel["geblokkeerd_door"] and (uren["weekend"] or moment.weekday() < 5):
            duur = min(rest, inplannen.MAX_BLOK)
            begin = None
            for duur in [duur] + list(range((duur - 1) // 15 * 15, 14, -15)):
                begin = inplannen._gat(moment.date(), duur, bezet, uren, moment)
                if begin is not None:
                    break
            if begin is None:
                break
            einde = begin + timedelta(minutes=duur)
            blok = {"start": begin.isoformat(timespec="minutes"), "einde": einde.isoformat(timespec="minutes"), "opnemen": True}
            intenties.valideer({"wat": "afspraak", "titel": taak["titel"], **blok})
            regel["blokken"].append(blok)
            bezet = sorted(bezet + [(begin - inplannen.PAUZE, einde + inplannen.PAUZE)])
            rest -= duur
        regel["rest"] = rest
        regels.append(regel)
    return {"datum": moment.date().isoformat(), "gemaakt_op": moment.isoformat(), "uren": uren, "regels": regels}


def valideer(plan: dict, gegevens: dict, moment: datetime | None = None, leeg_toegestaan: bool = False) -> list[dict]:
    moment = moment or nu()
    if plan.get("datum") != moment.date().isoformat():
        raise PlanOngeldig("Dit voorstel is niet meer voor vandaag. Maak een nieuw dagvoorstel.")
    uren = _uren(gegevens)
    if uren != plan.get("uren"):
        raise PlanOngeldig("Je planningsuren zijn gewijzigd. Maak een nieuw dagvoorstel.")
    if moment.weekday() >= 5 and not uren["weekend"]:
        raise PlanOngeldig("Je planningsuren sluiten het weekend uit.")
    begin_dag = datetime.combine(moment.date(), time.fromisoformat(uren["van"]))
    einde_dag = datetime.combine(moment.date(), time.fromisoformat(uren["tot"]))
    taken = {t["id"]: t for t in gegevens["taken"]}
    gepland = _gepland(gegevens, datetime.fromisoformat(plan["gemaakt_op"]))
    bezet, items, gezien = _bezet(gegevens), [], set()
    for regel in plan["regels"]:
        gekozen = [b for b in regel["blokken"] if b.get("opnemen", True)]
        if not gekozen:
            continue
        taak = regel["taak"]
        if taak["id"] in gezien or taak != taken.get(taak["id"]) or taak.get("klaar") or taak["id"] in gepland:
            raise PlanOngeldig("Een gekozen taak is gewijzigd, afgerond of al ingepland. Maak een nieuw dagvoorstel.")
        try:
            taakvolgorde.eis_startbaar(taak["id"], gegevens["taken"])
        except ValueError as fout:
            raise PlanOngeldig(str(fout)) from fout
        gezien.add(taak["id"])
        totaal = 0
        for blok in gekozen:
            try:
                item = intenties.valideer({"wat": "afspraak", "titel": taak["titel"], **blok})
            except ValueError as fout:
                raise PlanOngeldig(str(fout)) from fout
            begin, einde = datetime.fromisoformat(item["start"]), datetime.fromisoformat(item["einde"])
            minuten = int((einde - begin).total_seconds() / 60)
            if not max(moment, begin_dag) <= begin < einde <= einde_dag or minuten > inplannen.MAX_BLOK:
                raise PlanOngeldig("Houd ieder blok vandaag binnen je planningsuren, in de toekomst en maximaal twee uur lang.")
            if any(b < einde and begin < e for b, e in bezet):
                raise PlanOngeldig("Een gekozen blok overlapt een afspraak of laat minder dan tien minuten pauze. Pas het voorstel aan.")
            bezet.append((begin - inplannen.PAUZE, einde + inplannen.PAUZE))
            totaal += minuten
            items.append({"titel": taak["titel"], "start": item["start"], "einde": item["einde"],
                          "taak_id": taak["id"], "soort": "focus", "locatie": "", "contact_id": None,
                          "notitie": "Ingepland via Plan mijn dag."})
        if totaal > _minuten(taak):
            raise PlanOngeldig("De gekozen blokken zijn samen langer dan de taakduur. Kort ze in of laat een blok weg.")
    if not items and not leeg_toegestaan:
        raise PlanOngeldig("Kies ten minste één focusblok om op te slaan.")
    return items
