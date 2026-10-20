"""Budget: wat er binnenkomt en uitgaat, per categorie, met maandbudgetten, vaste lasten en spaardoelen.

Uitgaven en inkomsten staan in een eigen tabel (private.transacties), zodat de rest van de app snel blijft, ook
als je een heel bankafschrift inleest. Budgetten, vaste lasten, spaardoelen en je eigen categorieregels zijn klein
en staan bij de instellingen (instellingen.budget). Een bedrag is negatief voor een uitgave, positief voor inkomsten.

Bankafschriften: CSV van ING, Rabobank, bunq, SNS/ASN/RegioBank, Knab, Triodos en de TXT van ABN AMRO.
De app herkent zelf welke bank het is. Twee keer hetzelfde afschrift inlezen geeft geen dubbele regels.
"""

import calendar
import csv
import hashlib
import io
import re
import secrets
import time
from datetime import date, datetime, timedelta

import opslag

# Categorie -> (icoon, woorden in naam of omschrijving waaraan we hem herkennen).
CATEGORIEEN: dict[str, tuple[str, list[str]]] = {
    "Boodschappen": (":material/shopping_cart:", [
        "albert heijn", "ah to go", "jumbo", "lidl", "aldi", "plus ", "dirk", "coop", "spar", "dekamarkt", "vomar",
        "hoogvliet", "picnic", "ekoplaza", "crisp", "flink", "poiesz", "boni", "nettorama", "jan linders", "deen"]),
    "Wonen": (":material/home:", [
        "huur", "hypotheek", "woningcorporatie", "woonstichting", "vve", "gemeentelijke belastingen", "waterschap",
        "belastingsamenwerking", "ozb"]),
    "Energie en water": (":material/bolt:", [
        "vattenfall", "eneco", "essent", "greenchoice", "budget energie", "energiedirect", "vandebron", "pure energie",
        "engie", "vitens", "evides", "brabant water", "oasen", "pwn", "dunea", "waternet", "wml", "wmd"]),
    "Verzekeringen": (":material/shield:", [
        "zilveren kruis", "cz groep", " cz ", "vgz", "menzis", "dsw", "ohra", "centraal beheer", "interpolis",
        "nationale-nederlanden", "achmea", "unive", "univé", "fbto", "ditzo", "anwb verzeker", "allianz", "asr ",
        "a.s.r", "inshared", "verzekering", "zorgverzeker"]),
    "Abonnementen": (":material/subscriptions:", [
        "netflix", "spotify", "disney", "videoland", "apple.com", "itunes", "icloud", "google", "youtube", "kpn",
        "ziggo", "odido", "t-mobile", "vodafone", "tele2", "simyo", "lebara", "ben ", "youfone", "amazon prime",
        "hbo", "max.com", "nlziet", "viaplay", "dazn", "abonnement", "chatgpt", "openai", "anthropic", "claude.ai",
        "microsoft", "adobe", "dropbox", "storytel", "audible"]),
    "Vervoer": (":material/directions_car:", [
        "ns groep", "ns reizigers", "ov-chipkaart", "translink", "shell", "bp ", "esso", "tinq", "tango", "totalenergies",
        "gulf", "q8", "texaco", "argos", "parkeren", "yellowbrick", "parkmobile", "easypark", "anwb", "swapfiets",
        "greenwheels", "uber ", "bolt", "arriva", "connexxion", "ret ", "gvb", "htm", "qbuzz", "keolis", "ebs",
        "fastned", "allego", "vattenfall incharge", "wegenbelasting", "apk"]),
    "Eten en drinken": (":material/restaurant:", [
        "thuisbezorgd", "uber eats", "deliveroo", "mcdonald", "burger king", "kfc", "starbucks", "restaurant", "cafe",
        "café", "domino", "new york pizza", "febo", "subway", "lunch", "koffie", "broodje", "diner", "borrel", "eetcafe", "bakkerij", "brasserie"]),
    "Winkelen": (":material/shopping_bag:", [
        "bol.com", "amazon", "zalando", "coolblue", "hema", "action", "ikea", "kruidvat", "etos", "primark", "h&m",
        "mediamarkt", "blokker", "gamma", "praxis", "karwei", "hornbach", "wehkamp", "temu", "shein", "aliexpress",
        "decathlon", "intertoys", "bijenkorf", "c&a", "zeeman", "xenos", "flying tiger", "vinted", "marktplaats"]),
    "Gezondheid": (":material/health_and_safety:", [
        "apotheek", "tandarts", "fysio", "huisarts", "ziekenhuis", "opticien", "specsavers", "pearle", "eigen risico"]),
    "Vrije tijd": (":material/sports_tennis:", [
        "basic-fit", "basic fit", "sportschool", "fitness", "pathe", "pathé", "vue ", "kinepolis", "ticketmaster",
        "efteling", "museum", "bioscoop", "concert", "steam", "playstation", "nintendo", "xbox", "booking.com",
        "airbnb", "transavia", "klm", "ryanair", "easyjet", "tui", "sunweb", "corendon"]),
    "Kinderen": (":material/child_care:", ["kinderopvang", "kdv", "bso", "school", "ouderbijdrage"]),
    "Sparen en beleggen": (":material/savings:", [
        "spaarrekening", "spaardeposito", "degiro", "meesman", "brand new day", "bux", "trading 212", "saxo",
        "peaks", "lynx", "bitvavo", "eigen rekening"]),
    "Inkomen": (":material/payments:", [
        "salaris", "loon", "uwv", "svb", "toeslag", "duo", "studiefinanciering", "kinderbijslag", "pensioen",
        "teruggave", "vakantiegeld"]),
    "Overig": (":material/more_horiz:", []),
}
UITGAVEN = [c for c in CATEGORIEEN if c != "Inkomen"]
ONTHOUD_SECONDEN = 20

_cache: dict[tuple, tuple[float, list[dict]]] = {}


class Fout(Exception):
    """Iets ging mis; de tekst is geschikt om aan de gebruiker te tonen."""


# --- Instellingen ----------------------------------------------------------------------------------------------------

def instellingen() -> dict:
    """{budgetten: {categorie: bedrag}, vaste_lasten: [...], spaardoelen: [...], regels: {tegenpartij: categorie}}."""
    b = opslag.instellingen().get("budget", {})
    return {"budgetten": b.get("budgetten", {}), "vaste_lasten": b.get("vaste_lasten", []),
            "spaardoelen": b.get("spaardoelen", []), "regels": b.get("regels", {}), "gebruikt": b.get("gebruikt", False)}


def in_gebruik() -> bool:
    """Of de gebruiker het budget al gebruikt (alleen dan kost het een vraag aan de database)."""
    b = instellingen()
    return bool(b["gebruikt"] or b["budgetten"] or b["vaste_lasten"] or b["spaardoelen"])


def _bewaar(**velden) -> None:
    b = opslag.instellingen().get("budget", {})
    opslag.instellingen_bijwerken(budget={**b, **velden, "gebruikt": True})


def budget_instellen(categorie: str, bedrag: float) -> None:
    budgetten = dict(instellingen()["budgetten"])
    if bedrag and bedrag > 0:
        budgetten[categorie] = round(float(bedrag), 2)
    else:
        budgetten.pop(categorie, None)
    _bewaar(budgetten=budgetten)


def vaste_last_toevoegen(naam: str, bedrag: float, dag: int, categorie: str) -> dict:
    last = {"id": secrets.token_hex(4), "naam": naam.strip(), "bedrag": round(abs(float(bedrag)), 2),
            "dag": max(1, min(28, int(dag))), "categorie": categorie}
    _bewaar(vaste_lasten=instellingen()["vaste_lasten"] + [last])
    return last


def vaste_last_weg(last_id: str) -> None:
    _bewaar(vaste_lasten=[v for v in instellingen()["vaste_lasten"] if v["id"] != last_id])


def spaardoel_toevoegen(naam: str, doel: float, datum: str | None = None) -> dict:
    s = {"id": secrets.token_hex(4), "naam": naam.strip(), "doel": round(float(doel), 2), "gespaard": 0.0,
         "datum": datum}
    _bewaar(spaardoelen=instellingen()["spaardoelen"] + [s])
    return s


def spaardoel_bijwerken(doel_id: str, erbij: float = 0, weg: bool = False) -> dict | None:
    doelen, gevonden = [], None
    for s in instellingen()["spaardoelen"]:
        if s["id"] == doel_id:
            if weg:
                continue
            s = {**s, "gespaard": round(max(0.0, s["gespaard"] + float(erbij)), 2)}
            gevonden = s
        doelen.append(s)
    _bewaar(spaardoelen=doelen)
    return gevonden


# --- Herkennen --------------------------------------------------------------------------------------------------------

def categorie_raden(tegenpartij: str, omschrijving: str, bedrag: float, regels: dict | None = None) -> str:
    """Raadt de categorie: eerst je eigen regels, dan bekende namen, anders Inkomen (bij plus) of Overig."""
    regels = instellingen()["regels"] if regels is None else regels
    if (eigen := regels.get(tegenpartij.strip().lower())) and eigen in CATEGORIEEN:
        return eigen
    tekst = f" {tegenpartij} {omschrijving} ".lower()
    for naam, (_, woorden) in CATEGORIEEN.items():
        if naam == "Inkomen" and bedrag < 0:
            continue
        if any(w in tekst for w in woorden):
            return naam
    return "Inkomen" if bedrag > 0 else "Overig"


def regel_onthouden(tegenpartij: str, categorie: str) -> int:
    """Voortaan alles van deze tegenpartij in deze categorie, ook wat er al staat. Geeft het aantal aangepaste regels."""
    sleutel = tegenpartij.strip().lower()
    if not sleutel:
        return 0
    _bewaar(regels={**instellingen()["regels"], sleutel: categorie})
    _cache.clear()
    return opslag._rpc_ik("transacties_categorie", p_tegenpartij=tegenpartij.strip(), p_categorie=categorie)["aangepast"]


# --- Inlezen van bankafschriften -------------------------------------------------------------------------------------

def _bedrag(tekst: str) -> float | None:
    t = (tekst or "").strip().replace("€", "").replace("EUR", "").replace(" ", "").replace(" ", "")
    if not t or not re.search(r"\d", t):
        return None
    if re.search(r",\d{1,2}$", t):  # Nederlands: 1.234,56
        t = t.replace(".", "").replace(",", ".")
    else:
        t = t.replace(",", "")
    try:
        return float(t)
    except ValueError:
        return None


def _datum(tekst: str) -> date | None:
    t = (tekst or "").strip()
    for vorm in ("%Y-%m-%d", "%Y%m%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(t[:10] if len(t) >= 10 and vorm != "%Y%m%d" else t[:8], vorm).date()
        except ValueError:
            continue
    return None


def _decoderen(inhoud: bytes) -> str:
    for codering in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return inhoud.decode(codering)
        except UnicodeDecodeError:
            continue
    return inhoud.decode("utf-8", errors="replace")


def _kolom(kop: list[str], *namen: str, behalve: tuple[str, ...] = ()) -> int | None:
    kop = [k.strip().lower() for k in kop]
    for naam in namen:
        for i, k in enumerate(kop):
            if (k == naam or k.startswith(naam)) and not any(b in k for b in behalve):
                return i
    return None


def _schoon(tekst: str) -> str:
    return re.sub(r"\s+", " ", tekst or "").strip()


def _abn_omschrijving(tekst: str) -> tuple[str, str]:
    """ABN AMRO zet naam en omschrijving samen in één veld, zoals '/TRTP/SEPA.../NAME/Jan/REMI/Huur/'."""
    tekst = _schoon(tekst)
    if "/NAME/" in tekst:
        naam = re.search(r"/NAME/([^/]*)", tekst)
        remi = re.search(r"/REMI/([^/]*)", tekst)
        return (naam.group(1).strip() if naam else ""), (remi.group(1).strip() if remi else "")
    if m := re.search(r"Naam:\s*(.+?)(?:\s{2,}|Omschrijving:|IBAN:|Kenmerk:|$)", tekst):
        oms = re.search(r"Omschrijving:\s*(.+?)(?:\s{2,}|IBAN:|Kenmerk:|$)", tekst)
        return m.group(1).strip(), (oms.group(1).strip() if oms else "")
    if m := re.match(r"(?:BEA, Betaalpas|GEA, Betaalpas|eCom, Betaalpas|BEA|GEA)[,\s]+(.+?),PAS\d+", tekst):
        return m.group(1).strip(), tekst
    return tekst[:60], tekst


def lees_afschrift(naam: str, inhoud: bytes) -> list[dict]:
    """Leest een bankafschrift (CSV of TXT) en geeft regels {datum, bedrag, tegenpartij, omschrijving, rekening}."""
    tekst = _decoderen(inhoud)
    regels_tekst = [r for r in tekst.splitlines() if r.strip()]
    if not regels_tekst:
        raise Fout("Het bestand is leeg.")
    eerste = regels_tekst[0]
    scheiding = "\t" if eerste.count("\t") >= 3 else ";" if eerste.count(";") > eerste.count(",") else ","
    rijen = list(csv.reader(io.StringIO("\n".join(regels_tekst)), delimiter=scheiding))
    kop = [k.strip().strip('"').lower() for k in rijen[0]]
    heeft_kop = any(re.search(r"datum|date|bedrag|amount|omschrijving|description", k) for k in kop)
    uit = []

    if heeft_kop:
        i_datum = _kolom(kop, "datum", "date", "transactiedatum", "boekingsdatum", behalve=("rente", "interest", "valuta"))
        i_bedrag = _kolom(kop, "bedrag (eur)", "bedrag", "amount", "transactiebedrag")
        i_afbij = _kolom(kop, "af bij", "af/bij", "credit/debit", "debet/credit")
        i_naam = _kolom(kop, "naam tegenpartij", "naam / omschrijving", "counterparty name", "name", "naam",
                        "tegenpartij", "counterparty", behalve=("iban", "rekening"))
        i_oms = [i for i, k in enumerate(kop) if re.match(r"(omschrijving|mededelingen|description|beschrijving)", k)
                 and i != i_naam]
        i_rek = _kolom(kop, "iban/bban", "rekening", "account", behalve=("tegen",))
        if i_datum is None or i_bedrag is None:
            raise Fout("In dit bestand staan geen kolommen voor datum en bedrag. Download het afschrift als CSV.")
        for rij in rijen[1:]:
            if len(rij) <= max(i_datum, i_bedrag):
                continue
            d, b = _datum(rij[i_datum]), _bedrag(rij[i_bedrag])
            if d is None or b is None:
                continue
            if i_afbij is not None and rij[i_afbij].strip().lower() in ("af", "debit", "d", "debet"):
                b = -abs(b)
            elif i_afbij is not None and rij[i_afbij].strip().lower() in ("bij", "credit", "c"):
                b = abs(b)
            uit.append({"datum": d.isoformat(), "bedrag": round(b, 2),
                        "tegenpartij": _schoon(rij[i_naam]) if i_naam is not None and i_naam < len(rij) else "",
                        "omschrijving": _schoon(" ".join(rij[i] for i in i_oms if i < len(rij))),
                        "rekening": rij[i_rek].strip() if i_rek is not None and i_rek < len(rij) else ""})
    elif scheiding == "\t" and len(rijen[0]) >= 8:
        # ABN AMRO TXT: rekening, munt, datum, beginsaldo, eindsaldo, rentedatum, bedrag, omschrijving
        for rij in rijen:
            d, b = _datum(rij[2]), _bedrag(rij[6])
            if d is None or b is None:
                continue
            tegenpartij, oms = _abn_omschrijving(rij[7])
            uit.append({"datum": d.isoformat(), "bedrag": round(b, 2), "tegenpartij": tegenpartij,
                        "omschrijving": oms, "rekening": rij[0].strip()})
    elif len(rijen[0]) >= 18 and _datum(rijen[0][0]):
        # SNS, ASN en RegioBank: datum, rekening, tegenrekening, naam, ..., bedrag (kolom 11), ..., omschrijving (18)
        for rij in rijen:
            d, b = _datum(rij[0]), _bedrag(rij[10])
            if d is None or b is None:
                continue
            uit.append({"datum": d.isoformat(), "bedrag": round(b, 2), "tegenpartij": _schoon(rij[3]),
                        "omschrijving": _schoon(rij[17]), "rekening": rij[1].strip()})
    else:
        raise Fout("Dit afschrift herken ik niet. Download het bij je bank als CSV (of bij ABN AMRO als TXT).")
    if not uit:
        raise Fout("Er staan geen betalingen in dit bestand.")
    return uit


def _vingerafdruk(regels: list[dict]) -> list[dict]:
    """Geeft elke regel een vaste sleutel, zodat hetzelfde afschrift nog eens inlezen niets dubbel zet."""
    gezien: dict[str, int] = {}
    for r in regels:
        basis = f"{r['datum']}|{r['bedrag']:.2f}|{r['tegenpartij'].lower()}|{r['omschrijving'].lower()}|{r['rekening']}"
        gezien[basis] = gezien.get(basis, 0) + 1
        r["sleutel"] = "imp:" + hashlib.sha1(f"{basis}|{gezien[basis]}".encode()).hexdigest()[:32]
    return regels


def importeren(naam: str, inhoud: bytes) -> dict:
    """Leest een afschrift in. Geeft {gelezen, nieuw, van, tot}."""
    regels = lees_afschrift(naam, inhoud)
    eigen = instellingen()["regels"]
    for r in regels:
        r["categorie"] = categorie_raden(r["tegenpartij"], r["omschrijving"], r["bedrag"], eigen)
        r["bron"] = "import"
    nieuw = 0
    for begin in range(0, len(regels), 1000):
        antwoord = opslag._rpc_ik("transacties_toevoegen", p_regels=_vingerafdruk(regels)[begin:begin + 1000])
        if antwoord.get("fout"):
            raise Fout(antwoord["fout"])
        nieuw += antwoord["nieuw"]
    _cache.clear()
    if not instellingen()["gebruikt"]:
        _bewaar()
    datums = sorted(r["datum"] for r in regels)
    return {"gelezen": len(regels), "nieuw": nieuw, "van": datums[0], "tot": datums[-1]}


# --- Uitgaven en inkomsten ------------------------------------------------------------------------------------------

def toevoegen(bedrag: float, omschrijving: str, categorie: str = "", datum: str | None = None,
              uitgave: bool = True, bron: str = "hand") -> dict:
    """Eén uitgave (of inkomsten met uitgave=False) met de hand of via de assistent."""
    bedrag = -abs(float(bedrag)) if uitgave else abs(float(bedrag))
    regel = {"datum": datum or date.today().isoformat(), "bedrag": round(bedrag, 2), "omschrijving": omschrijving.strip(),
             "tegenpartij": "", "rekening": "", "bron": bron,
             "categorie": categorie if categorie in CATEGORIEEN else categorie_raden("", omschrijving, bedrag),
             "sleutel": f"{bron}:{secrets.token_hex(12)}"}
    opslag._rpc_ik("transacties_toevoegen", p_regels=[regel])
    _cache.clear()
    if not instellingen()["gebruikt"]:
        _bewaar()
    return regel


def bijwerken(transactie_id: int, categorie: str | None = None, omschrijving: str | None = None) -> dict | None:
    _cache.clear()
    return opslag._rpc_ik("transactie_bijwerken", p_id=transactie_id, p_categorie=categorie, p_omschrijving=omschrijving)


def weg(transactie_id: int) -> bool:
    _cache.clear()
    return bool(opslag._rpc("transactie_weg", p_naam=opslag._naam.get(), p_wachtwoord=opslag._wachtwoord.get(),
                            p_id=transactie_id))


def lijst(van: str, tot: str) -> list[dict]:
    """Alle regels tussen twee datums (inclusief), nieuwste eerst. Even onthouden, zodat de app snel blijft."""
    sleutel = (opslag._naam.get(), hashlib.sha256(opslag._wachtwoord.get().encode()).hexdigest(), van, tot)
    bewaard = _cache.get(sleutel)
    if bewaard and time.time() - bewaard[0] < ONTHOUD_SECONDEN:
        return bewaard[1]
    regels = opslag._rpc_ik("transacties_lijst", p_van=van, p_tot=tot)["transacties"]
    for r in regels:
        r["bedrag"] = float(r["bedrag"])
    if len(_cache) > 200:
        _cache.clear()
    _cache[sleutel] = (time.time(), regels)
    return regels


# --- Overzicht --------------------------------------------------------------------------------------------------------

def maandgrenzen(maand: str) -> tuple[date, date]:
    jaar, nr = map(int, maand.split("-"))
    return date(jaar, nr, 1), date(jaar, nr, calendar.monthrange(jaar, nr)[1])


def _betaald(last: dict, regels: list[dict]) -> bool:
    woorden = [w for w in re.findall(r"\w+", last["naam"].lower()) if len(w) > 2]
    for r in regels:
        if r["bedrag"] < 0 and abs(abs(r["bedrag"]) - last["bedrag"]) <= max(1.0, last["bedrag"] * 0.05):
            tekst = f"{r['tegenpartij']} {r['omschrijving']}".lower()
            if r["categorie"] == last["categorie"] or any(w in tekst for w in woorden):
                return True
    return False


def overzicht(maand: str | None = None, vandaag: date | None = None) -> dict:
    """Alles over één maand (JJJJ-MM): inkomsten, uitgaven per categorie, budgetten, vaste lasten en wat er over is."""
    vandaag = vandaag or date.today()
    maand = maand or vandaag.strftime("%Y-%m")
    begin, einde = maandgrenzen(maand)
    regels = lijst(begin.isoformat(), einde.isoformat())
    b = instellingen()

    uitgaven: dict[str, float] = {}
    inkomsten = 0.0
    for r in regels:
        if r["categorie"] == "Sparen en beleggen" and r["bedrag"] < 0:
            uitgaven["Sparen en beleggen"] = uitgaven.get("Sparen en beleggen", 0) + -r["bedrag"]
        elif r["bedrag"] < 0:
            uitgaven[r["categorie"] or "Overig"] = uitgaven.get(r["categorie"] or "Overig", 0) + -r["bedrag"]
        else:
            inkomsten += r["bedrag"]
    uitgegeven = sum(v for k, v in uitgaven.items() if k != "Sparen en beleggen")

    lopend = begin <= vandaag <= einde
    # Vaste lasten die deze maand nog niet van je rekening zijn gegaan.
    nog_te_betalen = [v for v in b["vaste_lasten"] if not _betaald(v, regels)] if lopend else []
    nog_vast = round(sum(v["bedrag"] for v in nog_te_betalen), 2)
    per_categorie = []
    for naam in UITGAVEN:
        uit, budget = round(uitgaven.get(naam, 0), 2), b["budgetten"].get(naam)
        if uit or budget:
            per_categorie.append({"categorie": naam, "uitgegeven": uit, "budget": budget,
                                  "over": round(budget - uit, 2) if budget else None})
    per_categorie.sort(key=lambda c: -(c["budget"] or 0) - c["uitgegeven"])

    totaal_budget = round(sum(b["budgetten"].values()), 2)
    dagen_over = (einde - vandaag).days + 1 if lopend else 0
    resultaat = {"maand": maand, "inkomsten": round(inkomsten, 2), "uitgegeven": round(uitgegeven, 2),
                 "gespaard": round(uitgaven.get("Sparen en beleggen", 0), 2), "per_categorie": per_categorie,
                 "totaal_budget": totaal_budget, "aantal": len(regels),
                 "vaste_lasten_nog": [{"naam": v["naam"], "bedrag": v["bedrag"], "dag": v["dag"]} for v in nog_te_betalen],
                 "nog_vast": nog_vast, "dagen_over": dagen_over}
    if totaal_budget:
        resultaat["budget_over"] = round(sum(c["over"] for c in per_categorie if c["over"] is not None), 2)
    if lopend and (inkomsten or totaal_budget):
        # Vrij te besteden: wat er binnenkwam min uitgaven en de vaste lasten die nog komen; zonder inkomsten
        # (nog geen afschrift) wat er nog over is van je budgetten.
        over = round(inkomsten - uitgegeven - nog_vast, 2) if inkomsten else resultaat["budget_over"]
        resultaat |= {"over": over, "per_dag": round(max(0.0, over) / max(1, dagen_over), 2)}
    return resultaat


def vorige_maanden(aantal: int = 6, vandaag: date | None = None) -> list[dict]:
    """Per maand de totalen, oudste eerst (voor een grafiekje)."""
    vandaag = vandaag or date.today()
    eerste = (vandaag.replace(day=1) - timedelta(days=31 * (aantal - 1))).replace(day=1)
    regels = lijst(eerste.isoformat(), vandaag.isoformat())
    per: dict[str, dict] = {}
    d = eerste
    while d <= vandaag:
        per[d.strftime("%Y-%m")] = {"maand": d.strftime("%Y-%m"), "uitgaven": 0.0, "inkomsten": 0.0}
        d = (d + timedelta(days=32)).replace(day=1)
    for r in regels:
        m = per.get(r["datum"][:7])
        if m is None or r["categorie"] == "Sparen en beleggen":
            continue
        m["uitgaven" if r["bedrag"] < 0 else "inkomsten"] += abs(r["bedrag"])
    return [{k: round(v, 2) if isinstance(v, float) else v for k, v in m.items()} for m in per.values()]


def kort(vandaag: date | None = None, voorpagina: bool = False) -> str | None:
    """Eén zin voor het ochtendoverzicht (of een paar woorden voor de voorpagina), of None als er niets te zeggen is."""
    if not in_gebruik():
        return None
    o = overzicht(vandaag=vandaag)
    if voorpagina:
        if "over" not in o:
            return f"Budget: €{euro(o['uitgegeven'])} uitgegeven" if o["uitgegeven"] else None
        return (f"Budget: nog €{euro(o['over'])} vrij" if o["over"] >= 0 else f"Budget: €{euro(-o['over'])} tekort")
    if "over" not in o:
        return f"Deze maand €{euro(o['uitgegeven'])} uitgegeven." if o["uitgegeven"] else None
    if o["over"] < 0:
        tekst = f"Je hebt deze maand €{euro(-o['over'])} meer uitgegeven dan er binnenkwam."
    else:
        tekst = f"Nog €{euro(o['over'])} vrij te besteden deze maand, ongeveer €{euro(o['per_dag'])} per dag."
    krap = [c["categorie"] for c in o["per_categorie"] if c["budget"] and c["over"] is not None and c["over"] < 0]
    if krap:
        tekst += f" Over budget: {', '.join(krap).lower()}."
    return tekst


def euro(bedrag: float) -> str:
    """12345.6 -> '12.345,60'."""
    return f"{bedrag:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
