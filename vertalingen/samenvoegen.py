"""Voegt vertaalde delen samen tot vertalingen/<taal>.json. Gebruik: python3 samenvoegen.py en deel0.json deel1.json ...
Een vertaling met een ander aantal {} dan het origineel wordt overgeslagen."""

import json
import sys
from pathlib import Path

hier = Path(__file__).parent
bron = json.loads((hier / "bron.json").read_text())
sjablonen = set(bron["sjablonen"])
code, delen = sys.argv[1], sys.argv[2:]
doel = hier / f"{code}.json"
uit = json.loads(doel.read_text()) if doel.exists() else {"vast": {}, "sjablonen": {}}
fout = 0
for pad in delen:
    for nl, vertaald in json.loads(Path(pad).read_text()).items():
        if not isinstance(vertaald, str) or not vertaald.strip():
            continue
        if nl in sjablonen:
            if nl.count("{}") != vertaald.count("{}"):
                fout += 1
                continue
            uit["sjablonen"][nl] = vertaald
        else:
            uit["vast"][nl] = vertaald
doel.write_text(json.dumps(uit, ensure_ascii=False, indent=0, sort_keys=True))
print(f"{len(uit['vast'])} vast, {len(uit['sjablonen'])} sjablonen, {fout} overgeslagen")
