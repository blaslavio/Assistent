#!/usr/bin/env python3
"""100.000 reproduceerbare integratie- en grenstests zonder echte accountgegevens."""
import argparse
import gzip
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import integratiecontrole
from tools.diepte_controle import controle


def markdown(r):
    regels = [f"# Integratiecontrole: {r['totaal']:,} testgevallen".replace(",", "."), "", r["scope"], "",
              f"Seed: {r['seed']} · uitvoering: {r['tijd']} · duur: {r['duur_seconden']} seconden.", "",
              "Uitkomsten: " + ", ".join(f"{k}: {v}" for k, v in r["samenvatting"].items()), "",
              "| Familie | Geslaagd | Mislukt |", "| --- | --- | --- |"]
    for f in r["families"]:
        regels.append(f"| {f['familie']} | {f.get('geslaagd',0)} | {f.get('mislukt',0)} |")
    regels += ["", "Alle IDs, seeds, hashes en uitkomsten staan in `controle/integratie_100000.json.gz`.", "",
               "De vijf nieuwe werkstroomfamilies controleren dossiers, draagbare bronnen, herstelverwijzingen, bronselectie en zoeken → dossier → sjabloon. De overige vijftien families breiden de bestaande grenscontroles uit met een nieuwe seed en 5000 gevallen per familie.", "",
               "Dit is geen bewijs van 100.000 gevonden fouten of een certificering van alle apponderdelen. Echte opslagconcurrentie en schermen worden apart getest; externe diensten en de eerder benoemde handmatige controles blijven buiten deze synthetische reeks."]
    return "\n".join(regels) + "\n"


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--seed", type=int, default=integratiecontrole.SEED)
    p.add_argument("--per-familie", type=int, default=integratiecontrole.PER_FAMILIE)
    p.add_argument("--familie", choices=integratiecontrole.FAMILIES)
    p.add_argument("--geval", type=int)
    p.add_argument("--uitvoer", type=Path, default=Path("controle/integratie_100000.json.gz"))
    p.add_argument("--markdown", type=Path, default=Path("INTEGRATIECONTROLE_100000.md"))
    args = p.parse_args()
    if args.familie is not None or args.geval is not None:
        if args.familie is None or args.geval is None:
            p.error("Geef familie en geval samen op.")
        print(json.dumps({"familie":args.familie,"geval":args.geval,"input_sha256":integratiecontrole.geval(args.familie,args.geval,args.seed),"status":"geslaagd"}))
        return 0
    r = controle(args.seed, args.per_familie, engine=integratiecontrole)
    r["formaat"] = "assistent-integratiecontrole"
    r["scope"] = "20 families met ieder 5000 reproduceerbare synthetische gevallen bij standaardinstellingen. Controle van werkstromen en grenzen; geen 100.000 gevonden verbeterpunten en geen echte dienstinteracties. Brondata wordt niet gewijzigd."
    args.uitvoer.parent.mkdir(parents=True, exist_ok=True)
    opener = gzip.open if args.uitvoer.suffix == ".gz" else open
    with opener(args.uitvoer, "wt", encoding="utf-8") as f:
        json.dump(r, f, ensure_ascii=False, indent=2)
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.write_text(markdown(r))
    print(json.dumps({"samenvatting":r["samenvatting"],"broncode_actueel":r["broncode_actueel"],"duur_seconden":r["duur_seconden"]}))
    return 1 if r["samenvatting"].get("mislukt") or not r["broncode_actueel"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
