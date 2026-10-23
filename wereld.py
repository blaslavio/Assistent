"""Wereld: de pagina waarop je een 3D-wereld of spel bouwt of speelt (zie wereld_js.js voor de motor zelf).

De pagina draait in een st.iframe. In de bouwstand bewaart de pagina zelf (met je sessie) via ruimte_bouw_opslaan,
zodat er niets verloren gaat als je even wegklikt. Alle gegevens gaan als JSON mee, nooit als HTML.
"""

import json
import os
from pathlib import Path

import opslag

THREE = "https://cdn.jsdelivr.net/npm/three@0.170.0"
_JS = Path(__file__).with_name("wereld_js.js")
_VORMEN = Path(__file__).with_name("vormen_js.js")  # gedeeld met de 3D-studio


def html(ruimte: dict, modus: str = "spelen", hoogte: int = 620, met_sessie: bool = True,
         ontwerpen: list[dict] | None = None) -> str:
    """De hele wereld als losse webpagina. modus: 'bouwen' (alleen de maker) of 'spelen'.

    ontwerpen: je eigen 3D-ontwerpen (met delen), om in de bouwer neer te zetten.
    """
    url = os.environ.get("SUPABASE_URL", opslag.SUPABASE_URL).rstrip("/")
    sleutel = os.environ.get("SUPABASE_KEY", opslag.SUPABASE_PUBLISHABLE_KEY)
    token = opslag._wachtwoord.get() or ""
    ingelogd = met_sessie and opslag.is_sessie(token)
    gegevens = {
        "modus": "bouwen" if modus == "bouwen" and ruimte.get("van_mij") else "spelen",
        "ruimte": {k: ruimte.get(k) for k in ("id", "titel", "omschrijving", "maker", "kleur")},
        "bouw": ruimte.get("bouw"),
        "items": [{k: d.get(k) for k in ("id", "soort", "titel", "tekst", "data", "klein", "breedte", "hoogte")}
                  for d in ruimte.get("dingen", [])],
        "api": {"url": url, "key": sleutel, "naam": opslag._naam.get() or "", "token": token} if ingelogd else None,
        "api_url": url, "api_key": sleutel,
        "three": THREE,
        "ontwerpen": [{k: o.get(k) for k in ("id", "titel", "omslag", "delen")} for o in (ontwerpen or [])],
    }
    data = json.dumps(gegevens).replace("</", "<\\/")
    js = _JS.read_text().replace("__VORMEN__", _VORMEN.read_text()).replace("__DATA__", data)
    return (PAGINA.replace("__THREE__", THREE).replace("__HOOGTE__", str(hoogte))
            .replace("__JS__", js.replace("</script", "<\\/script")))


PAGINA = r"""<!doctype html>
<html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<script type="importmap">{"imports": {"three": "__THREE__/build/three.module.min.js", "three/addons/": "__THREE__/examples/jsm/"}}</script>
<style>
  :root { --hoofd: #4f46e5; --tekst: #111827; --zacht: rgba(255,255,255,.94); --rand: rgba(17,24,39,.12); }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin: 0; height: __HOOGTE__px; overflow: hidden; background: #0f172a; color: var(--tekst);
    font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  :fullscreen body, body:fullscreen { height: 100vh; }
  #doek { position: fixed; inset: 0; width: 100%; height: 100%; touch-action: none; display: block; }
  [hidden] { display: none !important; }
  .knop { font: inherit; font-size: 14px; border: 1px solid var(--rand); background: #fff; color: var(--tekst); border-radius: 10px;
    padding: 7px 12px; cursor: pointer; white-space: nowrap; }
  .knop.hoofd { background: var(--hoofd); border-color: var(--hoofd); color: #fff; font-weight: 600; }
  .knop.gevaar { color: #b91c1c; }
  .knop.rond { width: 38px; padding: 7px 0; text-align: center; }
  .knop.mini { padding: 2px 9px; border-radius: 8px; }
  .knop.pil { border-radius: 999px; }
  .knop.pil.aan { background: #eef2ff; border-color: var(--hoofd); color: var(--hoofd); font-weight: 600; }
  .rij { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .klein { font-size: 13px; opacity: .7; margin: 6px 0; }
  .label { display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; opacity: .55; margin: 10px 0 5px; }
  .waarschuwing { font-size: 13px; color: #92400e; background: #fef3c7; border-radius: 8px; padding: 6px 10px; }
  .balk { position: fixed; top: 8px; left: 8px; right: 8px; display: flex; gap: 6px; align-items: center; z-index: 5; overflow-x: auto;
    scrollbar-width: none; }
  .balk::-webkit-scrollbar { display: none; }
  .balk .knop { background: var(--zacht); box-shadow: 0 1px 4px rgba(0,0,0,.15); }
  .balk .knop.hoofd { background: var(--hoofd); color: #fff; }
  .status { font-size: 12px; padding: 5px 9px; border-radius: 999px; background: var(--zacht); white-space: nowrap; cursor: pointer; }
  .status.opgeslagen { color: #15803d; } .status.fout { color: #b91c1c; } .status.wijzigingen, .status.bezig { color: #92400e; }
  .ruimte { flex: 1; }
  #toevoegen { position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%); z-index: 5; padding: 12px 22px; font-size: 16px;
    border-radius: 999px; box-shadow: 0 4px 14px rgba(0,0,0,.25); }
  .blad { position: fixed; left: 0; right: 0; bottom: 0; max-height: 52%; overflow: auto; z-index: 6; background: #fff;
    border-radius: 16px 16px 0 0; padding: 12px 14px 18px; box-shadow: 0 -6px 24px rgba(0,0,0,.25); overscroll-behavior: contain; }
  @media (min-width: 760px) { .blad { left: auto; right: 10px; bottom: 10px; top: 56px; width: 360px; max-height: none; border-radius: 16px; } }
  .blad .kop { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px; }
  .blad .kop b { font-size: 16px; }
  .groep { border-top: 1px solid var(--rand); padding-top: 4px; margin-top: 8px; }
  .groep small { display: block; font-size: 12px; opacity: .6; margin-top: 4px; }
  .maten { margin-top: 6px; gap: 10px; }
  .maten label { display: flex; flex-direction: column; font-size: 12px; opacity: .85; }
  .maten span { display: flex; align-items: center; gap: 6px; } .maten b { min-width: 30px; text-align: center; }
  .kleuren { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .kleur { width: 30px; height: 30px; border-radius: 50%; border: 2px solid rgba(0,0,0,.15); cursor: pointer; padding: 0; }
  .kleur.aan { outline: 3px solid var(--hoofd); outline-offset: 1px; }
  input[type=color] { width: 36px; height: 32px; border: 0; padding: 0; background: none; }
  .blad textarea, .blad input:not([type]), .blad input[type=text] { width: 100%; font: inherit; border: 1px solid var(--rand); border-radius: 8px; padding: 7px 9px; }
  .optie-rij { flex-wrap: nowrap; margin-top: 5px; } .optie-rij .optie-veld { flex: 1; }
  .vink { display: flex; gap: 8px; align-items: center; margin-top: 8px; font-size: 14px; }
  .schuif { display: flex; flex-direction: column; font-size: 12px; flex: 1; min-width: 120px; }
  .onder { margin-top: 12px; justify-content: space-between; }
  .tabs { display: flex; gap: 6px; overflow-x: auto; padding: 4px 0 8px; scrollbar-width: none; }
  .tegels { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px; }
  .tegel { font: inherit; font-size: 13px; border: 1px solid var(--rand); background: #fafafa; border-radius: 12px; padding: 10px 4px;
    display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; color: inherit; }
  .tegel span { font-size: 28px; line-height: 1; } .tegel img { width: 100%; height: 54px; object-fit: cover; border-radius: 8px; }
  .tegel.breed small { font-size: 11px; opacity: .6; text-align: center; }
  #hud { position: fixed; top: 10px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; z-index: 4; pointer-events: none; }
  #hud span { background: rgba(17,24,39,.7); color: #fff; border-radius: 999px; padding: 4px 11px; font-weight: 600; font-size: 15px; }
  body.testen #hud { top: 54px; }
  #melding { position: fixed; top: 92px; left: 50%; transform: translate(-50%, -8px); background: rgba(17,24,39,.85); color: #fff;
    padding: 7px 14px; border-radius: 999px; z-index: 8; opacity: 0; transition: .25s; pointer-events: none; font-weight: 600; }
  #melding.zichtbaar { opacity: 1; transform: translate(-50%, 0); }
  #info { position: fixed; left: 12px; right: 12px; top: 56px; z-index: 7; background: var(--zacht); border-radius: 12px; padding: 12px 14px;
    max-height: 50%; overflow: auto; box-shadow: 0 4px 16px rgba(0,0,0,.25); }
  #info div { white-space: pre-line; margin: 4px 0 8px; }
  .overlay { position: fixed; inset: 0; z-index: 9; display: grid; place-items: center; background: rgba(15,23,42,.45); padding: 16px; }
  .overlay .kaart { background: #fff; border-radius: 16px; padding: 18px; max-width: 420px; width: 100%; max-height: 90%; overflow: auto;
    box-shadow: 0 10px 40px rgba(0,0,0,.35); }
  .overlay h2 { margin: 0 0 4px; font-size: 22px; } .overlay .groot { font-size: 20px; font-weight: 700; margin: 6px 0; }
  .overlay ol { margin: 6px 0; padding-left: 22px; } .overlay li { display: flex; justify-content: space-between; gap: 8px; }
  .overlay .rij { margin-top: 12px; }
  #vraag .kaart { display: flex; flex-direction: column; gap: 8px; } #vraag b { font-size: 18px; margin-bottom: 4px; }
  .optie { text-align: left; font-size: 16px; padding: 11px 14px; }
  .optie.goed { background: #dcfce7; border-color: #16a34a; } .optie.fout { background: #fee2e2; border-color: #dc2626; }
  #stick { position: fixed; width: 100px; height: 100px; border-radius: 50%; background: rgba(255,255,255,.18); border: 2px solid rgba(255,255,255,.5);
    z-index: 4; pointer-events: none; display: grid; place-items: center; }
  #stick i { width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,.8); }
  #spring { position: fixed; right: 18px; bottom: 22px; width: 68px; height: 68px; border-radius: 50%; z-index: 5; font-size: 13px; font-weight: 700;
    background: rgba(255,255,255,.85); border: 0; box-shadow: 0 3px 10px rgba(0,0,0,.3); touch-action: none; }
  .hoek { position: fixed; z-index: 5; }
  #scherm { right: 10px; bottom: 100px; } #vr { right: 10px; bottom: 140px; }
  body.bouwen #scherm { bottom: 14px; right: 10px; }
  body.bouwen.testen #scherm { bottom: 100px; }
</style></head>
<body>
<canvas id="doek"></canvas>
<div id="bouwbalk" class="balk" hidden>
  <button class="knop" id="b-terug" aria-label="Ongedaan maken">↶</button>
  <button class="knop" id="b-vooruit" aria-label="Opnieuw doen">↷</button>
  <button class="knop" id="b-sjabloon">Begin</button>
  <button class="knop" id="b-omgeving">Omgeving</button>
  <button class="knop" id="b-spel">Spelregels</button>
  <button class="knop hoofd" id="b-testen">▶ Testen</button>
  <span class="ruimte"></span>
  <span id="status" class="status"></span>
</div>
<div id="testbalk" class="balk" hidden><button class="knop hoofd" id="t-stop">■ Terug naar bouwen</button></div>
<button class="knop hoofd" id="toevoegen" hidden>+ Toevoegen</button>
<div id="paneel" class="blad" hidden></div>
<div id="catalogus" class="blad" hidden></div>
<div id="instellingen" class="blad" hidden></div>
<div id="hud"></div>
<div id="melding"></div>
<div id="info" hidden></div>
<div id="stick" hidden><i></i></div>
<button id="spring" hidden>Spring</button>
<button class="knop hoek" id="scherm" aria-label="Volledig scherm">⛶</button>
<button class="knop hoek" id="vr" hidden>VR</button>
<div id="vraag" class="overlay" hidden></div>
<div id="begin" class="overlay" hidden></div>
<div id="einde" class="overlay" hidden></div>
<script type="module">
__JS__
</script>
</body></html>"""
