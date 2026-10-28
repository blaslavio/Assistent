"""Controleer het volledige meerdaagse focusvoorstel vóór één opslagactie."""
from datetime import date, datetime, time, timedelta
import dagplan
import inplannen
import intenties
import taakvolgorde


def valideer(plan: list[dict], gegevens: dict, moment: datetime | None = None) -> list[dict]:
    moment = moment or dagplan.nu()
    if not isinstance(plan, list) or not 1 <= len(plan) <= 1000:
        raise ValueError("Maak een geldig planningsvoorstel.")
    taken = {t["id"]: t for t in gegevens["taken"]}
    uren = dagplan._uren(gegevens)
    bezet = dagplan._bezet(gegevens)
    al_gepland = dagplan._gepland(gegevens, moment)
    items, gezien = [], set()
    for regel in plan:
        if not isinstance(regel, dict) or not isinstance(regel.get("blokken"), list):
            raise ValueError("Ongeldig focusvoorstel.")
        if not regel["blokken"]:
            continue
        i = regel.get("taak_id")
        if type(i) is not int or i not in taken or i in gezien or i in al_gepland:
            raise ValueError("Een taak is verdwenen, dubbel gekozen of al ingepland. Maak een nieuw voorstel.")
        taak = taken[i]
        taakvolgorde.eis_startbaar(i, gegevens["taken"])
        if regel.get("titel") != taak["titel"] or regel.get("deadline") != taak.get("deadline"):
            raise ValueError("Een taak is gewijzigd. Maak een nieuw voorstel.")
        gezien.add(i)
        totaal = 0
        if len(regel["blokken"]) > 100:
            raise ValueError("Te veel focusblokken voor één taak.")
        for blok in regel["blokken"]:
            if not isinstance(blok, dict) or set(blok) != {"start", "einde"}:
                raise ValueError("Ongeldig focusblok.")
            item = intenties.valideer({"wat": "afspraak", "titel": taak["titel"], **blok})
            begin, einde = datetime.fromisoformat(item["start"]), datetime.fromisoformat(item["einde"])
            duur = int((einde - begin).total_seconds() // 60)
            if not (moment <= begin < einde and begin.date() == einde.date() and begin.date() <= moment.date() + timedelta(days=31)
                    and (uren["weekend"] or begin.weekday() < 5)
                    and time.fromisoformat(uren["van"]) <= begin.time() < einde.time() <= time.fromisoformat(uren["tot"])
                    and duur <= inplannen.MAX_BLOK):
                raise ValueError("Een focusblok valt buiten de actuele planningsuren, is te lang of is al begonnen.")
            if taak.get("deadline") and moment.date() <= date.fromisoformat(taak["deadline"]) < begin.date():
                raise ValueError("Een focusblok valt na de deadline. Maak een nieuw voorstel.")
            if any(b < einde and begin < e for b, e in bezet):
                raise ValueError("Een focusblok overlapt of mist tien minuten pauze. Maak een nieuw voorstel.")
            bezet.append((begin - inplannen.PAUZE, einde + inplannen.PAUZE))
            totaal += duur
            items.append({"titel": taak["titel"], "start": item["start"], "einde": item["einde"], "taak_id": i,
                          "soort": "focus", "notitie": "Ingepland door je assistent.", "locatie": "", "contact_id": None})
        if totaal > dagplan._minuten(taak):
            raise ValueError("De blokken zijn langer dan de resterende taakduur.")
    if not items:
        raise ValueError("Het voorstel bevat geen focusblokken.")
    return items
