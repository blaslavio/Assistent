"""Je eigen boekingspagina (zoals Calendly). Zie sql/boekpagina.sql.

Bezoekers zien alleen vrije momenten. Bevestigde boekingen zet deze module in je agenda (en haalt ze er weer uit
als ze geannuleerd worden).
"""

import hashlib
import re
import secrets
import threading
import time
from datetime import date, datetime, timedelta

import opslag
import samen

STATUS = {"aangevraagd": "Wacht op jou", "bevestigd": "Bevestigd", "afgewezen": "Afgewezen", "geannuleerd": "Geannuleerd"}
STANDAARD = {"aan": True, "titel": "", "intro": "", "soorten": [{"naam": "Kennismaking", "minuten": 30}],
             "uren": {str(d): [["09:00", "17:00"]] for d in range(1, 6)}, "buffer": 15, "min_vooraf": 12,
             "vooruit": 30, "max_per_dag": 4, "bevestigen": False, "locatie": ""}

_laatst: dict[str, float] = {}


def mijn() -> dict:
    return opslag._rpc_ik("mijn_boekpagina")


def voorstel_adres() -> str:
    naam = opslag._naam.get() or "afspraak"
    return (re.sub(r"[^a-z0-9]+", "-", naam.lower()).strip("-")[:30] or "afspraak") + f"-{secrets.randbelow(900) + 100}"


def instellen(instellingen: dict) -> dict:
    p = samen._ok(opslag._rpc_ik("boekpagina_instellen", p_instellingen=instellingen))["pagina"]
    opslag.instellingen_bijwerken(boekpagina=True)
    return p


def link(basis: str, adres: str) -> str:
    return f"{basis.rstrip('/')}/?boek={adres}"


def bekijken(adres: str, soort: int = 0) -> dict:
    return samen._ok(opslag._rpc("boekpagina_bekijken", p_adres=adres, p_soort=soort))


def tijden(adres: str, soort: int, dag: date) -> list[datetime]:
    t = samen._ok(opslag._rpc("boekpagina_tijden", p_adres=adres, p_soort=soort, p_datum=dag.isoformat()))["tijden"]
    return [datetime.fromisoformat(x).astimezone() for x in t]


def boeken(adres: str, soort: int, start: datetime, naam: str, email: str, telefoon: str = "", notitie: str = "") -> dict:
    return samen._ok(opslag._rpc("boeken", p_adres=adres, p_soort=soort, p_start=start.astimezone().isoformat(),
                                 p_kiezer=naam, p_email=email, p_telefoon=telefoon, p_notitie=notitie))


def boeking_bekijken(code: str) -> dict:
    return samen._ok(opslag._rpc("boeking_bekijken", p_code=code))


def annuleren(code: str) -> None:
    samen._ok(opslag._rpc("boeking_annuleren", p_code=code))


def afhandelen(boeking_id: int, actie: str) -> None:
    samen._ok(opslag._rpc_ik("boeking_afhandelen", p_id=boeking_id, p_actie=actie))
    verwerken()


def _afspraak(b: dict, locatie: str) -> dict:
    start = datetime.fromisoformat(b["start"]).astimezone()
    notitie = "\n".join(filter(None, [b["email"], b["telefoon"], b["notitie"], "Geboekt via je boekingspagina."]))
    return opslag.afspraak_toevoegen(f"{b['soort']} met {b['naam']}", start.strftime("%Y-%m-%dT%H:%M"),
                                     (start + timedelta(minutes=b["minuten"])).strftime("%Y-%m-%dT%H:%M"),
                                     notitie, locatie, soort="afspraak")


def verwerken(m: dict | None = None) -> int:
    """Bevestigde boekingen in je agenda zetten en geannuleerde eruit halen. Geeft het aantal wijzigingen."""
    m = m or mijn()
    locatie = (m.get("pagina") or {}).get("locatie", "")
    gedaan = 0
    for b in m["boekingen"]:
        if b["verwerkt"]:
            continue
        afspraak_id = b["afspraak_id"]
        if b["status"] == "bevestigd" and not afspraak_id:
            afspraak_id = str(_afspraak(b, locatie)["id"])
        elif b["status"] in ("afgewezen", "geannuleerd") and afspraak_id:
            if afspraak_id.isdigit():
                opslag.afspraak_verwijderen(int(afspraak_id))
            afspraak_id = None
        opslag._rpc_ik("boeking_verwerkt", p_id=b["id"], p_afspraak=afspraak_id)
        gedaan += 1
    return gedaan


def vanzelf() -> None:
    """Hoogstens elke minuut nieuwe boekingen in de agenda zetten, alleen als je een boekingspagina hebt."""
    if not opslag.online() or not opslag.instellingen().get("boekpagina"):
        return
    wie = hashlib.sha256(f"{opslag._naam.get()}|{opslag._wachtwoord.get()}".encode()).hexdigest()
    if time.time() - _laatst.get(wie, 0) < 60:
        return
    _laatst[wie] = time.time()
    verwerken()
    if time.time() - _laatst.get("geld|" + wie, 0) > 600:
        _laatst["geld|" + wie] = time.time()
        threading.Thread(target=_verrekenen, args=(opslag._naam.get(), opslag._wachtwoord.get()), daemon=True).start()


def terugbetalen() -> None:
    """Na annuleren meteen terugbetalen, op de achtergrond."""
    threading.Thread(target=_verrekenen, args=(opslag._naam.get(), opslag._wachtwoord.get()), daemon=True).start()


def _verrekenen(naam: str, wachtwoord: str) -> None:
    """Betaalde boekingen die voorbij of geannuleerd zijn: terugbetalen en/of uitbetalen (via de betaalfunctie)."""
    try:
        opslag.gebruik_account(naam, wachtwoord)
        if samen.betalen_status().get("aan"):
            samen._stripe("boekingen_verrekenen")
    except Exception:
        pass  # volgende keer opnieuw


def nieuw(m: dict) -> list[dict]:
    """Boekingen die op jouw antwoord wachten."""
    return [b for b in m["boekingen"] if b["status"] == "aangevraagd" and b.get("geld") != "open"]
