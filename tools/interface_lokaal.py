"""Geïsoleerde preview van de echte navigatie en lokale hulpmiddelen.

Start uitsluitend met ASSISTENT_LOKAAL=1 en ASSISTENT_INTERFACE_DATA=/tmp/...json.
Externe pagina-inhoud, echte login en achtergrondtaken worden niet uitgevoerd.
Er wordt nooit een inlogroute of controle in app.py omzeild of aangepast.
"""
import ast
import importlib
import os
from pathlib import Path
import re
import sys
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import streamlit as st
import gereedschappen
import gereedschappen_scherm
import indeling
import opslag

st.set_page_config(page_title="Assistent · lokale interfacecontrole", layout="centered")
pad = Path(os.environ.get("ASSISTENT_INTERFACE_DATA", "/ongeldig")).resolve()
if os.environ.get("ASSISTENT_LOKAAL") != "1" or not pad.is_relative_to(Path("/tmp")):
    st.error("Deze preview vereist een apart gegevensbestand onder /tmp en ASSISTENT_LOKAAL=1.")
    st.stop()
opslag.DATA_BESTAND = pad
if not pad.exists():
    opslag.opslaan({**opslag.LEEG, "taken": [{"id": 1, "titel": "Interfacecontrole afronden", "klaar": False, "deadline": None, "minuten": 30}],
                   "volgend_id": 2, "instellingen": {"onderdelen_bekend": list(indeling.ONDERDELEN), "onderdelen_uit": [],
                   "indeling": {"bovenaan": ["agenda", "gereedschappen", "werkzoeken"], "favorieten": ["gereedschappen", "werkzoeken", "planning-backup"]}}})
st.caption("Lokale interfacecontrole · aparte testgegevens · externe diensten en login niet uitgevoerd")

bron = ast.parse((ROOT / "app.py").read_text())
namen = {"paginas", "onderdelen_tegels", "indeling_instellingen", "kopbalk", "gereedschappen_overzicht"}
functies = [n for n in bron.body if isinstance(n, ast.FunctionDef) and n.name in namen]
if {n.name for n in functies} != namen:
    raise RuntimeError("De vereiste navigatiefuncties zijn niet gevonden.")
callbacks = {}

class StreamlitDoorgever:
    def Page(self, functie, **kwargs):
        p = st.Page(functie, **kwargs)
        callbacks[p.url_path] = functie
        return p

    def __getattr__(self, naam):
        return getattr(st, naam)


env = {"st": StreamlitDoorgever(), "re": re, "indeling": indeling, "opslag": opslag,
       "gereedschappen": gereedschappen, "gereedschappen_scherm": gereedschappen_scherm,
       "PAGINA": {}, "GROEPEN": {}, "onderdelen_uit": indeling.onderdelen_uit,
       "samen": SimpleNamespace(beschikbaar=lambda: False),
       "samen_scherm": SimpleNamespace(nieuw_kort=lambda: {}),
       "ik": lambda: {"niveau": "particulier"}, "mijn_avatar": lambda: {"naam": "Assistent"},
       "boekingen_wachten": lambda: 0, "chat": SimpleNamespace(ongelezen=lambda: 0)}


def afgeschermd(titel):
    def pagina():
        st.subheader(titel)
        st.info("De inhoud van dit bestaande onderdeel wordt niet uitgevoerd in deze geïsoleerde interfacecontrole.")
        if "gereedschappen" in env["PAGINA"]:
            st.page_link(env["PAGINA"]["gereedschappen"], label="Bekijk alle gereedschappen")
    return pagina


veilig = {"communicatie_scherm", "werkcontext_scherm", "werkcontrole_scherm", "werkbronnen_scherm", "taakplanning_scherm", "planning_backup_scherm",
          "sjablonen_scherm", "actieoverzicht_scherm", "bestandsgereedschap_scherm", "actielinks_scherm"}
for t in gereedschappen.TOOLS:
    module, punt, attr = t["functie"].partition(".")
    if punt:
        if module in veilig:
            env[module] = importlib.import_module(module)
        else:
            env.setdefault(module, SimpleNamespace())
            setattr(env[module], attr, afgeschermd(t["titel"]))
    else:
        env[module] = afgeschermd(t["titel"])
for naam, titel in (("vandaag_overzicht", "Vandaag"), ("agenda_tabblad", "Agenda"), ("gesprek", "Assistent")):
    env[naam] = afgeschermd(titel)
env["winkelen_scherm"] = SimpleNamespace(pagina=afgeschermd("Winkelen"))
setattr(env["chat"], "pagina", afgeschermd("Chat"))
exec(compile(ast.Module(body=functies, type_ignores=[]), "app.py", "exec"), env)


def instellingen():
    st.subheader("Instellingen")
    st.page_link(env["PAGINA"]["gereedschappen"], label="Zoek tools in alle mappen", icon=":material/manage_search:")
    env["onderdelen_tegels"]()
    with st.expander("Bovenbalk en favorieten aanpassen"):
        env["indeling_instellingen"]()


env["instellingen_tabblad"] = instellingen
paginas = env["paginas"]()
pagina = st.navigation(paginas, position="hidden")
if doel := st.session_state.pop("ga_naar", None):
    if doel in env["PAGINA"] and pagina.url_path != doel:
        st.switch_page(env["PAGINA"][doel])
env["kopbalk"]()
gekozen = os.environ.get("ASSISTENT_INTERFACE_PAGINA")
if gekozen:
    callbacks[gekozen]()
else:
    pagina.run()
