"""Samen een datum kiezen: stemrondes (zoals Datumprikker). Zie sql/prikker.sql."""

from datetime import datetime, timedelta

import opslag
import samen

ANTWOORDEN = {"ja": "Ja", "misschien": "Misschien", "nee": "Nee"}


def maken(titel: str, opties: list[datetime], plaats: str = "", notitie: str = "", minuten: int = 60,
          genodigden: list[str] | None = None) -> dict:
    p = samen._ok(opslag._rpc_ik("peiling_maken", p_titel=titel, p_plaats=plaats, p_notitie=notitie, p_minuten=minuten,
                                 p_opties=[o.astimezone().isoformat() for o in opties],
                                 p_genodigden=[g.strip().lstrip("@") for g in genodigden or [] if g.strip()]))
    # De link kan alleen de maker later opnieuw delen; de code bewaren we in zijn eigen gegevens.
    codes = dict(opslag.instellingen().get("peiling_codes", {}))
    codes[str(p["id"])] = p["code"]
    opslag.instellingen_bijwerken(peiling_codes=codes)
    return p


def code(peiling_id: int) -> str:
    return opslag.instellingen().get("peiling_codes", {}).get(str(peiling_id), "")


def link(basis: str, code_: str) -> str:
    return f"{basis.rstrip('/')}/?prik={code_}"


def mijn() -> list[dict]:
    return opslag._rpc_ik("mijn_peilingen")["peilingen"]


def stem_ik(peiling_id: int, stemmen: dict) -> None:
    samen._ok(opslag._rpc_ik("peiling_stem_ik", p_id=peiling_id, p_stemmen={str(k): v for k, v in stemmen.items()}))


def bekijken(code_: str) -> dict:
    return samen._ok(opslag._rpc("peiling_bekijken", p_code=code_))


def stemmen(code_: str, naam: str, sleutel: str, stemmen_: dict) -> None:
    samen._ok(opslag._rpc("peiling_stemmen", p_code=code_, p_kiezer=naam, p_sleutel=sleutel,
                          p_stemmen={str(k): v for k, v in stemmen_.items()}))


def kiezen(peiling_id: int, optie_id: int | None) -> dict:
    """Sluit de stemronde. Met een moment: in je agenda, en wie in de app meedeed (en niet 'nee' zei) uitgenodigd."""
    k = samen._ok(opslag._rpc_ik("peiling_kiezen", p_id=peiling_id, p_optie=optie_id))
    if not k.get("start"):
        return k
    start = datetime.fromisoformat(k["start"]).astimezone()
    a = opslag.afspraak_toevoegen(k["titel"], start.strftime("%Y-%m-%dT%H:%M"),
                                  (start + timedelta(minutes=k["minuten"])).strftime("%Y-%m-%dT%H:%M"),
                                  "Gekozen via een stemronde.", k["plaats"])
    k["afspraak_id"] = a["id"]
    for naam in k.get("genodigden", []):
        try:
            samen.uitnodigen(a["id"], naam)
        except samen.Fout:
            pass
    return k


def weg(peiling_id: int) -> None:
    opslag._rpc_ik("peiling_weg", p_id=peiling_id)


def beste(p: dict) -> dict | None:
    """Het moment met de meeste ja's (bij gelijkspel ook misschien), of None zonder stemmen."""
    if not p["opties"]:
        return None
    o = max(p["opties"], key=lambda o: (o["ja"], o["misschien"]))
    return o if o["ja"] or o["misschien"] else None
