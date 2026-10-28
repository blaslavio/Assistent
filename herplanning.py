"""Herplan alleen toekomstige focusblokken van vandaag, met een controleerbare wijzigingsset."""

import copy
from datetime import datetime, timedelta

import agendacontrole
import dagplan
import taakvolgorde


def _toekomstig(a: dict, moment: datetime) -> bool:
    begin, _ = agendacontrole.interval(a)
    lokaal = begin.astimezone(dagplan.NL).replace(tzinfo=None)
    return a.get("soort") == "focus" and lokaal.date() == moment.date() and lokaal > moment


def voorstel(gegevens: dict, keuzes: dict | None = None, afspraak_id=None,
             uitloop: int = 0, moment: datetime | None = None) -> dict:
    moment = moment or dagplan.nu()
    virtueel = copy.deepcopy(dict(gegevens))
    opties = [copy.deepcopy(a) for a in gegevens["afspraken"]
              if a.get("soort") != "focus" and "T" in a.get("start", "")
              and agendacontrole.interval(a)[0].astimezone(dagplan.NL).date() == moment.date()]
    if type(uitloop) is not int or not 0 <= uitloop <= 240:
        raise dagplan.PlanOngeldig("Gebruik een uitloop van 0 tot 240 minuten.")
    if uitloop and afspraak_id is None:
        lopend = [a for a in opties if agendacontrole.interval(a)[0].astimezone(dagplan.NL).replace(tzinfo=None) <= moment
                  < agendacontrole.interval(a)[1].astimezone(dagplan.NL).replace(tzinfo=None) + timedelta(hours=1)]
        if len(lopend) != 1:
            raise dagplan.PlanOngeldig("De afspraak is niet eenduidig. Typ ‘Herplan de rest van vandaag’ en kies de afspraak bij Uitloop.")
        afspraak_id = lopend[0]["id"]
    verlenging = None
    if uitloop:
        oud = next((a for a in opties if a["id"] == afspraak_id), None)
        if oud is None:
            raise dagplan.PlanOngeldig("De gekozen afspraak is niet beschikbaar voor vandaag.")
        einde = agendacontrole.interval(oud)[1].astimezone(dagplan.NL).replace(tzinfo=None) + timedelta(minutes=uitloop)
        if einde.date() != moment.date():
            raise dagplan.PlanOngeldig("Deze uitloop valt buiten vandaag. Pas de afspraak via Agenda aan.")
        nieuw = {**oud, "einde": einde.isoformat(timespec="minutes")}
        verlenging = {"voor": copy.deepcopy(oud), "na": nieuw}
        virtueel["afspraken"] = [nieuw if a["id"] == afspraak_id else a for a in virtueel["afspraken"]]
    # Taken met lopende blokken of reserveringen op andere dagen blijven staan.
    beschermd = {a["taak_id"] for a in gegevens["afspraken"] if a.get("taak_id")
                 and agendacontrole.interval(a)[1].astimezone(dagplan.NL).replace(tzinfo=None) > moment
                 and not _toekomstig(a, moment)}
    taken = [t for t in gegevens["taken"] if not t.get("klaar") and t["id"] not in beschermd]
    geselecteerd, resterend = set(), {}
    for taak in taken:
        keuze = (keuzes or {}).get(str(taak["id"]), {})
        minuten = keuze.get("minuten", dagplan._minuten(taak))
        if type(minuten) is not int or not 1 <= minuten <= 10080:
            raise dagplan.PlanOngeldig("Geef een resterende taakduur van 1 tot 10080 minuten op.")
        resterend[taak["id"]] = minuten
        if keuze.get("plannen", True):
            geselecteerd.add(taak["id"])
    vervangt = [copy.deepcopy(a) for a in gegevens["afspraken"]
                if a.get("taak_id") in geselecteerd and _toekomstig(a, moment)]
    ids = {a["id"] for a in vervangt}
    virtueel["afspraken"] = [a for a in virtueel["afspraken"] if a["id"] not in ids]
    virtueel["taken"] = [{**t, "resterend_minuten": resterend[t["id"]]} if t["id"] in geselecteerd else copy.deepcopy(t)
                         for t in gegevens["taken"]]
    plan = dagplan.voorstel(virtueel, moment, taak_ids=geselecteerd)
    per_taak = {r["taak"]["id"]: r for r in plan["regels"] if r["taak"]["id"] in geselecteerd}
    regels = []
    for taak in sorted(taken, key=lambda t: (t.get("deadline") or "9999", t.get("prioriteit") != "hoog", t["id"])):
        regel = per_taak.get(taak["id"], {"blokken": [], "rest": resterend[taak["id"]],
                                         "te_laat": bool(taak.get("deadline") and taak["deadline"] < plan["datum"])})
        regel.update(geblokkeerd_door=taakvolgorde.blokkades(taak, gegevens["taken"]), taak=copy.deepcopy(taak), minuten=resterend[taak["id"]], resterend_minuten=resterend[taak["id"]],
                     plannen=taak["id"] in geselecteerd)
        regels.append(regel)
    plan.update(modus="herplan", regels=regels, vervangt=vervangt, verlenging=verlenging, afspraak_opties=opties,
                keuze={"afspraak_id": afspraak_id, "uitloop": uitloop}, selectie=sorted(geselecteerd))
    return plan


def valideer(plan: dict, gegevens: dict, moment: datetime | None = None) -> dict:
    moment = moment or dagplan.nu()
    geselecteerd = {r["taak"]["id"] for r in plan["regels"] if r["plannen"]}
    if sorted(geselecteerd) != plan["selectie"] or plan.get("nieuwe_keuze", plan["keuze"]) != plan["keuze"]:
        raise dagplan.PlanOngeldig("Je selectie of uitloop is veranderd. Kies eerst ‘Herbereken voorstel’.")
    anker = datetime.fromisoformat(plan["gemaakt_op"])
    oud = [a for a in gegevens["afspraken"] if a.get("taak_id") in geselecteerd and _toekomstig(a, anker)]
    if sorted(oud, key=lambda a: a["id"]) != sorted(plan["vervangt"], key=lambda a: a["id"]):
        raise dagplan.PlanOngeldig("Een focusblok is intussen gewijzigd. Maak een nieuwe herplanning.")
    if any(agendacontrole.interval(a)[0].astimezone(dagplan.NL).replace(tzinfo=None) <= moment for a in oud):
        raise dagplan.PlanOngeldig("Een te verplaatsen blok is inmiddels begonnen. Maak een nieuwe herplanning.")
    virtueel = copy.deepcopy(dict(gegevens))
    ids = {a["id"] for a in oud}
    virtueel["afspraken"] = [a for a in virtueel["afspraken"] if a["id"] not in ids]
    verlenging = plan["verlenging"]
    if verlenging:
        huidig = next((a for a in gegevens["afspraken"] if a["id"] == verlenging["voor"]["id"]), None)
        if huidig != verlenging["voor"]:
            raise dagplan.PlanOngeldig("De te verlengen afspraak is gewijzigd. Maak een nieuwe herplanning.")
        controle = agendacontrole.controleer({"wat": "afspraak", **verlenging["na"]},
                                            [a for a in virtueel["afspraken"] if a["id"] != huidig["id"]])
        if controle["conflicten"]:
            raise dagplan.PlanOngeldig("De uitloop overlapt een vaste afspraak. Pas de uitloop aan; er is niets opgeslagen.")
        virtueel["afspraken"] = [verlenging["na"] if a["id"] == huidig["id"] else a for a in virtueel["afspraken"]]
    taakwijzigingen = []
    controleplan = copy.deepcopy(plan)
    controleplan["regels"] = []
    taken = {t["id"]: t for t in gegevens["taken"]}
    for regel in plan["regels"]:
        if not regel["plannen"]:
            continue
        taak = regel["taak"]
        if taak != taken.get(taak["id"]) or taak.get("klaar"):
            raise dagplan.PlanOngeldig("Een gekozen taak is veranderd. Maak een nieuwe herplanning.")
        minuten = regel["resterend_minuten"]
        if type(minuten) is not int or minuten != regel["minuten"] or not 1 <= minuten <= 10080:
            raise dagplan.PlanOngeldig("Je resterende minuten zijn veranderd. Kies eerst ‘Herbereken voorstel’.")
        nieuw = {**taak, "resterend_minuten": minuten}
        taakwijzigingen.append({"voor": taak, "na": nieuw})
        virtueel["taken"] = [nieuw if t["id"] == taak["id"] else t for t in virtueel["taken"]]
        controleplan["regels"].append({**regel, "taak": nieuw})
    items = dagplan.valideer(controleplan, virtueel, moment, leeg_toegestaan=True)
    if not items and not oud and not verlenging and not any(w["voor"] != w["na"] for w in taakwijzigingen):
        raise dagplan.PlanOngeldig("Er zijn geen wijzigingen om te bevestigen.")
    return {"items": items, "vervangt": copy.deepcopy(oud), "taakwijzigingen": taakwijzigingen, "verlenging": verlenging}


def ongedaan(gegevens: dict, ontvangst: dict) -> None:
    """Pas het omgekeerde alleen toe wanneer alle betrokken gegevens ongewijzigd zijn."""
    afspraken = {a["id"]: a for a in gegevens["afspraken"]}
    taken = {t["id"]: t for t in gegevens["taken"]}
    if any(afspraken.get(a["id"]) != a for a in ontvangst["items"]) or any(a["id"] in afspraken for a in ontvangst["vervangt"]):
        raise dagplan.PlanOngeldig("Focusblokken zijn intussen gewijzigd. Er is niets teruggedraaid.")
    if any(taken.get(w["na"]["id"]) != w["na"] for w in ontvangst["taakwijzigingen"]):
        raise dagplan.PlanOngeldig("Een taak is intussen gewijzigd. Er is niets teruggedraaid.")
    verlenging = ontvangst["verlenging"]
    if verlenging and afspraken.get(verlenging["na"]["id"]) != verlenging["na"]:
        raise dagplan.PlanOngeldig("De verlengde afspraak is intussen gewijzigd. Er is niets teruggedraaid.")
    ids = {a["id"] for a in ontvangst["items"]}
    herstel = [a for a in gegevens["afspraken"] if a["id"] not in ids]
    if verlenging:
        herstel = [verlenging["voor"] if a["id"] == verlenging["na"]["id"] else a for a in herstel]
    for a in ontvangst["vervangt"]:
        b, e = agendacontrole.interval(a)
        begin, einde = b.astimezone(dagplan.NL).replace(tzinfo=None), e.astimezone(dagplan.NL).replace(tzinfo=None)
        if any(van < einde and begin < tot for van, tot in dagplan._bezet({"afspraken": herstel})):
            raise dagplan.PlanOngeldig("Oude blokken zouden overlappen met een nieuwe afspraak. Er is niets teruggedraaid.")
        herstel.append(a)
    herstel_taken = {w["voor"]["id"]: w["voor"] for w in ontvangst["taakwijzigingen"]}
    for afspraak in ontvangst["vervangt"]:
        if afspraak.get("taak_id"):
            try:
                taakvolgorde.eis_startbaar(afspraak["taak_id"], gegevens["taken"])
            except ValueError as fout:
                raise dagplan.PlanOngeldig(str(fout)) from fout
    gegevens["afspraken"] = herstel
    gegevens["taken"] = [herstel_taken.get(t["id"], t) for t in gegevens["taken"]]
