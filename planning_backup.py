"""Begrensde, versieerbare planningexport; geen instellingen of accountgeheimen."""
import tekstcontrole
import copy
from datetime import date, datetime, timezone
import hashlib
import hmac
import json
import re
import agendacontrole
import sjablonen
import werkbronnen

MAX_BYTES = 5_000_000
MAX_RECORDS = 10_000
TAAK = {"id", "titel", "deadline", "klaar", "minuten", "resterend_minuten", "prioriteit", "notitie", "afhankelijk_van"}
AFSPRAAK = {"id", "titel", "start", "einde", "locatie", "notitie", "soort", "sport", "taak_id"}


def vingerafdruk(gegevens: dict) -> str:
    return hashlib.sha256(json.dumps(gegevens, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def _tekst(r: dict, veld: str, maximum: int, verplicht=False) -> None:
    waarde = r.get(veld)
    if waarde is None and not verplicht:
        return
    if not isinstance(waarde, str) or len(waarde) > maximum or (verplicht and not waarde.strip()) or not tekstcontrole.veilig(waarde, regels=veld == "notitie"):
        raise ValueError(f"Ongeldige tekst voor {veld} (maximaal {maximum} tekens).")


def valideer(g: dict, versie=1) -> dict:
    verwacht = {"taken", "afspraken", "sjablonen"} | ({"werkbronnen"} if versie == 2 else set())
    if type(versie) is not int or versie not in (1, 2) or not isinstance(g, dict) or set(g) != verwacht:
        raise ValueError("De back-up moet taken, afspraken en sjablonen bevatten.")
    if not isinstance(g["taken"], list) or not isinstance(g["afspraken"], list) or not isinstance(g["sjablonen"], dict):
        raise ValueError("Ongeldige verzamelingen in de back-up.")
    if len(g["taken"]) + len(g["afspraken"]) + len(g["sjablonen"]) > MAX_RECORDS or len(g["sjablonen"]) > 100:
        raise ValueError("Te veel records in de back-up.")
    ids = set()
    for soort, velden in (("taken", TAAK), ("afspraken", AFSPRAAK)):
        for r in g[soort]:
            if not isinstance(r, dict) or set(r) - velden:
                raise ValueError("Onbekende velden in een planningrecord.")
            i = r.get("id")
            if type(i) is not int or not 1 <= i <= 2**53 or i in ids:
                raise ValueError("Ontbrekend, ongeldig of dubbel record-ID.")
            ids.add(i)
            _tekst(r, "titel", 160, True)
            _tekst(r, "notitie", 5000)
            if soort == "taken":
                if type(r.get("klaar")) is not bool:
                    raise ValueError("Iedere taak moet een geldige afgerond-status hebben.")
                if r.get("deadline") is not None:
                    if date.fromisoformat(r["deadline"]).isoformat() != r["deadline"]:
                        raise ValueError("Gebruik datums als JJJJ-MM-DD.")
                for veld in ("minuten", "resterend_minuten"):
                    if veld in r and (type(r[veld]) is not int or not 1 <= r[veld] <= 10080):
                        raise ValueError("Ongeldige taakduur in de back-up.")
                if r.get("prioriteit", "") not in ("", "hoog"):
                    raise ValueError("Ongeldige prioriteit.")
            else:
                _tekst(r, "locatie", 500)
                _tekst(r, "soort", 80)
                _tekst(r, "sport", 80)
                agendacontrole.interval(r)
    taken_ids = {t["id"] for t in g["taken"]}
    graad, opvolgers = {}, {i: [] for i in taken_ids}
    for t in g["taken"]:
        deps = t.get("afhankelijk_van", [])
        if (not isinstance(deps, list) or len(deps) > 100
                or any(type(i) is not int or i not in taken_ids for i in deps) or len(set(deps)) != len(deps)):
            raise ValueError("Ongeldige of ontbrekende taakafhankelijkheden.")
        graad[t["id"]] = len(deps)
        for voorganger in deps:
            opvolgers[voorganger].append(t["id"])
    vrij = [i for i, n in graad.items() if n == 0]
    verwerkt = 0
    while vrij:
        i = vrij.pop()
        verwerkt += 1
        for volgende in opvolgers[i]:
            graad[volgende] -= 1
            if graad[volgende] == 0:
                vrij.append(volgende)
    if verwerkt != len(taken_ids):
        raise ValueError("De back-up bevat een kringverwijzing tussen taken.")
    for a in g["afspraken"]:
        if "taak_id" in a and (type(a["taak_id"]) is not int or a["taak_id"] not in taken_ids):
            raise ValueError("Een afspraak verwijst naar een ontbrekende taak.")
    for sleutel, s in g["sjablonen"].items():
        if not isinstance(sleutel, str) or not 1 <= len(sleutel) <= 80 or sjablonen.valideer(s) != s:
            raise ValueError("Ongeldig sjabloon in de back-up.")
    if versie == 2:
        bronnen = g["werkbronnen"]
        if not isinstance(bronnen, dict) or len(bronnen) > 1000 or sum(len(g[k]) for k in verwacht) > MAX_RECORDS:
            raise ValueError("Te veel of ongeldige bronkoppelingen in de back-up.")
        doel_ids = {"taak": taken_ids, "afspraak": {a["id"] for a in g["afspraken"]}}
        per_doel = {}
        for sleutel, b in bronnen.items():
            if (not isinstance(sleutel, str) or not 1 <= len(sleutel) <= 80 or not isinstance(b, dict)
                    or not isinstance(b.get("soort"), str) or b["soort"] not in {"notitie", "url"}):
                raise ValueError("Alleen notities en webverwijzingen kunnen worden hersteld.")
            bron = werkbronnen.valideer(b)
            if set(b) != set(bron) | {"doel_soort", "doel_id"} or any(b[k] != v for k, v in bron.items()):
                raise ValueError("Onbekende bronvelden in de back-up.")
            soort, i = b.get("doel_soort"), b.get("doel_id")
            if not isinstance(soort, str) or soort not in doel_ids or type(i) is not int or i not in doel_ids[soort]:
                raise ValueError("Een bron verwijst naar ontbrekend werk.")
            per_doel[(soort, i)] = per_doel.get((soort, i), 0) + 1
            if per_doel[(soort, i)] > 100:
                raise ValueError("Maximaal 100 bronnen per taak of afspraak.")
    return copy.deepcopy(g)


def exporteer(gegevens: dict, onderdelen=None, bronnen=False) -> bytes:
    gekozen = {"taken", "afspraken", "sjablonen"} if onderdelen is None else set(onderdelen)
    if not gekozen or not gekozen <= {"taken", "afspraken", "sjablonen"}:
        raise ValueError("Kies minimaal één geldig back-uponderdeel.")
    brongegevens = gegevens.get("werkbronnen", {}) if bronnen else {}
    gegevens = {k: v for k, v in gegevens.items() if k in gekozen}
    g = {"taken": [{k: copy.deepcopy(v) for k, v in t.items() if k in TAAK} for t in gegevens.get("taken", [])],
         "afspraken": [{k: copy.deepcopy(v) for k, v in a.items() if k in AFSPRAAK} for a in gegevens.get("afspraken", [])],
         "sjablonen": {k: sjablonen.valideer(v) for k, v in gegevens.get("sjablonen", {}).items()}}
    # Historische focusblokken mogen blijven bestaan nadat hun taak is verwijderd.
    taak_ids = {t["id"] for t in g["taken"]}
    for a in g["afspraken"]:
        if a.get("taak_id") not in taak_ids:
            a.pop("taak_id", None)
    if type(bronnen) is not bool:
        raise ValueError("Kies of bronkoppelingen moeten worden meegenomen.")
    versie = 2 if bronnen else 1
    if bronnen:
        if not isinstance(brongegevens, dict):
            raise ValueError("De bronkoppelingen zijn onleesbaar.")
        g["werkbronnen"] = {}
        doelen = {"taak": taak_ids, "afspraak": {a["id"] for a in g["afspraken"]}}
        for b in brongegevens.values():
            if not isinstance(b, dict) or b.get("soort") not in ("notitie", "url"):
                continue
            soort, i = b.get("doel_soort"), b.get("doel_id")
            if not isinstance(soort, str) or soort not in doelen or type(i) is not int or i not in doelen[soort]:
                continue
            g["werkbronnen"]["bron-" + str(len(g["werkbronnen"]) + 1)] = {**werkbronnen.valideer(b), "doel_soort": soort, "doel_id": i}
    g = valideer(g, versie)
    r = {"formaat": "assistent-planning", "versie": versie, "gemaakt_op": datetime.now(timezone.utc).isoformat(), "gegevens": g}
    r["sha256"] = vingerafdruk(r)
    data = json.dumps(r, ensure_ascii=False, indent=2, allow_nan=False).encode()
    if len(data) > MAX_BYTES:
        raise ValueError("Deze planning is groter dan de maximale back-up van 5 MB.")
    return data


def _unieke_velden(paren):
    r = {}
    for k, v in paren:
        if k in r:
            raise ValueError("Dubbele JSON-velden zijn niet toegestaan.")
        r[k] = v
    return r


def lees(data: bytes) -> dict:
    if not isinstance(data, bytes) or not 0 < len(data) <= MAX_BYTES:
        raise ValueError("Kies een JSON-back-up van maximaal 5 MB.")
    try:
        def ongeldig(_):
            raise ValueError("Niet-eindige getallen zijn niet toegestaan.")
        r = json.loads(data.decode("utf-8"), object_pairs_hook=_unieke_velden, parse_constant=ongeldig)
        stapel = [(r, 0)]
        while stapel:
            obj, diepte = stapel.pop()
            if diepte > 15:
                raise ValueError("De back-up is te diep genest.")
            if isinstance(obj, dict):
                stapel.extend((v, diepte + 1) for v in obj.values())
            elif isinstance(obj, list):
                stapel.extend((v, diepte + 1) for v in obj)
        if (not isinstance(r, dict) or set(r) != {"formaat", "versie", "gemaakt_op", "gegevens", "sha256"}
                or r["formaat"] != "assistent-planning" or type(r["versie"]) is not int or r["versie"] not in (1, 2)):
            raise ValueError("Onbekend back-upformaat of versienummer.")
        if datetime.fromisoformat(r["gemaakt_op"]).tzinfo is None:
            raise ValueError("Het back-uptijdstip mist een tijdzone.")
        controle = {k: v for k, v in r.items() if k != "sha256"}
        if not isinstance(r["sha256"], str) or not re.fullmatch("[0-9a-f]{64}", r["sha256"]) or not hmac.compare_digest(r["sha256"], vingerafdruk(controle)):
            raise ValueError("De controlesom klopt niet; het bestand is gewijzigd of beschadigd.")
        r["gegevens"] = valideer(r["gegevens"], r["versie"])
        return r
    except (UnicodeError, RecursionError, OverflowError, TypeError, KeyError) as fout:
        raise ValueError("Dit is geen geldige planningback-up.") from fout


def voorvertoning(backup: dict, huidig: dict) -> dict:
    nieuw = backup["gegevens"]
    return {"toevoegen": {k: len(v) for k, v in nieuw.items()},
            "huidig": {k: len(huidig.get(k, {} if k == "sjablonen" else [])) for k in nieuw},
            "basis": vingerafdruk(huidig), "inhoud": backup["sha256"],
            "uitleg": "Voegt alles toe met nieuwe IDs. Bestaande gegevens blijven staan. Afspraken kunnen daardoor dubbel staan of overlappen; er wordt geen planning uitgevoerd."}


def selecteer(data: bytes, onderdelen, bronnen=True) -> bytes:
    if type(bronnen) is not bool:
        raise ValueError("Kies of bronkoppelingen moeten worden meegenomen.")
    gekozen = set(onderdelen)
    if not gekozen or not gekozen <= {"taken", "afspraken", "sjablonen"}:
        raise ValueError("Kies minimaal één onderdeel om toe te voegen.")
    r = lees(data)
    for k in {"taken", "afspraken", "sjablonen"} - gekozen:
        r["gegevens"][k] = {} if k == "sjablonen" else []
    if "taken" not in gekozen:
        for a in r["gegevens"]["afspraken"]:
            a.pop("taak_id", None)
    if r["versie"] == 2:
        doelen = {"taak": {t["id"] for t in r["gegevens"]["taken"]}, "afspraak": {a["id"] for a in r["gegevens"]["afspraken"]}}
        r["gegevens"]["werkbronnen"] = {k: b for k, b in r["gegevens"]["werkbronnen"].items()
            if bronnen and b["doel_id"] in doelen[b["doel_soort"]]}
    r["gegevens"] = valideer(r["gegevens"], r["versie"])
    r["sha256"] = vingerafdruk({k: v for k, v in r.items() if k != "sha256"})
    return json.dumps(r, ensure_ascii=False, indent=2).encode()
