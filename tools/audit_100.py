#!/usr/bin/env python3
"""Maak een controleerbaar rapport met precies 100 benoemde auditpunten.

Gebruikt de resultaten van planning_controle.py. Voert geen tests, reparaties,
netwerkverkeer of appacties uit. Handmatige punten blijven expliciet open.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]


def maak_rapport(manifest: list, testresultaten: dict, root: Path = ROOT) -> dict:
    if not isinstance(manifest, list) or len(manifest) != 100 or {r["id"] for r in manifest} != set(range(1, 101)):
        raise ValueError("Het auditmanifest moet precies 100 unieke genummerde punten bevatten.")
    if testresultaten.get("formaat") != "assistent-tests" or testresultaten.get("versie") != 1:
        raise ValueError("Onbekend testresultatenformaat.")
    bronnen = testresultaten.get("bronnen", {})
    actueel = bool(bronnen)
    for naam, digest in bronnen.items():
        pad = (root / naam).resolve()
        if not pad.is_relative_to(root.resolve()) or not pad.is_file() or hashlib.sha256(pad.read_bytes()).hexdigest() != digest:
            actueel = False
            break
    regels = []
    for punt in manifest:
        if punt["methode"] == "handmatig":
            status = "open"
            reden = punt["vervolg"]
        elif punt["methode"] == "test":
            status = testresultaten.get("tests", {}).get(punt["bewijs"], "niet_gecontroleerd") if actueel else "niet_gecontroleerd"
            reden = "Broncode veranderd sinds de test of bewijs ontbreekt." if status == "niet_gecontroleerd" else "Status uit de vastgelegde lokale testuitvoering."
        else:
            raise ValueError("Onbekende auditmethode.")
        regels.append({**punt, "status": status, "toelichting": reden})
    return {"formaat": "assistent-audit-100", "versie": 1, "gemaakt_op": datetime.now(timezone.utc).isoformat(),
            "testuitvoering": testresultaten.get("tijd"), "broncode_actueel": actueel,
            "samenvatting": dict(Counter(r["status"] for r in regels)), "punten": regels,
            "scope": "Lokale werk-, planning-, bestands- en herstelonderdelen plus benoemde open controles. Geen certificering van de volledige app of externe diensten. 100 controlepunten betekent niet 100 nieuwe fixes."}


def markdown(r: dict) -> str:
    regels = ["# Controle op 100 verbeterpunten", "", r["scope"], "", "Testuitvoering: " + str(r["testuitvoering"]), "",
              "Uitkomsten: " + ", ".join(f"{k}: {v}" for k, v in sorted(r["samenvatting"].items())), "",
              "| Nr. | Onderdeel | Controlepunt | Uitkomst | Bewijs of vervolgstap |", "| --- | --- | --- | --- | --- |"]
    for p in r["punten"]:
        bewijs = p.get("bewijs") or p.get("vervolg", "")
        regels.append(f"| {p['id']} | {p['categorie']} | {p['punt']} | {p['status']} | {bewijs} |")
    return "\n".join(regels) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resultaten", required=True)
    parser.add_argument("--uitvoer", default="controle/audit_100.json")
    parser.add_argument("--markdown", default="AUDIT_100.md")
    args = parser.parse_args()
    try:
        manifest = json.loads((ROOT / "tools/audit_100.json").read_text())
        testen = json.loads(Path(args.resultaten).read_text())
        r = maak_rapport(manifest, testen)
        for pad, inhoud in ((args.uitvoer, json.dumps(r, ensure_ascii=False, indent=2) + "\n"), (args.markdown, markdown(r))):
            bestand = Path(pad)
            bestand.parent.mkdir(parents=True, exist_ok=True)
            bestand.write_text(inhoud)
    except (ValueError, KeyError, OSError, TypeError) as fout:
        print("Auditrapport kon niet worden gemaakt: " + str(fout), file=sys.stderr)
        return 2
    print(json.dumps(r["samenvatting"], ensure_ascii=False))
    return 0 if all(p["status"] in {"geslaagd", "open"} for p in r["punten"]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
