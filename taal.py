"""Meerdere talen. De app is in het Nederlands geschreven; teksten op het scherm worden vertaald op het moment
dat Streamlit ze toont. Zo hoeft niet elke regel code aangepast te worden.

Vertalingen staan in vertalingen/<taal>.json: {"vast": {nl: vertaling}, "sjablonen": {"Nog {} dagen": "{} days left"}}.
Nieuwe teksten verzamel je met vertalingen/verzamelen.py. Wat (nog) niet vertaald is, blijft Nederlands.
Keuzelijsten houden hun Nederlandse waarden; alleen wat je ziet wordt vertaald (via format_func).
"""

import contextvars
import functools
import html
import json
import os
import re
import sys
from pathlib import Path

import streamlit as st
from streamlit.delta_generator import DeltaGenerator

# Alle talen waar de app in kan; een taal verschijnt pas als vertalingen/<code>.json er is.
ALLE_TALEN = {"nl": "Nederlands", "en": "English", "de": "Deutsch", "fr": "Français", "es": "Español", "it": "Italiano",
              "pt": "Português", "pl": "Polski", "tr": "Türkçe", "ar": "العربية", "uk": "Українська", "zh": "中文"}
NAAM_VOOR_CLAUDE = {"nl": "Nederlands", "en": "Engels (English)", "de": "Duits (Deutsch)", "fr": "Frans (français)",
                    "es": "Spaans (español)", "it": "Italiaans (italiano)", "pt": "Portugees (português)",
                    "pl": "Pools (polski)", "tr": "Turks (Türkçe)", "ar": "Arabisch (العربية)",
                    "uk": "Oekraïens (українська)", "zh": "Chinees (中文, vereenvoudigd)"}
RECHTS_NAAR_LINKS = {"ar"}
_MAP = Path(__file__).parent / "vertalingen"
TALEN = {c: n for c, n in ALLE_TALEN.items() if c == "nl" or (_MAP / f"{c}.json").exists()}
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
            per_begin.setdefault(begin[:3], []).append((begin, patroon, doel, len(bron.replace("{}", ""))))
        for lijst in per_begin.values():  # meest specifieke sjabloon eerst
            lijst.sort(key=lambda x: -x[3])
        per_begin = {k: [x[:3] for x in v] for k, v in per_begin.items()}
        _geladen[code] = (data.get("vast", {}), per_begin, gewijzigd)
    return _geladen[code][:2]


_chat_geladen: dict[str, tuple[dict, float]] = {}


def chat_teksten() -> dict:
    """De vertalingen voor het chatvenster (chat_js.js) in de huidige taal: {Nederlands: vertaling}.
    Uit vertalingen/chat_<taal>.json; opnieuw ingelezen zodra het bestand veranderd is. Geen bestand: leeg."""
    code = _huidig.get()
    bestand = Path(__file__).parent / "vertalingen" / f"chat_{code}.json"
    gewijzigd = bestand.stat().st_mtime if bestand.exists() else 0
    if _chat_geladen.get(code, (None, -1))[1] != gewijzigd:
        data = json.loads(bestand.read_text()) if bestand.exists() else {}
        _chat_geladen[code] = (data if isinstance(data, dict) else {}, gewijzigd)
    return _chat_geladen[code][0]


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


# --- Dagen en maanden: die zitten vaak in samengestelde tekst ("maandag 21 oktober") ------------------------

_datum: dict[str, tuple] = {}


def _datumwoorden(code: str) -> tuple[dict, re.Pattern, dict, re.Pattern]:
    """Volledige namen (overal te vervangen) en afkortingen (alleen naast een getal, of als losse tekst)."""
    if code not in _datum:
        alle = json.loads((_MAP / "datum.json").read_text())
        nl, doel = alle["nl"], alle.get(code) or alle["nl"]
        vol = {a: b for k in ("dagen", "maanden") for a, b in zip(nl[k], doel[k])}
        kort = {a: b for k in ("kort", "mkort") for a, b in zip(nl[k], doel[k])}
        vol_re = re.compile(r"\b(" + "|".join(sorted(vol, key=len, reverse=True)) + r")\b", re.I)
        kort_re = re.compile(r"(?<=\d )(" + "|".join(nl["mkort"]) + r")\b|\b(" + "|".join(nl["kort"]) + r")(?= \d)", re.I)
        _datum[code] = (vol, vol_re, kort, kort_re)
    return _datum[code]


def _hoofdletter(origineel: str, vertaald: str) -> str:
    return vertaald[:1].upper() + vertaald[1:] if origineel[:1].isupper() else vertaald


def datum(tekst: str) -> str:
    """Vervangt Nederlandse dag- en maandnamen in een tekst door die van de huidige taal."""
    code = _huidig.get()
    if code == "nl" or not isinstance(tekst, str):
        return tekst
    vol, vol_re, kort, kort_re = _datumwoorden(code)
    if (k := kort.get(tekst.strip().lower())) is not None and len(tekst.strip()) <= 3:
        return _hoofdletter(tekst.strip(), k)
    tekst = vol_re.sub(lambda m: _hoofdletter(m.group(0), vol[m.group(0).lower()]), tekst)
    return kort_re.sub(lambda m: _hoofdletter(m.group(0), kort[m.group(0).lower()]), tekst)


def rechts_naar_links() -> bool:
    return _huidig.get() in RECHTS_NAAR_LINKS


_TAG = re.compile(r"(<[^>]*>)")
_RAND = re.compile(r"^(\s*)(.*?)(\s*)$", re.S)


def _html(tekst: str) -> str:
    """HTML: alleen de tekst tussen de tags vertalen (niet in <style> of <script>)."""
    delen = _TAG.split(tekst)
    for i in range(0, len(delen), 2):
        vorige = delen[i - 1].lower() if i else ""
        if not delen[i].strip() or vorige.startswith(("<style", "<script")):
            continue
        voor, kern, na = _RAND.match(delen[i]).groups()
        delen[i] = voor + html.escape(t(html.unescape(kern)), quote=False) + na
    return "".join(delen)


_missers: set[str] = set()
_VERSIERING = re.compile(r"^(\s*(?::material/[a-z_]+:\s*|[^\w\s*\"'(\[:]+\s+)?)(\*\*)?(.+?)(\*\*)?(\s*)$", re.S)


def t(tekst):
    """Vertaalt een tekst naar de huidige taal. Alles wat geen tekst is, of niet bekend is, blijft zoals het is."""
    code = _huidig.get()
    if code == "nl" or not isinstance(tekst, str) or not tekst.strip():
        return tekst
    vast, per_begin = _laden(code)
    if (gevonden := vast.get(tekst)) is not None:
        return gevonden
    if "<" in tekst and _TAG.search(tekst):
        return _html(tekst)
    if (m := _VERSIERING.match(tekst)) and (m.group(1) or m.group(2)) and m.group(2) == m.group(4):
        # Een icoon of **vet** om een bekende tekst heen: alleen de tekst zelf vertalen.
        kern = m.group(3)
        if (vertaald := t(kern)) != kern:
            return m.group(1) + (m.group(2) or "") + vertaald + (m.group(4) or "") + m.group(5)
    for begin, patroon, doel in per_begin.get(tekst[:3], []):
        if tekst.startswith(begin) and (m := patroon.match(tekst)):
            return _vullen(doel, m.groups())
    for sleutel in {tekst[:n] for n in (0, 1, 2) if len(tekst) >= n}:
        for begin, patroon, doel in per_begin.get(sleutel, []):
            if len(begin) == len(sleutel) and (m := patroon.match(tekst)):
                return _vullen(doel, m.groups())
    if (m := re.fullmatch(r"(.+) \(([^()]+)\)", tekst, re.S)) and (stukken := [t(m.group(1)), t(m.group(2))]) != list(m.groups()):
        return f"{stukken[0]} ({stukken[1]})"
    for teken in (" · ", " | ", " – ", ", ", ": "):
        # Samengestelde tekst ("Vandaag · 3 taken"): de losse stukken vertalen.
        if teken in tekst:
            stukken = tekst.split(teken)
            vertaald = [t(x) for x in stukken]
            if vertaald != stukken:
                return teken.join(vertaald)
    uit = datum(_zinsdelen(code, tekst))
    if uit == tekst and os.environ.get("TAAL_MISSERS"):
        # Voor het bijwerken van de vertalingen: teksten die niet vertaald konden worden.
        if tekst not in _missers:
            _missers.add(tekst)
            with open(os.environ["TAAL_MISSERS"], "a") as f:
                f.write(json.dumps(tekst, ensure_ascii=False) + "\n")
    return uit


_delen_re: dict[str, tuple] = {}


def _zinsdelen(code: str, tekst: str) -> str:
    """Laatste redmiddel: bekende woordgroepen (minstens twee woorden) binnen een langere tekst vertalen,
    zoals "half bewolkt" in "14° half bewolkt"."""
    vast = _laden(code)[0]
    if _delen_re.get(code, (None,))[0] is not vast:
        groepen = sorted((k for k in vast if " " in k and len(k) >= 6 and re.fullmatch(r"[A-Za-zÀ-ÿ' ]+", k)
                          and vast[k] != k), key=len, reverse=True)
        _delen_re[code] = (vast, re.compile(r"\b(" + "|".join(map(re.escape, groepen)) + r")\b") if groepen else None)
    patroon = _delen_re[code][1]
    return patroon.sub(lambda m: vast[m.group(0)], tekst) if patroon else tekst


def _vullen(doel: str, waarden: tuple) -> str:
    """Zet de waarden terug in de vertaling; korte losse woorden (zoals een dagnaam) worden ook vertaald."""
    vast = _laden(_huidig.get())[0]
    delen = doel.split("{}")
    uit = delen[0]
    for waarde, rest in zip(waarden, delen[1:]):
        uit += (vast.get(waarde) or (t(waarde) if re.search(r"[^\W\d_]{2}", waarde) else waarde)) + rest
    return uit.replace("{{", "{").replace("}}", "}")


# --- Streamlit laten vertalen ------------------------------------------------------------------------

EERSTE_IS_TEKST = ["button", "markdown", "caption", "title", "header", "subheader", "text", "info", "warning", "error",
                   "success", "expander", "popover", "link_button", "download_button", "form_submit_button",
                   "text_input", "text_area", "number_input", "date_input", "time_input", "checkbox", "toggle",
                   "slider", "file_uploader", "camera_input", "color_picker", "metric", "status", "spinner",
                   "audio_input", "feedback", "html"]
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
