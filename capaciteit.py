"""Capaciteitsgrenzen op basis van werkuren, resterende duur en de appagenda."""
from datetime import date, datetime, time, timedelta
import agendacontrole
import dagplan
import taakvolgorde


def _minuten_unie(intervallen: list[tuple[datetime, datetime]], begin: datetime, einde: datetime) -> int:
    samen = []
    for van, tot in sorted((max(begin, b), min(einde, e)) for b, e in intervallen if b < einde and e > begin):
        if samen and van <= samen[-1][1]:
            samen[-1] = (samen[-1][0], max(samen[-1][1], tot))
        else:
            samen.append((van, tot))
    return int(sum((e - b).total_seconds() for b, e in samen) // 60)


def rapport(gegevens: dict, dagen: int = 14, moment: datetime | None = None) -> dict:
    if type(dagen) is not int or not 1 <= dagen <= 31:
        raise ValueError("Kies een periode van 1 tot 31 dagen.")
    moment = moment or dagplan.nu()
    uren = dagplan._uren(gegevens)
    bezet = dagplan._bezet(gegevens)
    einde_periode = moment.date() + timedelta(days=dagen - 1)
    dagenlijst, beschikbaar = [], 0
    for nr in range(dagen):
        dag = moment.date() + timedelta(days=nr)
        begin = max(moment, datetime.combine(dag, time.fromisoformat(uren["van"])))
        einde = datetime.combine(dag, time.fromisoformat(uren["tot"]))
        vrij = 0
        if begin < einde and (uren["weekend"] or dag.weekday() < 5):
            vrij = int((einde - begin).total_seconds() // 60) - _minuten_unie(bezet, begin, einde)
        beschikbaar += vrij
        dagenlijst.append({"datum": dag.isoformat(), "vrij_minuten": vrij, "cumulatief_vrij": beschikbaar})
    reserveringen = {}
    for afspraak in gegevens["afspraken"]:
        if afspraak.get("taak_id"):
            b, e = agendacontrole.interval(afspraak)
            reserveringen.setdefault(afspraak["taak_id"], []).append((b.astimezone(dagplan.NL).replace(tzinfo=None), e.astimezone(dagplan.NL).replace(tzinfo=None)))
    taken, deadlines = [], {einde_periode, moment.date()}
    for taak in gegevens["taken"]:
        if taak.get("klaar"):
            continue
        try:
            deadline = date.fromisoformat(taak["deadline"]) if taak.get("deadline") else None
        except (TypeError, ValueError):
            raise dagplan.PlanOngeldig("Een taak heeft een ongeldige deadline. Pas die eerst aan in Taken.") from None
        if deadline and deadline > einde_periode:
            continue
        if deadline:
            deadlines.add(max(moment.date(), deadline))
        taken.append({"id": taak["id"], "titel": taak["titel"], "deadline": deadline.isoformat() if deadline else None,
                      "minuten": dagplan._minuten(taak),
                      "geschat": taak.get("resterend_minuten") is None and taak.get("minuten") is None,
                      "geblokkeerd_door": taakvolgorde.blokkades(taak, gegevens["taken"])})
    per_dag = {d["datum"]: d for d in dagenlijst}
    grenzen = []
    for dag in sorted(deadlines):
        einde = datetime.combine(dag + timedelta(days=1), time())
        nodig = gereserveerd = 0
        for taak in taken:
            if (taak["deadline"] and taak["deadline"] <= dag.isoformat()) or dag == einde_periode:
                geboekt = min(taak["minuten"], _minuten_unie(reserveringen.get(taak["id"], []), moment, einde))
                gereserveerd += geboekt
                nodig += taak["minuten"] - geboekt
        vrij = per_dag[dag.isoformat()]["cumulatief_vrij"]
        grenzen.append({"tot_en_met": dag.isoformat(), "nog_in_te_plannen": nodig,
                        "al_gereserveerd": gereserveerd, "vrij_minuten": vrij, "minimaal_tekort": max(0, nodig - vrij)})
    return {"van": moment.date().isoformat(), "tot": einde_periode.isoformat(), "dagen": dagenlijst, "grenzen": grenzen,
            "taken": taken, "over_deadline": sum(bool(t["deadline"] and t["deadline"] < moment.date().isoformat()) for t in taken),
            "geschatte_taken": sum(t["geschat"] for t in taken),
            "beperking": "Alleen de appagenda. Vrije tijd is een bovengrens: pauzes rond bestaande afspraken zijn afgetrokken, pauzes tussen nieuwe blokken nog niet. Een reservering is geen afgerond werk. Geen garantie dat alle blokken passen."}
