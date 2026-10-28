"""Zet de voorwaarden en privacyverklaring uit teksten.py (de huidige app) in web/src/lib/teksten.ts.

Draai dit na een wijziging in teksten.py: python3 web/teksten.py
"""

import json
import sys
from pathlib import Path

HIER = Path(__file__).parent
sys.path.insert(0, str(HIER.parent))
import teksten  # noqa: E402

(HIER / "src/lib/teksten.ts").write_text(
    "// Gemaakt door web/teksten.py uit teksten.py, zodat beide apps dezelfde voorwaarden en privacyverklaring tonen.\n"
    f"export const VOORWAARDEN = {json.dumps(teksten.voorwaarden().strip(), ensure_ascii=False)};\n"
    f"export const PRIVACY = {json.dumps(teksten.privacy().strip(), ensure_ascii=False)};\n",
    encoding="utf-8")
