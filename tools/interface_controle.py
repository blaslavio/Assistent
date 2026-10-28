#!/usr/bin/env python3
"""Rapporteer 1000 concrete configuratiescenario’s plus de tooldekking per map.

Leest bewijs uit één testuitvoering en een afzonderlijke lokale browsercontrole.
Telt nooit testscenario’s als duizend gevonden of opgeloste fouten.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import gereedschappen
from test_interface import SCENARIOS, context, VOORKEUREN


def actueel(bronnen, root=ROOT):
    if not isinstance(bronnen, dict) or not bronnen:
        return False
    for naam, digest in bronnen.items():
        pad = (root / naam).resolve()
        if not pad.is_relative_to(root.resolve()) or not pad.is_file() or hashlib.sha256(pad.read_bytes()).hexdigest() != digest:
            return False
    return True


def maak_rapport(testen, browser=None, root=ROOT):
    if testen.get("formaat") != "assistent-tests" or testen.get("versie") != 1:
        raise ValueError("Gebruik het JSON-rapport van planning_controle.py.")
    huidig = actueel(testen.get("bronnen"), root)
    punten = []
    for s in SCENARIOS:
        status = testen.get("tests", {}).get(s["test"], "niet_gecontroleerd") if huidig else "niet_gecontroleerd"
        punten.append({**s, "status": status})
    if len(punten) != 1000 or len({s["test"] for s in punten}) != 1000:
        raise ValueError("De matrix moet precies 1000 verschillende scenario’s bevatten.")
    lokaal, _, _ = context(False, (), "particulier", VOORKEUREN[0])
    online, _, _ = context(True, (), "ondernemer", VOORKEUREN[0])
    browser_ok = bool(browser and browser.get("formaat") == "assistent-browsercontrole" and browser.get("broncode_actueel")
                      and actueel(browser.get("bronnen"), root) and {"desktop-instellingen", "mobiel-instellingen", "mobiel-gereedschappen"} <= {s.get("scenario") for s in browser.get("scenarios", [])}
                      and all(s.get("geslaagd") is True for s in browser["scenarios"]))
    return {"formaat": "assistent-interface-1000", "versie": 1, "tijd": datetime.now(timezone.utc).isoformat(),
            "testuitvoering": testen.get("tijd"), "broncode_actueel": huidig,
            "samenvatting": dict(Counter(p["status"] for p in punten)), "punten": punten,
            "lokale_mapdekking": gereedschappen.dekking(gereedschappen.catalogus(False), lokaal),
            "online_mapdekking": gereedschappen.dekking(gereedschappen.catalogus(True, niveau="ondernemer"), online),
            "browser_gecontroleerd": browser_ok, "browser_scenarios": browser.get("scenarios", []) if browser else [],
            "scope": "1000 configuratiescenario’s: 2 modi × 4 accounttypen × 25 keuzes van uitgeschakelde onderdelen × 5 voorkeuren. Controleert de echte navigatiefunctie met afgeschermde paginacallbacks, niet alle backendinhoud. Geen 1000 gevonden fouten of 1000 nieuwe fixes."}


def markdown(r):
    regels = ["# Nieuwe interface: 1000 configuratiescenario’s", "", r["scope"], "",
              "Testuitvoering: " + str(r["testuitvoering"]), "",
              "Uitkomsten: " + ", ".join(f"{k}: {v}" for k, v in r["samenvatting"].items()), "",
              "Lokale Chromium-controle actueel en geslaagd: " + ("ja" if r["browser_gecontroleerd"] else "niet aangetoond"), "",
              "## Tooldekking per map in lokale modus", "",
              "| Map | Eigen tools in catalogus | Nu te openen | Gedeelde hulpmiddelen |", "| --- | --- | --- | --- |"]
    for m in r["lokale_mapdekking"]:
        regels.append(f"| {m['map']} | {m['eigen_tools']} | {m['beschikbaar']} | {', '.join(m['gedeeld'])} |")
    regels += ["", "## De 1000 scenario’s", "",
               "Elke rij controleert routes, groepsvolgorde, favorieten, unieke en bekende URLs, rol- en modulegrenzen, tellers en toegankelijke callbackregistratie.", "",
               "| Nr. | Modus | Accounttype | Uitgeschakeld | Voorkeurvariant | Uitkomst |", "| --- | --- | --- | --- | --- | --- |"]
    for p in r["punten"]:
        regels.append(f"| {p['nummer']} | {'online' if p['online'] else 'lokaal'} | {p['rol']} | {', '.join(p['uit']) or 'geen'} | {p['voorkeur']} | {p['status']} |")
    regels += ["", "## Grenzen", "", "Browsercontrole: Chromium bij 1440×1000 en 390×844, in een aparte lokale preview met testgegevens. Controleert desktopinstellingen, mobiele instellingen, het mobiele tooloverzicht, zoeken naar een werkdossier en de communicatie- en privacyschermen. Externe pagina-inhoud, echte login, Safari, Android-apparaten en een volledige schermlezer-audit zijn niet uitgevoerd. Zie AUDIT_100.md voor open dienstcontroles."]
    return "\n".join(regels) + "\n"


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--resultaten", required=True, type=Path)
    p.add_argument("--browser", type=Path)
    p.add_argument("--uitvoer", type=Path, default=Path("controle/interface_1000.json"))
    p.add_argument("--markdown", type=Path, default=Path("INTERFACE_CONTROLE_1000.md"))
    args = p.parse_args()
    testen = json.loads(args.resultaten.read_text())
    browser = json.loads(args.browser.read_text()) if args.browser else None
    r = maak_rapport(testen, browser)
    for pad, tekst in ((args.uitvoer, json.dumps(r, ensure_ascii=False, indent=2) + "\n"), (args.markdown, markdown(r))):
        pad.parent.mkdir(parents=True, exist_ok=True)
        pad.write_text(tekst)
    print(json.dumps({"matrix": r["samenvatting"], "browser": r["browser_gecontroleerd"]}, ensure_ascii=False))
    return 0 if r["samenvatting"] == {"geslaagd": 1000} and (args.browser is None or r["browser_gecontroleerd"]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
