"""Samen met andere gebruikers: delen, projecten en de marktplaats.

Alles loopt via databasefuncties die naam en wachtwoord controleren. Er gaat
nooit geld via de app: kopers en verkopers regelen de betaling zelf.
"""

from datetime import datetime
from urllib.parse import quote_plus

import opslag

SOORTEN_DELEN = {"afspraak": "📅 Afspraak", "taak": "✅ Taak", "boodschappen": "🛒 Boodschappen", "notitie": "📝 Notitie"}
SOORTEN_ITEM = {"taak": "✅ Taak", "notitie": "📝 Notitie", "afspraak": "📅 Afspraak", "link": "🔗 Link"}
SOORTEN_AANBOD = {"product": "📦 Product", "dienst": "🛠️ Dienst", "training": "🏋️ Privétraining", "les": "🎓 Les of studie"}

# Andere marktplaatsen. {q} wordt de zoekterm.
ANDERE_MARKTPLAATSEN = [
    {"naam": "Marktplaats", "voor": "Tweedehands en nieuw, alles", "thuis": "https://www.marktplaats.nl/",
     "zoek": "https://www.marktplaats.nl/q/{q}/"},
    {"naam": "Vinted", "voor": "Kleding, schoenen en spullen", "thuis": "https://www.vinted.nl/",
     "zoek": "https://www.vinted.nl/catalog?search_text={q}"},
    {"naam": "2dehands", "voor": "Tweedehands in België", "thuis": "https://www.2dehands.be/",
     "zoek": "https://www.2dehands.be/q/{q}/"},
    {"naam": "Facebook Marketplace", "voor": "Spullen in de buurt", "thuis": "https://www.facebook.com/marketplace/",
     "zoek": "https://www.facebook.com/marketplace/search/?query={q}"},
    {"naam": "Bol", "voor": "Nieuwe producten", "thuis": "https://www.bol.com/",
     "zoek": "https://www.bol.com/nl/nl/s/?searchtext={q}"},
    {"naam": "Werkspot", "voor": "Vakmensen en klussen", "thuis": "https://www.werkspot.nl/", "zoek": ""},
    {"naam": "Superprof", "voor": "Bijles, privélessen en trainers", "thuis": "https://www.superprof.nl/", "zoek": ""},
]

VEILIG = ("Betaal en lever het liefst bij ophalen, of via een betaalverzoek als Tikkie nadat je het product hebt gezien. "
          "Betaal nooit vooruit aan iemand die je niet kent en deel geen inlogcodes. Klopt er iets niet? Gebruik 🚩 Melden.")


class Fout(Exception):
    """Iets lukte niet; de tekst is geschikt om aan de gebruiker te tonen."""


def _ok(antwoord: dict) -> dict:
    if antwoord.get("fout"):
        raise Fout(antwoord["fout"])
    return antwoord


def beschikbaar() -> bool:
    """Delen, projecten en de marktplaats werken alleen online (met meerdere gebruikers)."""
    return opslag.online()


def externe_links(zoekterm: str = "") -> list[dict]:
    q = quote_plus(zoekterm.strip())
    return [{"naam": m["naam"], "voor": m["voor"], "link": m["zoek"].replace("{q}", q) if q and m["zoek"] else m["thuis"]}
            for m in ANDERE_MARKTPLAATSEN]


def prijs_tekst(aanbod: dict) -> str:
    if aanbod.get("prijs") is None:
        return "Prijs in overleg"
    prijs = float(aanbod["prijs"])
    tekst = "Gratis" if prijs == 0 else f"€ {prijs:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{tekst} {aanbod['prijs_per']}".strip() if prijs and aanbod.get("prijs_per") else tekst


def tijd_tekst(start: str) -> str:
    """'2026-10-20T14:00:00+00:00' -> 'di 20-10 om 16:00' in Nederlandse tijd."""
    dag = datetime.fromisoformat(start).astimezone()
    return f"{['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'][dag.weekday()]} {dag:%d-%m} om {dag:%H:%M}"


# --- Delen -------------------------------------------------------------------

def delen(aan: str, soort: str, inhoud: dict) -> str:
    """Deelt iets met een andere gebruiker. Geeft de naam van de ontvanger."""
    return _ok(opslag._rpc_ik("delen", p_aan=aan.strip().lstrip("@"), p_soort=soort, p_inhoud=inhoud))["aan"]


def gedeeld_met_mij() -> list[dict]:
    return opslag._rpc_ik("gedeeld_met_mij")["gedeeld"]


def gedeeld_aannemen(item: dict) -> str:
    """Zet iets wat met je gedeeld is in je eigen agenda, taken of boodschappen."""
    inhoud, van = item["inhoud"], item["van"]
    if item["soort"] == "afspraak":
        opslag.afspraak_toevoegen(inhoud.get("titel", "Afspraak"), inhoud["start"], inhoud.get("einde"),
                                  (inhoud.get("notitie", "") + f"\nGedeeld door {van}").strip(), inhoud.get("locatie", ""),
                                  soort=inhoud.get("soort", ""), sport=inhoud.get("sport", ""))
        plek = "je agenda"
    elif item["soort"] == "boodschappen":
        opslag.boodschap_toevoegen(inhoud.get("items", []))
        plek = "je boodschappenlijst"
    else:
        titel = inhoud.get("titel", "")
        if item["soort"] == "notitie":
            titel = f"📝 {titel or inhoud.get('tekst', '')[:80]} (van {van})"
        opslag.taak_toevoegen(titel, inhoud.get("deadline"))
        plek = "je taken"
    opslag._rpc_ik("gedeeld_afhandelen", p_id=item["id"], p_aangenomen=True)
    return plek


def gedeeld_afwijzen(gedeeld_id: int) -> None:
    opslag._rpc_ik("gedeeld_afhandelen", p_id=gedeeld_id, p_aangenomen=False)


# --- Projecten -----------------------------------------------------------------

def projecten() -> list[dict]:
    return opslag._rpc_ik("projecten")["projecten"]


def project_maken(titel: str, omschrijving: str = "") -> int:
    return _ok(opslag._rpc_ik("project_maken", p_titel=titel, p_omschrijving=omschrijving))["id"]


def lid_toevoegen(project_id: int, gebruikersnaam: str) -> str:
    return _ok(opslag._rpc_ik("project_lid_toevoegen", p_project=project_id,
                              p_gebruikersnaam=gebruikersnaam.strip().lstrip("@")))["lid"]


def project_verlaten(project_id: int) -> None:
    opslag._rpc_ik("project_verlaten", p_project=project_id)


def items(project_id: int) -> list[dict]:
    return _ok(opslag._rpc_ik("project_items", p_project=project_id))["items"]


def item_toevoegen(project_id: int, soort: str, titel: str, inhoud: str = "", datum: str = "",
                   toegewezen_aan: str = "") -> int:
    return _ok(opslag._rpc_ik("project_item_toevoegen", p_project=project_id, p_soort=soort, p_titel=titel,
                              p_inhoud=inhoud, p_datum=datum, p_toegewezen_aan=toegewezen_aan.lstrip("@")))["id"]


def item_bijwerken(item_id: int, klaar: bool | None = None, titel: str | None = None, inhoud: str | None = None,
                   verwijderd: bool | None = None) -> bool:
    return bool(opslag._rpc_ik("project_item_bijwerken", p_item=item_id, p_klaar=klaar, p_titel=titel,
                               p_inhoud=inhoud, p_verwijderd=verwijderd))


# --- Marktplaats -----------------------------------------------------------------

def aanbod_zoeken(zoekterm: str = "", soort: str = "") -> list[dict]:
    return opslag._rpc_ik("aanbod_zoeken", p_zoekterm=zoekterm.strip(), p_soort=soort)["aanbod"]


def mijn_aanbod() -> list[dict]:
    return opslag._rpc_ik("mijn_aanbod")["aanbod"]


def aanbod_plaatsen(soort: str, titel: str, omschrijving: str = "", prijs: float | None = None, prijs_per: str = "",
                    plaats: str = "", contact: str = "") -> int:
    return _ok(opslag._rpc_ik("aanbod_plaatsen", p_soort=soort, p_titel=titel, p_omschrijving=omschrijving,
                              p_prijs=prijs, p_prijs_per=prijs_per, p_plaats=plaats, p_contact=contact))["id"]


def aanbod_actief(aanbod_id: int, actief: bool) -> None:
    opslag._rpc_ik("aanbod_bijwerken", p_id=aanbod_id, p_actief=actief)


def tijd_toevoegen(aanbod_id: int, start: datetime, minuten: int) -> None:
    _ok(opslag._rpc_ik("tijdslot_toevoegen", p_aanbod=aanbod_id, p_start=start.astimezone().isoformat(),
                       p_minuten=minuten))


def tijden(aanbod_id: int) -> list[dict]:
    return opslag._rpc_ik("tijdsloten", p_aanbod=aanbod_id)["tijden"]


def boeken(tijdslot_id: int, opmerking: str = "", in_agenda: bool = True) -> dict:
    """Boekt een tijd en zet hem in je eigen agenda."""
    boeking = _ok(opslag._rpc_ik("boeken", p_tijdslot=tijdslot_id, p_opmerking=opmerking))
    if in_agenda:
        in_agenda_zetten({**boeking, "met": boeking["aanbieder"]})
    return boeking


def in_agenda_zetten(boeking: dict) -> None:
    start = datetime.fromisoformat(boeking["start"]).astimezone()
    einde = start.timestamp() + boeking["minuten"] * 60
    opslag.afspraak_toevoegen(boeking["titel"], start.strftime("%Y-%m-%dT%H:%M"),
                              datetime.fromtimestamp(einde).astimezone().strftime("%Y-%m-%dT%H:%M"),
                              f"Geboekt via de marktplaats, met {boeking['met']}", boeking.get("plaats", ""))


def boeking_annuleren(tijdslot_id: int) -> bool:
    return bool(opslag._rpc_ik("boeking_annuleren", p_tijdslot=tijdslot_id))


def mijn_boekingen() -> list[dict]:
    return opslag._rpc_ik("mijn_boekingen")["boekingen"]


def bericht_sturen(aanbod_id: int, tekst: str, aan_id: int | None = None) -> None:
    _ok(opslag._rpc_ik("bericht_sturen", p_aanbod=aanbod_id, p_aan=aan_id, p_tekst=tekst))


def berichten() -> list[dict]:
    return opslag._rpc_ik("berichten")["berichten"]


def gesprekken() -> list[dict]:
    """Berichten gegroepeerd per aanbod en gesprekspartner, nieuwste gesprek eerst."""
    groepen: dict[tuple, dict] = {}
    for b in berichten():
        g = groepen.setdefault((b["aanbod_id"], b["ander_id"]), {"aanbod_id": b["aanbod_id"], "ander_id": b["ander_id"],
                                                                 "ander": b["ander"], "titel": b["titel"],
                                                                 "berichten": [], "ongelezen": 0})
        g["berichten"].append(b)
        g["ongelezen"] += not b["gelezen"]
    return sorted(groepen.values(), key=lambda g: g["berichten"][-1]["id"], reverse=True)


def gelezen(aanbod_id: int, ander_id: int) -> None:
    opslag._rpc_ik("berichten_gelezen", p_aanbod=aanbod_id, p_ander=ander_id)


def melden(aanbod_id: int, reden: str) -> bool:
    return bool(opslag._rpc_ik("melden", p_aanbod=aanbod_id, p_reden=reden))


def nieuw() -> dict:
    """Hoeveel er nieuw is: gedeelde dingen en ongelezen berichten."""
    return {"gedeeld": len(gedeeld_met_mij()), "berichten": sum(not b["gelezen"] for b in berichten())}


# --- Beheer (alleen de eigenaar) ---------------------------------------------------

def beheer() -> dict:
    return opslag._rpc_ik("beheer_meldingen")


def melding_afhandelen(melding_id: int, aanbod_blokkeren: bool = False, aanbieder_blokkeren: bool = False) -> bool:
    return bool(opslag._rpc_ik("beheer_afhandelen", p_melding=melding_id, p_aanbod_blokkeren=aanbod_blokkeren,
                               p_aanbieder_blokkeren=aanbieder_blokkeren))
