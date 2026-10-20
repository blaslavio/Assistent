"""Snel invoeren in gewone taal: "morgen 9u tandarts in Ede" wordt een afspraak, "vrijdag belasting, 1 uur" een taak.

Werkt zonder Claude: alleen vaste woorden en patronen. Met een tijd wordt het een afspraak, zonder tijd
een taak (met de datum als deadline). Wat niet herkend wordt, blijft gewoon de titel.
"""

import re
from datetime import date, datetime, timedelta

DAGEN = {"maandag": 0, "dinsdag": 1, "woensdag": 2, "donderdag": 3, "vrijdag": 4, "zaterdag": 5, "zondag": 6}
MAANDEN = {"januari": 1, "jan": 1, "februari": 2, "feb": 2, "maart": 3, "mrt": 3, "april": 4, "apr": 4, "mei": 5,
           "juni": 6, "jun": 6, "juli": 7, "jul": 7, "augustus": 8, "aug": 8, "september": 9, "sep": 9, "sept": 9,
           "oktober": 10, "okt": 10, "november": 11, "nov": 11, "december": 12, "dec": 12}

# Woord in de tekst -> soort in de agenda (tijd.SOORTEN).
SOORT_WOORDEN = {
    "sport": ["sporten", "sport", "fitness", "gym", "hardlopen", "rennen", "voetbal", "zwemmen", "yoga", "fietsen",
              "tennis", "padel", "training", "wandelen", "crossfit", "boksen"],
    "etentje": ["eten", "etentje", "diner", "lunch", "ontbijt", "borrel", "restaurant"],
    "werk": ["werk", "vergadering", "meeting", "overleg", "sollicitatie", "presentatie", "klant", "call"],
    "gezondheid": ["tandarts", "huisarts", "dokter", "fysio", "fysiotherapeut", "ziekenhuis", "kapper", "apotheek",
                   "psycholoog", "orthodontist", "opticien"],
    "uitgaan": ["feest", "feestje", "concert", "bioscoop", "film", "festival", "café", "uitgaan", "theater", "museum"],
    "verjaardag": ["verjaardag", "jarig", "verjaardagsfeest", "birthday"],
    "familie en vrienden": ["oma", "opa", "mama", "papa", "moeder", "vader", "familie",
                            "vrienden", "zus", "broer"],
    "reizen": ["vlucht", "vliegtuig", "vakantie", "trein", "reis", "hotel"],
}
VRAAGWOORDEN = ("wat", "wie", "waar", "wanneer", "hoe", "waarom", "welke", "welk", "kun", "kan", "kunt", "wil",
                "zou", "heb", "is", "zijn", "moet", "mag", "geef", "zoek", "vertel", "help", "leg", "maak", "schrijf")

def _volgende_dag(vandaag: date, weekdag: int, volgende_week: bool) -> date:
    """"Vrijdag" is de eerstvolgende vrijdag (vandaag als het vrijdag is), "volgende week vrijdag" een week later."""
    return vandaag + timedelta(days=(weekdag - vandaag.weekday()) % 7 + (7 if volgende_week else 0))


def _wis(tekst: str, gevonden: re.Match) -> str:
    return (tekst[:gevonden.start()] + " " + tekst[gevonden.end():]).strip()


def lees(invoer: str, nu: datetime | None = None) -> dict:
    """Haalt datum, tijd, duur, plaats en soort uit een zin. Geeft altijd een voorstel terug."""
    nu = nu or datetime.now()
    vandaag = nu.date()
    tekst = " " + re.sub(r"\s*,\s*", " , ", invoer.strip().rstrip(".!")) + " "
    laag = tekst.lower()
    dag = einde_tijd = begin_tijd = None
    minuten = None
    deadline_woord = False

    def zoek(patroon: str):
        nonlocal tekst, laag
        m = re.search(patroon, laag)
        if m:
            tekst, laag = " " + _wis(tekst, m) + " ", " " + _wis(laag, m) + " "
        return m

    # Een deadline: "voor vrijdag", "uiterlijk 12 nov", "deadline morgen".
    if m := zoek(r"\s(?:voor|vóór|uiterlijk|deadline|uiterlijk op)(?=\s+(?:vandaag|morgen|overmorgen|volgende|"
                 r"maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|\d))"):
        deadline_woord = True

    # Datum.
    middag = bool(re.search(r"'s middags|'s avonds|avond\b|middag\b|vanavond", laag))
    # Herhaling: "elke dinsdag", "elke werkdag", "om de week", "maandelijks".
    herhaal = ""
    if m := zoek(r"\s(?:elke|iedere) (maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)(?:avond|middag|ochtend)?\s"):
        herhaal, dag = "week", _volgende_dag(vandaag, DAGEN[m.group(1)], False)
    elif m := zoek(r"\s(elke dag|iedere dag|dagelijks|elke werkdag|iedere werkdag|doordeweeks|om de week|om de twee "
                   r"weken|elke twee weken|elke week|iedere week|wekelijks|elke maand|iedere maand|maandelijks|elk jaar|"
                   r"ieder jaar|jaarlijks)\s"):
        w = m.group(1)
        herhaal = ("werkdag" if "werkdag" in w or w == "doordeweeks" else "twee_weken" if "twee" in w or "om de" in w
                   else "dag" if "dag" in w else "week" if "week" in w or "wekelijks" in w
                   else "maand" if "maand" in w else "jaar")
    if dag:
        pass
    elif zoek(r"\s(vandaag|vanavond|vanmiddag|vanochtend|vanmorgen)\s"):
        dag = vandaag
    elif m := zoek(r"\s(overmorgen|morgen)(?:avond|middag|ochtend)?\s"):
        dag = vandaag + timedelta(days=2 if m.group(1) == "overmorgen" else 1)
    elif m := zoek(r"\sover (\d+|een|twee|drie) (dag|dagen|week|weken)\s"):
        aantal = {"een": 1, "twee": 2, "drie": 3}.get(m.group(1)) or int(m.group(1))
        dag = vandaag + timedelta(days=aantal * (7 if m.group(2).startswith("we") else 1))
    elif m := zoek(r"\s(?:(volgende week|volgende) )?(?:op )?(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|"
                   r"zondag)(?:avond|middag|ochtend)?\s"):
        dag = _volgende_dag(vandaag, DAGEN[m.group(2)], bool(m.group(1)))
    elif m := zoek(r"\s(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?\s"):
        jaar = int(m.group(3)) if m.group(3) else vandaag.year
        jaar += 2000 if jaar < 100 else 0
        try:
            dag = date(jaar, int(m.group(2)), int(m.group(1)))
            if not m.group(3) and dag < vandaag:
                dag = dag.replace(year=jaar + 1)
        except ValueError:
            dag = None
    elif m := zoek(r"\s(\d{1,2}) (" + "|".join(sorted(MAANDEN, key=len, reverse=True)) + r")\.?(?: (\d{4}))?\s"):
        jaar = int(m.group(3)) if m.group(3) else vandaag.year
        try:
            dag = date(jaar, MAANDEN[m.group(2)], int(m.group(1)))
            if not m.group(3) and dag < vandaag:
                dag = dag.replace(year=jaar + 1)
        except ValueError:
            dag = None

    # Duur: "1 uur", "anderhalf uur", "30 min", "duurt 2 uur". "om 8 uur" en "8 uur" (6 of later) zijn een tijd.
    for m in re.finditer(r"\s(duurt |voor |, )?(anderhalf|een half|half|\d+(?:[.,]\d)?) ?(uur|minuten|min|kwartier)(?=\s)", laag):
        if laag[:m.start()].endswith(" om"):
            continue
        getal = {"anderhalf": 1.5, "een half": 0.5, "half": 0.5}.get(m.group(2))
        getal = getal if getal is not None else float(m.group(2).replace(",", "."))
        if m.group(3) == "uur" and not m.group(1) and getal == int(getal) and getal >= 6:
            continue
        minuten = round(getal * (15 if m.group(3) == "kwartier" else 60 if m.group(3) == "uur" else 1))
        tekst = tekst[:m.start()] + (" , " if m.group(1) == ", " else " ") + tekst[m.end():]
        laag = tekst.lower()
        break

    # Tijd: "9-11u", "van 9 tot 11", "9:30", "half 3", "om 14 uur", "9u", "20 uur".
    if m := zoek(r"\s(?:van )?(\d{1,2})(?:[:.u](\d{2}))?u?\s?(?:-|tot)\s?(\d{1,2})(?:[:.u](\d{2})|u|h| uur)?\s"):
        begin_tijd = (int(m.group(1)), int(m.group(2) or 0))
        einde_tijd = (int(m.group(3)), int(m.group(4) or 0))
    elif m := zoek(r"\s(?:om )?half (\d{1,2})\s"):
        begin_tijd = ((int(m.group(1)) - 1) % 24, 30)
    elif m := (zoek(r"\s(?:om )?(\d{1,2})(?:[:.u](\d{2})|u|h)\s") or zoek(r"\som (\d{1,2})( uur)?\s")
               or zoek(r"\s(\d{1,2})( uur)\s")):
        begin_tijd = (int(m.group(1)), int(m.group(2)) if (m.group(2) or "").isdigit() else 0)
    ochtend = bool(re.search(r"'s ochtends|'s morgens|'s nachts|ochtend|vanmorgen", laag))
    zoek(r"\s's (?:ochtends|morgens|middags|avonds|nachts)\s")
    # "half 3" of "om 2" bedoelt bijna altijd de middag.
    if begin_tijd and begin_tijd[0] < 12 and (middag or (1 <= begin_tijd[0] <= 6 and not ochtend)):
        begin_tijd = (begin_tijd[0] + 12, begin_tijd[1])
        if einde_tijd and einde_tijd[0] < 12:
            einde_tijd = (einde_tijd[0] + 12, einde_tijd[1])
    if einde_tijd and einde_tijd < begin_tijd and einde_tijd[0] + 12 < 24:
        einde_tijd = (einde_tijd[0] + 12, einde_tijd[1])
    if begin_tijd and not (0 <= begin_tijd[0] < 24 and 0 <= begin_tijd[1] < 60):
        begin_tijd = einde_tijd = None
    if einde_tijd and not (0 <= einde_tijd[0] < 24 and 0 <= einde_tijd[1] < 60):
        einde_tijd = None

    # Plaats: "@ Ede", "in Ede", "bij de Jumbo in Ede" -> laatste "in/@ ..." met hoofdletter.
    locatie = ""
    if m := re.search(r"\s(?:@\s?|in |op )([A-Z0-9][^,;]*?)\s*$", tekst):
        locatie = m.group(1).strip()
        tekst = tekst[:m.start()]

    titel = re.sub(r"\s+", " ", tekst)
    titel = re.sub(r"(\s,)+", ",", titel)
    titel = re.sub(r"^[\s,;:-]+|[\s,;:-]+$", "", titel).strip()
    titel = re.sub(r"^(?:herinner me (?:aan |eraan )?|niet vergeten:? |taak:? |afspraak:? |om )", "", titel,
                   flags=re.I).strip() or invoer.strip()
    titel = titel[:1].upper() + titel[1:]

    soort = ""
    woorden = set(re.findall(r"[a-zé]+", invoer.lower()))
    for naam, lijst in SOORT_WOORDEN.items():
        if woorden & set(lijst):
            soort = naam
            break
    if re.search(r"herinner|niet vergeten", invoer, re.I):
        soort = "herinnering"

    resultaat = {"titel": titel, "soort_agenda": soort, "locatie": locatie, "herhaal": herhaal}
    if soort == "verjaardag" and dag and not begin_tijd:
        # "Sanne jarig 12 mei": een hele dag, elk jaar.
        resultaat |= {"wat": "afspraak", "start": dag.isoformat(), "einde": None, "herhaal": herhaal or "jaar"}
    elif begin_tijd and not deadline_woord:
        dag = dag or (vandaag if begin_tijd >= (nu.hour, nu.minute) else vandaag + timedelta(days=1))
        start = datetime.combine(dag, datetime.min.time()).replace(hour=begin_tijd[0], minute=begin_tijd[1])
        if einde_tijd:
            einde = start.replace(hour=einde_tijd[0], minute=einde_tijd[1])
            einde += timedelta(days=1) if einde <= start else timedelta()
        else:
            einde = start + timedelta(minutes=minuten or 60)
        resultaat |= {"wat": "afspraak", "start": start.isoformat(timespec="minutes"),
                      "einde": einde.isoformat(timespec="minutes")}
    else:
        resultaat |= {"wat": "taak", "deadline": dag.isoformat() if dag else None, "minuten": minuten}
    if resultaat["wat"] != "afspraak":
        resultaat["herhaal"] = ""  # taken herhalen (nog) niet
    resultaat["herkend"] = bool(dag or begin_tijd or minuten or locatie or herhaal)
    return resultaat


_BEDRAG = r"(\d{1,6}(?:[.,]\d{1,2})?)"


def uitgave(invoer: str) -> dict | None:
    """'€12,50 lunch', 'lunch €12,50' of '12,50 euro lunch' -> {bedrag, omschrijving}; anders None."""
    tekst = invoer.strip()
    for patroon, bedrag_eerst in ((rf"^€\s*{_BEDRAG}\s+(.+)$", True), (rf"^{_BEDRAG}\s*(?:euro|eur)\b\s*(.+)$", True),
                                   (rf"^(.+?)\s+€\s*{_BEDRAG}$", False), (rf"^(.+?)\s+{_BEDRAG}\s*(?:euro|eur)$", False)):
        if m := re.match(patroon, tekst, re.I):
            bedrag, omschrijving = (m.group(1), m.group(2)) if bedrag_eerst else (m.group(2), m.group(1))
            omschrijving = re.sub(r"^(voor|aan)\s+", "", omschrijving.strip(" ,.-"), flags=re.I)
            if omschrijving and "?" not in omschrijving and len(omschrijving) <= 80:
                return {"bedrag": float(bedrag.replace(",", ".")), "omschrijving": omschrijving}
    return None


def lijkt_invoer(invoer: str) -> bool:
    """True als een zin uit het invoerveld eerder iets om toe te voegen is dan een vraag aan de assistent."""
    tekst = invoer.strip()
    if not tekst or "?" in tekst or len(tekst) > 120:
        return False
    eerste = re.findall(r"[a-zé]+", tekst.lower())[:1]
    if eerste and eerste[0] in VRAAGWOORDEN:
        return False
    r = lees(tekst)
    return bool(r.get("start") or r.get("deadline"))
