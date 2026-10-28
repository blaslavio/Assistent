"""Account-scoped resource bookings with overlap validation."""
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from uuid import uuid4
import opslag

KEY = "resource_bookings"
RESOURCE_KEY = "resource_catalog"
KINDS = ("Zaal", "Werkplek", "Kappersstoel", "Materiaal", "Sportveld", "Overig")


def _instant(moment):
    if not isinstance(moment, datetime):
        raise ValueError("Kies een geldig tijdstip.")
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=ZoneInfo("Europe/Amsterdam"))
    return moment.astimezone(timezone.utc)

def _read(key):
    value = opslag.laden().get(key, [])
    return value if isinstance(value, list) else []

def resources():
    return _read(RESOURCE_KEY)

def bookings():
    return _read(KEY)

def add_resource(name, kind):
    name = name.strip()
    if not 1 <= len(name) <= 100 or kind not in KINDS:
        raise ValueError("Vul een geldige naam en soort in.")
    with opslag._slot:
        data = opslag.laden()
        records = data.get(RESOURCE_KEY, [])
        if any(r.get("name", "").casefold() == name.casefold() for r in records):
            raise ValueError("Deze voorziening bestaat al.")
        item = {"id": uuid4().hex, "name": name, "kind": kind}
        data[RESOURCE_KEY] = [*records, item]
        opslag.opslaan(data)
    return item

def create_booking(resource_id, start, end, description):
    begin, einde = _instant(start), _instant(end)
    if einde <= begin:
        raise ValueError("Eindtijd moet na de begintijd liggen.")
    if einde - begin > timedelta(days=30):
        raise ValueError("Reserveringen mogen maximaal 30 dagen duren.")
    description = description.strip()
    if len(description) > 200:
        raise ValueError("Omschrijving is te lang.")
    with opslag._slot:
        data = opslag.laden()
        if not any(r.get("id") == resource_id for r in data.get(RESOURCE_KEY, [])):
            raise ValueError("Onbekende voorziening.")
        for b in data.get(KEY, []):
            if b.get("resource_id") != resource_id or b.get("status") == "geannuleerd":
                continue
            if begin < _instant(datetime.fromisoformat(b["end"])) and einde > _instant(datetime.fromisoformat(b["start"])):
                raise ValueError("Deze voorziening is al gereserveerd in dit tijdvak.")
        item = {"id": uuid4().hex, "resource_id": resource_id,
                "start": start.isoformat(), "end": end.isoformat(),
                "description": description, "status": "bevestigd",
                "created_at": datetime.now(timezone.utc).isoformat()}
        data[KEY] = [*data.get(KEY, []), item]
        opslag.opslaan(data)
    return item

def cancel_booking(booking_id):
    with opslag._slot:
        data = opslag.laden()
        for item in data.get(KEY, []):
            if item.get("id") == booking_id:
                item["status"] = "geannuleerd"
                opslag.opslaan(data)
                return True
    return False
