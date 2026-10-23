"""Potten: samen geld inzamelen (cadeau, spaardoel, donaties). Zie sql/potten.sql.

De app beweegt geen geld: je maakt over naar de rekening of het betaalverzoek van de maker.
"""

import opslag
import samen

SOORTEN = {"cadeau": "Cadeau", "spaardoel": "Spaardoel", "donatie": "Donaties"}


def mijn() -> list[dict]:
    return samen._ok(opslag._rpc_ik("mijn_potten"))["potten"]


def bekijken(pot_id: int) -> dict:
    return samen._ok(opslag._rpc_ik("pot_bekijken", p_pot=int(pot_id)))["pot"]


def maken(titel: str, soort: str = "cadeau", doel: float | None = None, omschrijving: str = "", iban: str = "",
          tenaamstelling: str = "", betaallink: str = "", einddatum=None, leden: list[str] | None = None,
          community: int | None = None, gezin: int | None = None, afspraak: str = "", openbaar: bool = False) -> dict:
    return samen._ok(opslag._rpc_ik(
        "pot_maken", p_titel=titel, p_omschrijving=omschrijving, p_soort=soort, p_doel=doel, p_iban=iban,
        p_tenaamstelling=tenaamstelling, p_betaallink=betaallink.strip(),
        p_einddatum=einddatum.isoformat() if einddatum else None, p_leden=[l for l in (leden or []) if l.strip()],
        p_community=community, p_gezin=gezin, p_afspraak=str(afspraak or ""), p_openbaar=openbaar))


def bijwerken(p: dict, **velden) -> None:
    w = p | velden
    samen._ok(opslag._rpc_ik(
        "pot_bijwerken", p_pot=p["id"], p_titel=w["titel"], p_omschrijving=w["omschrijving"], p_doel=w["doel"],
        p_iban=w["iban"], p_tenaamstelling=w["tenaamstelling"], p_betaallink=w["betaallink"],
        p_einddatum=str(w["einddatum"]) if w.get("einddatum") else None, p_openbaar=w["openbaar"],
        p_gesloten=w["gesloten"]))


def leden_toevoegen(pot_id: int, leden: list[str]) -> int:
    return samen._ok(opslag._rpc_ik("pot_leden_toevoegen", p_pot=pot_id, p_leden=leden))["toegevoegd"]


def bijdragen(pot_id: int, bedrag: float, bericht: str = "", anoniem: bool = False) -> None:
    samen._ok(opslag._rpc_ik("pot_bijdragen", p_pot=pot_id, p_bedrag=round(float(bedrag), 2), p_bericht=bericht,
                             p_anoniem=anoniem))


def status(bijdrage_id: int, nieuw: str) -> None:
    samen._ok(opslag._rpc_ik("pot_bijdrage_status", p_bijdrage=bijdrage_id, p_status=nieuw))


def weg(pot_id: int) -> None:
    samen._ok(opslag._rpc_ik("pot_weg", p_pot=pot_id))


def openbaar(code: str) -> dict:
    return samen._ok(opslag._rpc("pot_openbaar", p_code=code))["pot"]


def doneren(code: str, naam: str, bedrag: float, bericht: str = "", anoniem: bool = False) -> None:
    samen._ok(opslag._rpc("pot_doneren", p_code=code, p_naam_gever=naam, p_bedrag=round(float(bedrag), 2),
                          p_bericht=bericht, p_anoniem=anoniem))


def voor_afspraak(afspraak_id: str, potten: list[dict] | None = None) -> dict | None:
    return next((p for p in (potten if potten is not None else mijn()) if p["afspraak"] == str(afspraak_id)
                 and p["van_mij"]), None)


def stand(p: dict) -> str:
    """Kort: '€ 35 van € 50 · 4 gevers'."""
    tekst = samen.euro(p["toegezegd"]) + (f" van {samen.euro(p['doel'])}" if p.get("doel") else "")
    return tekst + f" · {p['gevers']} {'gever' if p['gevers'] == 1 else 'gevers'}"
