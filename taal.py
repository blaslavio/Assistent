"""Meerdere talen. De app is in het Nederlands geschreven; teksten op het scherm worden vertaald op het moment
dat Streamlit ze toont. Zo hoeft niet elke regel code aangepast te worden.

Vertalingen staan in vertalingen/<taal>.json: {"vast": {nl: vertaling}, "sjablonen": {"Nog {} dagen": "{} days left"}}.
Nieuwe teksten verzamel je met vertalingen/verzamelen.py. Wat (nog) niet vertaald is, blijft Nederlands.
Keuzelijsten houden hun Nederlandse waarden; alleen wat je ziet wordt vertaald (via format_func).
"""

import contextvars
import functools
import json
import re
import sys
from pathlib import Path

import streamlit as st
from streamlit.delta_generator import DeltaGenerator

TALEN = {"nl": "Nederlands", "en": "English"}
NAAM_VOOR_CLAUDE = {"nl": "Nederlands", "en": "Engels (English)"}
_huidig: contextvars.ContextVar[str] = contextvars.ContextVar("taal", default="nl")
_geladen: dict[str, tuple[dict, dict, float]] = {}


def _laden(code: str) -> tuple[dict, dict]:
    """Vaste teksten, en sjablonen per eerste letters (zo hoeft niet elk sjabloon geprobeerd te worden).
    Opnieuw inlezen zodra het bestand veranderd is (na een update)."""
    bestand = Path(__file__).parent / "vertalingen" / f"{code}.json"
    gewijzigd = bestand.stat().st_mtime if bestand.exists() else 0
    if _geladen.get(code, (None, None, -1))[2] != gewijzigd:
        data = json.loads(bestand.read_text()) if bestand.exists() else {"vast": {}, "sjablonen": {}}
        per_begin: dict[str, list] = {}
        for bron, doel in data.get("sjablonen", {}).items():
            if bron.count("{}") != doel.count("{}"):
                continue
            begin = bron.split("{}")[0]
            stukken = [re.escape(s.replace("{{", "{").replace("}}", "}")) for s in bron.split("{}")]
            patroon = re.compile("^" + "(.*?)".join(stukken) + "$", re.S)
            per_begin.setdefault(begin[:3], []).append((begin, patroon, doel))
        _geladen[code] = (data.get("vast", {}), per_begin, gewijzigd)
    return _geladen[code][:2]


def zet(code: str) -> None:
    _huidig.set(code if code in TALEN else "nl")


def huidig() -> str:
    return _huidig.get()


def taalregel() -> str:
    """Voor de assistent: in welke taal hij antwoordt. Leeg bij Nederlands (de instructies zijn al Nederlands)."""
    code = _huidig.get()
    if code == "nl":
        return ""
    return (f"Antwoord altijd in het {NAAM_VOOR_CLAUDE[code]}, ook al zijn deze instructies in het Nederlands. "
            "Schrijf ook titels, taken en andere teksten die je bewaart in die taal. Labels zoals [gevoel: ...] en "
            "[[lacht]] blijven precies zoals afgesproken, in het Nederlands.")


def uit_browser() -> str:
    """De taal van de telefoon of computer, als die er een van ons is; anders Engels."""
    try:
        code = (st.context.locale or "")[:2].lower()
    except Exception:
        code = ""
    return code if code in TALEN else ("nl" if not code else "en")


def t(tekst):
    """Vertaalt een tekst naar de huidige taal. Alles wat geen tekst is, of niet bekend is, blijft zoals het is."""
    code = _huidig.get()
    if code == "nl" or not isinstance(tekst, str) or not tekst.strip():
        return tekst
    vast, per_begin = _laden(code)
    if (gevonden := vast.get(tekst)) is not None:
        return gevonden
    for begin, patroon, doel in per_begin.get(tekst[:3], []):
        if tekst.startswith(begin) and (m := patroon.match(tekst)):
            return _vullen(doel, m.groups())
    for sleutel in {tekst[:n] for n in (0, 1, 2) if len(tekst) >= n}:
        for begin, patroon, doel in per_begin.get(sleutel, []):
            if len(begin) == len(sleutel) and (m := patroon.match(tekst)):
                return _vullen(doel, m.groups())
    return tekst


def _vullen(doel: str, waarden: tuple) -> str:
    """Zet de waarden terug in de vertaling; korte losse woorden (zoals een dagnaam) worden ook vertaald."""
    vast = _laden(_huidig.get())[0]
    delen = doel.split("{}")
    uit = delen[0]
    for waarde, rest in zip(waarden, delen[1:]):
        uit += vast.get(waarde, waarde) + rest
    return uit.replace("{{", "{").replace("}}", "}")


# --- Streamlit laten vertalen ------------------------------------------------------------------------

EERSTE_IS_TEKST = ["button", "markdown", "caption", "title", "header", "subheader", "text", "info", "warning", "error",
                   "success", "expander", "popover", "link_button", "download_button", "form_submit_button",
                   "text_input", "text_area", "number_input", "date_input", "time_input", "checkbox", "toggle",
                   "slider", "file_uploader", "camera_input", "color_picker", "metric", "status", "spinner",
                   "audio_input", "feedback"]
MET_KEUZES = ["selectbox", "segmented_control", "pills", "radio", "multiselect", "select_slider"]
WOORDEN = ("label", "body", "placeholder", "help", "text", "title", "value_label")


def _t(waarde):
    # Via sys.modules: na het opnieuw laden van deze module gebruiken de omhulsels de nieuwe versie.
    return sys.modules[__name__].t(waarde)


def _nl() -> bool:
    return sys.modules[__name__].huidig() == "nl"


def _vertaal_argumenten(args, kwargs, eerste: bool):
    if eerste and args and isinstance(args[0], str):
        args = (_t(args[0]), *args[1:])
    for woord in WOORDEN:
        if isinstance(kwargs.get(woord), str):
            kwargs[woord] = _t(kwargs[woord])
    return args, kwargs


def _omhul(origineel, soort: str):
    @functools.wraps(origineel)
    def omhulsel(*args, **kwargs):
        if _nl():
            return origineel(*args, **kwargs)
        zelf, rest = (args[0], args[1:]) if args and isinstance(args[0], DeltaGenerator) else (None, args)
        if soort == "keuze":
            rest, kwargs = _vertaal_argumenten(rest, kwargs, True)
            eigen = kwargs.get("format_func") or str
            kwargs["format_func"] = lambda optie, _f=eigen: _t(_f(optie))
        elif soort == "tabs":
            if rest and isinstance(rest[0], (list, tuple)):
                rest = ([_t(x) for x in rest[0]], *rest[1:])
        elif soort == "write":
            rest = tuple(_t(x) for x in rest)
        else:
            rest, kwargs = _vertaal_argumenten(rest, kwargs, soort == "eerste")
        return origineel(*((zelf,) if zelf is not None else ()), *rest, **kwargs)
    return omhulsel


def installeren() -> None:
    """Eén keer per proces: de tekstfuncties van Streamlit laten vertalen. Werkt ook voor kolommen en containers."""
    if getattr(DeltaGenerator, "_taal_klaar", False):
        return
    for naam, soort in ([(n, "eerste") for n in EERSTE_IS_TEKST] + [(n, "keuze") for n in MET_KEUZES]
                        + [("tabs", "tabs"), ("write", "write"), ("page_link", "woorden"), ("chat_input", "eerste")]):
        if hasattr(DeltaGenerator, naam):
            setattr(DeltaGenerator, naam, _omhul(getattr(DeltaGenerator, naam), soort))
            setattr(st, naam, getattr(st._main, naam))
    st.toast = _omhul(st.toast, "eerste")
    oud_dialoog = st.dialog
    st.dialog = lambda title, *a, **k: oud_dialoog(_t(title), *a, **k)
    DeltaGenerator._taal_klaar = True
