"""Deterministische grens- en invariantcontroles met uitsluitend synthetische data.

15 families × 2000 gevallen. Schrijft geen appgegevens en benadert geen diensten.
De controle vergelijkt uitkomsten met onafhankelijke rekenregels en invarianten.
"""
import copy
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import gzip
import hashlib
import json
import random
import unicodedata
import agendacontrole
import actielinks
import bestandsgereedschap as bestanden
import capaciteit
import geldwaarden
import intenties
import planning_backup as backup
import sjablonen
import taakvolgorde
import werkbronnen
import werkzoeken

SEED = 20261028
PER_FAMILIE = 2000


def eis(voorwaarde, code):
    if not voorwaarde:
        raise AssertionError(code)


def weigert(functie, *args, **kwargs):
    try:
        functie(*args, **kwargs)
    except ValueError:
        return
    raise AssertionError("ongeldige_invoer_niet_geweigerd")


def bewijs(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()


def geld_exact(r, i):
    n = r.randrange(-10_000_000, 10_000_000)
    tekst = f"{'-' if n < 0 else ''}{abs(n)//100},{abs(n)%100:02d}"
    eis(geldwaarden.centen(tekst) == n, "cent_roundtrip")
    eis(geldwaarden.centen(geldwaarden.opmaak(n)) == n, "opmaak_roundtrip")
    return bewijs([n, tekst])


def geld_halve_cent(r, i):
    n = r.randrange(0, 10_000_000)
    fractie = r.choice([0, 1, 4, 5, 6, 9])
    negatief = r.choice([False, True])
    tekst = f"{'-' if negatief else ''}{n//100}.{n%100:02d}{fractie}"
    verwacht = (n + (fractie >= 5)) * (-1 if negatief else 1)
    eis(geldwaarden.centen(tekst) == verwacht, "halve_cent_afgerond")
    return bewijs([tekst, verwacht])


def invoervormen(r, i):
    keuze = i % 7
    if keuze == 0:
        invoer = {"naam": str(i), "soort": [i]}
        weigert(sjablonen.valideer, invoer)
    elif keuze == 1:
        invoer = {"titel": str(i), "soort": {str(i): True}}
        weigert(werkbronnen.valideer, invoer)
    elif keuze == 2:
        invoer = r.choice([None, [], i, False])
        weigert(intenties.valideer, invoer)
    elif keuze == 3:
        invoer = r.choice([None, [], i, False])
        weigert(actielinks.valideer, invoer)
    elif keuze == 4:
        invoer = r.choice([True, False, str(i), None, [i]])
        weigert(taakvolgorde.valideer, [{"id": 1}], invoer, [])
    elif keuze == 5:
        invoer = r.choice([float("inf"), float("nan"), True, "1e999", "geen bedrag", "", {str(i): 1}])
        weigert(geldwaarden.centen, invoer)
    else:
        invoer = str(i) + "abc"
        weigert(actielinks.prijs_cent, invoer)
    return bewijs([keuze, invoer, i])


def tijdzones(r, i):
    begin = datetime(2020, 1, 1, tzinfo=timezone.utc) + timedelta(days=i, minutes=r.randrange(1440))
    duur = r.randrange(1, 300)
    zone = timezone(timedelta(minutes=r.choice([-180, 0, 60, 120, 330])))
    item = {"start": begin.astimezone(zone).isoformat(), "einde": (begin + timedelta(minutes=duur)).astimezone(zone).isoformat()}
    b, e = agendacontrole.interval(item)
    eis(b == begin and e - b == timedelta(minutes=duur), "tijdzone_instanten")
    return bewijs(item)


def overlap(r, i):
    start = datetime(2030, 1, 7, 12) + timedelta(days=i)
    duur = r.randrange(1, 120)
    verschuiving = r.randrange(-120, 150)
    tweede_duur = r.randrange(1, 120)
    item = {"wat": "afspraak", "titel": str(i), "start": start.isoformat(), "einde": (start + timedelta(minutes=duur)).isoformat()}
    afspraak = {"titel": "bestaand", "start": (start + timedelta(minutes=verschuiving)).isoformat(), "einde": (start + timedelta(minutes=verschuiving + tweede_duur)).isoformat()}
    # Onbruikbare planuren schakelen uitsluitend alternatieven uit; de overlapcheck blijft actief.
    resultaat = agendacontrole.controleer(item, [afspraak], {"van": "ongeldig"})
    verwacht = verschuiving < duur and verschuiving + tweede_duur > 0
    eis(bool(resultaat["conflicten"]) == verwacht, "halfopen_overlap")
    return bewijs([item, afspraak])


def taakgrafen(r, i):
    n = r.randrange(3, 25)
    offset = i * 32
    taken = []
    for k in range(1, n + 1):
        deps = {k - 1} if k > 1 else set()
        if 2 < k < n:
            deps.update(r.sample(range(1, k), min(r.randrange(4), k - 1)))
        taken.append({"id": offset + k, "titel": f"Taak {i}-{k}", "klaar": False,
                      "afhankelijk_van": [offset + d for d in sorted(deps)]})
    origineel = copy.deepcopy(taken)
    eis(taakvolgorde.valideer(taken, offset + n, [offset + 1]) == [offset + 1], "geldige_graaf")
    weigert(taakvolgorde.valideer, taken, offset + 1, [offset + n])
    eis(taken == origineel, "graaf_niet_muteren")
    eis(bool(taakvolgorde.blokkades(taken[-1], taken)), "voorganger_nog_open")
    taken[-2]["klaar"] = True
    eis(not taakvolgorde.blokkades(taken[-1], taken), "afgeronde_voorganger")
    return bewijs(origineel)


def kleine_gegevens(r, i):
    n = r.randrange(1, 7)
    return {"taken": [{"id": k, "titel": f"Taak {i}-{k}", "klaar": bool(k % 2), "deadline": None,
                       "minuten": r.randrange(1, 200), "afhankelijk_van": [k - 1] if k > 1 else []} for k in range(1, n + 1)],
            "afspraken": [{"id": n + 1, "titel": f"Afspraak {i}", "start": "2030-01-07T10:00", "einde": "2030-01-07T11:00", "taak_id": n}], "sjablonen": {}}


def backup_roundtrip(r, i):
    g = kleine_gegevens(r, i)
    g["instellingen"] = {"sleutel": f"NOOIT-EXPORTEREN-{i}"}
    origineel = copy.deepcopy(g)
    data = backup.exporteer(g)
    gelezen = backup.lees(data)
    eis(gelezen["gegevens"] == {k: g[k] for k in ("taken", "afspraken", "sjablonen")}, "backup_roundtrip")
    eis(b"NOOIT-EXPORTEREN" not in data, "geen_accountinstellingen")
    eis(g == origineel, "export_niet_muteren")
    return bewijs(g)


def backup_integriteit(r, i):
    g = kleine_gegevens(r, i)
    data = backup.exporteer(g)
    gelezen = json.loads(data)
    gelezen["gegevens"]["taken"][0]["titel"] += "-gewijzigd"
    weigert(backup.lees, json.dumps(gelezen).encode())
    return bewijs(g)


def backup_selectie(r, i):
    g = kleine_gegevens(r, i)
    data = backup.exporteer(g)
    keuze = r.choice([("taken",), ("afspraken",), ("sjablonen",), ("taken", "afspraken")])
    subset = backup.lees(backup.selecteer(data, keuze))["gegevens"]
    eis(all(not subset[k] for k in set(g) - set(keuze)), "selectie_beperkt")
    if "taken" not in keuze:
        eis(all("taak_id" not in a for a in subset["afspraken"]), "geen_dode_taakverwijzingen")
    return bewijs([g, keuze])


def csv_statistiek(r, i):
    getallen = [r.randrange(-100000, 100000) for _ in range(r.randrange(1, 12))]
    inhoud = "bedrag;label\n" + "\n".join(f"{'-' if n < 0 else ''}{abs(n)//100},{abs(n)%100:02d};rij{i}" for n in getallen)
    uit = bestanden.analyseer_csv(f"data{i}.csv", inhoud.encode())
    eis(uit["rijen"] == len(getallen), "csv_rijtelling")
    eis(Decimal(uit["statistieken"][0]["som"]) * 100 == sum(getallen), "csv_exacte_som")
    eis(uit["statistieken"][0]["getallen"] == len(getallen), "csv_numeric_count")
    return bewijs([f"data{i}.csv", inhoud])


def gzip_bestandsnamen(r, i):
    data = r.randbytes(r.randrange(0, 1024))
    naam = r.choice([f"../../voorbeeld{i}.txt", f"C:\\map\\file{i}.txt", f"\x00\x01rapport{i}.txt", f"../café-{i}.csv"])
    uit = bestanden.comprimeer(naam, data)
    eis(gzip.decompress(uit["data"]) == data, "gzip_verliesvrij")
    eis(uit["sha256"] == hashlib.sha256(data).hexdigest(), "gzip_hash")
    veilig = bestanden.veilige_naam(naam)
    eis(not any(c in veilig for c in "/\\") and not any(unicodedata.category(c).startswith("C") for c in veilig), "veilige_bestandsnaam")
    return bewijs([naam, uit["sha256"]])


def csv_weigeringen(r, i):
    keuze = i % 4
    inhoud = (f"kolom{i},kolom{i}\n1,2", f"kolom{i}\n1,2", "a\n" + "x" * 4097, f"a,b{i}\n1")[keuze].encode()
    weigert(bestanden.analyseer_csv, f"ongeldig{i}.csv", inhoud)
    return bewijs([keuze, inhoud])


def bronverwijzingen(r, i):
    geldig = {"soort": "url", "titel": f"Bron {i}", "url": f"https://example.org/document/{i}?v={r.randrange(10000)}"}
    eis(werkbronnen.valideer(geldig) == geldig, "geldige_https_bron")
    ongeldig = {**geldig, "url": r.choice([f"http://example.org/{i}", f"javascript:actie{i}", f"https://user{i}:wachtwoord@example.org", f"https://example.org/{i}\nregel", f"file:///tmp/{i}"])}
    weigert(werkbronnen.valideer, ongeldig)
    return bewijs([geldig, ongeldig])


def capaciteit_unie(r, i):
    dag = datetime(2030, 1, 7, 9)
    afspraken, bezet = [], set()
    for n in range(r.randrange(0, 8)):
        b = r.randrange(0, 530)
        e = min(540, b + r.randrange(1, 90))
        afspraken.append({"id": n + 10, "titel": "Bezet", "start": (dag + timedelta(minutes=b)).isoformat(), "einde": (dag + timedelta(minutes=e)).isoformat()})
        bezet.update(range(max(0, b - 10), min(540, e + 10)))
    duur = r.randrange(1, 1000)
    g = {"taken": [{"id": 1, "titel": str(i), "klaar": False, "minuten": duur, "deadline": "2030-01-07"}], "afspraken": afspraken}
    rapport = capaciteit.rapport(g, 1, dag)
    vrij = 540 - len(bezet)
    eis(rapport["dagen"][0]["vrij_minuten"] == vrij, "intervalunie_vrije_minuten")
    eis(rapport["grenzen"][0]["minimaal_tekort"] == max(0, duur - vrij), "capaciteit_tekort")
    return bewijs(g)


def zoeken_en_privacy(r, i):
    n = r.randrange(2, 25)
    taken = [{"id": k, "titel": f"Café {i} begroting {k}", "klaar": k % 2 == 0, "deadline": None} for k in range(1, n + 1)]
    taken[0]["deadline"] = {"onleesbaar": f"NIET-TONEN-{i}"}
    g = {"taken": taken, "afspraken": [], "instellingen": {"token": f"GEHEIM-{i}"}}
    limiet = r.randrange(1, n)
    gevonden = werkzoeken.zoek(g, f"CAFE {i}", limiet=limiet)
    eis(gevonden["totaal"] == n and len(gevonden["resultaten"]) == limiet, "zoeklimiet_en_accents")
    tekst = json.dumps(gevonden)
    eis("NIET-TONEN" not in tekst and "GEHEIM" not in tekst, "zoekexport_veldprivacy")
    return bewijs([g, limiet])


FAMILIES = {
    "geld_exact": geld_exact, "geld_halve_cent": geld_halve_cent, "invoervormen": invoervormen,
    "tijdzones": tijdzones, "overlap": overlap, "taakgrafen": taakgrafen,
    "backup_roundtrip": backup_roundtrip, "backup_integriteit": backup_integriteit, "backup_selectie": backup_selectie,
    "csv_statistiek": csv_statistiek, "gzip_bestandsnamen": gzip_bestandsnamen, "csv_weigeringen": csv_weigeringen,
    "bronverwijzingen": bronverwijzingen, "capaciteit_unie": capaciteit_unie, "zoeken_en_privacy": zoeken_en_privacy,
}


def geval(familie, nummer, seed=SEED):
    if familie not in FAMILIES or type(nummer) is not int or not 0 <= nummer < PER_FAMILIE:
        raise ValueError("Onbekend diepcontrole-geval.")
    familie_seed = int.from_bytes(hashlib.sha256(familie.encode()).digest()[:8], "big")
    rng = random.Random(seed ^ familie_seed ^ (nummer * 1000003))
    return FAMILIES[familie](rng, nummer)
