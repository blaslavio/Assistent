#!/usr/bin/env python3
"""Maak een statische bronkaart met concrete beoordelingslocaties, zonder code uit te voeren.

Signalen zijn reviewkandidaten, geen automatisch bewezen fouten. Exporteert geen
bronregels, stringwaarden, accountinhoud of geheimen en voert geen reparaties uit.
"""
import argparse
import ast
from collections import Counter
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import shutil
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def beoordeel(tekst, naam):
    boom = ast.parse(tekst, filename=naam)
    signalen = []
    functies = 0
    for n in ast.walk(boom):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
            functies += 1
            lengte = n.end_lineno - n.lineno + 1
            if lengte > 150:
                signalen.append({"code": "groot_functieblok", "regel": n.lineno, "functie": n.name, "lengte": lengte})
        elif isinstance(n, ast.ExceptHandler):
            if n.type is None or (isinstance(n.type, ast.Name) and n.type.id in {"Exception", "BaseException"}):
                signalen.append({"code": "brede_exceptie", "regel": n.lineno})
        elif isinstance(n, ast.Call):
            if isinstance(n.func, ast.Name) and n.func.id in {"eval", "exec"}:
                signalen.append({"code": "dynamische_code_beoordelen", "regel": n.lineno})
            for kw in n.keywords:
                if isinstance(kw.value, ast.Constant) and ((kw.arg == "shell" and kw.value.value is True) or (kw.arg == "verify" and kw.value.value is False)):
                    signalen.append({"code": "proces_of_tls_instelling_beoordelen", "regel": n.lineno})
    return {"bestand": naam, "regels": len(tekst.splitlines()), "functies": functies,
            "sha256": hashlib.sha256(tekst.encode()).hexdigest(), "signalen": signalen}


def controle():
    p = subprocess.run(["rg", "--files", "-g", "*.py", "-g", "!attachments/**"], cwd=ROOT, text=True, capture_output=True, check=True)
    bestanden = []
    for naam in sorted(p.stdout.splitlines()):
        try:
            r = beoordeel((ROOT / naam).read_text(), naam)
            r["syntax"] = "geldig"
        except SyntaxError as fout:
            r = {"bestand": naam, "syntax": "ongeldig", "regel": fout.lineno, "signalen": []}
        bestanden.append(r)
    return {"formaat": "assistent-bronreview", "tijd": datetime.now(timezone.utc).isoformat(), "bestanden": bestanden,
            "aantal_bestanden": len(bestanden), "signalen": dict(Counter(s["code"] for b in bestanden for s in b["signalen"])),
            "scope": "Statische Python-bronbeoordeling. Lange functies, brede uitzonderingen en dynamische code vragen context; zijn niet automatisch bugs of beveiligingslekken. Geen runtime- of dienstgarantie."}


class Scripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.actief = False
        self.buffer = []
        self.scripts = []

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            a = dict(attrs)
            self.actief = "src" not in a and a.get("type", "").lower() in {"", "module", "text/javascript", "application/javascript"}
            self.buffer = []

    def handle_data(self, data):
        if self.actief:
            self.buffer.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.actief:
            self.scripts.append("".join(self.buffer))
            self.actief = False


def javascript_controle():
    node = shutil.which("node")
    p = subprocess.run(["rg", "--files", "-g", "*.js", "-g", "*.html", "-g", "!attachments/**"], cwd=ROOT, text=True, capture_output=True, check=True)
    resultaten = []
    for naam in sorted(p.stdout.splitlines()):
        tekst = (ROOT / naam).read_text()
        if naam.endswith(".html"):
            parser = Scripts()
            parser.feed(tekst)
            scripts = [(naam + f"#inline-{i}", t) for i, t in enumerate(parser.scripts, 1)]
        else:
            scripts = [(naam, tekst)]
        for label, script in scripts:
            if node is None:
                status = "niet_gecontroleerd"
            else:
                try:
                    r = subprocess.run([node, "--input-type=module", "--check"], input=script, text=True, capture_output=True, timeout=10)
                    status = "geldig" if r.returncode == 0 else "ongeldig"
                except subprocess.TimeoutExpired:
                    status = "niet_gecontroleerd"
            resultaten.append({"bestand": label, "syntax": status, "sha256": hashlib.sha256(script.encode()).hexdigest()})
    return resultaten


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--uitvoer", type=Path, default=Path("controle/bron_review.json"))
    args = p.parse_args()
    r = controle()
    r["javascript"] = javascript_controle()
    args.uitvoer.parent.mkdir(parents=True, exist_ok=True)
    args.uitvoer.write_text(json.dumps(r, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"bestanden":r["aantal_bestanden"],"signalen":r["signalen"], "javascript": dict(Counter(j["syntax"] for j in r["javascript"]))}))
    return 1 if any(b["syntax"] != "geldig" for b in [*r["bestanden"], *r["javascript"]]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
