"""Chat met end-to-end-versleuteling, gekoppeld aan de agenda. Zie chat_js.js en sql/chat.sql.

Versleutelen en ontsleutelen gebeurt alleen in de browser: deze server (en dus ook de assistent) ziet nooit wat er
in een bericht staat. De browser praat daarvoor zelf met de database, met dezelfde inlogsessie als de app.
Niet in de herlaadlus van app.py: een onderdeel mag maar één keer worden aangemeld.
"""

import os
import time
from datetime import date, datetime, timedelta
from pathlib import Path

import streamlit as st

import opslag

CSS = """
.c-wortel { --c-rand: rgba(128,128,128,.25); --c-zacht: rgba(128,128,128,.10); --c-hoofd: var(--st-primary-color, #4f46e5);
  font-family: inherit; color: var(--st-text-color, inherit); display: flex; flex-direction: column; gap: 10px;
  min-height: 60vh; font-size: 16px; }
.c-wortel:has(.c-berichten) { height: calc(100dvh - 11rem); min-height: 380px; }
.c-wortel label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; opacity: .9; flex: 1; }
.c-kop { display: flex; align-items: center; gap: 8px; }
.c-kop b { font-size: 18px; }
.c-ruimte { flex: 1; }
.c-knop { font: inherit; font-size: 15px; padding: 7px 14px; border-radius: 999px; border: 1px solid var(--c-rand);
  background: transparent; color: inherit; cursor: pointer; white-space: nowrap; }
.c-knop:hover { border-color: var(--c-hoofd); }
.c-hoofd { background: var(--c-hoofd) !important; color: #fff !important; border-color: var(--c-hoofd) !important; }
.c-breed { width: 100%; }
.c-item { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; font: inherit; color: inherit;
  background: transparent; border: 0; border-bottom: 1px solid var(--c-zacht); padding: 10px 2px; cursor: pointer; }
.c-item:hover { background: var(--c-zacht); }
.c-avatar { width: 42px; height: 42px; border-radius: 50%; background: var(--c-zacht); display: grid; place-items: center;
  font-weight: 600; flex: none; }
.c-item-tekst { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.c-item-tekst small, .c-item-rechts small { opacity: .6; font-size: 13px; }
.c-item-rechts { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.c-badge { background: var(--c-hoofd); color: #fff; border-radius: 999px; font-size: 12px; padding: 1px 7px; }
.c-berichten { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; padding: 4px 2px;
  -webkit-overflow-scrolling: touch; }
.c-bericht { max-width: 80%; align-self: flex-start; background: var(--c-zacht); border-radius: 16px 16px 16px 4px;
  padding: 7px 11px 4px; line-height: 1.35; overflow-wrap: anywhere; }
.c-bericht img { max-width: 100%; max-height: 320px; border-radius: 10px; display: block; }
.c-mijn { align-self: flex-end; background: color-mix(in srgb, var(--c-hoofd) 18%, transparent);
  border-radius: 16px 16px 4px 16px; }
.c-naam { font-size: 13px; font-weight: 600; color: var(--c-hoofd); }
.c-tijd { font-size: 11px; opacity: .55; text-align: right; margin-top: 2px; display: flex; gap: 6px; justify-content: flex-end;
  align-items: center; }
.c-dag { align-self: center; font-size: 12px; opacity: .6; background: var(--c-zacht); border-radius: 999px;
  padding: 2px 10px; margin: 6px 0; }
.c-kaart { display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--c-rand); border-radius: 12px;
  padding: 10px 12px; line-height: 1.4; }
.c-kaart small { opacity: .65; }
.c-rij { display: flex; gap: 8px; align-items: flex-end; }
.c-wrap { flex-wrap: wrap; }
.c-pil { font: inherit; font-size: 14px; padding: 5px 11px; border-radius: 999px; border: 1px solid var(--c-rand);
  background: transparent; color: inherit; cursor: pointer; }
.c-pil:hover { border-color: var(--c-hoofd); }
.c-paneel { border: 1px solid var(--c-rand); border-radius: 14px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.c-paneel.c-rij { flex-direction: row; }
.c-invoer { display: flex; gap: 8px; align-items: flex-end; }
.c-invoer textarea { flex: 1; resize: none; border-radius: 20px; padding: 9px 14px; max-height: 140px; }
.c-rond { width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--c-rand); background: transparent;
  color: inherit; font-size: 20px; cursor: pointer; flex: none; line-height: 1; }
.c-veld { font: inherit; font-size: 16px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--c-rand);
  background: var(--st-background-color, transparent); color: inherit; width: 100%; box-sizing: border-box; }
.c-veld:focus { outline: 2px solid color-mix(in srgb, var(--c-hoofd) 50%, transparent); border-color: transparent; }
.c-melding { position: sticky; top: 0; z-index: 3; background: var(--st-background-color, #fff); border: 1px solid var(--c-rand);
  border-radius: 10px; padding: 8px 12px; font-size: 14px; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
.c-verzoek { border: 1px solid var(--c-rand); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.c-code { font-family: ui-monospace, Menlo, monospace; font-size: 17px; letter-spacing: .05em; word-spacing: .4em;
  line-height: 1.7; }
.c-lid { padding: 6px 0; border-bottom: 1px solid var(--c-zacht); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.c-lid small { opacity: .6; }
.c-mini { font: inherit; font-size: 12px; background: transparent; border: 0; color: inherit; opacity: .6; cursor: pointer;
  padding: 0 2px; margin-left: auto; }
.c-grijs { opacity: .6; }
.c-waarschuwing { color: #b45309; }
.c-fout { color: #b91c1c; }
.c-leeg { opacity: .6; text-align: center; padding: 28px 8px; }
.c-voet { font-size: 13px; opacity: .55; text-align: center; margin-top: auto; padding-top: 10px; }
.c-scheid { font-size: 13px; opacity: .6; margin-top: 8px; }
.c-titel { flex: 1; display: flex; flex-direction: column; align-items: flex-start; font: inherit; color: inherit;
  background: transparent; border: 0; cursor: pointer; text-align: left; padding: 0; }
.c-titel small { opacity: .6; font-size: 12px; }
.c-link { font: inherit; background: transparent; border: 0; color: var(--c-hoofd); cursor: pointer; padding: 0; text-decoration: underline; }
.c-vink { flex-direction: row !important; align-items: center; gap: 8px !important; }
"""

_chat = st.components.v2.component("chat", html='<div class="c-wortel"></div>', css=CSS,
                                   js=(Path(__file__).parent / "chat_js.js").read_text())

# Ongelezen berichten per account, kort onthouden zodat de kopbalk niet bij elke klik de database vraagt.
_ongelezen: dict[str, tuple[float, int]] = {}


def ongelezen() -> int:
    """Aantal ongelezen chatberichten (en nieuwe verzoeken). Hoogstens elke halve minuut gevraagd."""
    if not opslag.online() or not opslag._wachtwoord.get():
        return 0
    sleutel = f"{opslag._naam.get()}|{opslag._wachtwoord.get()}"
    bewaard = _ongelezen.get(sleutel)
    if bewaard and time.time() - bewaard[0] < 30:
        return bewaard[1]
    try:
        gesprekken = opslag._rpc_ik("chat_gesprekken").get("gesprekken", [])
    except Exception:
        return bewaard[1] if bewaard else 0
    aantal = sum(g["ongelezen"] + (g["status"] == "verzoek") for g in gesprekken)
    _ongelezen[sleutel] = (time.time(), aantal)
    return aantal


def apparaat_naam() -> str:
    ua = (st.context.headers.get("User-Agent") or "").lower()
    for woord, naam in (("iphone", "iPhone"), ("ipad", "iPad"), ("android", "Android"), ("macintosh", "Mac"),
                        ("windows", "Windows"), ("linux", "Linux")):
        if woord in ua:
            return naam
    return "Browser"


def vrije_momenten(aantal: int = 8) -> list[str]:
    """Een paar vrije uren in de komende week (10, 13, 16 of 19 uur), hoogstens twee per dag."""
    vandaag = date.today()
    bezet = []
    for a in opslag.afspraken_tussen(vandaag.isoformat(), (vandaag + timedelta(days=8)).isoformat()):
        if a.get("soort") == "vrij" or "T" not in (a.get("start") or ""):
            continue
        start = datetime.fromisoformat(a["start"][:16])
        einde = datetime.fromisoformat(a["einde"][:16]) if a.get("einde") and "T" in a["einde"] else start + timedelta(hours=1)
        bezet.append((start, einde))
    nu = datetime.now() + timedelta(hours=2)
    momenten = []
    for d in range(8):
        dag = vandaag + timedelta(days=d)
        per_dag = 0
        for uur in (10, 13, 16, 19):
            begin = datetime.combine(dag, datetime.min.time()).replace(hour=uur)
            if begin < nu or per_dag == 2 or any(s < begin + timedelta(hours=1) and e > begin for s, e in bezet):
                continue
            momenten.append(begin.strftime("%Y-%m-%dT%H:%M"))
            per_dag += 1
            if len(momenten) == aantal:
                return momenten
    return momenten


def _naar_agenda(a: dict | None) -> None:
    """De knop 'In mijn agenda' bij een afspraak in de chat."""
    if not isinstance(a, dict) or a.get("n") == st.session_state.get("_chat_laatste"):
        return
    st.session_state._chat_laatste = a.get("n")
    try:
        start = datetime.fromisoformat(str(a["start"])[:16])
    except (KeyError, ValueError):
        return
    einde = start + timedelta(minutes=int(a.get("minuten") or 60))
    titel = str(a.get("titel") or "Afspraak")[:120]
    met = str(a.get("met") or "")[:60]
    opslag.afspraak_toevoegen(titel, start.strftime("%Y-%m-%dT%H:%M"), einde.strftime("%Y-%m-%dT%H:%M"),
                              notitie=f"Via de chat met {met}" if met else "Via de chat",
                              locatie=str(a.get("plaats") or "")[:200], soort="familie en vrienden")
    st.toast(f"{titel} staat in je agenda.")


def _open() -> int | None:
    """Een gesprek om meteen te openen: via een melding op je telefoon (?gesprek=nummer) of vanuit de app."""
    gesprek = st.query_params.pop("gesprek", None) or st.session_state.pop("chat_open", None)
    try:
        return int(gesprek) if gesprek else None
    except ValueError:
        return None


def pagina() -> None:
    if not opslag.online():
        st.info("De chat werkt alleen in de online versie van de app.")
        return
    if not opslag.is_sessie(st.session_state.get("wachtwoord", "")):
        st.info("Log opnieuw in om de beveiligde chat te gebruiken.")
        return
    try:
        vrij = vrije_momenten()
    except Exception:
        vrij = []
    resultaat = _chat(key="chat", data={
        "url": os.environ.get("SUPABASE_URL", opslag.SUPABASE_URL).rstrip("/"),
        "key": os.environ.get("SUPABASE_KEY", opslag.SUPABASE_PUBLISHABLE_KEY),
        "naam": st.session_state.get("naam", ""), "token": st.session_state.get("wachtwoord", ""),
        "label": apparaat_naam(), "vrij": vrij, "open": _open(),
    }, on_agenda_change=lambda: None)
    _naar_agenda(getattr(resultaat, "agenda", None) if resultaat is not None else None)
    # Zo blijft het aantal in de kopbalk kloppen nadat je berichten hebt gelezen.
    _ongelezen.pop(f"{opslag._naam.get()}|{opslag._wachtwoord.get()}", None)
