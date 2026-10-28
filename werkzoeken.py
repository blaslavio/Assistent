"""Begrensd zoeken in één accountsnapshot, met veilige resultaatvelden."""
import tekstcontrole
from datetime import date, datetime
import heapq
import unicodedata
from zoneinfo import ZoneInfo
import agendacontrole

SOORTEN = ("taak", "afspraak", "bron", "sjabloon")


def _norm(tekst: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", tekst.casefold()) if not unicodedata.combining(c))


def zoek(gegevens: dict, vraag: str, soorten=None, alleen_open=False, vandaag: date | None = None, limiet=1000) -> dict:
    if not isinstance(gegevens, dict) or not isinstance(vraag, str) or len(vraag) > 160:
        raise ValueError("Gebruik geldige gegevens en een zoekvraag van maximaal 160 tekens.")
    if type(limiet) is not int or not 1 <= limiet <= 1000 or type(alleen_open) is not bool:
        raise ValueError("Gebruik een resultaatlimiet van 1 tot 1000 en een geldige statusfilter.")
    if soorten is not None and (not isinstance(soorten, (list, tuple, set)) or any(not isinstance(s, str) or s not in SOORTEN for s in soorten)):
        raise ValueError("Onbekend zoekonderdeel.")
    gekozen = set(SOORTEN if soorten is None else soorten)
    termen = _norm(vraag).split()
    leeg = {"totaal": 0, "resultaten": [], "begrensd": False, "overgeslagen": 0, "limiet": limiet}
    if not termen:
        return leeg
    vandaag = datetime.now(ZoneInfo("Europe/Amsterdam")).date() if vandaag is None else vandaag
    if type(vandaag) is not date:
        raise ValueError("Gebruik een geldige kalenderdatum.")
    totaal = overgeslagen = 0

    def kandidaten():
        nonlocal totaal, overgeslagen
        for soort, key in (("taak", "taken"), ("afspraak", "afspraken"), ("bron", "werkbronnen"), ("sjabloon", "sjablonen")):
            if soort not in gekozen or (alleen_open and soort not in {"taak", "afspraak"}):
                continue
            raw = gegevens.get(key, [] if soort in {"taak", "afspraak"} else {})
            if soort in {"taak", "afspraak"}:
                if not isinstance(raw, list):
                    overgeslagen += 1
                    continue
                items = ((None, r) for r in raw)
            else:
                if not isinstance(raw, dict):
                    overgeslagen += 1
                    continue
                items = raw.items()
            for sleutel, r in items:
                if not isinstance(r, dict):
                    overgeslagen += 1
                    continue
                if alleen_open and soort == "taak" and r.get("klaar"):
                    continue
                titel = r.get("titel") or r.get("naam", "")
                if not tekstcontrole.veilig(titel):
                    overgeslagen += 1
                    continue
                omschrijving = r.get("tekst") or r.get("notitie") or r.get("locatie") or ""
                if not tekstcontrole.veilig(omschrijving, regels=True):
                    omschrijving = ""
                    overgeslagen += 1
                if not all(t in _norm(titel + " " + omschrijving) for t in termen):
                    continue
                status = "afgerond" if soort == "taak" and r.get("klaar") else "open" if soort == "taak" else "opgeslagen"
                datum = None
                if soort == "taak" and r.get("deadline") is not None:
                    try:
                        d = date.fromisoformat(r["deadline"])
                        if d.isoformat() != r["deadline"]:
                            raise ValueError
                        datum = d.isoformat()
                        if not r.get("klaar") and d < vandaag:
                            status = "deadline verstreken"
                    except (TypeError, ValueError):
                        overgeslagen += 1
                        status = "ongeldige datum"
                elif soort == "afspraak":
                    try:
                        einde = agendacontrole.interval(r)[1]
                        datum = datetime.fromisoformat(r["start"]).isoformat(timespec="minutes")
                        if alleen_open and einde.astimezone(ZoneInfo("Europe/Amsterdam")).date() < vandaag:
                            continue
                    except (ValueError, TypeError):
                        overgeslagen += 1
                        status = "ongeldige datum"
                        if alleen_open:
                            continue
                totaal += 1
                i = sleutel if sleutel is not None else r.get("id")
                # Geen onleesbare objecten of geneste inhoud in zoekexports.
                if type(i) not in {str, int}:
                    i = None
                yield {"soort": soort, "id": i, "titel": titel[:160], "omschrijving": omschrijving[:240],
                       "status": status, "datum": datum, "titel_match": all(t in _norm(titel) for t in termen)}

    regels = heapq.nsmallest(limiet, kandidaten(), key=lambda r: (not r["titel_match"], _norm(r["titel"]), r["soort"], str(r["id"])))
    return {"totaal": totaal, "resultaten": regels, "begrensd": totaal > limiet, "overgeslagen": overgeslagen, "limiet": limiet}
