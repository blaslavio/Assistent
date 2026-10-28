"""Leesmodel van opgeslagen opdrachten; schrijft nooit gegevens."""

import copy
from datetime import datetime, timezone
import actielinks


def herkomst(gegevens: dict, soort: str) -> dict:
    return {"tijd": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "bron": "Opgeslagen gegevens binnen dit account",
            "taken_in_bron": len(gegevens.get("taken", [])),
            "afspraken_in_bron": len(gegevens.get("afspraken", [])),
            "beperking": ("Externe agenda’s, reistijd en uitnodigingen zijn niet gecontroleerd."
                           if soort in {"afspraak", "dagplan", "herplan", "focusplan"}
                           else "Geen externe diensten gecontroleerd.")}


def overzicht(gegevens: dict) -> list[dict]:
    regels = []
    for opdracht, ontvangst in gegevens.get("intentie_ontvangst", {}).items():
        soort = ontvangst.get("wat", "onbekend")
        status = "ongedaan" if ontvangst.get("ongedaan") else "uitgevoerd"
        items = ontvangst.get("items", [ontvangst["item"]] if "item" in ontvangst else [])
        if status == "uitgevoerd":
            lijst = gegevens.get("taken" if soort == "taak" else "afspraken", [])
            huidig = {i["id"]: i for i in lijst}
            if items and any(i["id"] not in huidig for i in items):
                status = "verwijderd of deels verwijderd"
            elif any(huidig[i["id"]] != i for i in items):
                status = "later gewijzigd"
            if soort == "herplan" and status == "uitgevoerd":
                taken = {t["id"]: t for t in gegevens.get("taken", [])}
                wijzigingen = ontvangst.get("taakwijzigingen", [])
                verlenging = ontvangst.get("verlenging")
                if (any(taken.get(w["na"]["id"]) != w["na"] for w in wijzigingen)
                        or (verlenging and huidig.get(verlenging["na"]["id"]) != verlenging["na"])):
                    status = "later gewijzigd"
        bron = ontvangst.get("herkomst", {})
        regels.append({"id": opdracht, "soort": soort, "status": status,
                       "titel": ontvangst.get("tekst", "Opgeslagen opdracht"),
                       "tijd": bron.get("tijd"), "herkomst": copy.deepcopy(bron),
                       "terugdraaibaar": status == "uitgevoerd" and soort in {"taak", "afspraak", "dagplan", "herplan", "focusplan"}})
    for code, link in gegevens.get("actielinks", {}).items():
        try:
            status = actielinks.status(link)
        except actielinks.Fout:
            status = "ongeldige gegevens"
        regels.append({"id": code, "soort": "actielink", "status": status,
                       "titel": link.get("titel", "Conceptactie"), "tijd": link.get("aangemaakt"),
                       "herkomst": {"bron": "Concept binnen dit account", "beperking": "Geen publicatie of betaling uitgevoerd."},
                       "terugdraaibaar": False})
    for opdracht, r in gegevens.get("planning_herstel", {}).items():
        if not isinstance(r, dict) or not isinstance(r.get("toegevoegd"), dict):
            continue
        aantallen = {k: v for k, v in r["toegevoegd"].items() if k in {"taken", "afspraken", "sjablonen", "werkbronnen"} and type(v) is int}
        regels.append({"id": "herstel:" + opdracht, "soort": "herstel", "status": "toegevoegd bij herstel",
                       "titel": "Planningback-up toegevoegd: " + ", ".join(f"{n} {k}" for k, n in aantallen.items()),
                       "tijd": r.get("tijd"), "herkomst": {"bron": "Bevestigde planningback-up", "aantallen": aantallen,
                           "beperking": "Dit is een ontvangstbewijs van toevoegen. De huidige inhoud kan nadien zijn gewijzigd. Geen automatisch ongedaan maken."},
                       "terugdraaibaar": False})
    return sorted(regels, key=lambda r: (bool(r["tijd"]), r["tijd"] or "", r["id"]), reverse=True)
