#!/usr/bin/env python3
"""Controleer een expliciet lokaal JSON-bestand zonder het te wijzigen.

Uitvoer bevat probleemcodes en numerieke recordverwijzingen, geen titels,
notities, accountinstellingen of inhoud van het invoerbestand.
"""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import gegevenscontrole


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bestand", type=Path)
    parser.add_argument("--uitvoer", type=Path)
    args = parser.parse_args()
    try:
        if args.bestand.stat().st_size > 20_000_000:
            raise ValueError("Het bestand is groter dan 20 MB.")
        with args.bestand.open(encoding="utf-8") as f:
            def uniek(paren):
                r = {}
                for k, v in paren:
                    if k in r:
                        raise ValueError("Dubbel JSON-veld")
                    r[k] = v
                return r
            def eindig(_):
                raise ValueError("Niet-eindig getal")
            gegevens = json.load(f, object_pairs_hook=uniek, parse_constant=eindig)
        r = gegevenscontrole.controleer(gegevens)
    except (ValueError, OSError, RecursionError, UnicodeError):
        print("Invoer is onleesbaar of te groot; het bestand is niet gewijzigd.", file=sys.stderr)
        return 2
    tekst = json.dumps(r, ensure_ascii=False, indent=2) + "\n"
    if args.uitvoer:
        if args.uitvoer.resolve() == args.bestand.resolve() or (args.uitvoer.exists() and args.uitvoer.samefile(args.bestand)):
            print("Kies een ander uitvoerbestand; de invoer wordt nooit overschreven.", file=sys.stderr)
            return 2
        args.uitvoer.parent.mkdir(parents=True, exist_ok=True)
        args.uitvoer.write_text(tekst)
    else:
        print(tekst, end="")
    return 1 if not r["volledig"] or r["samenvatting"].get("fout") else 0


if __name__ == "__main__":
    raise SystemExit(main())
