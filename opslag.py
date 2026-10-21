"""Opslag van taken, agenda en leervoortgang.

Online staat alles in een Supabase-database. De app gebruikt daarvoor alleen de
publishable sleutel (die openbaar mag zijn) en databasefuncties die pas iets
teruggeven met het wachtwoord dat de gebruiker in de app kiest. Er staat dus
niets geheims in de code of in Streamlit.

Met ASSISTENT_LOKAAL=1 gebruikt de app het bestand data/gegevens.json, handig om
lokaal te testen.
"""

import contextvars
import copy
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
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
# De gegevens per gebruiker, gedeeld door alle sessies in deze server. Alles wat deze gegevens wijzigt, gaat via
# deze server (opslaan hieronder), dus ze blijven kloppen en hoeven niet bij elke klik opnieuw uit de database
# (die staat in Ierland, de server in de VS: elke vraag kost een paar honderd milliseconden).
# Een inlogcode mag de bewaarde gegevens alleen gebruiken als de database die code kort geleden nog goedkeurde.
_gedeeld: dict[int, tuple[float, dict]] = {}          # gebruiker-id -> (tijd, gegevens)
_codes: dict[tuple[str, str], tuple[float, int]] = {}  # (naam, inlogcode) -> (goedgekeurd om, gebruiker-id)
_gedeeld_slot = threading.Lock()
ONTHOUD_SECONDEN = 600
CODE_GELDIG_SECONDEN = 300


class GeenToegang(Exception):
    """Naam of wachtwoord klopt niet (of er waren te veel foute pogingen)."""


def gebruik_account(naam: str, wachtwoord: str) -> None:
    """Begin van elke run (en elke knop): vanaf hier de gegevens van dit account, vers uit de database."""
    _naam.set(naam)
    _wachtwoord.set(wachtwoord)


def gebruik_wachtwoord(wachtwoord: str) -> None:
    gebruik_account("", wachtwoord)


def online() -> bool:
    """True als de gegevens in Supabase bewaard worden."""
    return os.environ.get("ASSISTENT_LOKAAL") != "1"


# Eén verbinding die open blijft: scheelt bij elke databasevraag een nieuwe (trage) beveiligde verbinding.
_verbinding = httpx.Client(timeout=15)


def _rpc(functie: str, **parameters):
    url = os.environ.get("SUPABASE_URL", SUPABASE_URL).rstrip("/")
    sleutel = os.environ.get("SUPABASE_KEY", SUPABASE_PUBLISHABLE_KEY)
    r = _verbinding.post(f"{url}/rest/v1/rpc/{functie}", json=parameters, headers={"apikey": sleutel})
    r.raise_for_status()
    return r.json()


def tegelijk(*functies):
    """Voert een paar databasevragen tegelijk uit in plaats van na elkaar (scheelt telkens de reistijd)."""
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=len(functies)) as uitvoerder:
        bezig = [uitvoerder.submit(contextvars.copy_context().run, f) for f in functies]
        return [b.result() for b in bezig]


def _rpc_ik(functie: str, **parameters):
    """Roept een databasefunctie aan als de ingelogde gebruiker."""
    antwoord = _rpc(functie, p_naam=_naam.get(), p_wachtwoord=_wachtwoord.get(), **parameters)
    if functie in _MAAKT_CODES_ONGELDIG:
        vergeet_gegevens()
    if isinstance(antwoord, dict) and antwoord.get("geen_toegang"):
        with _gedeeld_slot:
            _codes.pop((_naam.get(), _wachtwoord.get()), None)
        raise GeenToegang
    return antwoord


# Na deze databasefuncties kan een inlogcode niet meer geldig zijn, of zijn de gegevens elders gewist.
_MAAKT_CODES_ONGELDIG = {"uitloggen", "overal_uitloggen", "profiel_bijwerken", "account_verwijderen",
                         "twee_stap_bevestigen", "twee_stap_uitzetten"}


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
    sleutel, nu = (_naam.get(), _wachtwoord.get()), time.time()
    with _gedeeld_slot:
        goedgekeurd, gebruiker = _codes.get(sleutel, (0, None))
        bewaard = _gedeeld.get(gebruiker) if nu - goedgekeurd < CODE_GELDIG_SECONDEN else None
        if bewaard and nu - bewaard[0] < ONTHOUD_SECONDEN:
            return copy.deepcopy(bewaard[1])
    antwoord = _rpc_ik("mijn_gegevens")
    gegevens = {**json.loads(json.dumps(LEEG)), **(antwoord.get("data") or {})}
    if gebruiker_id := (antwoord.get("gebruiker") or {}).get("id"):
        with _gedeeld_slot:
            _codes[sleutel] = (nu, gebruiker_id)
            _gedeeld[gebruiker_id] = (nu, copy.deepcopy(gegevens))
    return gegevens


def vergeet_gegevens() -> None:
    """Haalt alles weg wat deze server onthoudt: de volgende keer vers uit de database."""
    with _gedeeld_slot:
        _gedeeld.clear()
        _codes.clear()


def opslaan(gegevens: dict) -> None:
    if not online():
        _lokaal_opslaan(gegevens)
    elif not _rpc_ik("mijn_gegevens_bewaren", p_data=gegevens):
        with _gedeeld_slot:
            _codes.pop((_naam.get(), _wachtwoord.get()), None)
        raise GeenToegang
    else:
        with _gedeeld_slot:
            _goedgekeurd, gebruiker = _codes.get((_naam.get(), _wachtwoord.get()), (0, None))
            if gebruiker is not None:
                _codes[(_naam.get(), _wachtwoord.get())] = (time.time(), gebruiker)
                _gedeeld[gebruiker] = (time.time(), copy.deepcopy(gegevens))


# --- Wachtwoord ------------------------------------------------------------

_geregistreerd = False


def is_geregistreerd() -> bool:
    global _geregistreerd
    if not online():
        return "wachtwoord_hash" in _lokaal_laden().get("instellingen", {})
    # Eenmaal geregistreerd blijft zo: dan hoeft het niet bij elke klik opnieuw gevraagd.
    _geregistreerd = _geregistreerd or bool(_rpc("is_geregistreerd"))
    return _geregistreerd


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


def aanmelden(naam: str, wachtwoord: str, code: str = "", apparaat: str = "") -> dict:
    """Inloggen met wachtwoord en eventueel een code. Geeft {"token"}, {"code_nodig"} en/of {"fout"}.

    Het token gebruikt de app daarna in plaats van het wachtwoord.
    """
    if not online():
        return {"token": wachtwoord} if inloggen(naam, wachtwoord) else {"fout": "Wachtwoord klopt niet."}
    return _rpc("inloggen", p_naam=naam, p_wachtwoord=wachtwoord, p_code=code, p_apparaat=apparaat)


def is_sessie(wachtwoord: str) -> bool:
    return wachtwoord.startswith("sessie.")


def uitloggen() -> None:
    if online() and is_sessie(_wachtwoord.get()):
        try:
            _rpc_ik("uitloggen")
        except Exception:
            pass


def beveiliging() -> dict:
    return _rpc_ik("beveiliging")


# --- Vertrouwde apparaten: ingelogd blijven (ook voor Siri) ---------------------------

def apparaat_onthouden(naam_apparaat: str) -> str | None:
    """Een sleutel om op dit apparaat ingelogd te blijven, of None (lokaal of geen toegang)."""
    if not online():
        return None
    return _rpc_ik("apparaat_onthouden", p_apparaat=naam_apparaat).get("token")


def apparaat_inloggen(token: str, naam_apparaat: str) -> dict | None:
    """Ruilt een bewaarde apparaatsleutel in voor een sessie: {"token", "naam"} of None als hij niet meer geldt."""
    if not online() or not token.startswith("apparaat."):
        return None
    antwoord = _rpc("apparaat_inloggen", p_token=token, p_apparaat=naam_apparaat)
    return antwoord if antwoord.get("token") else None


def apparaat_vergeten(token: str) -> None:
    if online() and token.startswith("apparaat."):
        try:
            _rpc("apparaat_vergeten", p_token=token)
        except Exception:
            pass


def mijn_apparaten() -> list[dict]:
    return _rpc_ik("mijn_apparaten")["apparaten"] if online() else []


def apparaat_intrekken(apparaat_id: int | None = None) -> None:
    """Eén bewaard apparaat vergeten, of alle (zonder id)."""
    _rpc_ik("apparaat_intrekken", p_id=apparaat_id)


def overal_uitloggen() -> None:
    _rpc_ik("overal_uitloggen")


def twee_stap_starten() -> dict:
    return _rpc_ik("twee_stap_starten")


def twee_stap_bevestigen(code: str) -> dict:
    return _rpc_ik("twee_stap_bevestigen", p_code=code)


def twee_stap_uitzetten(wachtwoord: str, code: str) -> dict:
    return _rpc_ik("twee_stap_uitzetten", p_huidig_wachtwoord=wachtwoord, p_code=code)


# --- Account ---------------------------------------------------------------

def account_maken(naam: str, weergavenaam: str, email: str, wachtwoord: str, akkoord: bool) -> str | None:
    """Maakt een nieuw account. Geeft een foutmelding terug, of None als het gelukt is."""
    if not online():
        return "Accounts maken kan alleen in de online versie."
    antwoord = _rpc("account_maken", p_naam=naam, p_weergavenaam=weergavenaam, p_email=email, p_wachtwoord=wachtwoord,
                    p_akkoord=akkoord)
    return antwoord.get("fout")


def email_instellen(email: str) -> str | None:
    """Slaat het mailadres op. Geeft een foutmelding, of None."""
    if not online():
        return "Kan alleen in de online versie."
    return _rpc_ik("email_instellen", p_email=email).get("fout")


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


GEHEIM = {"anthropic_sleutel", "agenda_feed_token", "strava_client_secret", "strava_tokens", "ticketmaster_sleutel", "elevenlabs_sleutel"}


def export() -> str:
    """Al je eigen gegevens als JSON, zonder wachtwoorden en sleutels."""
    g = laden()
    inst = {k: v for k, v in g.get("instellingen", {}).items() if k not in GEHEIM}
    if "mail" in inst:
        inst["mail"] = {k: v for k, v in inst["mail"].items() if k != "wachtwoord"}
    if "agendas" in inst:
        inst["agendas"] = [{k: v for k, v in a.items() if k not in ("wachtwoord", "url")} for a in inst["agendas"]]
    return json.dumps({**g, "instellingen": inst}, ensure_ascii=False, indent=2)


def _nieuw_id(gegevens: dict) -> int:
    nieuw = gegevens["volgend_id"]
    gegevens["volgend_id"] += 1
    return nieuw


# --- Taken ---------------------------------------------------------------

TAAK_VELDEN = {"titel", "deadline", "minuten", "prioriteit", "notitie", "bron"}


def taak_toevoegen(titel: str, deadline: str | None = None, minuten: int | None = None, prioriteit: str = "",
                   notitie: str = "", bron: dict | None = None) -> dict:
    """Nieuwe taak. Minuten: hoe lang hij ongeveer duurt (voor het slim inplannen). Prioriteit: "hoog" of leeg.
    Bron: waar de taak vandaan komt, bijvoorbeeld {"soort": "mail", "uid": ..., "van": ..., "onderwerp": ...}."""
    with _slot:
        g = laden()
        taak = {"id": _nieuw_id(g), "titel": titel, "deadline": deadline, "klaar": False}
        if minuten:
            taak["minuten"] = int(minuten)
        if prioriteit == "hoog":
            taak["prioriteit"] = "hoog"
        if notitie:
            taak["notitie"] = notitie
        if bron:
            taak["bron"] = bron
        g["taken"].append(taak)
        opslaan(g)
    return taak


def taak_bijwerken(taak_id: int, **velden) -> dict | None:
    with _slot:
        g = laden()
        for taak in g["taken"]:
            if taak["id"] == taak_id:
                for k, v in velden.items():
                    if k not in TAAK_VELDEN:
                        continue
                    if v in (None, "", 0) and k != "titel":
                        taak.pop(k, None)
                    else:
                        taak[k] = v
                opslaan(g)
                return taak
    return None


def taak_verwijderen(taak_id: int) -> bool:
    with _slot:
        g = laden()
        voor = len(g["taken"])
        g["taken"] = [t for t in g["taken"] if t["id"] != taak_id]
        opslaan(g)
        return len(g["taken"]) < voor


def taak_afronden(taak_id: int) -> dict | None:
    with _slot:
        g = laden()
        for taak in g["taken"]:
            if taak["id"] == taak_id:
                taak["klaar"] = True
                # Ingeplande blokken voor deze taak die nog moeten komen, zijn niet meer nodig.
                nu = datetime.now().isoformat(timespec="minutes")
                g["afspraken"] = [a for a in g["afspraken"] if a.get("taak_id") != taak_id or a["start"] < nu]
                opslaan(g)
                return taak
    return None


def open_taken() -> list[dict]:
    """Open taken: vroegste deadline eerst, bij gelijke deadline de belangrijke eerst."""
    taken = [t for t in laden()["taken"] if not t["klaar"]]
    return sorted(taken, key=lambda t: (t["deadline"] or "9999", t.get("prioriteit") != "hoog"))


def mail_gezien() -> list[str]:
    """Mails (uid) die al op taken zijn nagekeken, zodat de assistent ze niet nog eens voorstelt."""
    return laden().get("mail_gezien", [])


def mail_gezien_bewaren(uids: list[str]) -> None:
    with _slot:
        g = laden()
        g["mail_gezien"] = list(dict.fromkeys(g.get("mail_gezien", []) + [str(u) for u in uids]))[-1000:]
        opslaan(g)


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
    taak_id: int | None = None,
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
        if taak_id:
            afspraak["taak_id"] = taak_id
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


def afspraken_tussen(van: str, tot: str, extern: bool = True) -> list[dict]:
    """Afspraken waarvan de start tussen twee datums (JJJJ-MM-DD, inclusief) valt.

    Met extern=True ook de afspraken uit je gekoppelde agenda's (Apple, Google, Outlook): die zijn alleen
    te lezen en hebben een tekst-id dat met "ext:" begint.
    """
    g = laden()
    resultaat = [a for a in g["afspraken"] if van <= a["start"][:10] <= tot]
    if extern:
        resultaat += [u for u in uitnodigingen() if van <= u["start"][:10] <= tot and u["uitnodiging"]["antwoord"] != "nee"]
    if extern and g.get("instellingen", {}).get("gezin"):
        try:
            import gezin
            resultaat += [a for a in gezin.mijn_afspraken() if van <= a["start"][:10] <= tot]
        except GeenToegang:
            raise
        except Exception:
            pass
    if extern:
        try:
            import feestdagen
            resultaat += feestdagen.items(van, tot)
        except Exception:
            pass
    if extern and g.get("instellingen", {}).get("agendas"):
        try:
            import agendas
            eigen = {(a["titel"].lower(), a["start"][:16]) for a in resultaat}
            tijden = g.get("extern_tijden", {})
            for a in agendas.afspraken(van, tot):
                if (a["titel"].lower(), a["start"][:16]) not in eigen:
                    resultaat.append({**a, "tijden": tijden[a["id"]]} if a["id"] in tijden else a)
        except Exception:
            pass  # een agenda die even niet bereikbaar is mag de app niet stilleggen
    return sorted(resultaat, key=lambda a: a["start"])


_uitnodigingen: dict[str, tuple[float, list[dict]]] = {}


def uitnodigingen(vers: bool = False) -> list[dict]:
    """Afspraken van anderen waarvoor je bent uitgenodigd, als (alleen te lezen) afspraken met id "ext:uit:<id>".
    Een minuut onthouden; vers=True haalt ze opnieuw op."""
    if not online() or not _wachtwoord.get():
        return []
    sleutel = hashlib.sha256(f"{_naam.get()}|{_wachtwoord.get()}".encode()).hexdigest()
    bewaard = _uitnodigingen.get(sleutel)
    if bewaard and not vers and time.time() - bewaard[0] < 60:
        return bewaard[1]
    try:
        lijst = _rpc_ik("mijn_uitnodigingen", p_van=(date.today() - timedelta(days=60)).isoformat(),
                        p_tot=(date.today() + timedelta(days=730)).isoformat())["uitnodigingen"]
    except GeenToegang:
        raise
    except Exception:
        return bewaard[1] if bewaard else []
    tijden = laden().get("extern_tijden", {})
    afspraken = []
    for u in lijst:
        a = {"id": f"ext:uit:{u['id']}", "titel": u["titel"], "start": u["start"], "einde": u["einde"],
             "locatie": u["locatie"], "soort": u["soort"], "notitie": "", "extern": True,
             "bron": f"uitnodiging van {u['van']}", "uitnodiging": u}
        afspraken.append({**a, "tijden": tijden[a["id"]]} if a["id"] in tijden else a)
    _uitnodigingen[sleutel] = (time.time(), afspraken)
    return afspraken


def tijd_vastleggen(afspraak_id: int | str, moment: str, tijdstip: str | None = None) -> dict | None:
    """Legt een moment vast (vertrokken, aangekomen, weg of terug), standaard nu."""
    tijdstip = tijdstip or datetime.now().isoformat(timespec="minutes")
    if isinstance(afspraak_id, str) and afspraak_id.startswith("ext:"):
        # Afspraak uit een gekoppelde agenda: de tijden bewaren we apart, de agenda zelf blijft onaangeroerd.
        with _slot:
            g = laden()
            g.setdefault("extern_tijden", {}).setdefault(afspraak_id, {})[moment] = tijdstip
            opslaan(g)
        return next((a for a in afspraken_tussen("0000", "9999") if a["id"] == afspraak_id), None)
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


# --- Herhalende afspraken -------------------------------------------------
# Een reeks (g["reeksen"]) beschrijft hoe vaak iets terugkomt. De afspraken zelf staan als gewone afspraken in de
# agenda (met "reeks": id), steeds tot een eindje vooruit; reeksen_aanvullen() vult ze later aan. Zo werkt alles wat
# met afspraken kan (wijzigen, reistijd, delen, reageren) ook voor elke keer apart.

HERHAAL = {"dag": "Elke dag", "werkdag": "Elke werkdag", "week": "Elke week", "twee_weken": "Om de week",
           "maand": "Elke maand", "jaar": "Elk jaar"}
_VOORUIT = {"dag": 60, "werkdag": 60, "week": 365, "twee_weken": 365, "maand": 730, "jaar": 1830}


def _volgende_datums(reeks: dict, na: date, tot: date) -> list[date]:
    """De datums van een reeks na `na` tot en met `tot` (en niet na de einddatum van de reeks)."""
    eerste = date.fromisoformat(reeks["eerste"])
    if reeks.get("tot"):
        tot = min(tot, date.fromisoformat(reeks["tot"]))
    elke, uit = reeks["elke"], []
    if elke in ("dag", "werkdag", "week", "twee_weken"):
        stap = {"dag": 1, "werkdag": 1, "week": 7, "twee_weken": 14}[elke]
        d = eerste + timedelta(days=max(0, -(-((na - eerste).days + 1) // stap)) * stap)
        while d <= tot:
            if d > na and (elke != "werkdag" or d.weekday() < 5):
                uit.append(d)
            d += timedelta(days=stap)
        return uit
    import calendar
    n = 1
    while True:
        jaar, maand = (eerste.year + n, eerste.month) if elke == "jaar" else \
            (eerste.year + (eerste.month - 1 + n) // 12, (eerste.month - 1 + n) % 12 + 1)
        d = date(jaar, maand, min(eerste.day, calendar.monthrange(jaar, maand)[1]))
        if d > tot:
            return uit
        if d > na:
            uit.append(d)
        n += 1


def _reeks_maken(g: dict, reeks: dict, tot: date) -> int:
    """Zet de afspraken van een reeks in de agenda tot en met `tot`. Geeft het aantal nieuwe."""
    s = reeks["sjabloon"]
    aantal = 0
    for d in _volgende_datums(reeks, date.fromisoformat(reeks["gemaakt_tot"]), tot):
        start = f"{d.isoformat()}T{s['tijd']}" if s.get("tijd") else d.isoformat()
        einde = None
        if s.get("duur") is not None and s.get("tijd"):
            einde = (datetime.fromisoformat(start) + timedelta(minutes=s["duur"])).isoformat(timespec="minutes")
        g["afspraken"].append({"id": _nieuw_id(g), **{k: v for k, v in s.items() if k not in ("tijd", "duur")},
                               "start": start, "einde": einde, "reeks": reeks["id"]})
        aantal += 1
    reeks["gemaakt_tot"] = max(reeks["gemaakt_tot"], tot.isoformat())
    return aantal


_SJABLOON_VELDEN = ("titel", "notitie", "locatie", "contact_id", "soort", "sport", "prive")


def _sjabloon(afspraak: dict) -> dict:
    s = {k: afspraak[k] for k in _SJABLOON_VELDEN if k in afspraak}
    if "T" in afspraak["start"]:
        s["tijd"] = afspraak["start"][11:16]
        if afspraak.get("einde") and "T" in afspraak["einde"]:
            s["duur"] = int((datetime.fromisoformat(afspraak["einde"])
                             - datetime.fromisoformat(afspraak["start"])).total_seconds() // 60)
    return s


def afspraak_herhalen(afspraak_id: int, elke: str, tot: str | None = None) -> dict | None:
    """Laat een afspraak terugkomen (elke dag, werkdag, week, twee_weken, maand of jaar), eventueel tot een datum."""
    if elke not in HERHAAL:
        raise ValueError(f"Kies uit: {', '.join(HERHAAL)}")
    with _slot:
        g = laden()
        a = next((a for a in g["afspraken"] if a["id"] == afspraak_id), None)
        if not a:
            return None
        if a.get("reeks"):  # al een reeks: eerst de volgende keren weghalen, dan opnieuw
            _reeks_afkappen(g, a["reeks"], a["start"][:10], ook_deze=False)
        reeks = {"id": _nieuw_id(g), "elke": elke, "tot": tot or None, "eerste": a["start"][:10],
                 "gemaakt_tot": a["start"][:10], "sjabloon": _sjabloon(a)}
        a["reeks"] = reeks["id"]
        g.setdefault("reeksen", []).append(reeks)
        _reeks_maken(g, reeks, date.today() + timedelta(days=_VOORUIT[elke]))
        opslaan(g)
        return reeks


def reeks(reeks_id: int | None) -> dict | None:
    return next((r for r in laden().get("reeksen", []) if r["id"] == reeks_id), None) if reeks_id else None


def _reeks_afkappen(g: dict, reeks_id: int, vanaf: str, ook_deze: bool = True) -> None:
    """Haalt de afspraken van een reeks vanaf een datum weg en laat de reeks daar eindigen."""
    g["afspraken"] = [a for a in g["afspraken"] if a.get("reeks") != reeks_id
                      or (a["start"][:10] < vanaf if ook_deze else a["start"][:10] <= vanaf)]
    for r in g.get("reeksen", []):
        if r["id"] == reeks_id:
            laatste = date.fromisoformat(vanaf) - timedelta(days=1) if ook_deze else date.fromisoformat(vanaf)
            r["tot"] = min(r["tot"] or "9999", laatste.isoformat())
            r["gemaakt_tot"] = min(r["gemaakt_tot"], r["tot"])


def reeks_stoppen(reeks_id: int, vanaf: str) -> int:
    """Deze en alle volgende keren weghalen. Geeft hoeveel afspraken er weg zijn."""
    with _slot:
        g = laden()
        voor = len(g["afspraken"])
        _reeks_afkappen(g, reeks_id, vanaf[:10])
        opslaan(g)
        return voor - len(g["afspraken"])


def reeks_bijwerken(afspraak_id: int, **velden) -> int:
    """Wijzigt deze en alle volgende keren van een reeks (titel, plek, tijd enz.). Geeft het aantal gewijzigde."""
    with _slot:
        g = laden()
        a = next((a for a in g["afspraken"] if a["id"] == afspraak_id), None)
        if not a or not a.get("reeks"):
            return 0
        vanaf = a["start"][:10]
        nieuw = {**a, **velden}
        verschuif = timedelta(0)
        if "T" in a["start"] and "T" in nieuw["start"]:  # alleen de kloktijd verschuift mee, niet de datum
            verschuif = (datetime.fromisoformat(f"{vanaf}T{nieuw['start'][11:16]}")
                         - datetime.fromisoformat(a["start"]))
        aantal = 0
        for b in g["afspraken"]:
            if b.get("reeks") == a["reeks"] and b["start"][:10] >= vanaf:
                for k in _SJABLOON_VELDEN:
                    if k in velden:
                        b[k] = velden[k]
                if "T" in b["start"]:
                    b["start"] = (datetime.fromisoformat(b["start"]) + verschuif).isoformat(timespec="minutes")
                    s = _sjabloon(nieuw)
                    b["einde"] = ((datetime.fromisoformat(b["start"]) + timedelta(minutes=s["duur"]))
                                  .isoformat(timespec="minutes") if s.get("duur") is not None else None)
                aantal += 1
        for r in g.get("reeksen", []):
            if r["id"] == a["reeks"]:
                r["sjabloon"] = _sjabloon(nieuw)
        opslaan(g)
        return aantal


def reeksen_aanvullen() -> int:
    """Vult reeksen aan zodat ze steeds een eindje vooruit in de agenda staan. Doet niets als dat al zo is."""
    vandaag = date.today()
    nodig = [r for r in laden().get("reeksen", [])
             if r["gemaakt_tot"] < (vandaag + timedelta(days=_VOORUIT[r["elke"]] - 7)).isoformat()
             and (not r.get("tot") or r["gemaakt_tot"] < r["tot"])]
    if not nodig:
        return 0
    with _slot:
        g = laden()
        aantal = sum(_reeks_maken(g, r, vandaag + timedelta(days=_VOORUIT[r["elke"]]))
                     for r in g.get("reeksen", []) if r["id"] in {n["id"] for n in nodig})
        opslaan(g)
        return aantal


def herhaal_tekst(reeks_of_id) -> str:
    """'Elke week tot 1 juni' en dergelijke; leeg als het geen reeks is."""
    r = reeks_of_id if isinstance(reeks_of_id, dict) else reeks(reeks_of_id)
    if not r:
        return ""
    tekst = HERHAAL[r["elke"]]
    if r["elke"] == "week" or r["elke"] == "twee_weken":
        tekst += " op " + ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag",
                           "zondag"][date.fromisoformat(r["eerste"]).weekday()]
    if r.get("tot"):
        t = date.fromisoformat(r["tot"])
        tekst += f" tot {t.day}-{t.month}-{t.year}"
    return tekst


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


# --- Kooplijst, wenslijst, notities en DIY-projecten ----------------------
# Kooplijst en wenslijst: dingen die je wilt kopen (geen supermarkt), met prijs, winkel en link.

LIJSTEN = ("kooplijst", "wenslijst", "notities", "diy")


def lijst(naam: str) -> list[dict]:
    assert naam in LIJSTEN
    return laden().get(naam, [])


def lijst_toevoegen(naam: str, **velden) -> dict:
    assert naam in LIJSTEN
    with _slot:
        g = laden()
        item = {"id": _nieuw_id(g), "toegevoegd": date.today().isoformat(), **velden}
        g.setdefault(naam, []).append(item)
        opslaan(g)
    return item


def lijst_bijwerken(naam: str, item_id: int, **velden) -> dict | None:
    assert naam in LIJSTEN
    with _slot:
        g = laden()
        for item in g.get(naam, []):
            if item["id"] == item_id:
                item.update(velden)
                opslaan(g)
                return item
    return None


def lijst_weg(naam: str, item_id: int) -> dict | None:
    """Haalt een item van een lijst en geeft het terug (handig om het naar een andere lijst te verplaatsen)."""
    assert naam in LIJSTEN
    with _slot:
        g = laden()
        weg = next((i for i in g.get(naam, []) if i["id"] == item_id), None)
        if weg:
            g[naam] = [i for i in g[naam] if i["id"] != item_id]
            opslaan(g)
    return weg


def verplaatsen(van: str, naar: str, item_id: int) -> None:
    if item := lijst_weg(van, item_id):
        lijst_toevoegen(naar, **{k: v for k, v in item.items() if k not in ("id", "toegevoegd")})


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
                    _leerpunten(g, 1)
                    opslaan(g)
                    return stap
    return None


def toets_vastleggen(leerdoel_id: int, soort: str, goed: int, totaal: int) -> None:
    """Bewaart de uitslag van een oefentoets of flitskaarten, om de voortgang te laten zien."""
    with _slot:
        g = laden()
        for doel in g["leerdoelen"]:
            if doel["id"] == leerdoel_id:
                doel.setdefault("toetsen", []).append(
                    {"datum": date.today().isoformat(), "soort": soort, "goed": goed, "totaal": totaal})
                doel["toetsen"] = doel["toetsen"][-20:]
                _leerpunten(g, totaal)
                opslaan(g)


# --- Leerreeks: elke dag een beetje (dagdoel en reeks) -------------------------

STANDAARD_DAGDOEL = 5


def _leerpunten(g: dict, punten: int) -> None:
    """Telt wat er vandaag geoefend is: een vraag, kaart of herhaling is één punt."""
    dagen = g.setdefault("leerdagen", {})
    vandaag = date.today().isoformat()
    dagen[vandaag] = dagen.get(vandaag, 0) + max(0, punten)
    for oud in sorted(dagen)[:-400]:
        del dagen[oud]


def leerreeks() -> dict:
    """Hoeveel dagen op rij het dagdoel gehaald is, en hoe het vandaag en deze week gaat."""
    g = laden()
    dagen = g.get("leerdagen", {})
    doel = int(g.get("instellingen", {}).get("dagdoel") or STANDAARD_DAGDOEL)
    vandaag = date.today()
    gehaald = lambda d: dagen.get(d.isoformat(), 0) >= doel  # noqa: E731
    # Vandaag nog niet gehaald breekt de reeks niet: dan telt vanaf gisteren.
    dag, reeks = (vandaag if gehaald(vandaag) else vandaag - timedelta(days=1)), 0
    while gehaald(dag):
        reeks += 1
        dag -= timedelta(days=1)
    return {"reeks": reeks, "dagdoel": doel, "vandaag": dagen.get(vandaag.isoformat(), 0),
            "vandaag_gehaald": gehaald(vandaag),
            "week": [gehaald(vandaag - timedelta(days=i)) for i in range(6, -1, -1)],
            "beste": _beste_reeks(dagen, doel)}


def _beste_reeks(dagen: dict, doel: int) -> int:
    beste = huidige = 0
    vorige = None
    for d in sorted(k for k, v in dagen.items() if v >= doel):
        dag = date.fromisoformat(d)
        huidige = huidige + 1 if vorige and dag - vorige == timedelta(days=1) else 1
        beste, vorige = max(beste, huidige), dag
    return beste


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


# --- Feedback: wat de gebruiker van de antwoorden vond -----------------------------

def feedback() -> list[dict]:
    return laden().get("feedback", [])


def feedback_geven(goed: bool, vraag: str, antwoord: str, opmerking: str = "", antwoord_id: str = "") -> dict:
    """Bewaart 👍 of 👎 (met een eventuele opmerking) bij een antwoord. Opnieuw geven vervangt het oude oordeel."""
    with _slot:
        g = laden()
        lijst = [f for f in g.get("feedback", []) if not antwoord_id or f.get("antwoord_id") != antwoord_id]
        item = {"id": _nieuw_id(g), "goed": goed, "vraag": vraag.strip()[:200], "antwoord": antwoord.strip()[:300],
                "opmerking": opmerking.strip()[:300], "antwoord_id": antwoord_id,
                "datum": datetime.now().date().isoformat()}
        g["feedback"] = (lijst + [item])[-100:]
        opslaan(g)
    return item


def feedback_vergeten(feedback_id: int) -> None:
    with _slot:
        g = laden()
        g["feedback"] = [f for f in g.get("feedback", []) if f["id"] != feedback_id]
        opslaan(g)


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

# --- Namens de gebruiker -----------------------------------------------------
# Hoe zelfstandig de assistent mag reageren (instellingen.namens) en een logboek van wat hij namens je stuurde.

NAMENS = {"vragen": "✋ Eerst aan mij vragen", "bekenden": "👥 Zelf reageren aan mijn contacten, de rest eerst vragen",
          "zelf": "🤖 Zelf reageren, ik lees het overzicht"}
NAMENS_PER_DAG = 25


def namens(kanaal: str) -> str:
    """'vragen', 'bekenden' of 'zelf' voor kanaal 'mail' of 'berichten'."""
    keuze = instellingen().get("namens", {}).get(kanaal, "vragen")
    return keuze if keuze in NAMENS else "vragen"


def namens_instellen(kanaal: str, keuze: str) -> None:
    assert keuze in NAMENS and kanaal in ("mail", "berichten")
    instellingen_bijwerken(namens=instellingen().get("namens", {}) | {kanaal: keuze})


def namens_log() -> list[dict]:
    return laden().get("namens_log", [])


def namens_vandaag() -> int:
    vandaag = date.today().isoformat()
    return sum(1 for r in namens_log() if r["moment"].startswith(vandaag))


def namens_vastleggen(kanaal: str, aan: str, onderwerp: str, tekst: str) -> None:
    with _slot:
        g = laden()
        log = g.setdefault("namens_log", [])
        log.append({"moment": datetime.now().isoformat(timespec="minutes"), "kanaal": kanaal, "aan": aan,
                    "onderwerp": onderwerp, "tekst": tekst})
        g["namens_log"] = log[-200:]
        opslaan(g)


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
