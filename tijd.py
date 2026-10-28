"""Persoonlijke tijdregistratie per afspraak.

De gebruiker tikt vier momenten aan: vertrokken, aangekomen, weg en terug.
Daaruit volgt per afspraak:
- reistijd heen en terug (blauw),
- tijd op locatie binnen de geplande tijd (groen),
- uitloop: langer gebleven dan gepland (rood).
"""

from datetime import date, datetime, timedelta

import opslag
import symbool

MOMENTEN = ["vertrokken", "aangekomen", "weg", "terug"]


def volgend_moment(afspraak: dict) -> str | None:
    """Het moment dat als eerste nog moet worden aangetikt, of None als alles er is."""
    vastgelegd = afspraak.get("tijden", {})
    return next((m for m in MOMENTEN if m not in vastgelegd), None)


def _minuten(van: datetime, tot: datetime) -> int:
    return max(0, round((tot - van).total_seconds() / 60))


def berekening(afspraak: dict) -> dict | None:
    """Minuten per kleur voor één afspraak. None als er nog niets is vastgelegd."""
    tijden = {m: datetime.fromisoformat(t) for m, t in afspraak.get("tijden", {}).items()}
    if not tijden:
        return None
    start = datetime.fromisoformat(afspraak["start"]) if "T" in afspraak["start"] else None
    if afspraak.get("einde") and "T" in afspraak["einde"]:
        gepland_einde = datetime.fromisoformat(afspraak["einde"])
    else:
        gepland_einde = start + timedelta(hours=1) if start else None

    uitkomst = {"heen": 0, "op_locatie": 0, "uitloop": 0, "terug": 0}
    if "vertrokken" in tijden and "aangekomen" in tijden:
        uitkomst["heen"] = _minuten(tijden["vertrokken"], tijden["aangekomen"])
    if "aangekomen" in tijden and "weg" in tijden:
        weg = tijden["weg"]
        grens = max(gepland_einde, tijden["aangekomen"]) if gepland_einde else weg
        uitkomst["op_locatie"] = _minuten(tijden["aangekomen"], min(weg, grens))
        uitkomst["uitloop"] = _minuten(grens, weg)
    if "weg" in tijden and "terug" in tijden:
        uitkomst["terug"] = _minuten(tijden["weg"], tijden["terug"])
    uitkomst["reistijd"] = uitkomst["heen"] + uitkomst["terug"]
    if "vertrokken" in tijden and start and "aangekomen" in tijden:
        uitkomst["te_laat"] = _minuten(start, tijden["aangekomen"])
    return uitkomst


def tijdsbesteding(van: str, tot: str) -> dict:
    """Overzicht per afspraak en totalen tussen twee datums (JJJJ-MM-DD)."""
    regels, totaal = [], {"reistijd": 0, "op_locatie": 0, "uitloop": 0}
    for afspraak in opslag.afspraken_tussen(van, tot):
        if uitkomst := berekening(afspraak):
            regels.append({"id": afspraak["id"], "titel": afspraak["titel"], "start": afspraak["start"], **uitkomst})
            for sleutel in totaal:
                totaal[sleutel] += uitkomst[sleutel]
    return {"van": van, "tot": tot, "afspraken": regels, "totaal_minuten": totaal}


# Per sport een symbool (Material Symbols, zie symbool.py).
SPORT_ICOON = {"hardlopen": "directions_run", "rennen": "directions_run", "fitness": "fitness_center",
               "krachttraining": "fitness_center", "crossfit": "fitness_center", "fietsen": "directions_bike",
               "wielrennen": "directions_bike", "mountainbiken": "directions_bike", "bmx": "pedal_bike",
               "spinning": "directions_bike", "zwemmen": "pool", "waterpolo": "pool", "wandelen": "directions_walk",
               "hiken": "hiking", "voetbal": "sports_soccer", "futsal": "sports_soccer", "tennis": "sports_tennis",
               "padel": "sports_tennis", "squash": "sports_tennis", "badminton": "sports_tennis",
               "tafeltennis": "sports_tennis", "yoga": "self_improvement", "pilates": "self_improvement",
               "boksen": "sports_mma", "kickboksen": "sports_mma", "mma": "sports_mma", "judo": "sports_martial_arts",
               "karate": "sports_martial_arts", "taekwondo": "sports_martial_arts", "worstelen": "sports_kabaddi",
               "basketbal": "sports_basketball", "volleybal": "sports_volleyball", "beachvolleybal": "sports_volleyball",
               "handbal": "sports_handball", "hockey": "sports_hockey", "ijshockey": "sports_hockey",
               "honkbal": "sports_baseball", "softbal": "sports_baseball", "rugby": "sports_rugby",
               "american football": "sports_football", "golf": "golf_course", "skiën": "downhill_skiing",
               "snowboarden": "snowboarding", "schaatsen": "ice_skating", "skaten": "skateboarding",
               "skateboarden": "skateboarding", "surfen": "surfing", "kitesurfen": "kitesurfing", "zeilen": "sailing",
               "roeien": "rowing", "kanoën": "kayaking", "klimmen": "landscape", "boulderen": "landscape",
               "paardrijden": "pets", "atletiek": "directions_run", "turnen": "sports_gymnastics", "dansen": "nightlife",
               "schermen": "sports_martial_arts", "darten": "target", "boogschieten": "target", "schaken": "chess",
               "duiken": "scuba_diving", "triatlon": "pool", "korfbal": "sports_basketball", "cricket": "sports_cricket",
               "motorcross": "two_wheeler", "karten": "sports_motorsports", "parkour": "sports_gymnastics",
               "calisthenics": "sports_gymnastics", "touwtjespringen": "sports_gymnastics",
               "wandelvoetbal": "sports_soccer", "bootcamp": "fitness_center"}
SPORTEN = sorted(set(SPORT_ICOON) - {"rennen"})


def sport_icoon(sport: str) -> str:
    """Het symbool van een sport, voor markdown."""
    return symbool.md(SPORT_ICOON.get(sport, "emoji_events"))


# Soorten afspraken in de agenda, met hun symbool (Material Symbols, zie symbool.py).
SOORTEN = {"afspraak": "push_pin", "sport": "directions_run", "uitgaan": "celebration", "etentje": "restaurant",
           "werk": "work", "familie en vrienden": "group", "gezondheid": "stethoscope", "reizen": "flight",
           "verjaardag": "cake", "herinnering": "notifications", "focus": "target", "vrij": "beach_access",
           "bezorging": "local_shipping", "overig": "event"}
# Taken met een deadline staan als herinnering in de agenda, maar zijn geen soort afspraak.
_TEKENS = SOORTEN | {"taak": "task_alt"}


def teken(soort: str) -> str:
    """Het symbool van een soort afspraak, voor markdown."""
    return symbool.md(_TEKENS.get(soort, "event"))


def soort_tekst(soort: str) -> str:
    """Symbool en naam, bijvoorbeeld voor een knop of een kopje: ":material/work: Werk"."""
    return f"{teken(soort)} {soort.capitalize()}"


# Elke soort heeft een eigen kleur in de agenda; de gebruiker kan ze aanpassen (instellingen.kleuren).
# "taak" is voor taken met een deadline, die als herinnering in de agenda staan.
KLEUREN = {"afspraak": "#2563eb", "sport": "#16a34a", "uitgaan": "#9333ea", "etentje": "#ea580c",
           "werk": "#475569", "familie en vrienden": "#db2777", "gezondheid": "#0891b2", "reizen": "#ca8a04",
           "verjaardag": "#f59e0b", "herinnering": "#dc2626", "focus": "#0d9488", "vrij": "#059669", "bezorging": "#7c3aed", "overig": "#64748b", "taak": "#e11d48"}


def kleur(soort: str) -> str:
    eigen = opslag.instellingen().get("kleuren", {})
    return eigen.get(soort) or KLEUREN.get(soort, KLEUREN["overig"])


def label_html(soort: str, tekst: str = "") -> str:
    """Een gekleurd labeltje met symbool, bijvoorbeeld "Werk" in de kleur van werk."""
    k = kleur(soort)
    tekst = symbool.html(_TEKENS.get(soort, "notifications"), "1.05em") + " " + (tekst or soort.capitalize())
    return (f'<span style="background:{k}22;color:{k};border:1px solid {k}55;border-radius:10px;'
            f'padding:1px 8px;font-size:13px;white-space:nowrap">{tekst}</span>')


def soort_van(afspraak: dict) -> str:
    """De soort van een afspraak; oudere afspraken met een sport tellen als sport."""
    soort = afspraak.get("soort") or ("sport" if afspraak.get("sport") else "afspraak")
    return soort if soort in SOORTEN else "overig"


def icoon_naam(afspraak: dict) -> str:
    if afspraak.get("sport"):
        return SPORT_ICOON.get(afspraak["sport"], "emoji_events")
    return SOORTEN[soort_van(afspraak)]


def icoon(afspraak: dict) -> str:
    """Het symbool van een afspraak, voor markdown."""
    return symbool.md(icoon_naam(afspraak))


def icoon_html(afspraak: dict) -> str:
    """Het symbool van een afspraak, voor eigen HTML."""
    return symbool.html(icoon_naam(afspraak))


def sportminuten(afspraak: dict) -> int:
    """Hoe lang er gesport is: ingevuld resultaat, anders tijdregistratie, anders de geplande duur."""
    if minuten := afspraak.get("sport_resultaat", {}).get("minuten"):
        return minuten
    if (uitkomst := berekening(afspraak)) and (uitkomst["op_locatie"] or uitkomst["uitloop"]):
        return uitkomst["op_locatie"] + uitkomst["uitloop"]
    if afspraak.get("einde") and "T" in afspraak["einde"] and "T" in afspraak["start"]:
        return _minuten(datetime.fromisoformat(afspraak["start"]), datetime.fromisoformat(afspraak["einde"]))
    return 60


def gedaan(van: str, tot: str, sport: str = "") -> list[dict]:
    """Sportafspraken die echt gedaan zijn (resultaat, tijdregistratie, of de tijd is voorbij)."""
    nu = datetime.now().isoformat(timespec="minutes")
    return [a for a in opslag.afspraken_tussen(van, tot)
            if a.get("sport") and (not sport or a["sport"] == sport)
            and (a.get("sport_resultaat") or a.get("tijden") or a["start"] <= nu)]


def _km(afspraak: dict) -> float:
    return afspraak.get("sport_resultaat", {}).get("afstand_km", 0)


EENHEID = {"keer_per_week": "keer deze week", "minuten_per_week": "minuten deze week", "km_per_week": "km deze week",
           "langste_km": "km in één keer", "totaal_km": "km totaal", "eigen": ""}


def doel_voortgang(doel: dict) -> dict:
    """Hoe ver de gebruiker is met een sportdoel."""
    vandaag = datetime.now().date()
    maandag = (vandaag - timedelta(days=vandaag.weekday())).isoformat()
    maatstaf = doel["maatstaf"]
    if maatstaf == "eigen":
        lijst = []
    elif maatstaf.endswith("_per_week"):
        lijst = gedaan(maandag, vandaag.isoformat(), doel.get("sport", ""))
    else:
        lijst = gedaan(doel["gestart"], vandaag.isoformat(), doel.get("sport", ""))
    huidig = {
        "eigen": doel.get("stand", 0),
        "keer_per_week": len(lijst),
        "minuten_per_week": sum(sportminuten(a) for a in lijst),
        "km_per_week": sum(_km(a) for a in lijst),
        "langste_km": max((_km(a) for a in lijst), default=0),
        "totaal_km": sum(_km(a) for a in lijst),
    }[maatstaf]
    procent = min(100, round(100 * huidig / doel["doelwaarde"])) if doel["doelwaarde"] else 0
    uitkomst = {**doel, "huidig": round(huidig, 1), "procent": procent,
                "tekst": f"{round(huidig, 1):g} van {doel['doelwaarde']:g} {doel.get('eenheid', '') if maatstaf == 'eigen' else EENHEID[maatstaf]}".strip()}
    if doel.get("deadline"):
        uitkomst["dagen_te_gaan"] = (datetime.fromisoformat(doel["deadline"]).date() - vandaag).days
    return uitkomst


def sportoverzicht(van: str, tot: str) -> dict:
    """Gedane sportafspraken tussen twee datums: aantal, minuten, kilometers, per sport."""
    gedaan_lijst = gedaan(van, tot)
    per_sport: dict[str, int] = {}
    for a in gedaan_lijst:
        per_sport[a["sport"]] = per_sport.get(a["sport"], 0) + 1
    return {
        "van": van,
        "tot": tot,
        "aantal": len(gedaan_lijst),
        "minuten": sum(sportminuten(a) for a in gedaan_lijst),
        "afstand_km": round(sum(_km(a) for a in gedaan_lijst), 1),
        "per_sport": per_sport,
    }


def gewoontes(dagen: int = 90) -> dict:
    """Wat de tijdregistratie leert, per soort afspraak: hoe vaak, gemiddelde uitloop en hoe laat je aankomt."""
    tot = datetime.now().date()
    per_soort: dict[str, dict] = {}
    for afspraak in opslag.afspraken_tussen((tot - timedelta(days=dagen)).isoformat(), tot.isoformat()):
        if not (uitkomst := berekening(afspraak)):
            continue
        s = per_soort.setdefault(soort_van(afspraak), {"aantal": 0, "uitloop": 0, "te_laat": 0, "op_locatie": 0})
        s["aantal"] += 1
        s["uitloop"] += uitkomst["uitloop"]
        s["te_laat"] += uitkomst.get("te_laat") or 0
        s["op_locatie"] += uitkomst["op_locatie"]
    return {soort: {"aantal": s["aantal"], "gem_uitloop_min": round(s["uitloop"] / s["aantal"]),
                    "gem_te_laat_min": round(s["te_laat"] / s["aantal"]),
                    "gem_op_locatie_min": round(s["op_locatie"] / s["aantal"])}
            for soort, s in per_soort.items()}


def plan_inplannen(sport: str, plan: dict, weekdagen: list[int], tijdstip) -> int:
    """Zet de sessies van een trainingsplan op de gekozen weekdagen (0 = maandag), vanaf volgende week maandag."""
    vandaag = date.today()
    maandag = vandaag + timedelta(days=7 - vandaag.weekday())
    nummers = sorted(set(weekdagen))
    aantal = 0
    for w in plan["weken"]:
        for i, sessie in enumerate(w["sessies"]):
            dag = maandag + timedelta(weeks=w["week"] - 1, days=nummers[i % len(nummers)])
            start = datetime.combine(dag, tijdstip)
            opslag.afspraak_toevoegen(f"{sport.capitalize()}: {sessie['titel']}", start.isoformat(timespec="minutes"),
                                      (start + timedelta(minutes=sessie["minuten"] or 60)).isoformat(timespec="minutes"),
                                      notitie=sessie["inhoud"], sport=sport, soort="sport")
            aantal += 1
    return aantal
