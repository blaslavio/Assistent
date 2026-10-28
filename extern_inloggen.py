"""Inloggen met Google, Apple of Microsoft Entra ID via Supabase Auth (PKCE), zie sql/extern_inloggen.sql.

De knoppen verschijnen vanzelf zodra de beheerder een aanbieder aanzet in Supabase (Authentication › Providers).
Stap 1: start() geeft de link naar de aanbieder, met een geheime 'verifier' die alleen deze server kent.
Stap 2: de aanbieder stuurt je terug naar ?extern=<staat>&code=...; afronden() wisselt de code in en logt in.
"""

import base64
import hashlib
import os
import secrets
import threading
import time
from urllib.parse import urlencode, urlsplit, urlunsplit

import opslag

AANBIEDERS = {"google": "Google", "apple": "Apple", "azure": "Microsoft"}
ICONEN = {"google": ":material/g_mobiledata:", "apple": ":material/phone_iphone:", "azure": ":material/window:"}

_wacht: dict[str, tuple[str, float]] = {}  # staat -> (verifier, verloopt)
_slot = threading.Lock()
_aan: tuple[float, list[str]] = (0.0, [])


def _url() -> str:
    return os.environ.get("SUPABASE_URL", opslag.SUPABASE_URL).rstrip("/")


def _sleutel() -> str:
    return os.environ.get("SUPABASE_KEY", opslag.SUPABASE_PUBLISHABLE_KEY)


def aanbieders() -> list[str]:
    """Welke aanbieders aanstaan (10 minuten bewaard). Leeg als Supabase niet bereikbaar is."""
    global _aan
    if _aan[0] > time.time():
        return _aan[1]
    aan = []
    try:
        r = opslag._verbinding.get(f"{_url()}/auth/v1/settings", headers={"apikey": _sleutel()}, timeout=4)
        if not 200 <= r.status_code < 300:
            raise ValueError("Providerinstellingen niet beschikbaar")
        extern = r.json().get("external") or {}
        aan = [a for a in AANBIEDERS if extern.get(a)]
    except Exception:
        pass
    _aan = (time.time() + 600, aan)
    return aan


def provider_ready(aanbieder: str) -> bool:
    """Only configured and provider-reported enabled logins can be offered."""
    if aanbieder not in AANBIEDERS:
        return False
    return aanbieder in aanbieders()


def start(aanbieder: str, terug_adres: str) -> str:
    """De link naar de aanbieder. terug_adres is het adres van de app (met / aan het eind)."""
    if aanbieder not in AANBIEDERS:
        raise ValueError("Onbekende inlogaanbieder.")
    if not provider_ready(aanbieder):
        raise ValueError("Deze inlogaanbieder is nog niet geconfigureerd.")
    if not isinstance(terug_adres, str) or not terug_adres.startswith("https://"):
        raise ValueError("Een beveiligd terugkeeradres is vereist.")
    try:
        redirect = urlsplit(terug_adres)
        if (not redirect.hostname or redirect.username or redirect.password
                or redirect.port not in (None, 443)):
            raise ValueError
    except ValueError:
        raise ValueError("Een geldig beveiligd terugkeeradres is vereist.") from None
    verifier = secrets.token_urlsafe(48)
    staat = secrets.token_urlsafe(16)
    with _slot:
        for s in [s for s, (_, t) in _wacht.items() if t < time.time()]:
            _wacht.pop(s, None)
        _wacht[staat] = (verifier, time.time() + 900)
    uitdaging = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    terug = urlunsplit((redirect.scheme, redirect.netloc, redirect.path, urlencode({"extern": staat}), ""))
    return f"{_url()}/auth/v1/authorize?" + urlencode({"provider": aanbieder, "redirect_to": terug,
                                                         "code_challenge": uitdaging,
                                                         "code_challenge_method": "s256",
                                                         **({"scopes": "email"} if aanbieder == "azure" else {})})


def afronden(staat: str, code: str, apparaat: str, akkoord: bool = True) -> dict:
    """Wisselt de code in en logt in. Geeft {"token", "naam", "nieuw"} of {"fout"}."""
    with _slot:
        verifier, verloopt = _wacht.pop(staat, ("", 0))
    if not verifier or verloopt < time.time():
        return {"fout": "Deze inlog is verlopen. Probeer het opnieuw."}
    try:
        r = opslag._verbinding.post(f"{_url()}/auth/v1/token?grant_type=pkce", headers={"apikey": _sleutel()},
                                    json={"auth_code": code, "code_verifier": verifier}, timeout=15)
        if not 200 <= r.status_code < 300:
            return {"fout": "Inloggen lukte niet. Probeer het opnieuw."}
        toegang = r.json().get("access_token")
        if not toegang:
            return {"fout": "Inloggen lukte niet. Probeer het opnieuw."}
        r = opslag._verbinding.post(f"{_url()}/rest/v1/rpc/inloggen_extern",
                                    json={"p_apparaat": apparaat, "p_akkoord": akkoord},
                                    headers={"apikey": _sleutel(), "Authorization": f"Bearer {toegang}"}, timeout=15)
        if not 200 <= r.status_code < 300:
            return {"fout": "Inloggen lukte niet. Probeer het opnieuw."}
        return r.json() if isinstance(r.json(), dict) else {"fout": "Inloggen lukte niet."}
    except Exception:
        return {"fout": "Even niet bereikbaar. Probeer het zo opnieuw."}
