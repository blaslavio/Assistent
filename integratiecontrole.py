"""100.000 reproduceerbare controles: bestaande fundamenten plus vijf werkstromen."""
import copy
from datetime import datetime, timezone
import hashlib
import itertools
import json
import random
import dieptecontrole
import herstel
import planning_backup
import sjablonen
import werkcontext
import werkzoeken

SEED = 10000020261028
PER_FAMILIE = 5000


def dataset(r, i):
    g = dieptecontrole.kleine_gegevens(r, i)
    n = len(g["taken"])
    g["volgend_id"] = n + 2 + r.randrange(10000)
    g["werkbronnen"] = {
        "notitie": {"soort": "notitie", "titel": f"Notitie {i}", "tekst": f"Onderzoeksresultaat {i}", "doel_soort": "taak", "doel_id": n, "aangemaakt": "2030-01-07T08:00:00+00:00"},
        "web": {"soort": "url", "titel": f"Website {i}", "url": f"https://example.org/{i}", "doel_soort": "afspraak", "doel_id": n + 1, "aangemaakt": "2030-01-07T08:00:00+00:00"},
        "cloud": {"soort": "document", "titel": "Cloudinhoud niet meenemen", "bron_id": 9000 + i, "doel_soort": "taak", "doel_id": n, "aangemaakt": "2030-01-07T08:00:00+00:00"}}
    g["instellingen"] = {"sleutel": f"CONFIG-NIET-EXPORTEREN-{i}"}
    return g


def dossierrelaties(r, i):
    g = dataset(r, i)
    n = len(g["taken"])
    origineel = copy.deepcopy(g)
    a = werkcontext.samenhang(g, "taak", n)
    b = werkcontext.samenhang(g, "afspraak", n + 1)
    dieptecontrole.eis(b["taak"]["id"] == n, "afspraak_naar_taak")
    dieptecontrole.eis(a["afspraken"][0]["id"] == n + 1, "taak_naar_afspraak")
    dieptecontrole.eis(len(a["bronnen"]) == 3 and len(b["bronnen"]) == 3, "gedeelde_broncontext")
    dieptecontrole.eis(g == origineel, "dossier_niet_muteren")
    return dieptecontrole.bewijs(g)


def draagbare_bundel(r, i):
    g = dataset(r, i)
    data = planning_backup.exporteer(g, bronnen=True)
    nieuw = planning_backup.lees(data)
    dieptecontrole.eis(nieuw["versie"] == 2, "bundelversie")
    dieptecontrole.eis(len(nieuw["gegevens"]["werkbronnen"]) == 2, "portable_bronnen")
    dieptecontrole.eis(b"CONFIG-NIET-EXPORTEREN" not in data and b"bron_id" not in data, "geen_account_of_cloud_ids")
    return dieptecontrole.bewijs(g)


def herstel_samenhang(r, i):
    g = dataset(r, i)
    backup = planning_backup.lees(planning_backup.exporteer(g, bronnen=True))
    ids = itertools.count()
    wijziging = herstel.maak(g, backup, maak_id=lambda: f"hersteld-{i}-{next(ids)}", moment=datetime(2030, 1, 7, tzinfo=timezone.utc))
    nieuw = copy.deepcopy(g)
    for key in ("taken", "afspraken"):
        nieuw[key].extend(wijziging["toevoegingen"][key])
    nieuw["werkbronnen"].update(wijziging["toevoegingen"]["werkbronnen"])
    nieuw["volgend_id"] = wijziging["volgend_id"]
    taak = wijziging["toevoegingen"]["taken"][-1]
    dossier = werkcontext.samenhang(nieuw, "taak", taak["id"])
    dieptecontrole.eis(len(dossier["bronnen"]) == 2, "herstelde_bronnen_juiste_doel")
    dieptecontrole.eis(len(dossier["afspraken"]) == 1, "herstelde_afspraak_juiste_taak")
    dieptecontrole.eis(dossier["afspraken"][0]["id"] not in {a["id"] for a in g["afspraken"]}, "herstelde_ids_uniek")
    if len(g["taken"]) > 1:
        dieptecontrole.eis(dossier["voorgangers"][0]["id"] in {t["id"] for t in wijziging["toevoegingen"]["taken"]}, "voorganger_geremapt")
    return dieptecontrole.bewijs(g)


def selectie_bewaakt_doelen(r, i):
    g = dataset(r, i)
    data = planning_backup.exporteer(g, bronnen=True)
    keuze = r.choice([("taken",), ("afspraken",), ("sjablonen",), ("taken", "afspraken")])
    selected = planning_backup.lees(planning_backup.selecteer(data, keuze))
    doelen = {"taak": {t["id"] for t in selected["gegevens"]["taken"]}, "afspraak": {a["id"] for a in selected["gegevens"]["afspraken"]}}
    for b in selected["gegevens"]["werkbronnen"].values():
        dieptecontrole.eis(b["doel_id"] in doelen[b["doel_soort"]], "geen_weesbron_na_selectie")
    zonder = planning_backup.lees(planning_backup.selecteer(data, keuze, bronnen=False))
    dieptecontrole.eis(not zonder["gegevens"]["werkbronnen"], "bronselectie_uit_gerespecteerd")
    return dieptecontrole.bewijs([g, keuze])


def zoeken_naar_sjabloon(r, i):
    g = dataset(r, i)
    gevonden = werkzoeken.zoek(g, f"Taak {i}", ["taak"])
    dieptecontrole.eis(gevonden["totaal"] == len(g["taken"]), "zoekbare_taak")
    ref = gevonden["resultaten"][0]
    dossier = werkcontext.samenhang(g, ref["soort"], ref["id"])
    origineel = next(t for t in g["taken"] if t["id"] == dossier["hoofd"]["id"])
    sjabloon = sjablonen.uit_resultaat("taak", origineel)
    voorstel = sjablonen.voorstel(sjabloon)
    dieptecontrole.eis(voorstel["gegevens"]["titel"] == origineel["titel"], "sjabloon_titel_behouden")
    dieptecontrole.eis(voorstel["gegevens"]["deadline"] is None and "id" not in voorstel["gegevens"], "geen_oude_datum_of_id")
    dieptecontrole.eis("CONFIG-NIET-EXPORTEREN" not in json.dumps(dossier), "dossier_geen_config")
    return dieptecontrole.bewijs([g, dossier["hoofd"]["id"]])


FAMILIES = {**dieptecontrole.FAMILIES, "dossierrelaties": dossierrelaties, "draagbare_bundel": draagbare_bundel,
            "herstel_samenhang": herstel_samenhang, "selectie_bewaakt_doelen": selectie_bewaakt_doelen, "zoeken_naar_sjabloon": zoeken_naar_sjabloon}
assert len(FAMILIES) == 20


def geval(familie, nummer, seed=SEED):
    if familie not in FAMILIES or type(nummer) is not int or not 0 <= nummer < PER_FAMILIE:
        raise ValueError("Onbekend integratiegeval.")
    family_seed = int.from_bytes(hashlib.sha256(familie.encode()).digest()[:8], "big")
    return FAMILIES[familie](random.Random(seed ^ family_seed ^ (nummer * 1000003)), nummer)
