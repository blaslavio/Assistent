"""Opslag van taken, agenda en leervoortgang.

Online (met SUPABASE_URL en SUPABASE_KEY ingesteld) staat alles in een
Supabase-database, zodat het bewaard blijft. Zonder die instellingen gebruikt
de app het bestand data/gegevens.json, handig om lokaal te testen.
"""

import json
import os
import threading
from datetime import date, timedelta
from pathlib import Path

import httpx

DATA_BESTAND = Path(__file__).parent / "data" / "gegevens.json"
_slot = threading.Lock()

LEEG = {"taken": [], "afspraken": [], "leerdoelen": [], "volgend_id": 1}


def _supabase() -> tuple[str, dict] | None:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    sleutel = os.environ.get("SUPABASE_KEY", "")
    if not (url and sleutel):
        return None
    headers = {"apikey": sleutel}
    if sleutel.startswith("eyJ"):  # oude sleutelvorm (JWT) moet ook als Bearer mee
        headers["Authorization"] = f"Bearer {sleutel}"
    return f"{url}/rest/v1/gegevens", headers


def laden() -> dict:
    if online := _supabase():
        url, headers = online
        r = httpx.get(url, params={"id": "eq.1", "select": "data"}, headers=headers, timeout=15)
        r.raise_for_status()
        rijen = r.json()
        return rijen[0]["data"] if rijen else json.loads(json.dumps(LEEG))
    if not DATA_BESTAND.exists():
        return json.loads(json.dumps(LEEG))
    with DATA_BESTAND.open(encoding="utf-8") as f:
        return json.load(f)


def opslaan(gegevens: dict) -> None:
    if online := _supabase():
        url, headers = online
        r = httpx.post(
            url,
            json={"id": 1, "data": gegevens},
            headers={**headers, "Prefer": "resolution=merge-duplicates"},
            timeout=15,
        )
        r.raise_for_status()
        return
    DATA_BESTAND.parent.mkdir(parents=True, exist_ok=True)
    tijdelijk = DATA_BESTAND.with_suffix(".tmp")
    with tijdelijk.open("w", encoding="utf-8") as f:
        json.dump(gegevens, f, ensure_ascii=False, indent=2)
    tijdelijk.replace(DATA_BESTAND)


def _nieuw_id(gegevens: dict) -> int:
    nieuw = gegevens["volgend_id"]
    gegevens["volgend_id"] += 1
    return nieuw


# --- Taken ---------------------------------------------------------------

def taak_toevoegen(titel: str, deadline: str | None = None) -> dict:
    with _slot:
        g = laden()
        taak = {"id": _nieuw_id(g), "titel": titel, "deadline": deadline, "klaar": False}
        g["taken"].append(taak)
        opslaan(g)
    return taak


def taak_afronden(taak_id: int) -> dict | None:
    with _slot:
        g = laden()
        for taak in g["taken"]:
            if taak["id"] == taak_id:
                taak["klaar"] = True
                opslaan(g)
                return taak
    return None


def open_taken() -> list[dict]:
    taken = [t for t in laden()["taken"] if not t["klaar"]]
    return sorted(taken, key=lambda t: t["deadline"] or "9999")


# --- Agenda --------------------------------------------------------------

def afspraak_toevoegen(titel: str, start: str, einde: str | None = None, notitie: str = "") -> dict:
    with _slot:
        g = laden()
        afspraak = {"id": _nieuw_id(g), "titel": titel, "start": start, "einde": einde, "notitie": notitie}
        g["afspraken"].append(afspraak)
        opslaan(g)
    return afspraak


def afspraak_verwijderen(afspraak_id: int) -> bool:
    with _slot:
        g = laden()
        voor = len(g["afspraken"])
        g["afspraken"] = [a for a in g["afspraken"] if a["id"] != afspraak_id]
        opslaan(g)
        return len(g["afspraken"]) < voor


def afspraken_tussen(van: str, tot: str) -> list[dict]:
    """Afspraken waarvan de start tussen twee datums (JJJJ-MM-DD, inclusief) valt."""
    resultaat = [a for a in laden()["afspraken"] if van <= a["start"][:10] <= tot]
    return sorted(resultaat, key=lambda a: a["start"])


# --- Leren ---------------------------------------------------------------
# Herhaling volgens een eenvoudige "spaced repetition": hoe beter je een stap
# beheerst, hoe langer het duurt voordat hij terugkomt.

HERHAAL_NA_DAGEN = {0: 1, 1: 1, 2: 2, 3: 4, 4: 7, 5: 14}


def leerdoel_starten(onderwerp: str, stappen: list[str]) -> dict:
    with _slot:
        g = laden()
        doel = {
            "id": _nieuw_id(g),
            "onderwerp": onderwerp,
            "gestart": date.today().isoformat(),
            "stappen": [
                {"nummer": i + 1, "titel": titel, "score": None, "herhalen_op": None, "keer_geoefend": 0}
                for i, titel in enumerate(stappen)
            ],
        }
        g["leerdoelen"].append(doel)
        opslaan(g)
    return doel


def oefening_vastleggen(leerdoel_id: int, stap_nummer: int, score: int) -> dict | None:
    """Score 0 (helemaal niet) tot 5 (perfect). Plant de volgende herhaling in."""
    score = max(0, min(5, score))
    with _slot:
        g = laden()
        for doel in g["leerdoelen"]:
            if doel["id"] != leerdoel_id:
                continue
            for stap in doel["stappen"]:
                if stap["nummer"] == stap_nummer:
                    stap["keer_geoefend"] += 1
                    dagen = HERHAAL_NA_DAGEN[score] * (2 if stap["keer_geoefend"] > 2 and score >= 4 else 1)
                    stap["score"] = score
                    stap["herhalen_op"] = (date.today() + timedelta(days=dagen)).isoformat()
                    opslaan(g)
                    return stap
    return None


def voortgang(doel: dict) -> int:
    """Percentage stappen dat met minimaal een 4 beheerst wordt."""
    if not doel["stappen"]:
        return 0
    beheerst = sum(1 for s in doel["stappen"] if (s["score"] or 0) >= 4)
    return round(100 * beheerst / len(doel["stappen"]))


def leerdoelen() -> list[dict]:
    return laden()["leerdoelen"]


def herhalingen_vandaag() -> list[dict]:
    vandaag = date.today().isoformat()
    resultaat = []
    for doel in leerdoelen():
        for stap in doel["stappen"]:
            if stap["herhalen_op"] and stap["herhalen_op"] <= vandaag:
                resultaat.append({"leerdoel_id": doel["id"], "onderwerp": doel["onderwerp"], **stap})
    return resultaat
