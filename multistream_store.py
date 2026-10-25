"""Account-scoped persistence for private Multi-Stream drafts.

Uses the existing authenticated opslag.laden/opslaan RPC, not a separate public table.
"""
from datetime import datetime, timezone
from uuid import uuid4
import opslag
import multistream_core

KEY = "master_stream_drafts"

def list_drafts() -> list[dict]:
    data = opslag.laden()
    records = data.get(KEY, [])
    return records if isinstance(records, list) else []

def add_draft(text: str) -> dict:
    draft = multistream_core.make_draft(text)
    item = {"id": uuid4().hex, "category": draft.category,
            "text": draft.text, "status": "concept",
            "created_at": datetime.now(timezone.utc).isoformat()}
    with opslag._slot:
        data = opslag.laden()
        records = data.get(KEY, [])
        if not isinstance(records, list):
            records = []
        data[KEY] = [item, *records][:200]
        opslag.opslaan(data)
    return item

def delete_draft(draft_id: str) -> bool:
    with opslag._slot:
        data = opslag.laden()
        records = data.get(KEY, [])
        if not isinstance(records, list):
            return False
        remaining = [item for item in records if item.get("id") != draft_id]
        if len(remaining) == len(records):
            return False
        data[KEY] = remaining
        opslag.opslaan(data)
    return True
