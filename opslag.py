"""Opslag van taken, agenda en leervoortgang.

Online staat alles in een Supabase-database. De app gebruikt daarvoor alleen de
publishable sleutel (die openbaar mag zijn) en databasefuncties die pas iets
teruggeven met het wachtwoord dat de gebruiker in de app kiest. Er staat dus
niets geheims in de code of in Streamlit.

Met ASSISTENT_LOKAAL=1 gebruikt de app het bestand data/gegevens.json, handig om
lokaal te testen.
"""

import contextvars
import hashlib
import hmac
import json
import os
import secrets
import threading
from datetime import date, datetime, timedelta
from pathlib import Path

import httpx

DATA_BESTAND = Path(__file__).parent / "data" / "gegevens.json"
_slot = threading.Lock()

SUPABASE_URL = "https://lnjsekmlpjyiwdlzcowa.supabase.co"
SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Bq-K3J6yt0-B-mHWYj-tnQ_DWD0c9KX"

LEEG = {"taken": [], "afspraken": [], "contacten": [], "leerdoelen": [], "sportdoelen": [], "volgend_id": 1}

# Naam en wachtwoord van de ingelogde gebruiker, per sessie (Streamlit draait elke sessie in een eigen thread).
# Een lege naam is de eigenaar van de app.
_naam: contextvars.ContextVar[str] = contextvars.ContextVar("naam", default="")
_wachtwoord: contextvars.ContextVar[str] = contextvars.ContextVar("wachtwoord", default="")


class GeenToegang(Exception):
    """Naam of wachtwoord klopt niet (of er waren te veel foute pogingen)."""


def gebruik_account(naam: str, wachtwoord: str) -> None:
    _naam.set(naam)
    _wachtwoord.set(wachtwoord)


def gebruik_wachtwoord(wachtwoord: str) -> None:
    gebruik_account("", wachtwoord)


def online() -> bool:
    """True als de gegevens in Supabase bewaard worden."""
    return os.environ.get("ASSISTENT_LOKAAL") != "1"


def _rpc(functie: str, **parameters):
    url = os.environ.get("SUPABASE_URL", SUPABASE_URL).rstrip("/")
    sleutel = os.environ.get("SUPABASE_KEY", SUPABASE_PUBLISHABLE_KEY)
    r = httpx.post(f"{url}/rest/v1/rpc/{functie}", json=parameters, headers={"apikey": sleutel}, timeout=15)
    r.raise_for_status()
    return r.json()


def _rpc_ik(functie: str, **parameters):
    """Roept een databasefunctie aan als de ingelogde gebruiker."""
    antwoord = _rpc(functie, p_naam=_naam.get(), p_wachtwoord=_wachtwoord.get(), **parameters)
    if isinstance(antwoord, dict) and antwoord.get("geen_toegang"):
        raise GeenToegang
    return antwoord


def _lokaal_laden() -> dict:
    if not DATA_BESTAND.exists():
        return json.loads(json.dumps(LEEG))
    with DATA_BESTAND.open(encoding="utf-8") as f:
        return json.load(f)


def _lokaal_opslaan(gegevens: dict) -> None:
    DATA_BESTAND.parent.mkdir(parents=True, exist_ok=True)
    tijdelijk = DATA_BESTAND.with_suffix(".tmp")
    with tijdelijk.open("w", encoding="utf-8") as f:
        json.dump(gegevens, f, ensure_ascii=False, indent=2)
    tijdelijk.replace(DATA_BESTAND)


def _lokale_hash(wachtwoord: str, zout: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", wachtwoord.encode(), bytes.fromhex(zout), 200_000).hex()


def laden() -> dict:
    if not online():
        return _lokaal_laden()
    gegevens = _rpc_ik("mijn_gegevens").get("data") or {}
    return {**json.loads(json.dumps(LEEG)), **gegevens}


def opslaan(gegevens: dict) -> None:
    if not online():
        _lokaal_opslaan(gegevens)
    elif not _rpc_ik("mijn_gegevens_bewaren", p_data=gegevens):
        raise GeenToegang


# --- Wachtwoord ------------------------------------------------------------

def is_geregistreerd() -> bool:
    if not online():
        return "wachtwoord_hash" in _lokaal_laden().get("instellingen", {})
    return bool(_rpc("is_geregistreerd"))


def registreer(wachtwoord: str) -> bool:
    """Stelt het wachtwoord in. Lukt alleen als er nog geen wachtwoord is."""
    if is_geregistreerd():
        return False
    if not online():
        g = _lokaal_laden()
        zout = secrets.token_hex(16)
        g.setdefault("instellingen", {}).update(wachtwoord_zout=zout, wachtwoord_hash=_lokale_hash(wachtwoord, zout))
        _lokaal_opslaan(g)
        return True
    return bool(_rpc("registreer", p_wachtwoord=wachtwoord))


def wachtwoord_klopt(wachtwoord: str) -> bool:
    return inloggen("", wachtwoord) is not None


def inloggen(naam: str, wachtwoord: str) -> dict | None:
    """Controleert naam en wachtwoord. Geeft de gebruiker (id, naam, weergavenaam, beheerder) of None."""
    if not online():
        inst = _lokaal_laden().get("instellingen", {})
        klopt = not naam and "wachtwoord_hash" in inst and hmac.compare_digest(
            _lokale_hash(wachtwoord, inst["wachtwoord_zout"]), inst["wachtwoord_hash"])
        return {"id": 1, "naam": None, "weergavenaam": "Eigenaar", "beheerder": True} if klopt else None
    antwoord = _rpc("mijn_gegevens", p_naam=naam, p_wachtwoord=wachtwoord)
    return None if antwoord.get("geen_toegang") else antwoord["gebruiker"]


# --- Account ---------------------------------------------------------------

def account_maken(naam: str, weergavenaam: str, wachtwoord: str, akkoord: bool) -> str | None:
    """Maakt een nieuw account. Geeft een foutmelding terug, of None als het gelukt is."""
    if not online():
        return "Accounts maken kan alleen in de online versie."
    antwoord = _rpc("account_maken", p_naam=naam, p_weergavenaam=weergavenaam, p_wachtwoord=wachtwoord, p_akkoord=akkoord)
    return antwoord.get("fout")


def profiel_bijwerken(nieuwe_naam: str | None = None, weergavenaam: str | None = None,
                      nieuw_wachtwoord: str | None = None) -> str | None:
    """Past gebruikersnaam, weergavenaam of wachtwoord aan. Geeft een foutmelding, of None."""
    if not online():
        return "Kan alleen in de online versie."
    antwoord = _rpc_ik("profiel_bijwerken", p_nieuwe_naam=nieuwe_naam, p_weergavenaam=weergavenaam,
                       p_nieuw_wachtwoord=nieuw_wachtwoord)
    return antwoord.get("fout")


def account_verwijderen() -> bool:
    """Wist alle gegevens en maakt het account onbruikbaar. Kan niet voor de eigenaar."""
    return online() and bool(_rpc_ik("account_verwijderen"))


GEHEIM = {"anthropic_sleutel", "strava_client_secret", "strava_tokens", "ticketmaster_sleutel"}


def export() -> str:
    """Al je eigen gegevens als JSON, zonder wachtwoorden en sleutels."""
    g = laden()
    inst = {k: v for k, v in g.get("instellingen", {}).items() if k not in GEHEIM}
    if "mail" in inst:
        inst["mail"] = {k: v for k, v in inst["mail"].items() if k != "wachtwoord"}
    return json.dumps({**g, "instellingen": inst}, ensure_ascii=False, indent=2)


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

def afspraak_toevoegen(
    titel: str,
    start: str,
    einde: str | None = None,
    notitie: str = "",
    locatie: str = "",
    contact_id: int | None = None,
    sport: str = "",
    soort: str = "",
) -> dict:
    with _slot:
        g = laden()
        afspraak = {
            "id": _nieuw_id(g),
            "titel": titel,
            "start": start,
            "einde": einde,
            "notitie": notitie,
            "locatie": locatie,
            "contact_id": contact_id,
        }
        if sport:
            afspraak["sport"] = sport.lower()
        if soort:
            afspraak["soort"] = soort.lower()
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


def tijd_vastleggen(afspraak_id: int, moment: str, tijdstip: str | None = None) -> dict | None:
    """Legt een moment vast (vertrokken, aangekomen, weg of terug), standaard nu."""
    tijdstip = tijdstip or datetime.now().isoformat(timespec="minutes")
    with _slot:
        g = laden()
        for afspraak in g["afspraken"]:
            if afspraak["id"] == afspraak_id:
                afspraak.setdefault("tijden", {})[moment] = tijdstip
                opslaan(g)
                return afspraak
    return None


def sport_vastleggen(
    afspraak_id: int, minuten: int = 0, afstand_km: float = 0, gevoel: int = 0, notitie: str = ""
) -> dict | None:
    """Resultaat van een sportafspraak. Gevoel van 1 (zwaar) tot 5 (top), 0 als onbekend."""
    resultaat = {"minuten": minuten, "afstand_km": afstand_km, "gevoel": gevoel, "notitie": notitie}
    with _slot:
        g = laden()
        for afspraak in g["afspraken"]:
            if afspraak["id"] == afspraak_id:
                afspraak["sport_resultaat"] = {k: v for k, v in resultaat.items() if v}
                opslaan(g)
                return afspraak
    return None


def training_koppelen(training_id: int, naam: str, start: str, sport: str, resultaat: dict) -> bool:
    """Koppelt een training uit Strava aan een sportafspraak die rond die tijd begon,
    of zet hem als nieuwe sportafspraak in de agenda. False als hij er al was."""
    resultaat = {k: v for k, v in resultaat.items() if v}
    with _slot:
        g = laden()
        if any(a.get("strava_id") == training_id for a in g["afspraken"]):
            return False
        moment = datetime.fromisoformat(start)
        for afspraak in g["afspraken"]:
            if (afspraak.get("sport") and "T" in afspraak["start"] and not afspraak.get("strava_id")
                    and abs(datetime.fromisoformat(afspraak["start"]) - moment) <= timedelta(hours=2)):
                afspraak["strava_id"] = training_id
                afspraak["sport_resultaat"] = {**afspraak.get("sport_resultaat", {}), **resultaat}
                break
        else:
            einde = moment + timedelta(minutes=resultaat.get("minuten", 0))
            g["afspraken"].append({
                "id": _nieuw_id(g), "titel": naam, "start": start, "einde": einde.isoformat(timespec="minutes"),
                "notitie": "", "locatie": "", "contact_id": None, "sport": sport,
                "sport_resultaat": resultaat, "strava_id": training_id,
            })
        opslaan(g)
    return True


def afspraak_bijwerken(afspraak_id: int, **velden) -> dict | None:
    with _slot:
        g = laden()
        for afspraak in g["afspraken"]:
            if afspraak["id"] == afspraak_id:
                afspraak.update(velden)
                opslaan(g)
                return afspraak
    return None


# --- Contacten -----------------------------------------------------------

def contact_opslaan(
    naam: str, telefoon: str = "", email: str = "", adres: str = "", notitie: str = "", contact_id: int | None = None
) -> dict:
    """Nieuw contact, of een bestaand contact bijwerken als contact_id is opgegeven."""
    velden = {"naam": naam, "telefoon": telefoon, "email": email, "adres": adres, "notitie": notitie}
    with _slot:
        g = laden()
        contacten = g.setdefault("contacten", [])
        for contact in contacten:
            if contact["id"] == contact_id:
                contact.update({k: v for k, v in velden.items() if v})
                opslaan(g)
                return contact
        contact = {"id": _nieuw_id(g), **velden}
        contacten.append(contact)
        opslaan(g)
    return contact


def contacten_zoeken(zoekterm: str = "") -> list[dict]:
    zoekterm = zoekterm.lower()
    return [c for c in laden().get("contacten", []) if zoekterm in json.dumps(c, ensure_ascii=False).lower()]


def contact(contact_id: int | None) -> dict | None:
    return next((c for c in laden().get("contacten", []) if c["id"] == contact_id), None)


# --- Boodschappen ---------------------------------------------------------

def boodschappen() -> list[dict]:
    return laden().get("boodschappen", [])


def boodschap_toevoegen(teksten: list[str]) -> list[dict]:
    with _slot:
        g = laden()
        lijst = g.setdefault("boodschappen", [])
        bestaand = {b["tekst"].lower() for b in lijst if not b["gekocht"]}
        nieuw = []
        for tekst in teksten:
            tekst = tekst.strip()
            if tekst and tekst.lower() not in bestaand:
                item = {"id": _nieuw_id(g), "tekst": tekst, "gekocht": False}
                lijst.append(item)
                nieuw.append(item)
                bestaand.add(tekst.lower())
        opslaan(g)
    return nieuw


def boodschap_bijwerken(boodschap_id: int, **velden) -> None:
    with _slot:
        g = laden()
        for b in g.get("boodschappen", []):
            if b["id"] == boodschap_id:
                b.update(velden)
        opslaan(g)


def boodschappen_opruimen(alleen_gekocht: bool = True) -> None:
    with _slot:
        g = laden()
        g["boodschappen"] = [b for b in g.get("boodschappen", []) if alleen_gekocht and not b["gekocht"]]
        opslaan(g)


# --- Sportdoelen ----------------------------------------------------------
# maatstaf: keer_per_week, minuten_per_week, km_per_week, langste_km (één keer zo
# ver, bijvoorbeeld 10 km hardlopen) of totaal_km (bij elkaar vanaf de start).

MAATSTAVEN = ["keer_per_week", "minuten_per_week", "km_per_week", "langste_km", "totaal_km"]


def sportdoel_stellen(omschrijving: str, maatstaf: str, doelwaarde: float, sport: str = "", deadline: str = "") -> dict:
    with _slot:
        g = laden()
        doel = {"id": _nieuw_id(g), "omschrijving": omschrijving, "sport": sport.lower(), "maatstaf": maatstaf,
                "doelwaarde": doelwaarde, "deadline": deadline, "gestart": date.today().isoformat(), "actief": True}
        g.setdefault("sportdoelen", []).append(doel)
        opslaan(g)
    return doel


def sportdoel_stoppen(doel_id: int) -> bool:
    with _slot:
        g = laden()
        for doel in g.get("sportdoelen", []):
            if doel["id"] == doel_id:
                doel["actief"] = False
                opslaan(g)
                return True
    return False


def sportdoelen() -> list[dict]:
    return [d for d in laden().get("sportdoelen", []) if d.get("actief", True)]


# --- Leren ---------------------------------------------------------------
# Herhaling volgens een eenvoudige "spaced repetition": hoe beter je een stap
# beheerst, hoe langer het duurt voordat hij terugkomt.

HERHAAL_NA_DAGEN = {0: 1, 1: 1, 2: 2, 3: 4, 4: 7, 5: 14}


def leerdoel_starten(onderwerp: str, stappen: list[str], doel_omschrijving: str = "", deadline: str = "") -> dict:
    with _slot:
        g = laden()
        doel = {
            "id": _nieuw_id(g),
            "onderwerp": onderwerp,
            "doel": doel_omschrijving,
            "deadline": deadline,
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


# --- Instellingen ----------------------------------------------------------
# De Anthropic-sleutel, ingevuld in de app zelf.

def instellingen() -> dict:
    return laden().get("instellingen", {})


def instellingen_bijwerken(**waarden: str) -> None:
    with _slot:
        g = laden()
        g.setdefault("instellingen", {}).update(waarden)
        opslaan(g)


# --- Geheugen: wat de assistent over de gebruiker weet --------------------

def geheugen() -> list[dict]:
    return laden().get("geheugen", [])


def onthouden(feit: str, onderwerp: str = "algemeen") -> dict:
    """Bewaart een feit. Een feit dat er al (bijna letterlijk) staat, wordt niet dubbel bewaard."""
    with _slot:
        g = laden()
        lijst = g.setdefault("geheugen", [])
        for item in lijst:
            if item["feit"].strip().lower() == feit.strip().lower():
                return item
        item = {"id": _nieuw_id(g), "feit": feit.strip(), "onderwerp": onderwerp.strip().lower() or "algemeen",
                "datum": datetime.now().date().isoformat()}
        lijst.append(item)
        opslaan(g)
    return item


def vergeten(feit_id: int) -> bool:
    with _slot:
        g = laden()
        lijst = g.get("geheugen", [])
        over = [f for f in lijst if f["id"] != feit_id]
        if len(over) == len(lijst):
            return False
        g["geheugen"] = over
        opslaan(g)
    return True


# --- Schrijven: scripties, verslagen en essays ------------------------------

HOOFDSTUKKEN = {
    "scriptie": ["Inleiding en onderzoeksvraag", "Theoretisch kader", "Methode", "Resultaten",
                 "Conclusie", "Discussie en aanbevelingen", "Literatuurlijst"],
    "verslag": ["Inleiding", "Achtergrond", "Uitwerking", "Conclusie", "Bronnenlijst"],
    "essay": ["Inleiding en stelling", "Argumenten", "Tegenargumenten en weerlegging", "Conclusie", "Bronnenlijst"],
    "paper": ["Abstract", "Inleiding", "Methode", "Resultaten", "Discussie", "Referenties"],
}
STATUS = ["te doen", "bezig", "klaar"]


def schrijfprojecten() -> list[dict]:
    return laden().get("schrijfprojecten", [])


def schrijfproject(project_id: int) -> dict | None:
    return next((p for p in schrijfprojecten() if p["id"] == project_id), None)


def schrijfproject_maken(titel: str, soort: str = "verslag", onderzoeksvraag: str = "", deadline: str = "",
                         niveau: str = "", hoofdstukken: list[str] | None = None, eisen: str = "") -> dict:
    soort = soort.lower() if soort.lower() in HOOFDSTUKKEN else "verslag"
    with _slot:
        g = laden()
        project = {
            "id": _nieuw_id(g), "titel": titel, "soort": soort, "onderzoeksvraag": onderzoeksvraag,
            "deadline": deadline, "niveau": niveau, "eisen": eisen, "stijl": "APA 7",
            "gestart": date.today().isoformat(),
            "hoofdstukken": [{"nummer": i + 1, "titel": h, "status": "te doen", "notitie": ""}
                             for i, h in enumerate(hoofdstukken or HOOFDSTUKKEN[soort])],
            "bronnen": [],
        }
        g.setdefault("schrijfprojecten", []).append(project)
        opslaan(g)
    return project


def schrijfproject_bijwerken(project_id: int, **velden) -> dict | None:
    with _slot:
        g = laden()
        for project in g.get("schrijfprojecten", []):
            if project["id"] == project_id:
                project.update(velden)
                opslaan(g)
                return project
    return None


def hoofdstuk_bijwerken(project_id: int, nummer: int, status: str = "", notitie: str | None = None,
                        titel: str = "") -> dict | None:
    with _slot:
        g = laden()
        for project in g.get("schrijfprojecten", []):
            if project["id"] != project_id:
                continue
            for h in project["hoofdstukken"]:
                if h["nummer"] == nummer:
                    if status in STATUS:
                        h["status"] = status
                    if notitie is not None:
                        h["notitie"] = notitie
                    if titel:
                        h["titel"] = titel
                    opslaan(g)
                    return h
    return None


def bron_toevoegen(project_id: int, bron: dict) -> dict | None:
    """Voegt een bron toe aan een project; dezelfde DOI of titel komt er maar één keer in."""
    with _slot:
        g = laden()
        for project in g.get("schrijfprojecten", []):
            if project["id"] != project_id:
                continue
            for b in project["bronnen"]:
                if (bron.get("doi") and b.get("doi") == bron["doi"]) or b["titel"].lower() == bron["titel"].lower():
                    return b
            bron = {"id": _nieuw_id(g), **bron}
            project["bronnen"].append(bron)
            opslaan(g)
            return bron
    return None


def bron_verwijderen(project_id: int, bron_id: int) -> None:
    with _slot:
        g = laden()
        for project in g.get("schrijfprojecten", []):
            if project["id"] == project_id:
                project["bronnen"] = [b for b in project["bronnen"] if b["id"] != bron_id]
                opslaan(g)


def schrijfproject_archiveren(project_id: int) -> None:
    schrijfproject_bijwerken(project_id, gearchiveerd=True)


# --- Mailconcepten: antwoorden die klaarstaan om te versturen ---------------

def mailconcepten() -> list[dict]:
    return laden().get("mailconcepten", [])


def mailconcept_opslaan(aan: str, onderwerp: str, tekst: str, in_antwoord_op: str = "", references: str = "",
                        concept_id: int | None = None) -> dict:
    with _slot:
        g = laden()
        lijst = g.setdefault("mailconcepten", [])
        velden = {"aan": aan, "onderwerp": onderwerp, "tekst": tekst, "in_antwoord_op": in_antwoord_op,
                  "references": references}
        for concept in lijst:
            if concept["id"] == concept_id:
                concept.update(velden)
                opslaan(g)
                return concept
        concept = {"id": _nieuw_id(g), **velden, "gemaakt": datetime.now().isoformat(timespec="minutes")}
        lijst.append(concept)
        opslaan(g)
    return concept


def mailconcept_weg(concept_id: int) -> None:
    with _slot:
        g = laden()
        g["mailconcepten"] = [c for c in g.get("mailconcepten", []) if c["id"] != concept_id]
        opslaan(g)
