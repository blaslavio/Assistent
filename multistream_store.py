"""Account-bound private drafts with explicit profile separation."""
from datetime import datetime, timezone
from uuid import uuid4
import opslag
import multistream_core

KEY = "master_stream_drafts"
PROFILES = ("Privé", "Zakelijk", "Community")

def _profile(value):
    if value not in PROFILES:
        raise ValueError("Onbekend privacyprofiel.")
    return value

def list_drafts(profile="Privé"):
    _profile(profile)
    records = opslag.laden().get(KEY, [])
    if not isinstance(records, list):
        return []
    return [item for item in records if isinstance(item, dict)
            and item.get("profile", "Privé") == profile]

def add_draft(text, profile="Privé"):
    _profile(profile)
    draft = multistream_core.make_draft(text)
    item = {"id": uuid4().hex, "category": draft.category,
            "text": draft.text, "status": "concept", "profile": profile,
            "created_at": datetime.now(timezone.utc).isoformat()}
    with opslag._slot:
        data = opslag.laden()
        records = data.get(KEY, [])
        if not isinstance(records, list):
            records = []
        data[KEY] = [item] + records[:199]
        opslag.opslaan(data)
    return item

def delete_draft(draft_id, profile="Privé"):
    _profile(profile)
    with opslag._slot:
        data = opslag.laden()
        records = data.get(KEY, [])
        if not isinstance(records, list):
            return False
        remaining = [item for item in records if not (
            isinstance(item, dict) and item.get("id") == draft_id
            and item.get("profile", "Privé") == profile)]
        if len(remaining) == len(records):
            return False
        data[KEY] = remaining
        opslag.opslaan(data)
    return True
