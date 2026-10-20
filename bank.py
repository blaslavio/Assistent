"""Bankkoppeling: af- en bijschrijvingen komen vanzelf in je budget, via Enable Banking (PSD2, alleen lezen).

Je logt één keer in bij je eigen bank en geeft toestemming om mee te lezen. Daarna haalt de app (zolang hij open is)
hooguit elke zes uur nieuwe regels op. Geld overmaken kan via deze koppeling niet. De bank vraagt na een tijd
(meestal 90 of 180 dagen) opnieuw om toestemming.

De sleutel van Enable Banking zit alleen in de Edge Function `bank`; deze module praat met die functie.
"""

import contextvars
import hashlib
import os
import threading
import time
from datetime import date, datetime, timedelta

import httpx

import budget
import opslag

ELKE_SECONDEN = 6 * 3600

_bezig: dict[str, float] = {}
_slot = threading.Lock()


class Fout(Exception):
    """Iets ging mis; de tekst is geschikt om aan de gebruiker te tonen."""


def _functie(actie: str, **velden) -> dict:
    url = os.environ.get("SUPABASE_URL", opslag.SUPABASE_URL).rstrip("/")
    sleutel = os.environ.get("SUPABASE_KEY", opslag.SUPABASE_PUBLISHABLE_KEY)
    try:
        r = httpx.post(f"{url}/functions/v1/bank", headers={"apikey": sleutel}, timeout=60,
                       json={"actie": actie, "naam": opslag._naam.get(), "wachtwoord": opslag._wachtwoord.get(),
                             **velden})
        antwoord = r.json()
    except (httpx.HTTPError, ValueError):
        raise Fout("De bankkoppeling is even niet bereikbaar. Probeer het later opnieuw.")
    if antwoord.get("fout"):
        raise Fout(antwoord["fout"])
    return antwoord


def status() -> dict:
    """{aan, koppelingen: [{id, bank, status, rekeningen, geldig_tot, laatst_opgehaald, fout}]}."""
    if not opslag.online():
        return {"aan": False, "koppelingen": []}
    try:
        return opslag._rpc_ik("bank_status")
    except Exception:
        return {"aan": False, "koppelingen": []}


def instellen(app_id: str, sleutel: str, app_adres: str = "") -> None:
    """Alleen de eigenaar: het application ID en de .pem-sleutel van Enable Banking, en (als die er nog niet is)
    het adres van de app, waar de bank je na het inloggen naar terugstuurt."""
    antwoord = opslag._rpc_ik("bank_platform_instellen", p_app_id=app_id.strip(), p_sleutel=sleutel.strip())
    if antwoord.get("fout") or antwoord.get("geen_toegang"):
        raise Fout(antwoord.get("fout") or "Alleen de eigenaar kan dit instellen.")
    if app_adres.startswith("https://"):
        opslag._rpc_ik("platform_instellen", p_stripe_sleutel="", p_webhook_geheim="", p_app_adres=app_adres)


_banken: dict[str, tuple[float, list[dict]]] = {}


def banken(land: str = "NL") -> list[dict]:
    """De banken die je kunt koppelen (een dag onthouden)."""
    bewaard = _banken.get(land)
    if bewaard and time.time() - bewaard[0] < 86400:
        return bewaard[1]
    lijst = sorted(_functie("banken", land=land)["banken"], key=lambda b: b["naam"].lower())
    _banken[land] = (time.time(), lijst)
    return lijst


def koppelen(bank: str, land: str = "NL") -> str:
    """Geeft de link naar je bank. Na inloggen kom je terug in de app met ?code=...&state=..."""
    return _functie("koppelen", bank=bank, land=land, dagen=180)["url"]


def afmaken(code: str, staat: str) -> dict:
    """Na terugkeer van de bank: koppeling vastleggen en meteen de eerste regels ophalen."""
    k = _functie("afmaken", code=code, staat=staat)
    k["opgehaald"] = ophalen(k["id"])
    return k


def _sleutel(r: dict) -> str:
    basis = r["referentie"] or f"{r['datum']}|{r['bedrag']}|{r['tegenpartij']}|{r['omschrijving']}"
    return "bank:" + hashlib.sha1(f"{r['rekening']}|{basis}".encode()).hexdigest()[:32]


def _al_ingelezen(r: dict, bestaand: list[dict]) -> bool:
    """Staat deze regel er al via een ingelezen afschrift? Dan niet nog eens."""
    naam = r["tegenpartij"].lower()[:12]
    return any(b["datum"] == r["datum"] and abs(b["bedrag"] - r["bedrag"]) < 0.005 and b.get("bron") == "import"
               and (not naam or naam in (b["tegenpartij"] or b["omschrijving"]).lower()) for b in bestaand)


def ophalen(koppeling_id: int, vanaf: str | None = None) -> dict:
    """Nieuwe regels ophalen en in je budget zetten. Geeft {nieuw, facturen_betaald}."""
    if not vanaf:
        k = next((k for k in status()["koppelingen"] if k["id"] == koppeling_id), {})
        laatst = (k.get("laatst_opgehaald") or "")[:10]
        vanaf = ((date.fromisoformat(laatst) - timedelta(days=5)).isoformat() if laatst
                 else (date.today() - timedelta(days=90)).isoformat())
    antwoord = _functie("ophalen", koppeling=koppeling_id, vanaf=vanaf)
    bestaand = budget.lijst(vanaf, date.today().isoformat())
    eigen = budget.instellingen()["regels"]
    regels = []
    for r in antwoord["regels"]:
        if not r.get("datum") or r.get("valuta", "EUR") != "EUR" or _al_ingelezen(r, bestaand):
            continue
        regels.append({"datum": r["datum"][:10], "bedrag": r["bedrag"], "omschrijving": r["omschrijving"],
                       "tegenpartij": r["tegenpartij"], "rekening": r["rekening"], "bron": "bank",
                       "categorie": budget.categorie_raden(r["tegenpartij"], r["omschrijving"], r["bedrag"], eigen),
                       "sleutel": _sleutel(r)})
    nieuw = 0
    for begin in range(0, len(regels), 1000):
        nieuw += opslag._rpc_ik("transacties_toevoegen", p_regels=regels[begin:begin + 1000]).get("nieuw", 0)
    budget._cache.clear()
    if antwoord.get("saldi"):
        budget.saldo_instellen(sum(s["bedrag"] for s in antwoord["saldi"]))
    elif not budget.instellingen()["gebruikt"]:
        budget._bewaar()
    return {"nieuw": nieuw, "facturen_betaald": budget.afstemmen()}


def ontkoppelen(koppeling_id: int) -> None:
    _functie("ontkoppelen", koppeling=koppeling_id)


def vanzelf() -> None:
    """Op de achtergrond nieuwe regels ophalen als dat langer dan zes uur geleden is. Wacht nergens op."""
    if not opslag.online():
        return
    gebruiker = hashlib.sha256(f"{opslag._naam.get()}|{opslag._wachtwoord.get()}".encode()).hexdigest()
    with _slot:
        if time.time() - _bezig.get(gebruiker, 0) < 600:  # niet elke paar seconden de database vragen
            return
        _bezig[gebruiker] = time.time()

    def werk() -> None:
        try:
            nu = datetime.now().astimezone()
            for k in status()["koppelingen"]:
                laatst = k.get("laatst_opgehaald")
                if k["status"] != "actief" or (laatst and (nu - datetime.fromisoformat(laatst)).total_seconds()
                                               < ELKE_SECONDEN):
                    continue
                try:
                    ophalen(k["id"])
                except Fout:
                    pass
        except Exception:
            pass

    threading.Thread(target=contextvars.copy_context().run, args=(werk,), daemon=True).start()
