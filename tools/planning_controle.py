#!/usr/bin/env python3
"""Controleer de planningsonderdelen lokaal, vanuit elke werkmap.

Gebruik de project-venv. --database-container verwijst naar een bestaande,
geïsoleerde PostgreSQL-testcontainer; dit script raakt geen productiedatabase aan.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import ast
import os
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
ONDERDELEN = {
    "communicatie": ["test_communicatie"],
    "integratie": ["test_integratie"],
    "verdieping": ["test_verdieping"],
    "interface": ["test_interface", "test_interface_scherm"],
    "werkcontrole": ["test_werkcontrole"],
    "focusplan": ["test_focusplan"],
    "controlegereedschap": ["test_controlegereedschap"],
    "invoer": ["test_intenties"],
    "agenda": ["test_agendacontrole"],
    "dagplan": ["test_dagplan"],
    "herplanning": ["test_herplanning"],
    "bestanden": ["test_bestandsgereedschap"],
    "actielinks": ["test_actielinks"],
    "gebruikersstroom": ["test_gebruikersstroom"],
    "backup": ["test_planning_backup"],
    "bronnen": ["test_werkbronnen"],
    "werkdruk": ["test_taakplanning"],
    "sjablonen": ["test_sjablonen"],
    "activiteiten": ["test_actieoverzicht"],
    "opslag": ["test_veilige_opslag"],
}
BRONNEN = ["gegevenscontrole.py", "werkzoeken.py", "werkcontrole_scherm.py", "focusplan.py", "planning_backup.py", "planning_backup_scherm.py", "werkbronnen.py", "werkbronnen_scherm.py", "taakvolgorde.py", "capaciteit.py", "taakplanning_scherm.py", "sjablonen.py", "sjablonen_scherm.py", "actieoverzicht.py", "actieoverzicht_scherm.py", "app.py", "opslag.py", "intenties.py", "universal_os.py", "agendacontrole.py",
           "dagplan.py", "dagplan_scherm.py", "herplanning.py", "inplannen.py", "snelinvoer.py",
           "bestandsgereedschap.py", "bestandsgereedschap_scherm.py", "actielinks.py", "actielinks_scherm.py"]


class Testresultaat(unittest.TextTestResult):
    """Bewaar alleen test-IDs en status; geen testgegevens of tracebacks in JSON."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.details = {}

    def startTest(self, test):
        self.details[test.id()] = "onvolledig"
        super().startTest(test)

    def addSuccess(self, test):
        self.details[test.id()] = "geslaagd"
        super().addSuccess(test)

    def addFailure(self, test, err):
        self.details[test.id()] = "mislukt"
        super().addFailure(test, err)

    def addError(self, test, err):
        self.details[test.id()] = "mislukt"
        super().addError(test, err)

    def addSkip(self, test, reason):
        self.details[test.id()] = "overgeslagen"
        super().addSkip(test, reason)

    def addSubTest(self, test, subtest, err):
        if err is not None:
            self.details[test.id()] = "mislukt"
        super().addSubTest(test, subtest, err)

    def addExpectedFailure(self, test, err):
        self.details[test.id()] = "verwacht_mislukt"
        super().addExpectedFailure(test, err)

    def addUnexpectedSuccess(self, test):
        self.details[test.id()] = "mislukt"
        super().addUnexpectedSuccess(test)


def bronbestanden() -> list[str]:
    r = subprocess.run(["rg", "--files", "-g", "*.py", "-g", "!attachments/**"], cwd=ROOT, capture_output=True, text=True, check=True)
    return sorted(r.stdout.splitlines())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--onderdeel", choices=["alles", *ONDERDELEN], default="alles")
    parser.add_argument("--database-container", help="Naam van een geïsoleerde PostgreSQL-testcontainer")
    parser.add_argument("--rapport-json", help="Bewaar teststatus en bronvingerafdrukken, zonder testinhoud")
    args = parser.parse_args()
    os.chdir(ROOT)
    sys.path.insert(0, str(ROOT))
    if args.database_container:
        os.environ["ASSISTENT_TEST_POSTGRES_CONTAINER"] = args.database_container
    bronnen = bronbestanden()
    for naam in bronnen:
        ast.parse((ROOT / naam).read_text(), filename=naam)
    print(f"Syntax van {len(bronnen)} Python-bestanden gecontroleerd.", flush=True)
    vingerafdrukken = {naam: hashlib.sha256((ROOT / naam).read_bytes()).hexdigest() for naam in bronnen}
    manifest = ROOT / "tools/audit_100.json"
    if manifest.exists():
        vingerafdrukken["tools/audit_100.json"] = hashlib.sha256(manifest.read_bytes()).hexdigest()
    diff = subprocess.run(["git", "diff", "--check"], cwd=ROOT)
    if diff.returncode:
        return diff.returncode
    onderdelen = ONDERDELEN if args.onderdeel == "alles" else {args.onderdeel: ONDERDELEN[args.onderdeel]}
    mislukt = False
    totaal = overgeslagen = 0
    details = {}
    for naam, modules in onderdelen.items():
        print(f"\nOnderdeel: {naam}", flush=True)
        suite = unittest.defaultTestLoader.loadTestsFromNames(modules)
        resultaat = unittest.TextTestRunner(verbosity=2, resultclass=Testresultaat).run(suite)
        details.update(resultaat.details)
        totaal += resultaat.testsRun
        overgeslagen += len(resultaat.skipped)
        mislukt |= not resultaat.wasSuccessful()
    print(f"\n{totaal} tests behandeld; {overgeslagen} overgeslagen.", flush=True)
    if overgeslagen:
        print("Overgeslagen controles zijn niet geverifieerd; zie per test de reden, bijvoorbeeld ontbrekende PostgreSQL of FFmpeg.", flush=True)
    if args.rapport_json:
        rapport = {"formaat": "assistent-tests", "versie": 1, "tijd": datetime.now(timezone.utc).isoformat(),
                   "totaal": totaal, "overgeslagen": overgeslagen, "geslaagd": not mislukt,
                   "bronnen": vingerafdrukken, "tests": details}
        pad = Path(args.rapport_json)
        pad.parent.mkdir(parents=True, exist_ok=True)
        pad.write_text(json.dumps(rapport, ensure_ascii=False, indent=2) + "\n")
    return 1 if mislukt else 0


if __name__ == "__main__":
    raise SystemExit(main())
