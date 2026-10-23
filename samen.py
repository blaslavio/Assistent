"""Samen met andere gebruikers: delen, projecten en de marktplaats.

Alles loopt via databasefuncties die naam en wachtwoord controleren. Er gaat
nooit geld via de app: kopers en verkopers regelen de betaling zelf.
"""

import os
import re
import time
from datetime import date, datetime, timedelta
from urllib.parse import quote_plus

import httpx

import opslag

SOORTEN_DELEN = {"afspraak": "📅 Afspraak", "taak": "✅ Taak", "boodschappen": "🛒 Boodschappen", "notitie": "📝 Notitie"}
SOORTEN_ITEM = {"taak": "✅ Taak", "notitie": "📝 Notitie", "afspraak": "📅 Afspraak", "link": "🔗 Link"}
SOORTEN_AANBOD = {"product": "📦 Product", "dienst": "🛠️ Dienst", "training": "🏋️ Privétraining", "les": "🎓 Les of studie"}
BETAALWIJZEN = {"app": "💳 Via de app (beschermd)", "tikkie": "📲 Tikkie of betaalverzoek", "overmaken": "🏦 Overmaken",
                "contant": "💶 Contant bij ophalen"}
LEVERING = {"ophalen": "🤝 Ophalen", "verzenden": "📦 Verzenden", "op_locatie": "📍 Op locatie", "online": "💻 Online",
            "bezorgen": "🛵 Bezorgen"}
STATUS = {"aangevraagd": "🕓 Aangevraagd", "geaccepteerd": "👍 Geaccepteerd", "betaald": "💶 Betaald",
          "geleverd": "📦 Geleverd", "afgerond": "✅ Afgerond", "geannuleerd": "✖️ Geannuleerd",
          "geschil": "⚠️ Probleem gemeld", "terugbetaald": "↩️ Terugbetaald"}

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

VEILIG = ("Het veiligst is **💳 betalen via de app**: je geld staat bij Stripe en gaat pas naar de verkoper als jij "
          "bevestigt dat alles goed is ontvangen. Gaat er iets mis, meld dan een probleem; de beheerder beslist. "
          "Betaal je buiten de app, doe dat dan bij ophalen of nadat je het product hebt gezien. Betaal nooit via een "
          "link of rekeningnummer dat iemand in een bericht stuurt, en deel nooit inlogcodes. Let op ✅ geverifieerd "
          "en de sterren. Klopt er iets niet? Gebruik 🚩 Melden.")

# Signalen van oplichting in berichten: links, rekeningnummers, betaalverzoeken, telefoonnummers.
VERDACHT = re.compile(r"https?://|www\.|\b[A-Z]{2}\d{2}\s?[A-Z]{4}(\s?\d){10}\b|tikkie|betaalverzoek|whatsapp|"
                      r"(\+31|0031|\b06)[\s-]?\d", re.I)


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


def tijd_kort(start: str) -> str:
    """'2026-10-21T19:00' -> 'wo 21-10 19:00' (agendatijd, al in je eigen tijdzone)."""
    try:
        d = datetime.fromisoformat(start)
    except ValueError:
        return start
    return f"{['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'][d.weekday()]} {d:%d-%m}" + (f" {d:%H:%M}" if "T" in start else "")


# --- Agenda delen -------------------------------------------------------------

REACTIES = {"op_tijd": "Op tijd", "later": "Later", "kan_niet": "Kan niet", "opmerking": "Opmerking"}


def agenda_delen(met: str, niveau: str = "bezet") -> str:
    _deelsituatie.clear()
    """Deelt je agenda met een gebruiker (details of alleen 'bezet'). Geeft diens naam."""
    return _ok(opslag._rpc_ik("agenda_delen", p_met=met.strip().lstrip("@"), p_niveau=niveau))["met"]


def agenda_delen_stoppen(ander_id: int) -> None:
    _deelsituatie.clear()
    opslag._rpc_ik("agenda_delen_stoppen", p_ander=ander_id)


def agenda_deelsituatie() -> dict:
    """{ik_deel_met: [{id, naam, niveau}], met_mij: [{id, naam, niveau}]}; leeg als je niet online bent."""
    if not beschikbaar():
        return {"ik_deel_met": [], "met_mij": []}
    # Een minuut onthouden: verandert zelden, en de agenda vraagt het bij elke klik.
    sleutel = (opslag._naam.get(), opslag._wachtwoord.get())
    bewaard = _deelsituatie.get(sleutel)
    if bewaard and time.time() - bewaard[0] < 60:
        return bewaard[1]
    antwoord = opslag._rpc_ik("agenda_deelsituatie")
    _deelsituatie[sleutel] = (time.time(), antwoord)
    return antwoord


_deelsituatie: dict[tuple, tuple[float, dict]] = {}


def gedeelde_agenda(eigenaar_id: int, van: str, tot: str) -> dict:
    return _ok(opslag._rpc_ik("gedeelde_agenda", p_eigenaar=eigenaar_id, p_van=van, p_tot=tot))


def agenda_reageren(eigenaar_id: int | None, afspraak_id, soort: str, minuten: int | None = None,
                    tekst: str = "") -> dict:
    """Reageren bij een afspraak: op_tijd, later (met minuten), kan_niet of opmerking (met tekst).
    eigenaar_id None is je eigen agenda."""
    return _ok(opslag._rpc_ik("agenda_reageren", p_eigenaar=eigenaar_id, p_afspraak=str(afspraak_id), p_soort=soort,
                              p_minuten=minuten, p_tekst=tekst))


def agenda_reactie_weg(reactie_id: int) -> None:
    opslag._rpc_ik("agenda_reactie_weg", p_id=reactie_id)


def mijn_agenda_reacties(afspraak_ids: list) -> dict[str, list[dict]]:
    """Reacties bij je eigen afspraken, per afspraak-id (als tekst)."""
    if not afspraak_ids or not beschikbaar():
        return {}
    per: dict[str, list[dict]] = {}
    for r in opslag._rpc_ik("mijn_agenda_reacties", p_afspraken=[str(a) for a in afspraak_ids])["reacties"]:
        per.setdefault(r["afspraak"], []).append(r)
    return per


def agenda_nieuw(sinds: str) -> list[dict]:
    """Reacties van anderen sinds een tijdstip (ISO), nieuwste eerst."""
    return agenda_nieuws(sinds)["reacties"]


def agenda_nieuws(sinds: str) -> dict:
    """{reacties, uitnodigingen (nieuw voor jou), antwoorden (op jouw uitnodigingen)} sinds een tijdstip."""
    antwoord = opslag._rpc_ik("agenda_nieuw", p_sinds=sinds)
    return {"reacties": antwoord.get("reacties", []), "uitnodigingen": antwoord.get("uitnodigingen", []),
            "antwoorden": antwoord.get("antwoorden", [])}


# --- Uitnodigen voor een afspraak ----------------------------------------------------

ANTWOORDEN = {"ja": "Ja", "misschien": "Misschien", "nee": "Nee"}


def uitnodigen(afspraak_id, gast: str) -> dict:
    """Nodigt een gebruiker uit voor één van je afspraken. Diegene ziet hem in zijn eigen agenda."""
    return _ok(opslag._rpc_ik("agenda_uitnodigen", p_afspraak=str(afspraak_id), p_gast=gast.strip().lstrip("@")))


def uitnodiging_weg(uitnodiging_id: int) -> None:
    opslag._rpc_ik("agenda_uitnodiging_weg", p_id=uitnodiging_id)


def antwoorden(uitnodiging_id: int, antwoord: str) -> dict:
    """ja, nee of misschien op een uitnodiging."""
    return _ok(opslag._rpc_ik("agenda_antwoorden", p_id=uitnodiging_id, p_antwoord=antwoord))


def gasten(afspraak_ids: list) -> dict[str, list[dict]]:
    """Wie je per afspraak hebt uitgenodigd: {afspraak-id: [{id, naam, antwoord}]}."""
    if not afspraak_ids or not beschikbaar():
        return {}
    per: dict[str, list[dict]] = {}
    for g in opslag._rpc_ik("agenda_gasten", p_afspraken=[str(a) for a in afspraak_ids])["gasten"]:
        per.setdefault(g["afspraak"], []).append(g)
    return per


def mijn_uitnodigingen(van: str, tot: str) -> list[dict]:
    """Afspraken van anderen waarvoor je bent uitgenodigd (behalve als je nee zei blijven ze zichtbaar)."""
    if not beschikbaar():
        return []
    return opslag._rpc_ik("mijn_uitnodigingen", p_van=van, p_tot=tot)["uitnodigingen"]


def aantallen_tekst(aantallen: dict) -> str:
    """'3 ja, 1 misschien' (zonder namen)."""
    return ", ".join(f"{aantallen[k]} {ANTWOORDEN[k].lower()}" for k in ("ja", "misschien") if aantallen.get(k))


# Wat de eigenaar per afspraak instelt (afspraak["zichtbaar"]); de eerste keuze is steeds de standaard.
ZICHTBAAR = {
    "reageren": ("Wie mag reageren", {"iedereen": "Gasten en meekijkers", "gasten": "Alleen gasten",
                                      "niemand": "Niemand"}),
    "gastenlijst": ("Wie ziet wie er komt", {"ik": "Alleen ik", "gasten": "Alle gasten"}),
    "reacties": ("Wie ziet de reacties", {"ik": "Alleen ik", "gasten": "Iedereen die mag kijken"}),
}


def zichtbaar(afspraak: dict) -> dict:
    """De instellingen van een afspraak, aangevuld met de standaard."""
    eigen = afspraak.get("zichtbaar") or {}
    return {k: eigen.get(k) if eigen.get(k) in keuzes else next(iter(keuzes)) for k, (_, keuzes) in ZICHTBAAR.items()}


def gasten_tekst(lijst: list[dict]) -> str:
    """'Sanne: ja, Jan: nog geen antwoord'."""
    return ", ".join(f"{g['naam']}: {ANTWOORDEN.get(g['antwoord'], 'nog geen antwoord').lower()}" for g in lijst)


def reactie_tekst(r: dict, met_naam: bool = True) -> str:
    """'Sanne: 10 min later', 'Jan: op tijd', 'Piet: kan niet', 'Sanne: "neem jij wijn mee?"'."""
    if r["soort"] == "later":
        wat = f"{r['minuten']} min later"
    elif r["soort"] == "op_tijd":
        wat = "op tijd"
    elif r["soort"] == "kan_niet":
        wat = "kan niet"
    else:
        wat = f"\"{r['tekst']}\""
    if r["soort"] != "opmerking" and r.get("tekst"):
        wat += f" ({r['tekst']})"
    return f"{r['door']}: {wat}" if met_naam else wat


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
    elif item["soort"] == "notitie":
        tekst = inhoud.get("tekst", "")
        opslag.lijst_toevoegen("notities", titel=(inhoud.get("titel") or tekst[:40] or "Notitie") + f" (van {van})",
                               tekst=tekst)
        plek = "je notities"
    else:
        opslag.taak_toevoegen(inhoud.get("titel", ""), inhoud.get("deadline"))
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

DIENSTEN = ("training", "les", "dienst")


def aanbod_zoeken(zoekterm: str = "", soort: str = "") -> list[dict]:
    """Bij diensten (training, les, dienst) staan de best beoordeelde bovenaan."""
    lijst = opslag._rpc_ik("aanbod_zoeken", p_zoekterm=zoekterm.strip(), p_soort=soort)["aanbod"]
    if soort in DIENSTEN:
        lijst.sort(key=lambda a: -score(a.get("vertrouwen")))
    return lijst


def mijn_aanbod() -> list[dict]:
    return opslag._rpc_ik("mijn_aanbod")["aanbod"]


def aanbod_plaatsen(soort: str, titel: str, omschrijving: str = "", prijs: float | None = None, prijs_per: str = "",
                    plaats: str = "", contact: str = "", betaalwijzen: list[str] | None = None,
                    levering: list[str] | None = None) -> int:
    return _ok(opslag._rpc_ik("aanbod_plaatsen", p_soort=soort, p_titel=titel, p_omschrijving=omschrijving,
                              p_prijs=prijs, p_prijs_per=prijs_per, p_plaats=plaats, p_contact=contact,
                              p_betaalwijzen=betaalwijzen or ["tikkie", "contant"],
                              p_levering=levering or ["ophalen"]))["id"]


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


def euro(bedrag: float | None) -> str:
    if bedrag is None:
        return "in overleg"
    return f"€ {float(bedrag):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


NIVEAUS = {
    "particulier": ("Privé", "Je gebruikt de app voor jezelf. Je kunt af en toe iets verkopen, tot 10 dingen tegelijk."),
    "verkoper": ("Privé, verkoopt vaak", "Je verkoopt als privépersoon (geen bedrijf, geen KvK), bijvoorbeeld spullen "
                 "van zolder of een hobby. Tot 100 dingen tegelijk en een overzicht van je verkopen. Verkoop je "
                 "regelmatig met winst, dan ben je ondernemer en hoor je in te schrijven bij de KvK."),
    "ondernemer": ("Bedrijf of zzp (KvK)", "Je verkoopt als bedrijf of zzp'er met een KvK-nummer. Je aanbod krijgt het "
                   "label 'Zakelijk', je maakt facturen en ziet je klanten. Tot 1000 dingen tegelijk."),
}


def niveau_instellen(niveau: str, bedrijf: dict | None = None) -> dict:
    return _ok(opslag._rpc_ik("niveau_instellen", p_niveau=niveau, p_bedrijf=bedrijf))


def verkoop_overzicht() -> dict:
    return opslag._rpc_ik("verkoop_overzicht")


def zakelijk(v: dict | None) -> dict | None:
    """Het bedrijf achter een aanbod of bestelling, of None bij een particulier."""
    return (v or {}).get("bedrijf") if (v or {}).get("niveau") == "ondernemer" else None


def vertrouwen_tekst(v: dict | None) -> str:
    """Korte regel waaruit blijkt hoe betrouwbaar iemand is."""
    if not v:
        return ""
    delen = []
    if bedrijf := zakelijk(v):
        delen.append(" ".join(filter(None, ["Zakelijk", bedrijf.get("naam") or "",
                                            f"(KvK {bedrijf['kvk']})" if bedrijf.get("kvk") else ""])))
    if v.get("geverifieerd"):
        delen.append("✅ geverifieerd")
    if v.get("beoordelingen"):
        delen.append(f"⭐ {str(v['sterren']).replace('.', ',')} ({v['beoordelingen']})")
    if v.get("verkocht"):
        delen.append(f"{v['verkocht']} keer verkocht")
    if v.get("nieuw"):
        delen.append("🆕 nieuw account")
    elif v.get("lid_sinds"):
        delen.append(f"lid sinds {datetime.fromisoformat(v['lid_sinds']):%m-%Y}")
    return " · ".join(delen)


# --- Bestellingen ------------------------------------------------------------------

def bestellen(aanbod_id: int, betaalwijze: str, levering: str, bericht: str = "") -> int:
    return _ok(opslag._rpc_ik("bestellen", p_aanbod=aanbod_id, p_betaalwijze=betaalwijze, p_levering=levering,
                              p_bericht=bericht))["id"]


def bod_doen(aanbod_id: int, bedrag: float, bericht: str = "") -> int:
    return _ok(opslag._rpc_ik("bod_doen", p_aanbod=aanbod_id, p_bedrag=round(bedrag, 2), p_bericht=bericht))["id"]


def bod_antwoorden(bod_id: int, actie: str, bedrag: float | None = None) -> None:
    """Verkoper: accepteren, afwijzen of tegenbod (met bedrag). Koper: accepteren, afwijzen (tegenbod) of intrekken."""
    _ok(opslag._rpc_ik("bod_antwoorden", p_id=bod_id, p_actie=actie,
                       p_bedrag=round(bedrag, 2) if bedrag is not None else None))


def mijn_biedingen() -> list[dict]:
    return opslag._rpc_ik("mijn_biedingen")["biedingen"]


def bestelling_stap(bestelling_id: int, actie: str, toelichting: str = "") -> str:
    """accepteren, weigeren, betaling_ontvangen, geleverd (verkoper); annuleren, ontvangen, probleem (koper)."""
    return _ok(opslag._rpc_ik("bestelling_bijwerken", p_id=bestelling_id, p_actie=actie,
                              p_toelichting=toelichting))["status"]


def mijn_bestellingen() -> list[dict]:
    return opslag._rpc_ik("mijn_bestellingen")["bestellingen"]


VERVOERDERS = {"postnl": "PostNL", "dhl": "DHL", "dpd": "DPD", "gls": "GLS", "ups": "UPS", "anders": "Anders"}
_VOLGEN = {"postnl": "https://postnl.nl/tracktrace/?B={}&D=NL&T=C",
           "dhl": "https://www.dhl.com/nl-nl/home/tracking.html?tracking-id={}",
           "dpd": "https://www.dpdgroup.com/nl/mydpd/my-parcels/incoming?parcelNumber={}",
           "gls": "https://gls-group.com/NL/nl/volg-je-pakket?match={}",
           "ups": "https://www.ups.com/track?loc=nl_NL&tracknum={}"}


def volg_link(b: dict) -> str:
    """De pagina van de vervoerder om het pakket te volgen (bij Anders mag de code zelf een link zijn)."""
    code = (b.get("track_code") or "").strip()
    if not code:
        return ""
    if code.startswith("https://"):
        return code
    sjabloon = _VOLGEN.get(b.get("vervoerder") or "")
    return sjabloon.format(quote_plus(code)) if sjabloon else ""


def verzending(bestelling_id: int, vervoerder: str = "", code: str = "", van: datetime | None = None,
               tot: datetime | None = None) -> None:
    """Verkoper: track en trace (en eventueel bezorgmoment). Koper: alleen het bezorgmoment."""
    _ok(opslag._rpc_ik("bestelling_verzending", p_id=bestelling_id, p_vervoerder=vervoerder, p_code=code,
                       p_van=van.astimezone().isoformat() if van else None,
                       p_tot=tot.astimezone().isoformat() if tot else None))


def bezorgingen_in_agenda(bestellingen: list[dict]) -> None:
    """Zodra het bezorgmoment van iets wat je koopt bekend is, staat het in je agenda (en verschuift het mee)."""
    afspraken = {a.get("bestelling_id"): a for a in opslag.laden()["afspraken"] if a.get("bestelling_id")}
    for b in bestellingen:
        if b["rol"] != "koper" or not b.get("bezorgen_van") or b["status"] not in ("betaald", "geleverd"):
            continue
        start = datetime.fromisoformat(b["bezorgen_van"]).astimezone().strftime("%Y-%m-%dT%H:%M")
        einde = datetime.fromisoformat(b["bezorgen_tot"]).astimezone().strftime("%Y-%m-%dT%H:%M")
        notitie = " ".join(filter(None, [VERVOERDERS.get(b.get("vervoerder") or "", ""), b.get("track_code") or ""]))
        if a := afspraken.get(b["id"]):
            if (a["start"], a.get("einde")) != (start, einde) or a.get("notitie") != notitie:
                opslag.afspraak_bijwerken(a["id"], start=start, einde=einde, notitie=notitie)
        else:
            nieuw = opslag.afspraak_toevoegen(f"Bezorging: {b['titel']}", start, einde, notitie, soort="bezorging")
            opslag.afspraak_bijwerken(nieuw["id"], bestelling_id=b["id"])


def score(vertrouwen: dict | None) -> float:
    """Om de beste bovenaan te zetten: het gemiddelde, gewogen naar het aantal reviews (weinig reviews telt minder)."""
    v = vertrouwen or {}
    n = v.get("beoordelingen") or 0
    return ((v.get("sterren") or 0) * n + 3.5 * 3) / (n + 3)


def beoordelen(bestelling_id: int, sterren: int, tekst: str = "") -> None:
    _ok(opslag._rpc_ik("beoordelen", p_bestelling=bestelling_id, p_sterren=sterren, p_tekst=tekst))


# --- Webshop ------------------------------------------------------------------------
# Een eigen winkelpagina voor verkopers en ondernemers. De koper betaalt via de app zonder extra kosten;
# de verkoper betaalt commissie, die bij het uitbetalen wordt ingehouden.

def mijn_winkel() -> dict:
    return opslag._rpc_ik("mijn_winkel")


def winkel_instellen(adres: str, naam: str, omschrijving: str, kleur: str, verzendkosten: float,
                     gratis_vanaf: float | None, retour: str, open_: bool) -> str:
    return _ok(opslag._rpc_ik("winkel_instellen", p_adres=adres, p_winkelnaam=naam, p_omschrijving=omschrijving,
                              p_kleur=kleur, p_verzendkosten=verzendkosten, p_gratis_vanaf=gratis_vanaf,
                              p_retour=retour, p_open=open_))["adres"]


def winkel_product(aanbod_id: int, in_winkel: bool, voorraad: int | None) -> None:
    _ok(opslag._rpc_ik("winkel_product", p_aanbod=aanbod_id, p_in_winkel=in_winkel, p_voorraad=voorraad))


def winkel_vestiging(winkeladres: str, lat: float | None, lon: float | None) -> None:
    """Adres van de echte winkel, zodat hij op de winkelkaart staat. Leeg = alleen online."""
    _ok(opslag._rpc_ik("winkel_vestiging", p_winkeladres=winkeladres, p_lat=lat, p_lon=lon))


def winkel_bekijken(adres: str) -> dict:
    """Een winkel zoals iedereen hem ziet, ook zonder account."""
    return _ok(opslag._rpc("winkel_bekijken", p_adres=adres))


def winkels_zoeken(zoekterm: str = "") -> list[dict]:
    """Alle open winkels in de app (de winkelstraat), ook zonder account."""
    return opslag._rpc("winkels_zoeken", p_zoekterm=zoekterm)


def webshop_bestellen(aanbod_id: int, aantal: int, levering: str, bericht: str = "", code: str = "") -> dict:
    return _ok(opslag._rpc_ik("webshop_bestellen", p_aanbod=aanbod_id, p_aantal=aantal, p_levering=levering,
                              p_bericht=bericht, p_code=code))


# --- Winkelen: winkels en producten in de buurt, een mandje per winkel, bezorgen en inkopen ----------

WINKELSOORTEN = {"winkel": "Winkel", "restaurant": "Restaurant", "groothandel": "Groothandel"}
BEZORG_STAP = {"": "Besteld", "bereiden": "Wordt klaargemaakt", "onderweg": "Onderweg"}


def winkelen_winkels(zoek: str = "", lat: float | None = None, lon: float | None = None, soort: str = "",
                     inkopen: bool = False) -> list[dict]:
    """Open winkels, dichtstbij eerst. inkopen=True: alleen groothandels (voor verkopers en ondernemers)."""
    return _ok(opslag._rpc_ik("winkelen_winkels", p_zoek=zoek, p_lat=lat, p_lon=lon, p_soort=soort,
                              p_inkopen=inkopen))["winkels"]


def winkelen_producten(zoek: str = "", lat: float | None = None, lon: float | None = None,
                       inkopen: bool = False) -> list[dict]:
    return _ok(opslag._rpc_ik("winkelen_producten", p_zoek=zoek, p_lat=lat, p_lon=lon, p_inkopen=inkopen))["producten"]


def winkel_afrekenen(winkel: str, regels: list[dict], levering: str, adres: str = "", lat: float | None = None,
                     lon: float | None = None, bericht: str = "", code: str = "") -> dict:
    """Eén bestelling met alles uit het mandje van één winkel. regels = [{"id", "aantal"}]."""
    return _ok(opslag._rpc_ik("winkel_afrekenen", p_winkel=winkel, p_regels=regels, p_levering=levering,
                              p_adres=adres, p_lat=lat, p_lon=lon, p_bericht=bericht, p_code=code))


def winkel_bezorging(soort: str, bezorgen: bool, km: float, kosten: float, minimum: float, minuten: int,
                     van: str | None, tot: str | None) -> None:
    _ok(opslag._rpc_ik("winkel_bezorging", p_soort=soort, p_bezorgen=bezorgen, p_km=km, p_kosten=kosten,
                       p_minimum=minimum, p_minuten=minuten, p_van=van, p_tot=tot))


def bezorging_bijwerken(bestelling_id: int, stap: str) -> None:
    """bereiden, onderweg of bezorgd (alleen de winkel)."""
    _ok(opslag._rpc_ik("bezorging_bijwerken", p_id=bestelling_id, p_stap=stap))


# --- Reviews: alleen na een echte aankoop of een bevestigd bezoek ------------------------

def reviews_bekijken(adres: str) -> dict:
    """Reviews van een winkel, voor iedereen (ook zonder account)."""
    return opslag._rpc("reviews_bekijken", p_adres=adres) or {"aantal": 0, "sterren": None, "reviews": []}


def bezoekcode_maken() -> dict:
    return _ok(opslag._rpc_ik("bezoekcode_maken"))


def bezoek_bevestigen(code: str) -> dict:
    return _ok(opslag._rpc_ik("bezoek_bevestigen", p_code=code))


def mijn_bezoeken() -> list[dict]:
    return opslag._rpc_ik("mijn_bezoeken")["bezoeken"]


def winkel_beoordelen(bezoek_id: int, sterren: int, tekst: str) -> None:
    _ok(opslag._rpc_ik("winkel_beoordelen", p_bezoek=bezoek_id, p_sterren=sterren, p_tekst=tekst))


def review_antwoorden(soort: str, review_id: int, tekst: str) -> None:
    _ok(opslag._rpc_ik("review_antwoorden", p_soort=soort, p_id=review_id, p_tekst=tekst))


def review_melden(soort: str, review_id: int, reden: str) -> None:
    _ok(opslag._rpc_ik("review_melden", p_soort=soort, p_id=review_id, p_reden=reden))


def beheer_reviews() -> list[dict]:
    return opslag._rpc_ik("beheer_reviews").get("reviews", [])


def beheer_review_afhandelen(soort: str, review_id: int, verbergen: bool) -> None:
    _ok(opslag._rpc_ik("beheer_review_afhandelen", p_soort=soort, p_id=review_id, p_verbergen=verbergen))


# --- Marketing voor winkels ----------------------------------------------------------------

def mijn_marketing() -> dict:
    return _ok(opslag._rpc_ik("mijn_marketing"))


def kortingscode_opslaan(code: str = "", procent: int | None = None, bedrag: float | None = None, minimum: float = 0,
                         geldig_tot: str | None = None, max_gebruik: int | None = None, code_id: int | None = None,
                         actief: bool = True) -> None:
    _ok(opslag._rpc_ik("kortingscode_opslaan", p_id=code_id, p_code=code, p_procent=procent, p_bedrag=bedrag,
                       p_minimum=minimum, p_geldig_tot=geldig_tot, p_max_gebruik=max_gebruik, p_actief=actief))


def kortingscode_controleren(adres: str, code: str, subtotaal: float) -> float:
    return _ok(opslag._rpc("kortingscode_controleren", p_adres=adres, p_code=code, p_subtotaal=subtotaal))["korting"]


def winkel_actie(tekst: str, tot: str | None) -> None:
    _ok(opslag._rpc_ik("winkel_actie", p_tekst=tekst, p_tot=tot))


def winkel_nieuws_plaatsen(tekst: str) -> None:
    _ok(opslag._rpc_ik("winkel_nieuws_plaatsen", p_tekst=tekst))


def winkel_nieuws_weg(nieuws_id: int) -> None:
    _ok(opslag._rpc_ik("winkel_nieuws_weg", p_id=nieuws_id))


def winkel_volgen(adres: str, aan: bool) -> None:
    _ok(opslag._rpc_ik("winkel_volgen", p_adres=adres, p_aan=aan))


def mijn_winkelnieuws() -> dict:
    return opslag._rpc_ik("mijn_winkelnieuws")


def winkel_bezocht(adres: str) -> None:
    opslag._rpc("winkel_bezocht", p_adres=adres)


def commissie(bedrag: float, procent: float = 5, minimum: float = 0.35) -> float:
    """Zelfde berekening als in de database, om vooraf te tonen."""
    return min(bedrag, max(minimum, round(bedrag * procent / 100, 2)))


def verzendkosten(winkel: dict, subtotaal: float, levering: str) -> float:
    if levering != "verzenden" or (winkel.get("gratis_vanaf") is not None and subtotaal >= winkel["gratis_vanaf"]):
        return 0.0
    return float(winkel["verzendkosten"])


# --- Betalen via de app (Stripe) --------------------------------------------------------

def betalen_status() -> dict:
    return opslag._rpc_ik("betalen_status")


def _stripe(actie: str, **velden) -> dict:
    """Roept de betaalfunctie aan (Supabase Edge Function), die met Stripe praat."""
    url = os.environ.get("SUPABASE_URL", opslag.SUPABASE_URL).rstrip("/")
    sleutel = os.environ.get("SUPABASE_KEY", opslag.SUPABASE_PUBLISHABLE_KEY)
    r = httpx.post(f"{url}/functions/v1/betalen", headers={"apikey": sleutel}, timeout=30,
                   json={"actie": actie, "naam": opslag._naam.get(), "wachtwoord": opslag._wachtwoord.get(), **velden})
    try:
        antwoord = r.json()
    except ValueError:
        raise Fout("De betaaldienst is even niet bereikbaar. Probeer het later opnieuw.")
    return _ok(antwoord)


def verkoper_aanmelden() -> str:
    """Link naar Stripe om je als verkoper aan te melden (identiteit en rekeningnummer)."""
    return _stripe("verkoper_aanmelden")["url"]


def verkoper_status() -> bool:
    return _stripe("verkoper_status")["klaar"]


def afrekenen(bestelling_id: int) -> str:
    """Link naar de betaalpagina van Stripe (iDEAL, Apple Pay, kaart)."""
    return _stripe("afrekenen", bestelling=bestelling_id)["url"]


def ontvangen_bevestigen(bestelling: dict) -> None:
    """Koper bevestigt dat alles goed is ontvangen. Bij betalen via de app gaat het geld dan naar de verkoper."""
    if bestelling["betaalwijze"] == "app":
        _stripe("ontvangen", bestelling=bestelling["id"])
    else:
        bestelling_stap(bestelling["id"], "ontvangen")


def platform_instellen(stripe_sleutel: str = "", webhook_geheim: str = "", app_adres: str = "") -> None:
    _ok(opslag._rpc_ik("platform_instellen", p_stripe_sleutel=stripe_sleutel, p_webhook_geheim=webhook_geheim,
                       p_app_adres=app_adres))


def nieuw() -> dict:
    """Wat er nieuw is: gedeelde dingen, ongelezen berichten, bestellingen die op jou wachten, meldingen en je saldo."""
    wacht, meldingen = 0, []
    maand = date.today().strftime("%Y-%m")
    week = (date.today() - timedelta(days=7)).isoformat()
    saldo = {"verdiend": 0.0, "verkocht": 0, "onderweg": 0.0, "uitgegeven": 0.0}
    sinds = opslag.instellingen().get("agenda_gezien") or (datetime.now() - timedelta(days=2)).isoformat()

    def veilig(functie):
        def proberen():
            try:
                return functie()
            except opslag.GeenToegang:
                raise
            except Exception:
                return None
        return proberen

    # Alles tegelijk vragen: scheelt bij elke vraag de reistijd naar de database.
    bestellingen, alle_berichten, met_mij, nieuws, winkelnieuws = opslag.tegelijk(
        mijn_bestellingen, berichten, gedeeld_met_mij, veilig(lambda: agenda_nieuws(sinds)), veilig(mijn_winkelnieuws))
    for b in bestellingen:
        bijgewerkt = (b.get("bijgewerkt") or "")[:10]
        if b["rol"] == "verkoper":
            wacht += b["status"] in ("aangevraagd", "betaald")
            if b["status"] == "aangevraagd":
                meldingen.append(("bestellingen", f"🛒 {b['ander']} wil **{b['titel']}** kopen"))
            elif b["status"] == "betaald":
                meldingen.append(("bestellingen", f"💶 **{b['titel']}** is betaald, verstuur of overhandig het"))
            elif b["status"] == "afgerond" and bijgewerkt >= week:
                meldingen.append(("bestellingen", f"✅ **{b['titel']}** verkocht voor {euro(b['bedrag'])}"))
            if b["status"] == "afgerond" and bijgewerkt[:7] == maand:
                saldo["verdiend"] += float(b["bedrag"])
                saldo["verkocht"] += 1
            if b["betaalwijze"] == "app" and b["status"] in ("betaald", "geleverd", "geschil"):
                saldo["onderweg"] += float(b["bedrag"])
        else:
            if b["status"] == "geaccepteerd" and b["betaalwijze"] == "app":
                wacht += 1
                meldingen.append(("bestellingen", f"💳 **{b['titel']}**: je kunt nu betalen"))
            elif b["status"] == "geleverd":
                wacht += 1
                meldingen.append(("bestellingen", f"📦 **{b['titel']}** is onderweg, bevestig als het binnen is"))
            elif b["status"] == "afgerond" and not b["beoordeeld"]:
                wacht += 1
                meldingen.append(("bestellingen", f"⭐ Geef **{b['titel']}** een beoordeling"))
            if b["status"] in ("betaald", "geleverd", "afgerond") and bijgewerkt[:7] == maand:
                saldo["uitgegeven"] += float(b["bedrag"]) + float(b.get("kosten") or 0)
    try:
        bezorgingen_in_agenda(bestellingen)
    except opslag.GeenToegang:
        raise
    except Exception:
        pass
    ongelezen = sum(not b["gelezen"] for b in alle_berichten)
    gedeeld = len(met_mij)
    if ongelezen:
        meldingen.append(("berichten", f"💬 {ongelezen} nieuw bericht" + ("en" if ongelezen > 1 else "")))
    if gedeeld:
        meldingen.append(("samen", f"🤝 {gedeeld} nieuw met je gedeeld"))
    if nieuws:
        for u in nieuws["uitnodigingen"][:3]:
            meldingen.append(("agenda", f"🗓️ {u['van']} nodigt je uit: **{u['titel']}** · {tijd_kort(u['start'])}"))
        for u in nieuws["antwoorden"][:3]:
            meldingen.append(("agenda", f"🗓️ {u['gast']}: {ANTWOORDEN.get(u['antwoord'], u['antwoord']).lower()} · {u['titel']}"))
        for r in nieuws["reacties"][:3]:
            meldingen.append(("agenda", f"🗓️ {reactie_tekst(r)} · {r.get('titel') or 'afspraak'}"))
    for n in (winkelnieuws or {}).get("nieuws", [])[:2]:
        if n["datum"][:10] >= (date.today() - timedelta(days=2)).isoformat():
            meldingen.append(("winkels", f"📰 **{n['winkel']}**: {n['tekst'][:70]}"))
    return {"gedeeld": gedeeld, "berichten": ongelezen, "bestellingen": wacht, "meldingen": meldingen, "saldo": saldo}


# --- Beheer (alleen de eigenaar) ---------------------------------------------------

def beheer() -> dict:
    return opslag._rpc_ik("beheer_meldingen")


def geschillen() -> list[dict]:
    return opslag._rpc_ik("beheer_geschillen")["geschillen"]


def geschil_besluiten(geschil: dict, uitkomst: str) -> None:
    """uitkomst: koper (geld terug) of verkoper (uitbetalen)."""
    if geschil["betaalwijze"] == "app":
        _stripe("geschil_besluiten", bestelling=geschil["id"], uitkomst=uitkomst)
    else:
        opslag._rpc_ik("beheer_geschil_afhandelen", p_id=geschil["id"], p_uitkomst=uitkomst)


def melding_afhandelen(melding_id: int, aanbod_blokkeren: bool = False, aanbieder_blokkeren: bool = False) -> bool:
    return bool(opslag._rpc_ik("beheer_afhandelen", p_melding=melding_id, p_aanbod_blokkeren=aanbod_blokkeren,
                               p_aanbieder_blokkeren=aanbieder_blokkeren))
