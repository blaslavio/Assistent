"""Opslag en de assistent zonder eigen sleutel.

Alle tools zijn gratis. Iedereen krijgt gratis opslag; alleen extra opslag is een abonnement per maand (via Stripe,
Edge Function `betalen`). Wie geen eigen Anthropic-sleutel heeft, gebruikt de assistent via de Edge Function `ai`
met de sleutel van het platform (tot een maandgrens per persoon). Wat iemand heeft, bepaalt de database
(sql/bestanden.sql); deze module vraagt het alleen op.
"""

import base64
import json
import os
import threading
import time

import anthropic
import httpx

import opslag

_cache: dict[tuple, tuple[float, dict]] = {}
_slot = threading.Lock()


class Fout(Exception):
    """Iets ging mis; de tekst is geschikt om aan de gebruiker te tonen."""


def _basis() -> str:
    return os.environ.get("SUPABASE_URL", opslag.SUPABASE_URL).rstrip("/")


def _publiek() -> str:
    return os.environ.get("SUPABASE_KEY", opslag.SUPABASE_PUBLISHABLE_KEY)


def _functie(naam: str, actie: str, **velden) -> dict:
    try:
        r = httpx.post(f"{_basis()}/functions/v1/{naam}", headers={"apikey": _publiek()}, timeout=60,
                       json={"actie": actie, "naam": opslag._naam.get(), "wachtwoord": opslag._wachtwoord.get(),
                             **velden})
        antwoord = r.json()
    except (httpx.HTTPError, ValueError):
        raise Fout("Even niet bereikbaar. Probeer het zo opnieuw.")
    if antwoord.get("fout"):
        raise Fout(antwoord["fout"])
    return antwoord


def status(vers: bool = False) -> dict:
    """{opslag, gebruikt, gratis_gb, plannen, abonnementen, aanbod, betalen_aan, ai_platform, ai_euro, ...}.
    Een halve minuut bewaard per gebruiker."""
    leeg = {"opslag": 2_000_000_000, "gebruikt": 0, "ai_platform": False, "plannen": [], "abonnementen": [],
            "aanbod": {}, "betalen_aan": False}
    if not opslag.online():
        return leeg
    sleutel = (opslag._naam.get(), opslag._wachtwoord.get())
    with _slot:
        tijd, bewaard = _cache.get(sleutel, (0, None))
    if bewaard is not None and not vers and time.time() - tijd < 30:
        return bewaard
    try:
        nieuw = opslag._rpc_ik("toegang_status") or leeg
    except opslag.GeenToegang:
        raise
    except Exception:
        return bewaard or leeg
    with _slot:
        _cache[sleutel] = (time.time(), nieuw)
    return nieuw


def vergeten() -> None:
    with _slot:
        _cache.pop((opslag._naam.get(), opslag._wachtwoord.get()), None)


# --- De assistent ---------------------------------------------------------------------------

def sleutel() -> str:
    """Je eigen Anthropic-sleutel, of (zonder) de toegang via het platform. Leeg = de assistent staat nog uit."""
    if eigen := opslag.instellingen().get("anthropic_sleutel", ""):
        return eigen
    if not status().get("ai_platform"):
        return ""
    gegevens = json.dumps([opslag._naam.get(), opslag._wachtwoord.get()]).encode()
    return "abo." + base64.urlsafe_b64encode(gegevens).decode()


def via_platform(api_sleutel: str) -> bool:
    return api_sleutel.startswith("abo.")


def claude(api_sleutel: str) -> anthropic.Anthropic:
    """De Claude-client: rechtstreeks met je eigen sleutel, of via het platform (met maandgrens)."""
    if not via_platform(api_sleutel):
        return anthropic.Anthropic(api_key=api_sleutel)
    return anthropic.Anthropic(api_key=api_sleutel, base_url=f"{_basis()}/functions/v1/ai",
                               default_headers={"apikey": _publiek()})


# --- Extra opslag ----------------------------------------------------------------------------

def afsluiten(plan: str) -> dict:
    """Naar Stripe om af te rekenen ({url}), of meteen gewisseld ({gewijzigd: True}) als je al een abonnement hebt."""
    antwoord = _functie("betalen", "abonnement_afsluiten", plan=plan)
    vergeten()
    return antwoord


def bijwerken() -> None:
    """De stand bij Stripe ophalen (na het afrekenen)."""
    _functie("betalen", "abonnement_bijwerken")
    vergeten()


def opzeggen(terug: bool = False) -> None:
    """Opzeggen per het eind van de betaalde maand (terug=True: toch doorgaan)."""
    _functie("betalen", "abonnement_opzeggen", terug=terug)
    vergeten()


def beheren() -> str:
    """Link naar Stripe voor betaalgegevens en facturen."""
    return _functie("betalen", "abonnement_beheren")["url"]


def stoppen() -> None:
    """Meteen stoppen (bij het verwijderen van je account)."""
    _functie("betalen", "abonnement_stoppen")


# --- Voor de eigenaar ------------------------------------------------------------------------

def instellen(anthropic_sleutel: str = "", ai_gratis_euro: float | None = None,
              gratis_gb: float | None = None) -> None:
    """Alleen de eigenaar: de sleutel voor de gratis assistent, de maandgrens en de opslag per persoon."""
    antwoord = opslag._rpc_ik("toegang_instellen", p_anthropic_sleutel=anthropic_sleutel.strip(),
                              p_ai_gratis_euro=ai_gratis_euro, p_gratis_gb=gratis_gb)
    if antwoord.get("fout"):
        raise Fout(antwoord["fout"])
    vergeten()


def leesbaar(aantal_bytes: float) -> str:
    """1234567 → '1,2 MB'. Met 1000 per stap, zoals op telefoons."""
    for eenheid in ("bytes", "kB", "MB", "GB"):
        if aantal_bytes < 1000:
            tekst = f"{aantal_bytes:.0f}" if eenheid == "bytes" or aantal_bytes >= 100 else f"{aantal_bytes:.1f}"
            return f"{tekst.replace('.', ',')} {eenheid}"
        aantal_bytes /= 1000
    return f"{aantal_bytes:.1f} TB".replace(".", ",")


def euro(bedrag: float) -> str:
    return f"€{bedrag:.2f}".replace(".", ",")
