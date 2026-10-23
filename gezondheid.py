"""Sport en gezondheid koppelen: trainingen, stappen en slaap uit andere apps, alleen lezen.

Drie manieren, van makkelijk naar altijd mogelijk:
1. Inloggen bij de app zelf (Strava, Fitbit, Polar, Withings, Oura). Eén tik op Verbinden; je logt in bij die app en
   geeft toestemming. De toegangscodes blijven in de database en de Edge Function `gezondheid`; deze module ziet ze
   nooit.
2. Een app die zelf gegevens kan versturen (zoals Health Auto Export voor Apple Gezondheid) stuurt ze naar je eigen,
   geheime inzendadres.
3. Een bestand uit elke sportapp of elk horloge (GPX, TCX, FIT of CSV).

Trainingen komen in je agenda (als sportafspraak, of bij de training die je al gepland had). Stappen en slaap per dag
staan in instellingen.gezondheid_dagen (60 dagen).
"""

import contextvars
import csv
import hashlib
import io
import os
import re
import threading
import time
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx

import opslag
import tijd

AMSTERDAM = ZoneInfo("Europe/Amsterdam")
ELKE_SECONDEN = 2 * 3600

# naam, wat het is, en (voor de eigenaar) waar je de sleutels maakt.
AANBIEDERS = {
    "strava": ("Strava", "Trainingen. Neemt ook over van Garmin, Apple Watch, Wahoo, Zwift, Suunto en COROS.",
               "https://www.strava.com/settings/api"),
    "fitbit": ("Fitbit", "Trainingen, stappen en slaap. Ook Google Pixel Watch.", "https://dev.fitbit.com/apps/new"),
    "polar": ("Polar", "Trainingen van je Polar-horloge.", "https://admin.polaraccesslink.com"),
    "withings": ("Withings", "Trainingen, stappen en slaap.", "https://developer.withings.com/dashboard/"),
    "oura": ("Oura", "Trainingen, stappen en slaap van je ring.", "https://cloud.ouraring.com/oauth/applications"),
}

# Engelse namen uit apps → onze sporten.
_SPORT = [("trail", "hardlopen"), ("run", "hardlopen"), ("jog", "hardlopen"), ("hardlo", "hardlopen"),
          ("mountain", "mountainbiken"), ("mtb", "mountainbiken"), ("spin", "spinning"), ("ride", "fietsen"),
          ("cycl", "fietsen"), ("bik", "fietsen"), ("fiets", "fietsen"), ("swim", "zwemmen"), ("zwem", "zwemmen"),
          ("hik", "hiken"), ("walk", "wandelen"), ("wandel", "wandelen"), ("yoga", "yoga"), ("pilates", "pilates"),
          ("row", "roeien"), ("roei", "roeien"), ("padel", "padel"), ("tennis", "tennis"), ("squash", "squash"),
          ("badminton", "badminton"), ("soccer", "voetbal"), ("football", "voetbal"), ("voetbal", "voetbal"),
          ("basket", "basketbal"), ("volley", "volleybal"), ("hockey", "hockey"), ("golf", "golf"),
          ("ski", "skiën"), ("snowboard", "snowboarden"), ("skat", "schaatsen"), ("climb", "klimmen"),
          ("boulder", "boulderen"), ("box", "boksen"), ("danc", "dansen"), ("crossfit", "crossfit"),
          ("strength", "krachttraining"), ("weight", "krachttraining"), ("kracht", "krachttraining"),
          ("hiit", "fitness"), ("workout", "fitness"), ("training", "fitness"), ("elliptic", "fitness"),
          ("stair", "fitness"), ("gym", "fitness"), ("fitness", "fitness"), ("kayak", "kanoën"), ("canoe", "kanoën"),
          ("surf", "surfen"), ("sail", "zeilen")]


class Fout(Exception):
    """Iets ging mis; de tekst is geschikt om aan de gebruiker te tonen."""


def sport_nl(ruw: str) -> str:
    t = re.sub(r"[^a-zë]+", " ", (ruw or "").lower()).strip()
    if t in tijd.SPORT_ICOON:
        return t
    for stukje, sport in _SPORT:
        if stukje in t.replace(" ", ""):
            return sport
    return t[:40] or "sport"


# --- Praten met de Edge Function --------------------------------------------------------------------------------

def _basis() -> str:
    return os.environ.get("SUPABASE_URL", opslag.SUPABASE_URL).rstrip("/")


def _functie(actie: str, **velden) -> dict:
    sleutel = os.environ.get("SUPABASE_KEY", opslag.SUPABASE_PUBLISHABLE_KEY)
    try:
        r = httpx.post(f"{_basis()}/functions/v1/gezondheid", headers={"apikey": sleutel}, timeout=60,
                       json={"actie": actie, "naam": opslag._naam.get(), "wachtwoord": opslag._wachtwoord.get(),
                             **velden})
        antwoord = r.json()
    except (httpx.HTTPError, ValueError):
        raise Fout("De koppeling is even niet bereikbaar. Probeer het later opnieuw.")
    if antwoord.get("fout"):
        raise Fout(antwoord["fout"])
    return antwoord


def status() -> dict:
    """{aan: [aanbieders die aan staan], koppelingen: [...], inzendadres: bool, eigenaar, ingesteld}."""
    leeg = {"aan": [], "koppelingen": [], "inzendadres": False, "eigenaar": False, "ingesteld": {}}
    if not opslag.online():
        return leeg
    try:
        return opslag._rpc_ik("gezondheid_status") or leeg
    except opslag.GeenToegang:
        raise
    except Exception:
        return leeg


def app_instellen(aanbieder: str, client_id: str, client_secret: str) -> None:
    """Alleen de eigenaar: de sleutels van een gezondheidsapp. Leeg = niet wijzigen."""
    a = opslag._rpc_ik("gezondheid_app_instellen", p_aanbieder=aanbieder, p_client_id="".join(client_id.split()),
                       p_client_secret="".join(client_secret.split()))
    if a.get("fout") or a.get("geen_toegang"):
        raise Fout(a.get("fout") or "Alleen de eigenaar kan dit instellen.")


def koppelen(aanbieder: str) -> str:
    """De link om in te loggen bij de app. Daarna kom je terug met ?code=...&state=gz...."""
    return _functie("starten", aanbieder=aanbieder)["url"]


def afmaken(code: str, staat: str) -> dict:
    """Na terugkeer: koppeling vastleggen en meteen de eerste gegevens ophalen."""
    k = _functie("afmaken", code=code, staat=staat)
    try:
        k["nieuw"] = ophalen(k["aanbieder"], dagen=30)
    except Fout:
        k["nieuw"] = 0
    return k


def ontkoppelen(aanbieder: str) -> None:
    _functie("ontkoppelen", aanbieder=aanbieder)


def ophalen(aanbieder: str, dagen: int = 14) -> int:
    """Nieuwe trainingen en dagwaarden ophalen. Geeft het aantal nieuwe trainingen."""
    a = _functie("ophalen", aanbieder=aanbieder, dagen=dagen)
    return verwerken(a.get("trainingen", []), a.get("dagen", []), AANBIEDERS.get(aanbieder, (aanbieder,))[0])


# --- Insturen door een andere app (Apple Gezondheid via Health Auto Export) -------------------------------------

def inzendcode_maken() -> str:
    a = opslag._rpc_ik("gezondheid_inzendcode_maken")
    if a.get("fout"):
        raise Fout(a["fout"])
    return a["code"]


def inzendcode_stoppen() -> None:
    opslag._rpc_ik("gezondheid_inzendcode_stoppen")


def inzendadres(code: str) -> str:
    return f"{_basis()}/functions/v1/gezondheid?code={code}"


def ingezonden_verwerken() -> int:
    """Wat apps sinds de vorige keer instuurden, in je agenda en dagoverzicht zetten."""
    na = opslag.instellingen().get("gezondheid_ingezonden_tot")
    items = opslag._rpc_ik("gezondheid_ingezonden", p_na=na).get("items", [])
    if not items:
        return 0
    trainingen = [{**i["inhoud"], "id": i["sleutel"].replace("training:", "inzenden:", 1), "bron": i["bron"]}
                  for i in items if i["soort"] == "training"]
    dagen = [{**i["inhoud"], "bron": i["bron"]} for i in items if i["soort"] == "dag"]
    nieuw = verwerken(trainingen, dagen, items[-1]["bron"] or "App")
    opslag.instellingen_bijwerken(gezondheid_ingezonden_tot=items[-1]["ontvangen"])
    return nieuw


# --- Verwerken ----------------------------------------------------------------------------------------------------

def verwerken(trainingen: list[dict], dagen: list[dict], bron: str) -> int:
    nieuw = 0
    for t in trainingen:
        start = str(t.get("start", ""))[:16]
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", start) or not t.get("id"):
            continue
        sport = sport_nl(t.get("sport") or t.get("naam") or "")
        resultaat = {"minuten": int(t.get("minuten") or 0), "afstand_km": round(float(t.get("afstand_km") or 0), 1),
                     "calorieen": int(t.get("calorieen") or 0), "bron": t.get("bron") or bron}
        naam = (t.get("naam") or "").strip() or sport.capitalize()
        if opslag.training_koppelen(str(t["id"]), naam[:80], start, sport, resultaat):
            nieuw += 1
    if dagen:
        bewaard = dict(opslag.instellingen().get("gezondheid_dagen") or {})
        for d in dagen:
            if re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(d.get("datum", ""))):
                waarden = {k: int(d[k]) for k in ("stappen", "slaap_min", "slaap_score", "rusthartslag")
                           if isinstance(d.get(k), (int, float)) and d[k] > 0}
                if waarden:
                    bewaard[d["datum"]] = {**bewaard.get(d["datum"], {}), **waarden, "bron": d.get("bron") or bron}
        grens = (date.today() - timedelta(days=60)).isoformat()
        opslag.instellingen_bijwerken(gezondheid_dagen={k: v for k, v in sorted(bewaard.items()) if k >= grens})
    return nieuw


def dagen(aantal: int = 7) -> list[dict]:
    """Stappen en slaap van de laatste dagen (nieuwste eerst)."""
    bewaard = opslag.instellingen().get("gezondheid_dagen") or {}
    return [{"datum": k, **v} for k, v in sorted(bewaard.items(), reverse=True)[:aantal]]


_bezig: dict[str, float] = {}
_slot = threading.Lock()


def vanzelf() -> None:
    """Op de achtergrond nieuwe gegevens ophalen als dat langer dan twee uur geleden is. Wacht nergens op."""
    if not opslag.online():
        return
    wie = hashlib.sha256(f"{opslag._naam.get()}|{opslag._wachtwoord.get()}".encode()).hexdigest()
    with _slot:
        if time.time() - _bezig.get(wie, 0) < 600:
            return
        _bezig[wie] = time.time()

    def werk() -> None:
        try:
            s = status()
            nu = datetime.now(timezone.utc)
            for k in s["koppelingen"]:
                laatst = k.get("laatst_opgehaald")
                if k["status"] != "actief" or (laatst and (nu - datetime.fromisoformat(laatst)).total_seconds()
                                               < ELKE_SECONDEN):
                    continue
                try:
                    ophalen(k["aanbieder"])
                except Fout:
                    pass
            if s["inzendadres"]:
                ingezonden_verwerken()
        except Exception:
            pass

    threading.Thread(target=contextvars.copy_context().run, args=(werk,), daemon=True).start()


# --- Bestanden (GPX, TCX, FIT, CSV) -------------------------------------------------------------------------------

def _lokaal(moment: datetime) -> str:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(AMSTERDAM).strftime("%Y-%m-%dT%H:%M")


def _tijd(tekst: str) -> datetime:
    return datetime.fromisoformat(tekst.strip().replace("Z", "+00:00"))


def _afstand(punten: list[tuple[float, float]]) -> float:
    from math import asin, cos, radians, sin, sqrt
    totaal = 0.0
    for (a1, o1), (a2, o2) in zip(punten, punten[1:]):
        d = sin(radians(a2 - a1) / 2) ** 2 + cos(radians(a1)) * cos(radians(a2)) * sin(radians(o2 - o1) / 2) ** 2
        totaal += 2 * 6371 * asin(sqrt(d))
    return totaal


def _naam_zonder_ns(e: ET.Element) -> str:
    return e.tag.rsplit("}", 1)[-1]


def bestand_lezen(naam: str, inhoud: bytes) -> list[dict]:
    """Trainingen uit een bestand. Geeft [{id, naam, start, sport, minuten, afstand_km}]."""
    soort = naam.lower().rsplit(".", 1)[-1]
    vingerafdruk = hashlib.sha1(inhoud).hexdigest()[:16]
    if soort in ("gpx", "tcx"):
        try:
            # Geen externe entiteiten: ElementTree laadt die niet, en we weigeren DOCTYPE helemaal.
            if b"<!DOCTYPE" in inhoud[:2000].upper():
                raise Fout("Dit bestand kan ik niet lezen.")
            wortel = ET.fromstring(inhoud)
        except ET.ParseError:
            raise Fout("Dit bestand kan ik niet lezen.")
        tijden, punten, sport, titel = [], [], "", ""
        afstand_tcx = 0.0
        for e in wortel.iter():
            t = _naam_zonder_ns(e)
            if t == "time" or t == "Time":
                try:
                    tijden.append(_tijd(e.text or ""))
                except ValueError:
                    pass
            elif t in ("trkpt", "rtept"):
                punten.append((float(e.get("lat", 0)), float(e.get("lon", 0))))
            elif t == "Position":
                lat = next((float(x.text) for x in e if _naam_zonder_ns(x) == "LatitudeDegrees"), None)
                lon = next((float(x.text) for x in e if _naam_zonder_ns(x) == "LongitudeDegrees"), None)
                if lat is not None and lon is not None:
                    punten.append((lat, lon))
            elif t == "Activity" and e.get("Sport"):
                sport = e.get("Sport")
            elif t == "type" and not sport:
                sport = e.text or ""
            elif t == "name" and not titel:
                titel = (e.text or "").strip()
            elif t == "Lap":
                afstand_tcx += next((float(x.text) for x in e if _naam_zonder_ns(x) == "DistanceMeters"), 0.0)
        if not tijden:
            raise Fout("Er staat geen tijd in dit bestand.")
        km = afstand_tcx / 1000 if afstand_tcx else _afstand(punten)
        return [{"id": f"bestand:{vingerafdruk}", "naam": titel or sport_nl(sport or "sport").capitalize(),
                 "start": _lokaal(min(tijden)), "sport": sport or titel,
                 "minuten": round((max(tijden) - min(tijden)).total_seconds() / 60), "afstand_km": round(km, 1)}]
    if soort == "fit":
        try:
            import fitdecode
        except ImportError:
            raise Fout("FIT-bestanden kan ik nu niet lezen. Kies een GPX- of TCX-bestand.")
        uit = []
        try:
            with fitdecode.FitReader(io.BytesIO(inhoud)) as lezer:
                for frame in lezer:
                    if isinstance(frame, fitdecode.FitDataMessage) and frame.name == "session":
                        w = {f.name: f.value for f in frame.fields}
                        start = w.get("start_time")
                        if not isinstance(start, datetime):
                            continue
                        uit.append({"id": f"bestand:{vingerafdruk}:{len(uit)}", "naam": "", "start": _lokaal(start),
                                    "sport": str(w.get("sport") or ""),
                                    "minuten": round(float(w.get("total_timer_time") or w.get("total_elapsed_time") or 0) / 60),
                                    "afstand_km": round(float(w.get("total_distance") or 0) / 1000, 1),
                                    "calorieen": int(w.get("total_calories") or 0)})
        except fitdecode.FitError:
            raise Fout("Dit FIT-bestand kan ik niet lezen.")
        if not uit:
            raise Fout("Er staat geen training in dit bestand.")
        return uit
    if soort == "csv":
        tekst = inhoud.decode("utf-8-sig", errors="replace")
        try:
            dialect = csv.Sniffer().sniff(tekst[:2000], delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel
        uit = []
        for nr, rij in enumerate(csv.DictReader(io.StringIO(tekst), dialect=dialect)):
            r = {(k or "").strip().lower(): (v or "").strip() for k, v in rij.items()}
            start = next((r[k] for k in ("start", "datum", "date", "start time", "activity date", "begintijd", "starttijd")
                          if r.get(k)), "")
            try:
                moment = _csv_tijd(start)
            except ValueError:
                continue
            duur = next((r[k] for k in ("minuten", "duur", "duration", "elapsed time", "moving time", "tijd") if r.get(k)), "0")
            afstand = next((r[k] for k in ("afstand_km", "afstand", "distance", "km") if r.get(k)), "0")
            uit.append({"id": f"bestand:{vingerafdruk}:{nr}", "naam": r.get("naam") or r.get("activity name") or r.get("title") or "",
                        "start": moment, "sport": r.get("sport") or r.get("activity type") or r.get("type") or "",
                        "minuten": _minuten(duur), "afstand_km": _getal(afstand)})
            if len(uit) >= 2000:
                break
        if not uit:
            raise Fout("Ik vond geen trainingen. De eerste regel moet kolomnamen hebben, zoals datum, sport, minuten en afstand.")
        return uit
    raise Fout("Kies een GPX-, TCX-, FIT- of CSV-bestand.")


def _csv_tijd(tekst: str) -> str:
    tekst = tekst.strip()
    for vorm in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%d-%m-%Y %H:%M",
                 "%d-%m-%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%b %d, %Y, %I:%M:%S %p", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(tekst, vorm).strftime("%Y-%m-%dT%H:%M")
        except ValueError:
            pass
    return _lokaal(_tijd(tekst))


def _getal(tekst: str) -> float:
    try:
        return round(float(tekst.replace(",", ".").split()[0]), 1)
    except (ValueError, IndexError):
        return 0.0


def _minuten(tekst: str) -> int:
    """"45", "0:45:00", "1:02:30" of seconden (groot getal) → minuten."""
    tekst = tekst.strip()
    if ":" in tekst:
        delen = [float(x) for x in tekst.split(":")]
        while len(delen) < 3:
            delen.insert(0, 0)
        return round(delen[0] * 60 + delen[1] + delen[2] / 60)
    waarde = _getal(tekst)
    return round(waarde / 60) if waarde > 600 else round(waarde)


def bestand_importeren(naam: str, inhoud: bytes) -> int:
    if len(inhoud) > 30_000_000:
        raise Fout("Dit bestand is te groot.")
    return verwerken(bestand_lezen(naam, inhoud), [], "Bestand")
