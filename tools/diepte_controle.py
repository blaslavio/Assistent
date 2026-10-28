#!/usr/bin/env python3
"""Voer 30.000 reproduceerbare lokale invariantcontroles uit zonder appgegevens.

Testgevallen zijn geen aangetoonde verbeterpunten. Fouten worden per familie en
geval vastgelegd zonder ruwe invoer, geheimen of tracebackinhoud in het rapport.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import dieptecontrole


def bronhashes():
    r = subprocess.run(["rg", "--files", "-g", "*.py", "-g", "!attachments/**"], cwd=ROOT, capture_output=True, text=True, check=True)
    return {naam: hashlib.sha256((ROOT / naam).read_bytes()).hexdigest() for naam in sorted(r.stdout.splitlines())}


def controle(seed=dieptecontrole.SEED, per_familie=dieptecontrole.PER_FAMILIE, engine=None):
    engine = dieptecontrole if engine is None else engine
    if type(per_familie) is not int or not 1 <= per_familie <= engine.PER_FAMILIE:
        raise ValueError("Gebruik 1 tot 2000 gevallen per familie.")
    bronnen = bronhashes()
    gestart = time.perf_counter()
    gevallen, groepen = [], []
    for familie in engine.FAMILIES:
        familie_resultaten = []
        for n in range(per_familie):
            rij = {"id": f"{familie}:{n:04d}", "familie": familie, "nummer": n, "seed": seed}
            try:
                rij["input_sha256"] = engine.geval(familie, n, seed)
                rij["status"] = "geslaagd"
            except Exception as fout:
                rij["status"] = "mislukt"
                rij["foutsoort"] = type(fout).__name__
                # Alleen vaste assertioncodes bewaren, geen repr van invoer of extern bericht.
                if isinstance(fout, AssertionError) and len(fout.args) == 1 and str(fout.args[0]).replace("_", "").isalnum():
                    rij["code"] = str(fout.args[0])
            familie_resultaten.append(rij)
        gevallen.extend(familie_resultaten)
        groepen.append({"familie": familie, **dict(Counter(r["status"] for r in familie_resultaten))})
    return {"formaat": "assistent-dieptecontrole", "versie": 1, "tijd": datetime.now(timezone.utc).isoformat(),
            "seed": seed, "totaal": len(gevallen), "duur_seconden": round(time.perf_counter() - gestart, 3),
            "samenvatting": dict(Counter(r["status"] for r in gevallen)), "families": groepen, "gevallen": gevallen,
            "bronnen": bronnen, "broncode_actueel": bronnen == bronhashes(),
            "scope": "Synthetische grens- en invariantcontroles op 15 afgebakende families. Geen 30.000 gevonden fouten; geen bewijs dat de volledige app of externe diensten foutloos zijn."}


def markdown(r):
    regels = [f"# Diepgaande controle met {r['totaal']:,} testgevallen".replace(",", "."), "", r["scope"], "",
              f"Uitvoering: {r['tijd']} · seed {r['seed']} · {r['totaal']} gevallen · {r['duur_seconden']} seconden.", "",
              "Uitkomsten: " + ", ".join(f"{k}: {v}" for k, v in r["samenvatting"].items()), "",
              "| Familie | Geslaagd | Mislukt |", "| --- | --- | --- |"]
    for f in r["families"]:
        regels.append(f"| {f['familie']} | {f.get('geslaagd',0)} | {f.get('mislukt',0)} |")
    regels += ["", "Alle individuele IDs, seeds, invoervingerafdrukken en uitkomsten staan in `controle/diepte_30000.json`.", "",
               "Herhaal één geval met `.venv/bin/python tools/diepte_controle.py --familie NAAM --geval NUMMER`.", "",
               "Deze reeks vervangt geen regressietests, echte diensttests, dependency-advisoryscan, prestatietest met productiegegevens of handmatige toegankelijkheidsaudit."]
    return "\n".join(regels) + "\n"


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--seed", type=int, default=dieptecontrole.SEED)
    p.add_argument("--per-familie", type=int, default=dieptecontrole.PER_FAMILIE)
    p.add_argument("--familie", choices=dieptecontrole.FAMILIES)
    p.add_argument("--geval", type=int)
    p.add_argument("--uitvoer", type=Path, default=Path("controle/diepte_30000.json"))
    p.add_argument("--markdown", type=Path, default=Path("DIEPTECONTROLE_30000.md"))
    args = p.parse_args()
    if args.familie is not None or args.geval is not None:
        if args.familie is None or args.geval is None:
            p.error("Geef --familie en --geval samen op.")
        print(json.dumps({"familie": args.familie, "geval": args.geval, "input_sha256": dieptecontrole.geval(args.familie, args.geval, args.seed), "status": "geslaagd"}))
        return 0
    r = controle(args.seed, args.per_familie)
    for pad, tekst in ((args.uitvoer, json.dumps(r, ensure_ascii=False, indent=2) + "\n"), (args.markdown, markdown(r))):
        pad.parent.mkdir(parents=True, exist_ok=True)
        pad.write_text(tekst)
    print(json.dumps({"samenvatting": r["samenvatting"], "broncode_actueel": r["broncode_actueel"], "duur_seconden": r["duur_seconden"]}))
    return 0 if not r["samenvatting"].get("mislukt") and r["broncode_actueel"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
