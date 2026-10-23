"""3D-studio: zelf 3D-ontwerpen maken (zie ontwerp_js.js voor de studio en vormen_js.js voor de vormen).

Een ontwerp is privé. De studio draait in een st.iframe en bewaart zelf (met je sessie) via ontwerp_opslaan.
In een wereld zet je een ontwerp via Bouwen › Toevoegen › Mijn ontwerpen; de delen gaan dan mee in die wereld.
"""

import json
import os
from pathlib import Path

import opslag
import wereld

_JS = Path(__file__).with_name("ontwerp_js.js")
VORMEN_JS = Path(__file__).with_name("vormen_js.js")


class Fout(Exception):
    """Iets lukte niet; de tekst is geschikt om aan de gebruiker te tonen."""


def _ok(antwoord: dict) -> dict:
    if antwoord.get("fout"):
        raise Fout(antwoord["fout"])
    return antwoord


def mijn_ontwerpen(met_delen: bool = False) -> list[dict]:
    return opslag._rpc_ik("mijn_ontwerpen", p_met_delen=met_delen)["ontwerpen"]


def lezen(ontwerp_id: int) -> dict:
    return _ok(opslag._rpc_ik("ontwerp_lezen", p_id=ontwerp_id))


def maken(titel: str, ontwerp_id: int | None = None) -> int:
    return _ok(opslag._rpc_ik("ontwerp_maken", p_id=ontwerp_id, p_titel=titel))["id"]


def kopie(ontwerp_id: int) -> int:
    return _ok(opslag._rpc_ik("ontwerp_kopie", p_id=ontwerp_id))["id"]


def weg(ontwerp_id: int) -> None:
    _ok(opslag._rpc_ik("ontwerp_weg", p_id=ontwerp_id))


def vormen_js() -> str:
    """De gedeelde vormen, om in een module-script te plakken."""
    return VORMEN_JS.read_text()


def html(ontwerp: dict, hoogte: int = 640) -> str:
    """De hele studio als losse webpagina."""
    url = os.environ.get("SUPABASE_URL", opslag.SUPABASE_URL).rstrip("/")
    sleutel = os.environ.get("SUPABASE_KEY", opslag.SUPABASE_PUBLISHABLE_KEY)
    token = opslag._wachtwoord.get() or ""
    gegevens = {
        "ontwerp": {k: ontwerp.get(k) for k in ("id", "titel", "delen")},
        "api": {"url": url, "key": sleutel, "naam": opslag._naam.get() or "", "token": token} if opslag.is_sessie(token) else None,
        "three": wereld.THREE,
    }
    data = json.dumps(gegevens).replace("</", "<\\/")
    js = _JS.read_text().replace("__VORMEN__", vormen_js()).replace("__DATA__", data)
    stijl = wereld.PAGINA.split("<style>", 1)[1].split("</style>", 1)[0]  # dezelfde knoppen en bladen als de wereldbouwer
    return (PAGINA.replace("__THREE__", wereld.THREE).replace("__STIJL__", stijl + EXTRA_STIJL)
            .replace("__HOOGTE__", str(hoogte)).replace("__JS__", js.replace("</script", "<\\/script")))


EXTRA_STIJL = r"""
  html, body { background: #e8ecf2; }
  .tegel img.vorm { width: 64px; height: 64px; object-fit: contain; }
  .vorm-leeg { display: grid; place-items: center; width: 64px; height: 64px; font-weight: 700; font-size: 22px !important; opacity: .5; }
  .getallen { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .getallen label { display: flex; flex-direction: column; font-size: 12px; opacity: .85; position: relative; }
  .getallen input { width: 100%; font: inherit; border: 1px solid var(--rand); border-radius: 8px; padding: 6px 26px 6px 8px; margin-top: 2px; }
  .getallen i { position: absolute; right: 8px; bottom: 8px; font-style: normal; font-size: 12px; opacity: .5; }
  .lijst { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
  .knop.regel { text-align: left; white-space: normal; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
  .knop.regel small { opacity: .65; font-size: 13px; }
  #gereedschap { top: auto; bottom: 12px; left: 50%; right: auto; transform: translateX(-50%); max-width: calc(100% - 16px);
    background: rgba(255,255,255,.96); border-radius: 14px; padding: 5px; box-shadow: 0 4px 16px rgba(0,0,0,.18); }
  #gereedschap .knop { box-shadow: none; border-color: transparent; background: transparent; }
  #gereedschap .knop.aan { background: #eef2ff; color: var(--hoofd); font-weight: 600; }
  #gereedschap .scheiding { width: 1px; align-self: stretch; background: var(--rand); margin: 2px 2px; }
  #scherm { bottom: 14px; right: 10px; }
  body:has(#gereedschap:not([hidden])) #scherm { bottom: 72px; }
"""

PAGINA = r"""<!doctype html>
<html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<script type="importmap">{"imports": {"three": "__THREE__/build/three.module.min.js", "three/addons/": "__THREE__/examples/jsm/"}}</script>
<style>__STIJL__</style></head>
<body>
<canvas id="doek"></canvas>
<div class="balk">
  <button class="knop" id="b-terug" aria-label="Ongedaan maken">↶</button>
  <button class="knop" id="b-vooruit" aria-label="Opnieuw doen">↷</button>
  <button class="knop" id="b-begin">Begin</button>
  <button class="knop" id="b-bekijken">Bekijken</button>
  <button class="knop" id="b-delen">Delen</button>
  <span class="ruimte"></span>
  <span id="status" class="status"></span>
</div>
<button class="knop hoofd" id="toevoegen">+ Vorm</button>
<div id="gereedschap" class="balk" hidden>
  <button class="knop" data-stand="translate">Verplaatsen</button>
  <button class="knop" data-stand="rotate">Draaien</button>
  <button class="knop" data-stand="scale">Maat</button>
  <span class="scheiding"></span>
  <button class="knop" id="g-aanpassen">Kleur en meer</button>
  <button class="knop" id="g-kopie">Kopie</button>
  <button class="knop gevaar" id="g-weg" aria-label="Weghalen">Weg</button>
  <button class="knop" id="g-klaar" aria-label="Loslaten">✓</button>
</div>
<div id="paneel" class="blad" hidden></div>
<div id="catalogus" class="blad" hidden></div>
<div id="instellingen" class="blad" hidden></div>
<div id="melding"></div>
<button class="knop hoek" id="scherm" aria-label="Volledig scherm">⛶</button>
<script type="module">
__JS__
</script>
</body></html>"""
