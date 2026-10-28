"""Verse, accountgebonden samenhang tussen werkrecords; nooit accountconfiguratie tonen."""
import re
import tekstcontrole
import werkbronnen

SOORTEN = {"taak", "afspraak", "bron", "sjabloon"}


def verwijzing(soort, record_id):
    if not isinstance(soort, str) or soort not in SOORTEN:
        raise ValueError("Kies een taak, afspraak, bron of sjabloon.")
    if soort in {"taak", "afspraak"}:
        if type(record_id) is not int or record_id < 1:
            raise ValueError("Kies een geldig record-ID.")
    elif not isinstance(record_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", record_id):
        raise ValueError("Kies een geldige bron of sjabloon.")
    return {"soort": soort, "id": record_id}


def _tekst(waarde, regels=False):
    return waarde if tekstcontrole.veilig(waarde, regels) else ""


def kaart(soort, r):
    velden = ("titel", "naam", "deadline", "start", "einde", "locatie", "notitie")
    uit = {"soort": soort, "id": r.get("id")}
    for veld in velden:
        if veld in r:
            uit[veld] = _tekst(r[veld], regels=veld == "notitie")[:5000 if veld == "notitie" else 500]
    for veld in ("minuten", "resterend_minuten"):
        if type(r.get(veld)) is int:
            uit[veld] = r[veld]
    if soort == "taak":
        uit["klaar"] = r.get("klaar") is True
    return uit


def samenhang(gegevens, soort, record_id):
    ref = verwijzing(soort, record_id)
    if not isinstance(gegevens, dict):
        raise ValueError("De werkgegevens konden niet worden gelezen.")
    for key, soort_type in (("taken", list), ("afspraken", list), ("werkbronnen", dict), ("sjablonen", dict), ("intentie_ontvangst", dict), ("planning_herstel", dict)):
        if not isinstance(gegevens.get(key, soort_type()), soort_type):
            raise ValueError("Een verzameling werkgegevens is onleesbaar. Bekijk de gegevenscontrole.")
    taken = {t["id"]: t for t in gegevens.get("taken", []) if isinstance(t, dict) and type(t.get("id")) is int}
    afspraken = {a["id"]: a for a in gegevens.get("afspraken", []) if isinstance(a, dict) and type(a.get("id")) is int}
    hoofd, basis, bron = None, ref, None
    if soort == "bron":
        r = gegevens.get("werkbronnen", {}).get(record_id)
        if not isinstance(r, dict):
            raise ValueError("Deze bron is verwijderd of niet beschikbaar binnen je huidige account.")
        bron = werkbronnen.valideer(r)
        basis = verwijzing(r.get("doel_soort"), r.get("doel_id"))
    elif soort == "sjabloon":
        import sjablonen
        r = gegevens.get("sjablonen", {}).get(record_id)
        if not isinstance(r, dict):
            raise ValueError("Dit sjabloon is niet beschikbaar binnen je huidige account.")
        return {"verwijzing": ref, "hoofd": {**sjablonen.valideer(r), "sjabloonsoort": r["soort"], "soort": "sjabloon", "id": record_id},
                "taak": None, "voorgangers": [], "vervolgtaken": [], "afspraken": [], "bronnen": [], "historie": [], "meldingen": []}
    meldingen = []
    record = (taken if basis["soort"] == "taak" else afspraken).get(basis["id"])
    if record is None:
        if bron is None:
            raise ValueError("Dit werk is verwijderd of niet beschikbaar binnen je huidige account.")
        return {"verwijzing": ref, "hoofd": {**bron, "brontype": bron["soort"], "soort": "bron", "id": record_id}, "taak": None,
                "voorgangers": [], "vervolgtaken": [], "afspraken": [], "bronnen": [], "historie": [],
                "meldingen": ["Het gekoppelde werk is verwijderd. De bron blijft beschikbaar bij Bronnen bij werk."]}
    hoofd = kaart(basis["soort"], record)
    taak = record if basis["soort"] == "taak" else taken.get(record.get("taak_id")) if type(record.get("taak_id")) is int else None
    voorgangers, vervolgtaken, gekoppeld = [], [], []
    if taak:
        deps = taak.get("afhankelijk_van", [])
        if not isinstance(deps, list):
            meldingen.append("Afhankelijkheden zijn onleesbaar; bekijk de gegevenscontrole.")
            deps = []
        for i in deps:
            if type(i) is not int or i not in taken:
                meldingen.append("Een voorafgaande taak ontbreekt of is onleesbaar.")
            else:
                voorgangers.append(kaart("taak", taken[i]))
        for t in taken.values():
            deps = t.get("afhankelijk_van", [])
            if isinstance(deps, list) and taak["id"] in [i for i in deps if type(i) is int]:
                vervolgtaken.append(kaart("taak", t))
        gekoppeld = [kaart("afspraak", a) for a in afspraken.values() if type(a.get("taak_id")) is int and a.get("taak_id") == taak["id"]]
    doelen = {(basis["soort"], basis["id"])}
    if taak:
        doelen.add(("taak", taak["id"]))
        doelen.update(("afspraak", a["id"]) for a in gekoppeld)
    bronnen = []
    for sleutel, b in gegevens.get("werkbronnen", {}).items():
        if not isinstance(b, dict) or type(b.get("doel_id")) is not int or not isinstance(b.get("doel_soort"), str):
            continue
        if (b["doel_soort"], b["doel_id"]) in doelen:
            try:
                r = werkbronnen.valideer(b)
                bronnen.append({"id": sleutel, **r, "doel_soort": b["doel_soort"], "doel_id": b["doel_id"]})
            except ValueError:
                meldingen.append("Een bron is onleesbaar en overgeslagen.")
    historie = []
    for ontvangst in gegevens.get("intentie_ontvangst", {}).values():
        if not isinstance(ontvangst, dict):
            continue
        items = ontvangst.get("items") or ([ontvangst["item"]] if isinstance(ontvangst.get("item"), dict) else [])
        if not isinstance(items, list):
            continue
        soort_ = ontvangst.get("wat")
        if soort_ not in ("taak", "afspraak", "dagplan", "focusplan", "herplan"):
            continue
        if any(isinstance(i, dict) and type(i.get("id")) is int and (("taak" if soort_ == "taak" else "afspraak", i["id"]) in doelen) for i in items):
            herkomst = ontvangst.get("herkomst") or {}
            historie.append({"soort": _tekst(soort_), "tekst": _tekst(ontvangst.get("tekst", "")), "ongedaan": ontvangst.get("ongedaan") is True,
                             "tijd": _tekst(herkomst.get("tijd", "")) if isinstance(herkomst, dict) else ""})
    for r in gegevens.get("planning_herstel", {}).values():
        if not isinstance(r, dict) or not isinstance(r.get("ids"), dict):
            continue
        verwant = False
        for key, label in (("taken", "taak"), ("afspraken", "afspraak")):
            ids = r["ids"].get(key, [])
            if isinstance(ids, list) and any(type(i) is int and (label, i) in doelen for i in ids):
                verwant = True
        if verwant:
            historie.append({"soort": "herstel", "tekst": "Toegevoegd na bevestiging van een planningback-up.", "ongedaan": False, "tijd": _tekst(r.get("tijd", ""))})
    return {"verwijzing": ref, "hoofd": hoofd, "taak": kaart("taak", taak) if taak else None,
            "voorgangers": voorgangers, "vervolgtaken": vervolgtaken, "afspraken": sorted(gekoppeld, key=lambda a: a.get("start", "")),
            "bronnen": bronnen, "historie": sorted(historie, key=lambda h: h["tijd"], reverse=True)[:10], "meldingen": meldingen}
