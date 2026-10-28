"""Maak een volledige herstelset vóór schrijven; gebruikt geen opslag of diensten."""
import copy
from datetime import datetime, timezone
import re
import uuid
import planning_backup


def maak(huidig, backup, maak_id=None, moment=None):
    versie = backup.get("versie")
    nieuw = planning_backup.valideer(backup.get("gegevens"), versie)
    if len(huidig.get("sjablonen", {})) + len(nieuw["sjablonen"]) > 100:
        raise ValueError("Herstel zou het maximum van 100 sjablonen overschrijden.")
    if nieuw.get("werkbronnen") and len(huidig.get("werkbronnen", {})) + len(nieuw["werkbronnen"]) > 1000:
        raise ValueError("Herstel zou het maximum van 1000 bronkoppelingen overschrijden.")
    teller = huidig.get("volgend_id", 1)
    if type(teller) is not int or teller < 1:
        raise ValueError("Herstel eerst de ongeldige ID-teller via gegevensbeheer.")
    bestaand = [r["id"] for key in ("taken", "afspraken") for r in huidig.get(key, []) if isinstance(r, dict) and type(r.get("id")) is int]
    teller = max(teller, max(bestaand, default=0) + 1)
    nieuw_aantal = len(nieuw["taken"]) + len(nieuw["afspraken"])
    if nieuw_aantal and teller + nieuw_aantal - 1 > 2**53:
        raise ValueError("Er zijn geen veilig overdraagbare record-IDs meer beschikbaar.")
    gebruikt = set(huidig.get("sjablonen", {})) | set(huidig.get("werkbronnen", {}))
    maak_id = maak_id or (lambda: uuid.uuid4().hex)
    moment = datetime.now(timezone.utc) if moment is None else moment
    if not isinstance(moment, datetime) or moment.tzinfo is None:
        raise ValueError("Gebruik een hersteltijdstip met tijdzone.")

    def sleutel():
        for _ in range(10):
            i = maak_id()
            if not isinstance(i, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", i):
                raise ValueError("Ongeldige sleutel voor herstelde gegevens.")
            if i not in gebruikt:
                gebruikt.add(i)
                return i
        raise ValueError("Er kon geen unieke herstelsleutel worden gemaakt.")

    resultaat = {"taken": [], "afspraken": [], "sjablonen": {}}
    if versie == 2:
        resultaat["werkbronnen"] = {}
    mapping = {}
    for key in ("taken", "afspraken"):
        for item in nieuw[key]:
            mapping[item["id"]] = teller
            teller += 1
    for taak in nieuw["taken"]:
        item = copy.deepcopy(taak)
        item["id"] = mapping[taak["id"]]
        if "afhankelijk_van" in item:
            item["afhankelijk_van"] = [mapping[i] for i in item["afhankelijk_van"]]
        resultaat["taken"].append(item)
    for afspraak in nieuw["afspraken"]:
        item = copy.deepcopy(afspraak)
        item["id"] = mapping[afspraak["id"]]
        if "taak_id" in item:
            item["taak_id"] = mapping[item["taak_id"]]
        item["contact_id"] = None
        resultaat["afspraken"].append(item)
    for b in nieuw.get("werkbronnen", {}).values():
        item = copy.deepcopy(b)
        item["doel_id"] = mapping[item["doel_id"]]
        item["aangemaakt"] = moment.astimezone(timezone.utc).isoformat(timespec="seconds")
        resultaat["werkbronnen"][sleutel()] = item
    for s in nieuw["sjablonen"].values():
        resultaat["sjablonen"][sleutel()] = copy.deepcopy(s)
    return {"toevoegingen": resultaat, "volgend_id": teller}
