"""Herbruikbare instellingen; nooit oude datums, IDs of bestanden overnemen."""
import tekstcontrole
from datetime import date, datetime, time, timedelta
import actielinks
import intenties
import agendacontrole

SOORTEN = {"taak": "Taak", "afspraak": "Afspraak", "actielink": "Conceptaanbieding", "dagplan": "Werkdag plannen", "csv": "CSV analyseren"}


def valideer(gegevens: dict) -> dict:
    if not isinstance(gegevens, dict):
        raise ValueError("Ongeldig sjabloon.")
    naam = gegevens.get("naam", "")
    soort = gegevens.get("soort")
    if not isinstance(naam, str) or not 1 <= len(naam.strip()) <= 80 or not tekstcontrole.veilig(naam) or not isinstance(soort, str) or soort not in SOORTEN:
        raise ValueError("Geef een naam van maximaal 80 tekens en kies een ondersteund onderdeel.")
    r = {"naam": naam.strip(), "soort": soort}
    if soort in {"taak", "afspraak", "actielink"}:
        titel = gegevens.get("titel", "")
        if not isinstance(titel, str) or not 1 <= len(titel.strip()) <= 160 or not tekstcontrole.veilig(titel):
            raise ValueError("Geef een titel van maximaal 160 tekens.")
        r["titel"] = titel.strip()
    if soort in {"taak", "afspraak"}:
        minuten = gegevens.get("minuten")
        if minuten is not None and (type(minuten) is not int or not 1 <= minuten <= 1440):
            raise ValueError("Gebruik een duur van 1 tot 1440 minuten.")
        if soort == "afspraak" and minuten is None:
            raise ValueError("Vul de afspraakduur in.")
        r["minuten"] = minuten
    if soort == "afspraak":
        locatie = gegevens.get("locatie", "")
        if not isinstance(locatie, str) or len(locatie) > 500 or not tekstcontrole.veilig(locatie):
            raise ValueError("Gebruik een locatie van maximaal 500 tekens.")
        r["locatie"] = locatie.strip()
    if soort == "actielink":
        r.update(actielinks.valideer({"titel": r["titel"], "prijs_cent": gegevens.get("prijs_cent"), "uren": gegevens.get("uren")}))
    return r


def uit_resultaat(soort: str, item: dict) -> dict:
    if not isinstance(soort, str) or not isinstance(item, dict) or not isinstance(item.get("titel"), str):
        raise ValueError("Dit resultaat kan niet veilig als sjabloon worden overgenomen.")
    if soort == "actielink":
        begin, einde = datetime.fromisoformat(item["aangemaakt"]), datetime.fromisoformat(item["vervalt"])
        uren = int((einde - begin).total_seconds() // 3600)
        r = {"naam": item["titel"][:80], "soort": soort, "titel": item["titel"], "prijs_cent": item["prijs_cent"], "uren": uren}
    elif soort in {"taak", "afspraak"}:
        r = {"naam": item["titel"][:80], "soort": soort, "titel": item["titel"], "minuten": item.get("minuten")}
        if soort == "afspraak":
            if not isinstance(item.get("start"), str) or len(item["start"]) == 10:
                raise ValueError("Hele-dagafspraken kun je via Agenda beheren; dit sjabloon is voor getimede afspraken.")
            begin, einde = agendacontrole.interval(item)
            duur = einde - begin
            r.update(minuten=int(duur.total_seconds() // 60), locatie=item.get("locatie", ""))
    else:
        raise ValueError("Dit resultaat kan niet als sjabloon worden gebruikt.")
    return valideer(r)


def voorstel(sjabloon: dict, dag: date | None = None, begintijd: time | None = None, deadline: date | None = None) -> dict:
    s = valideer(sjabloon)
    soort = s["soort"]
    if soort == "taak":
        return {"soort": "voorstel", "gegevens": intenties.valideer({"wat": "taak", "titel": s["titel"], "minuten": s["minuten"], "deadline": deadline.isoformat() if deadline else None})}
    if soort == "afspraak":
        if not isinstance(dag, date) or not isinstance(begintijd, time):
            raise ValueError("Kies voor elk gebruik een datum en begintijd.")
        begin = datetime.combine(dag, begintijd)
        return {"soort": "voorstel", "gegevens": intenties.valideer({"wat": "afspraak", "titel": s["titel"], "start": begin.isoformat(), "einde": (begin + timedelta(minutes=s["minuten"])).isoformat(), "locatie": s["locatie"]})}
    if soort == "actielink":
        return {"soort": "actielink", "gegevens": {k: s[k] for k in ("titel", "prijs_cent", "uren")}}
    return {"soort": soort}
