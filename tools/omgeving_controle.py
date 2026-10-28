#!/usr/bin/env python3
"""Controleer lokale pakketten en videogereedschap, zonder netwerk of geheimen."""
import argparse
from importlib import metadata
import json
import re
from pathlib import Path
import shutil
import sys
from packaging.requirements import InvalidRequirement, Requirement
from packaging.version import InvalidVersion, Version


def pakketconflicten(distributies=None):
    distributies = list(metadata.distributions() if distributies is None else distributies)
    def naam(d):
        return re.sub(r"[-_.]+", "-", str(d.metadata["Name"]).lower())
    versies = {naam(d): d.version for d in distributies}
    fouten = []
    for d in distributies:
        for tekst in d.requires or []:
            try:
                r = Requirement(tekst)
                if r.marker and not r.marker.evaluate({"extra": ""}):
                    continue
                vereist = re.sub(r"[-_.]+", "-", r.name.lower())
                if vereist not in versies:
                    fouten.append({"pakket": naam(d), "vereist": vereist, "probleem": "ontbreekt"})
                elif r.specifier and Version(versies[vereist]) not in r.specifier:
                    fouten.append({"pakket": naam(d), "vereist": vereist, "probleem": "versieconflict"})
            except (InvalidRequirement, InvalidVersion):
                fouten.append({"pakket": naam(d), "probleem": "ongeldige_metadata"})
    return fouten


def rapport():
    versies = {}
    for naam in ("streamlit", "anthropic", "httpx", "pillow", "pypdf"):
        try:
            versies[naam] = metadata.version(naam)
        except metadata.PackageNotFoundError:
            versies[naam] = None
    return {"formaat": "assistent-omgeving", "versie": 1, "python": ".".join(map(str, sys.version_info[:3])),
            "pakketten": versies, "pakketconflicten": pakketconflicten(),
            "ffmpeg_beschikbaar": bool(shutil.which("ffmpeg")), "ffprobe_beschikbaar": bool(shutil.which("ffprobe")),
            "beperking": "Alleen lokale installatieconsistentie. Geen CVE-database, netwerk, accounts, tokens of externe diensten gecontroleerd."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--uitvoer", type=Path)
    args = parser.parse_args()
    r = rapport()
    tekst = json.dumps(r, ensure_ascii=False, indent=2) + "\n"
    if args.uitvoer:
        args.uitvoer.parent.mkdir(parents=True, exist_ok=True)
        args.uitvoer.write_text(tekst)
    else:
        print(tekst, end="")
    return 1 if r["pakketconflicten"] or any(v is None for v in r["pakketten"].values()) else 0


if __name__ == "__main__":
    raise SystemExit(main())
