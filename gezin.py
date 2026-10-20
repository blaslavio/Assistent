"""Gezinsagenda: wie haalt, wie brengt. Zie sql/gezin.sql.

Alleen leden die de uitnodiging accepteerden zien de gezinsagenda. Wat aan jou is toegewezen komt ook in je eigen
agenda (als afspraak die je hier wijzigt, met een id dat met "ext:gz:" begint).
"""

import hashlib
import time
from datetime import date, datetime, timedelta

import opslag
import samen

SOORTEN = {"brengen": "Brengen", "halen": "Halen", "afspraak": "Afspraak", "taak": "Klusje"}

_eigen: dict[str, tuple[float, list[dict]]] = {}


def mijn() -> list[dict]:
    return opslag._rpc_ik("mijn_gezinnen")["gezinnen"]


def maken(naam: str, kinderen: list[str]) -> int:
    g = samen._ok(opslag._rpc_ik("gezin_maken", p_gezin=naam, p_kinderen=[k.strip() for k in kinderen if k.strip()]))
    opslag.instellingen_bijwerken(gezin=True)
    return g["id"]


def bijwerken(gezin_id: int, naam: str, kinderen: list[str]) -> None:
    samen._ok(opslag._rpc_ik("gezin_bijwerken", p_gezin=gezin_id, p_titel=naam,
                             p_kinderen=[k.strip() for k in kinderen if k.strip()]))


def uitnodigen(gezin_id: int, gebruiker: str) -> None:
    samen._ok(opslag._rpc_ik("gezin_uitnodigen", p_gezin=gezin_id, p_gast=gebruiker.strip().lstrip("@")))


def antwoorden(gezin_id: int, antwoord: str) -> None:
    """antwoord: ja, nee of verlaten."""
    samen._ok(opslag._rpc_ik("gezin_antwoorden", p_gezin=gezin_id, p_antwoord=antwoord))
    if antwoord == "ja":
        opslag.instellingen_bijwerken(gezin=True)
    vergeten()


def agenda(gezin_id: int, van: date, tot: date) -> list[dict]:
    """Alles in de gezinsagenda van van tot en met tot."""
    return samen._ok(opslag._rpc_ik("gezin_agenda", p_gezin=gezin_id, p_van=_tijd(van),
                                    p_tot=_tijd(tot + timedelta(days=1))))["items"]


def _tijd(dag: date) -> str:
    return datetime.combine(dag, datetime.min.time()).astimezone().isoformat()


def opslaan(gezin_id: int, titel: str, soort: str, start: datetime, minuten: int = 30, locatie: str = "",
            voor: str = "", wie: int | None = None, notitie: str = "", item_id: int | None = None) -> dict:
    i = samen._ok(opslag._rpc_ik("gezin_item_opslaan", p_gezin=gezin_id, p_id=item_id, p_titel=titel, p_soort=soort,
                                 p_start=start.astimezone().isoformat(), p_minuten=minuten, p_locatie=locatie,
                                 p_voor=voor, p_wie=wie, p_notitie=notitie))["item"]
    vergeten()
    return i


def oppakken(item_id: int, ik: bool = True) -> dict:
    i = samen._ok(opslag._rpc_ik("gezin_item_oppakken", p_id=item_id, p_ik=ik))["item"]
    vergeten()
    return i


def weg(item_id: int) -> None:
    opslag._rpc_ik("gezin_item_weg", p_id=item_id)
    vergeten()


def omschrijving(i: dict) -> str:
    """Bijvoorbeeld "Halen Noor (school)" of "Tandarts Noor"."""
    if i["soort"] in ("brengen", "halen"):
        return " ".join(filter(None, [SOORTEN[i["soort"]], i["voor"]])) + (f" ({i['titel']})" if i["titel"] else "")
    return " ".join(filter(None, [i["titel"], i["voor"]]))


def _sleutel() -> str:
    return hashlib.sha256(f"{opslag._naam.get()}|{opslag._wachtwoord.get()}".encode()).hexdigest()


def vergeten() -> None:
    _eigen.pop(_sleutel(), None)


def mijn_afspraken() -> list[dict]:
    """Wat aan jou is toegewezen, als afspraken voor je eigen agenda. Een minuut onthouden."""
    if not opslag.online() or not opslag._wachtwoord.get() or not opslag.instellingen().get("gezin"):
        return []
    sleutel = _sleutel()
    bewaard = _eigen.get(sleutel)
    if bewaard and time.time() - bewaard[0] < 60:
        return bewaard[1]
    try:
        items = opslag._rpc_ik("mijn_gezin_taken", p_van=_tijd(date.today() - timedelta(days=30)),
                               p_tot=_tijd(date.today() + timedelta(days=400)))["items"]
    except opslag.GeenToegang:
        raise
    except Exception:
        return bewaard[1] if bewaard else []
    afspraken = []
    for i in items:
        start = datetime.fromisoformat(i["start"]).astimezone()
        afspraken.append({"id": f"ext:gz:{i['id']}", "titel": omschrijving(i), "start": start.strftime("%Y-%m-%dT%H:%M"),
                          "einde": (start + timedelta(minutes=i["minuten"])).strftime("%Y-%m-%dT%H:%M"),
                          "locatie": i["locatie"], "notitie": i["notitie"], "soort": "familie en vrienden",
                          "extern": True, "bron": f"gezinsagenda {i['gezin']}"})
    _eigen[sleutel] = (time.time(), afspraken)
    return afspraken
