"""Verzamelt alle Nederlandse teksten uit de app, zodat ze vertaald kunnen worden (zie taal.py).

Gebruik: python3 vertalingen/verzamelen.py  -> schrijft vertalingen/bron.json
Vaste teksten komen er letterlijk in; teksten met variabelen (f-strings) als sjabloon met {}.
"""

import ast
import json
import re
from pathlib import Path

MAP = Path(__file__).parent.parent
OVERSLAAN = {"agent.py", "slim.py", "taal.py"}  # teksten voor Claude of de database
WOORD = re.compile(r"[A-Za-zÀ-ÿ]{2,}")


def tekstachtig(s: str) -> bool:
    if not WOORD.search(s) or len(s) > 600 or s.startswith(("http", ":material/", "#", ".", "<style", "select ", "<")):
        return False
    if re.fullmatch(r"[a-z0-9_./-]+", s):  # sleutels en bestandsnamen
        return False
    return " " in s or s[:1].isupper() or not s[:1].isascii()


def sjabloon(n: ast.JoinedStr) -> str | None:
    delen = []
    for d in n.values:
        if isinstance(d, ast.Constant):
            delen.append(d.value.replace("{", "{{").replace("}", "}}"))
        else:
            delen.append("{}")
    s = "".join(delen)
    letterlijk = s.replace("{}", "")
    return s if len(WOORD.findall(letterlijk)) >= 1 and tekstachtig(letterlijk.strip() or "x") else None


def main() -> None:
    vast, sjablonen = set(), set()
    for bestand in sorted(MAP.glob("*.py")):
        if bestand.name in OVERSLAAN or bestand.name.startswith(("nep_", "test")):
            continue
        boom = ast.parse(bestand.read_text())
        docstrings = {id(n.body[0].value) for n in ast.walk(boom)
                      if isinstance(n, (ast.FunctionDef, ast.ClassDef, ast.Module, ast.AsyncFunctionDef))
                      and n.body and isinstance(n.body[0], ast.Expr) and isinstance(n.body[0].value, ast.Constant)}
        binnen_fstring = {id(c) for n in ast.walk(boom) if isinstance(n, ast.JoinedStr) for c in n.values}
        for n in ast.walk(boom):
            if isinstance(n, ast.Constant) and isinstance(n.value, str) and id(n) not in docstrings \
                    and id(n) not in binnen_fstring and tekstachtig(n.value):
                vast.add(n.value)
            elif isinstance(n, ast.JoinedStr) and (s := sjabloon(n)):
                sjablonen.add(s)
    uit = {"vast": sorted(vast), "sjablonen": sorted(sjablonen)}
    (Path(__file__).parent / "bron.json").write_text(json.dumps(uit, ensure_ascii=False, indent=0))
    print(len(vast), "vaste teksten,", len(sjablonen), "sjablonen")


if __name__ == "__main__":
    main()
