"""Meldingen op je telefoon, ook als de app dicht is: eigen pushmeldingen via de web-app (sql/webpush.sql) of
de gratis app ntfy.

De database verstuurt ze (elke minuut, zie sql/meldingen.sql). Deze module zet herinneringen en vertrekwekkers klaar
voor de komende dagen; meldingen over uitnodigingen, reacties, berichten en reserveringen maakt de database zelf.
"""

import contextvars
import hashlib
import json
import threading
import time
from datetime import date, datetime, timedelta

import opslag
import taal
import planning

SOORTEN = {"vertrek": "Vertrekwekker", "herinnering": "Herinneringen", "uitnodiging": "Uitnodigingen",
           "reactie": "Reacties op je agenda", "bericht": "Berichten", "reservering": "Reserveringen",
           "aanvraag": "Antwoord van restaurants"}
APP_STORE = "https://apps.apple.com/app/ntfy/id1625396347"
PLAY_STORE = "https://play.google.com/store/apps/details?id=io.heckel.ntfy"
DAGEN_VOORUIT = 7

_laatst: dict[str, tuple[float, str]] = {}
_slot = threading.Lock()


def status() -> dict:
    return opslag._rpc_ik("push_status")


def instellen(aan: bool = True, kort: bool | None = None, soorten: list[str] | None = None,
              stil_van: str | None = None, stil_tot: str | None = None, nieuw_topic: bool = False) -> dict:
    import samen
    return samen._ok(opslag._rpc_ik("push_instellen", p_aan=aan, p_kort=kort, p_soorten=soorten,
                                    p_stil_van=stil_van, p_stil_tot=stil_tot, p_nieuw_topic=nieuw_topic))["push"]


def web_code() -> str:
    import samen
    return samen._ok(opslag._rpc_ik("push_web_code"))["code"]


def toestellen() -> dict:
    """{"toestellen": [{id, apparaat, aangemaakt, laatst_ok}], "ntfy": bool}"""
    return opslag._rpc_ik("push_web_toestellen")


def toestel_weg(toestel_id: int) -> None:
    import samen
    samen._ok(opslag._rpc_ik("push_web_weg", p_id=toestel_id))


def testen() -> None:
    import samen
    samen._ok(opslag._rpc_ik("push_testen"))
    vergeten()


def vergeten() -> None:
    """Na een wijziging de herinneringen bij de volgende beurt opnieuw klaarzetten."""
    _laatst.pop(_gebruiker(), None)


def _gebruiker() -> str:
    return hashlib.sha256(f"{opslag._naam.get()}|{opslag._wachtwoord.get()}".encode()).hexdigest()


def _hhmm(iso: str) -> str:
    return iso[11:16]


def lijst(dagen: int = DAGEN_VOORUIT) -> list[dict]:
    """Herinneringen en vertrekwekkers voor de komende dagen."""
    voor = int(opslag.instellingen().get("melding_voor", 15))
    nu = datetime.now()
    uit = []
    for d in range(dagen):
        dag = (date.today() + timedelta(days=d)).isoformat()
        for r in planning.dagplanning(dag)["afspraken"]:
            titel, start = r["titel"], r["start"]
            if r.get("soort") == "vrij" and r.get("extern"):
                continue  # feestdagen en schoolvakanties: geen seintje
            if "T" not in start:  # hele dag: om 8 uur 's ochtends
                wanneer = datetime.fromisoformat(f"{dag}T08:00")
                tekst = f"{titel} is jarig" if r.get("soort") == "verjaardag" else titel
                uit.append({"soort": "herinnering", "sleutel": f"dag:{r['id']}:{dag}", "wanneer": wanneer,
                            "titel": "Vandaag", "tekst": tekst})
            elif r.get("vertrek_om"):
                wanneer = datetime.fromisoformat(f"{dag}T{r['vertrek_om']}")
                reis = r.get("reis", {}).get("reistijd_minuten")
                uit.append({"soort": "vertrek", "sleutel": f"vertrek:{r['id']}:{start}", "wanneer": wanneer,
                            "titel": "Tijd om te vertrekken",
                            "tekst": f"{titel} om {_hhmm(start)}" + (f", {reis} min reizen" if reis else "")
                                     + (f" naar {r['locatie']}" if r.get("locatie") else "")})
            elif voor:
                wanneer = datetime.fromisoformat(start) - timedelta(minutes=voor)
                uit.append({"soort": "herinnering", "sleutel": f"herinnering:{r['id']}:{start}", "wanneer": wanneer,
                            "titel": f"Over {voor} min", "tekst": f"{titel} om {_hhmm(start)}"})
    eind = (date.today() + timedelta(days=dagen - 1)).isoformat()
    for t in opslag.open_taken():
        if t["deadline"] and date.today().isoformat() <= t["deadline"] <= eind:
            uit.append({"soort": "herinnering", "sleutel": f"taak:{t['id']}:{t['deadline']}",
                        "wanneer": datetime.fromisoformat(f"{t['deadline']}T09:00"),
                        "titel": "Taak voor vandaag", "tekst": t["titel"]})
    return [{**m, "wanneer": m["wanneer"].astimezone().isoformat()} for m in uit if m["wanneer"] > nu]


def plannen() -> int:
    # Meldingen in de taal van de gebruiker.
    berichten = [m | {k: taal.t(m[k]) for k in ("titel", "tekst") if isinstance(m.get(k), str)} for m in lijst()]
    return opslag._rpc_ik("herinneringen_plannen", p_lijst=berichten).get("gepland", 0)


def vanzelf() -> None:
    """Op de achtergrond de herinneringen bijwerken als de agenda veranderde (of elke tien minuten)."""
    if not opslag.online() or not opslag.instellingen().get("meldingen_aan"):
        return
    g = opslag.laden()
    van, tot = date.today().isoformat(), (date.today() + timedelta(days=DAGEN_VOORUIT)).isoformat()
    stand = hashlib.sha256(json.dumps([[a for a in g["afspraken"] if van <= a["start"][:10] <= tot],
                                       [t for t in g["taken"] if not t["klaar"]],
                                       opslag.instellingen().get("melding_voor"),
                                       opslag.instellingen().get("thuisadres"), taal.huidig()],
                                      sort_keys=True, default=str).encode()).hexdigest()
    gebruiker = _gebruiker()
    with _slot:
        vorige = _laatst.get(gebruiker)
        if vorige and vorige[1] == stand and time.time() - vorige[0] < 600:
            return
        _laatst[gebruiker] = (time.time(), stand)

    def werk() -> None:
        try:
            plannen()
        except Exception:
            _laatst.pop(gebruiker, None)

    threading.Thread(target=contextvars.copy_context().run, args=(werk,), daemon=True).start()
