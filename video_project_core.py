"""Private video project planning with timestamped review notes."""
from datetime import datetime, timezone
from uuid import uuid4
import opslag

KEY = "video_projects"

def projects():
    records = opslag.laden().get(KEY, [])
    return records if isinstance(records, list) else []

def create_project(title):
    title = title.strip()
    if not 1 <= len(title) <= 120:
        raise ValueError("Projectnaam moet 1 tot 120 tekens bevatten.")
    with opslag._slot:
        data = opslag.laden()
        item = {"id": uuid4().hex, "title": title, "status": "concept",
                "version": 1, "notes": [],
                "created_at": datetime.now(timezone.utc).isoformat()}
        data[KEY] = [item] + data.get(KEY, [])
        opslag.opslaan(data)
    return item

def add_note(project_id, seconds, text):
    text = text.strip()
    if not 1 <= len(text) <= 500 or not 0 <= seconds <= 86400:
        raise ValueError("Controleer tijdcode en opmerking.")
    with opslag._slot:
        data = opslag.laden()
        project = next((p for p in data.get(KEY, []) if p.get("id") == project_id), None)
        if project is None:
            raise ValueError("Project niet gevonden.")
        project.setdefault("notes", []).append({"id": uuid4().hex,
            "seconds": seconds, "text": text,
            "created_at": datetime.now(timezone.utc).isoformat()})
        opslag.opslaan(data)

def set_status(project_id, status):
    if status not in ("concept", "in bewerking", "ter review", "afgerond"):
        raise ValueError("Ongeldige status.")
    with opslag._slot:
        data = opslag.laden()
        project = next((p for p in data.get(KEY, []) if p.get("id") == project_id), None)
        if project is None:
            raise ValueError("Project niet gevonden.")
        project["status"] = status
        opslag.opslaan(data)
