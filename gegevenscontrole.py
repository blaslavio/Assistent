"""Leescontrole van werkgegevens; rapporten bevatten geen titels, notities of geheimen."""
import tekstcontrole
from collections import Counter
from datetime import date
import heapq
import agendacontrole
import sjablonen
import werkbronnen

MAX_RECORDS = 20000
MAX_MELDINGEN = 200


def controleer(gegevens: dict) -> dict:
    if not isinstance(gegevens, dict):
        raise ValueError("De gegevens moeten een JSON-object zijn.")
    meldingen, volledig = [], True
    def meld(code, onderdeel, ids=None, ernst="waarschuwing"):
        nonlocal volledig
        if len(meldingen) >= MAX_MELDINGEN:
            volledig = False
            return
        meldingen.append({"code": code, "onderdeel": onderdeel, "ids": ids or [], "ernst": ernst})
    lijsten = {}
    for key in ("taken", "afspraken"):
        raw = gegevens.get(key, [])
        if not isinstance(raw, list):
            meld("ongeldige_verzameling", key, ernst="fout")
            volledig = False
            raw = []
        if len(raw) > MAX_RECORDS:
            volledig = False
        lijsten[key] = raw[:MAX_RECORDS]
    taken, afspraken, gezien = {}, [], set()
    for key in ("taken", "afspraken"):
        for nummer, item in enumerate(lijsten[key]):
            if not isinstance(item, dict) or type(item.get("id")) is not int or item["id"] < 1:
                meld("ongeldig_id", key, [nummer], "fout")
                volledig = False
                continue
            i = item["id"]
            if i in gezien:
                meld("dubbel_id", key, [i], "fout")
            gezien.add(i)
            if not isinstance(item.get("titel"), str) or not item["titel"].strip() or not tekstcontrole.veilig(item["titel"]):
                meld("lege_titel", key, [i], "fout")
            if key == "taken":
                taken[i] = item
                if type(item.get("klaar")) is not bool:
                    meld("ongeldige_taakstatus", key, [i], "fout")
                if item.get("deadline"):
                    try:
                        if date.fromisoformat(item["deadline"]).isoformat() != item["deadline"]:
                            raise ValueError("Niet-canonieke datum")
                    except (TypeError, ValueError):
                        meld("ongeldige_deadline", key, [i], "fout")
                for veld in ("minuten", "resterend_minuten"):
                    if item.get(veld) is not None and (type(item[veld]) is not int or item[veld] < 1 or item[veld] > 10080):
                        meld("ongeldige_taakduur", key, [i], "fout")
                if item.get("minuten") is None and item.get("resterend_minuten") is None and not item.get("klaar"):
                    meld("taakduur_geschat", key, [i], "informatie")
            else:
                try:
                    b, e = agendacontrole.interval(item)
                    afspraken.append((b, e, i, item))
                except agendacontrole.ControleOnvolledig:
                    meld("ongeldige_afspraaktijd", key, [i], "fout")
                    volledig = False
    opvolgers = {i: [] for i in taken}
    graad = {i: 0 for i in taken}
    for i, t in taken.items():
        deps = t.get("afhankelijk_van", [])
        if not isinstance(deps, list) or any(type(d) is not int for d in deps):
            meld("ongeldige_afhankelijkheden", "taken", [i], "fout")
            continue
        if len(deps) != len(set(deps)):
            meld("dubbele_afhankelijkheid", "taken", [i])
        for d in set(deps):
            if d not in taken:
                meld("ontbrekende_voorganger", "taken", [i, d], "fout")
            else:
                opvolgers[d].append(i)
                graad[i] += 1
    vrij = [i for i, n in graad.items() if n == 0]
    while vrij:
        i = vrij.pop()
        for n in opvolgers[i]:
            graad[n] -= 1
            if graad[n] == 0:
                vrij.append(n)
    rest = sorted(i for i, n in graad.items() if n)
    if rest:
        meld("cyclus_of_afhankelijke_wachtketen", "taken", rest[:50], "fout")
    actief = []
    for b, e, i, a in sorted(afspraken, key=lambda r: (r[0], r[1], r[2])):
        while actief and actief[0][0] <= b:
            heapq.heappop(actief)
        if actief:
            meld("overlappende_afspraken", "afspraken", [actief[0][1], i])
        heapq.heappush(actief, (e, i))
        if a.get("taak_id") is not None and (type(a["taak_id"]) is not int or a["taak_id"] not in taken):
            meld("ontbrekende_focustaak", "afspraken", [i])
    afspraken_ids = {a["id"] for a in lijsten["afspraken"] if isinstance(a, dict) and type(a.get("id")) is int and a["id"] > 0}
    for key, validator in (("sjablonen", sjablonen.valideer), ("werkbronnen", werkbronnen.valideer)):
        raw = gegevens.get(key, {})
        if not isinstance(raw, dict):
            meld("ongeldige_verzameling", key, ernst="fout")
            volledig = False
            continue
        if len(raw) > MAX_RECORDS:
            volledig = False
        for nr, r in enumerate(raw.values()):
            if nr >= MAX_RECORDS:
                break
            try:
                validator(r)
            except (ValueError, TypeError, KeyError, AttributeError):
                meld("ongeldig_record", key, [nr], "fout")
                continue
            if key == "werkbronnen":
                try:
                    soort, doel_id = r["doel_soort"], r["doel_id"]
                    if type(doel_id) is not int or not ((soort == "taak" and doel_id in taken) or (soort == "afspraak" and doel_id in afspraken_ids)):
                        raise ValueError("Doel ontbreekt")
                except (ValueError, KeyError):
                    meld("bron_zonder_doel", key, [nr])
    volgend = gegevens.get("volgend_id", 1)
    if type(volgend) is not int or volgend < 1 or (gezien and volgend <= max(gezien)):
        meld("id_teller_achtergelopen", "opslag", ernst="fout")
    return {"formaat": "assistent-gegevenscontrole", "versie": 1, "volledig": volledig,
            "aantallen": {k: len(v) for k, v in lijsten.items()},
            "samenvatting": dict(Counter(m["ernst"] for m in meldingen)), "meldingen": meldingen,
            "beperking": "Alleen opgeslagen werkgegevens. Maximaal 200 meldingen; overlapcontrole noemt per afspraak één bestaande overlap. Geen externe diensten gecontroleerd en niets aangepast."}
