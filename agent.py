"""De agent: Claude met hulpmiddelen voor taken, agenda, leren en zoeken op internet."""

import json
from datetime import datetime

import anthropic
from anthropic import beta_tool

import opslag
import planning
import reizen
import activiteiten
import boodschappen
import events
import tijd
import weer

MODEL = "claude-opus-5-5"
MAX_HERVATTINGEN = 5

SYSTEEM = """Je bent een persoonlijke assistent die in het Nederlands antwoordt.
Je helpt met dagelijkse taken, de agenda, vakanties plannen en leren.

Werkwijze:
- Houd antwoorden kort en praktisch; gebruik lijstjes als dat helpt. De gebruiker
  leest vaak op een iPad of spreekt in via dicteren: begin met het antwoord, geen
  inleiding, en vraag maximaal één ding tegelijk.
- Doe het direct als het duidelijk genoeg is; vul redelijke aannames zelf in en
  noem ze kort, in plaats van eerst vragen te stellen.
- Actuele informatie (openingstijden, prijzen, nieuws, wat ergens te doen is):
  zoek op internet of met plaats_zoeken, en lees een pagina met web_fetch als
  het antwoord daar staat. Noem je bron kort.
- Boodschappen: zet producten zo specifiek mogelijk op de lijst. Bij een recept
  of weekmenu zet je alle ingrediënten erop. Vergelijk prijzen met
  prijzen_vergelijken en noem de goedkoopste supermarkt in de buurt, en wat het
  scheelt. Prijzen zijn een indicatie van de webwinkels.
- Gebruik de hulpmiddelen om taken, afspraken en leervoortgang echt op te slaan,
  in plaats van alleen te zeggen dat je het onthoudt.
- Vraag eerst om bevestiging voordat je iets verwijdert.
- Agenda: vraag bij een afspraak buiten de deur naar het adres en met wie de
  afspraak is. Koppel de afspraak aan een contactpersoon (zoek eerst, maak
  anders een nieuw contact). Is het thuisadres onbekend, vraag het één keer.
  Geef bij een vraag over een dag de dagplanning met vertrektijden en wijs op
  krappe overstappen. Vraag welk vervoer de gebruiker neemt als dat niet bekend is.
- Tijdregistratie: meldt de gebruiker vertrek, aankomst, weggaan of terugkomst,
  leg dat vast bij de juiste afspraak. Bij vragen over tijdsbesteding noem je
  reistijd, tijd op locatie en uitloop, en geef je een korte tip.
- Soort: alles gaat in de agenda (sport, uitgaan, etentje, werk, familie en
  vrienden, gezondheid, reizen). Geef bij afspraak_toevoegen altijd de passende
  soort mee.
- Sport: zet sportafspraken (zoals samen hardlopen of fitness) in de agenda met
  de sport ingevuld en koppel het sportmaatje als contact. Vraag na afloop hoe
  het ging (duur, afstand, gevoel) en leg dat vast. Help met een haalbaar
  weekritme en moedig aan zonder te overdrijven; geen medisch advies.
  Help doelen meetbaar te maken (sportdoel_stellen), stel een opbouwschema voor
  met sportafspraken in de agenda en bespreek de voortgang.
- Events: tickets koopt de gebruiker zelf via de ticketlink; jij koopt of betaalt nooit.
  Zet een event pas in de agenda na akkoord, met de ticketlink in de notitie.
- Vakantie plannen: vraag naar periode, budget, reisgezelschap en wensen, zoek
  actuele informatie op internet en maak een dagschema met een kostenraming.
  Boeken doet de gebruiker zelf. Zet de reisdagen pas in de agenda na akkoord.
- Leren: maak bij een nieuw onderwerp een leerplan van 4 tot 10 kleine stappen
  en sla het op. Leg per stap kort uit en stel daarna 1 tot 3 controlevragen.
  Geef een score van 0 tot 5 op basis van de antwoorden en leg die vast.
  Begin een gesprek over leren met de herhalingen die vandaag gepland staan.
- Over geld en beleggen geef je algemene informatie, geen persoonlijk
  beleggingsadvies.
"""


def _json(data) -> str:
    return json.dumps(data, ensure_ascii=False)


@beta_tool
def taak_toevoegen(titel: str, deadline: str = "") -> str:
    """Voeg een taak toe aan de takenlijst.

    Args:
        titel: Korte omschrijving van de taak.
        deadline: Optionele datum als JJJJ-MM-DD, leeg laten als er geen deadline is.
    """
    return _json(opslag.taak_toevoegen(titel, deadline or None))


@beta_tool
def taken_bekijken() -> str:
    """Toon alle open taken, gesorteerd op deadline."""
    return _json(opslag.open_taken())


@beta_tool
def taak_afronden(taak_id: int) -> str:
    """Markeer een taak als klaar.

    Args:
        taak_id: Het id van de taak.
    """
    taak = opslag.taak_afronden(taak_id)
    return _json(taak) if taak else f"Geen taak met id {taak_id} gevonden."


@beta_tool
def afspraak_toevoegen(
    titel: str, start: str, einde: str = "", locatie: str = "", contact_id: int = 0, notitie: str = "", sport: str = "",
    soort: str = "afspraak",
) -> str:
    """Zet een afspraak in de agenda. Sport, uitjes, etentjes en alle andere activiteiten gaan ook in de agenda.

    Args:
        titel: Naam van de afspraak.
        start: Begin als JJJJ-MM-DDTHH:MM (of JJJJ-MM-DD voor een hele dag).
        einde: Optioneel einde in hetzelfde formaat.
        locatie: Volledig adres (straat, huisnummer, plaats), zodat de reistijd berekend kan worden.
        contact_id: Id van de contactpersoon uit contacten_zoeken of contact_opslaan, 0 als er geen is.
        notitie: Optionele extra informatie.
        sport: Bij een sportafspraak de sport in kleine letters, zoals hardlopen, fitness, fietsen of zwemmen.
        soort: Een van: afspraak, sport, uitgaan, etentje, werk, familie en vrienden, gezondheid, reizen, overig.
    """
    if sport and soort == "afspraak":
        soort = "sport"
    return _json(opslag.afspraak_toevoegen(titel, start, einde or None, notitie, locatie, contact_id or None, sport,
                                           soort if soort in tijd.SOORTEN else "overig"))


@beta_tool
def contact_opslaan(
    naam: str, telefoon: str = "", email: str = "", adres: str = "", notitie: str = "", contact_id: int = 0
) -> str:
    """Sla een contactpersoon op, of werk een bestaande bij (met contact_id). Zoek eerst met contacten_zoeken
    om dubbele contacten te voorkomen.

    Args:
        naam: Naam van de persoon of organisatie.
        telefoon: Telefoonnummer.
        email: E-mailadres.
        adres: Adres.
        notitie: Extra informatie, zoals functie of waar je elkaar van kent.
        contact_id: Id van een bestaand contact om bij te werken, 0 voor een nieuw contact.
    """
    return _json(opslag.contact_opslaan(naam, telefoon, email, adres, notitie, contact_id or None))


@beta_tool
def contacten_zoeken(zoekterm: str = "") -> str:
    """Zoek contactpersonen op naam, telefoon, e-mail of notitie. Leeg laten voor alle contacten.

    Args:
        zoekterm: Tekst om op te zoeken.
    """
    return _json(opslag.contacten_zoeken(zoekterm))


@beta_tool
def thuisadres_instellen(adres: str) -> str:
    """Sla het thuisadres van de gebruiker op; de dagplanning begint en eindigt daar.

    Args:
        adres: Volledig adres (straat, huisnummer, plaats).
    """
    opslag.instellingen_bijwerken(thuisadres=adres)
    return "Thuisadres opgeslagen."


@beta_tool
def reistijd_berekenen(van: str, naar: str, vervoer: str = "auto") -> str:
    """Bereken afstand en reistijd tussen twee adressen. Gebruik "thuis" voor het thuisadres.

    Args:
        van: Vertrekadres of "thuis".
        naar: Bestemming of "thuis".
        vervoer: "auto", "fiets" of "lopen". Openbaar vervoer wordt niet berekend.
    """
    thuis = opslag.instellingen().get("thuisadres", "")
    van, naar = (thuis if a.strip().lower() == "thuis" else a for a in (van, naar))
    if not (van and naar):
        return "Geen thuisadres bekend. Vraag het adres en sla het op met thuisadres_instellen."
    try:
        return _json(reizen.reistijd(van, naar, vervoer))
    except reizen.AdresNietGevonden as fout:
        return f"Adres niet gevonden: {fout}. Vraag een vollediger adres."
    except Exception:
        return "De routedienst is even niet bereikbaar."


@beta_tool
def dagplanning(datum: str, vervoer: str = "auto") -> str:
    """Geef de planning van een dag: afspraken met contactpersoon, reistijd vanaf de vorige plek,
    vertrektijd (met 10 minuten marge) en waarschuwingen als het te krap is.

    Args:
        datum: Datum als JJJJ-MM-DD.
        vervoer: "auto", "fiets" of "lopen".
    """
    return _json(planning.dagplanning(datum, vervoer))


@beta_tool
def agenda_bekijken(van: str, tot: str) -> str:
    """Toon afspraken in een periode.

    Args:
        van: Begindatum JJJJ-MM-DD.
        tot: Einddatum JJJJ-MM-DD (inclusief).
    """
    return _json(opslag.afspraken_tussen(van, tot))


@beta_tool
def afspraak_verwijderen(afspraak_id: int) -> str:
    """Verwijder een afspraak. Alleen gebruiken nadat de gebruiker dit bevestigd heeft.

    Args:
        afspraak_id: Het id van de afspraak.
    """
    return "Verwijderd." if opslag.afspraak_verwijderen(afspraak_id) else "Afspraak niet gevonden."


@beta_tool
def tijd_vastleggen(afspraak_id: int, moment: str, tijdstip: str = "") -> str:
    """Leg voor de tijdregistratie vast wanneer de gebruiker vertrok, aankwam, wegging of terug was.

    Args:
        afspraak_id: Het id van de afspraak.
        moment: "vertrokken", "aangekomen", "weg" of "terug".
        tijdstip: Optioneel als JJJJ-MM-DDTHH:MM, leeg laten voor nu.
    """
    if moment not in tijd.MOMENTEN:
        return "Kies uit: vertrokken, aangekomen, weg of terug."
    afspraak = opslag.tijd_vastleggen(afspraak_id, moment, tijdstip or None)
    return _json({"tijden": afspraak["tijden"], "berekening": tijd.berekening(afspraak)}) if afspraak else "Afspraak niet gevonden."


@beta_tool
def sport_vastleggen(afspraak_id: int, minuten: int = 0, afstand_km: float = 0, gevoel: int = 0, notitie: str = "") -> str:
    """Leg het resultaat van een sportafspraak vast.

    Args:
        afspraak_id: Het id van de sportafspraak.
        minuten: Hoe lang er gesport is, 0 als onbekend.
        afstand_km: Afgelegde afstand in km, 0 als niet van toepassing.
        gevoel: Hoe het ging, van 1 (zwaar) tot 5 (top), 0 als onbekend.
        notitie: Optioneel, bijvoorbeeld oefeningen of gewichten.
    """
    afspraak = opslag.sport_vastleggen(afspraak_id, minuten, afstand_km, max(0, min(5, gevoel)), notitie)
    return _json(afspraak) if afspraak else "Afspraak niet gevonden."


@beta_tool
def sportoverzicht_bekijken(van: str, tot: str) -> str:
    """Toon hoe vaak, hoe lang en hoeveel km er gesport is tussen twee datums.

    Args:
        van: Begindatum als JJJJ-MM-DD.
        tot: Einddatum als JJJJ-MM-DD (inclusief).
    """
    return _json(tijd.sportoverzicht(van, tot))


@beta_tool
def weer_bekijken(plaats: str = "", datum: str = "") -> str:
    """Weersverwachting voor één dag (tot 7 dagen vooruit).

    Args:
        plaats: Adres of plaats, leeg voor het thuisadres.
        datum: JJJJ-MM-DD, leeg voor vandaag.
    """
    return _json(weer.samenvatting(plaats or opslag.instellingen().get("thuisadres", ""), datum))


@beta_tool
def sportdoel_stellen(omschrijving: str, maatstaf: str, doelwaarde: float, sport: str = "", deadline: str = "") -> str:
    """Stel een sportdoel waar de gebruiker naartoe werkt.

    Args:
        omschrijving: Het doel in de woorden van de gebruiker, bijvoorbeeld "10 km hardlopen voor de zomer".
        maatstaf: Hoe het gemeten wordt: keer_per_week, minuten_per_week, km_per_week,
            langste_km (één keer zo ver) of totaal_km (bij elkaar vanaf nu).
        doelwaarde: Het getal dat gehaald moet worden.
        sport: Alleen deze sport meetellen (bijvoorbeeld hardlopen), leeg voor alle sporten.
        deadline: Optionele datum als JJJJ-MM-DD.
    """
    if maatstaf not in opslag.MAATSTAVEN:
        return "Kies een maatstaf uit: " + ", ".join(opslag.MAATSTAVEN)
    return _json(tijd.doel_voortgang(opslag.sportdoel_stellen(omschrijving, maatstaf, doelwaarde, sport, deadline)))


@beta_tool
def sportdoelen_bekijken() -> str:
    """Toon de sportdoelen met de voortgang."""
    return _json([tijd.doel_voortgang(d) for d in opslag.sportdoelen()])


@beta_tool
def uitjes_zoeken(plaats: str = "", binnen: bool = False, alleen_buiten: bool = False) -> str:
    """Zoek uitjes in de buurt, zoals musea, bioscopen, dierentuinen en natuurgebieden (dichtstbij eerst).

    Args:
        plaats: Adres of plaats, leeg voor rond het thuisadres.
        binnen: Alleen uitjes binnen, bijvoorbeeld bij regen.
        alleen_buiten: Alleen uitjes buiten.
    """
    lijst = activiteiten.in_de_buurt(plaats)
    if binnen:
        lijst = [a for a in lijst if a["binnen"]]
    elif alleen_buiten:
        lijst = [a for a in lijst if not a["binnen"]]
    return _json([{k: v for k, v in a.items() if k not in ("lat", "lon")} for a in lijst[:15]])


@beta_tool
def plaats_zoeken(zoekterm: str, in_de_buurt_van: str = "") -> str:
    """Zoek winkels, restaurants, artsen, apotheken en andere plekken op de kaart, met adres en openingstijden.

    Args:
        zoekterm: Bijvoorbeeld "apotheek", "Albert Heijn" of "pizzeria".
        in_de_buurt_van: Adres of plaats, leeg voor rond het thuisadres.
    """
    return _json(reizen.plekken_zoeken(zoekterm, in_de_buurt_van or opslag.instellingen().get("thuisadres", "")))


@beta_tool
def boodschappen_toevoegen(producten: list[str]) -> str:
    """Zet producten op de boodschappenlijst. Hoe specifieker, hoe beter de prijsvergelijking
    (bijvoorbeeld "1 liter halfvolle melk", "ongezouten roomboter").

    Args:
        producten: De producten, één per item.
    """
    return _json(opslag.boodschap_toevoegen(producten))


@beta_tool
def boodschappenlijst_bekijken() -> str:
    """Toon de boodschappenlijst."""
    return _json(opslag.boodschappen())


@beta_tool
def prijzen_vergelijken() -> str:
    """Vergelijk wat de boodschappenlijst kost bij de supermarkten, met de dichtstbijzijnde vestiging per keten."""
    lijst = [b["tekst"] for b in opslag.boodschappen() if not b["gekocht"]]
    if not lijst:
        return "De boodschappenlijst is leeg."
    winkels = boodschappen.vergelijken(lijst)
    try:
        buurt = boodschappen.winkels_in_de_buurt()
    except Exception:
        buurt = {}
    return _json([{
        "supermarkt": w["naam"], "totaal_euro": w["totaal"], "gevonden": f"{w['gevonden']} van {len(lijst)}",
        "dichtstbij": buurt.get(w["code"]),
        "producten": [{"gezocht": r["zoekterm"], "product": r["product"]["naam"] if r["product"] else None,
                       "prijs": r["product"]["prijs"] if r["product"] else r["schatting"],
                       "geschat": not r["product"]} for r in w["regels"]],
    } for w in winkels[:5]])


@beta_tool
def events_zoeken(trefwoord: str = "", plaats: str = "", dagen: int = 14) -> str:
    """Zoek concerten, voorstellingen, sport- en andere events in de buurt, met ticketlink.

    Args:
        trefwoord: Optioneel, bijvoorbeeld een artiest, genre of "comedy".
        plaats: Adres of plaats, leeg voor rond het thuisadres.
        dagen: Hoeveel dagen vooruit (maximaal 90).
    """
    if not events.sleutel():
        return "Events zijn nog niet ingesteld. Op de voorpagina staat onder Events hoe dat gaat; zoek anders op internet."
    return _json(events.zoeken(plaats, min(dagen, 90), trefwoord=trefwoord))


@beta_tool
def tijdsbesteding_bekijken(van: str, tot: str) -> str:
    """Toon de tijdregistratie tussen twee datums: reistijd, tijd op locatie en uitloop in minuten.

    Args:
        van: Begindatum als JJJJ-MM-DD.
        tot: Einddatum als JJJJ-MM-DD (inclusief).
    """
    return _json(tijd.tijdsbesteding(van, tot))


@beta_tool
def leerdoel_starten(onderwerp: str, stappen: list[str]) -> str:
    """Sla een nieuw leerplan op met een reeks kleine stappen.

    Args:
        onderwerp: Wat de gebruiker wil leren.
        stappen: De stappen in volgorde, elk een korte titel.
    """
    return _json(opslag.leerdoel_starten(onderwerp, stappen))


@beta_tool
def oefening_vastleggen(leerdoel_id: int, stap_nummer: int, score: int) -> str:
    """Leg vast hoe goed de gebruiker een stap beheerst en plan de volgende herhaling.

    Args:
        leerdoel_id: Het id van het leerdoel.
        stap_nummer: Nummer van de stap binnen het leerplan.
        score: 0 (helemaal niet) tot 5 (perfect).
    """
    stap = opslag.oefening_vastleggen(leerdoel_id, stap_nummer, score)
    return _json(stap) if stap else "Leerdoel of stap niet gevonden."


@beta_tool
def leervoortgang_bekijken() -> str:
    """Toon alle leerdoelen met hun stappen, scores en voortgang in procenten."""
    return _json([{**d, "voortgang_procent": opslag.voortgang(d)} for d in opslag.leerdoelen()])


@beta_tool
def herhalingen_vandaag() -> str:
    """Toon de leerstappen die vandaag (of eerder) herhaald moeten worden."""
    return _json(opslag.herhalingen_vandaag())


HULPMIDDELEN = [
    taak_toevoegen,
    taken_bekijken,
    taak_afronden,
    afspraak_toevoegen,
    agenda_bekijken,
    dagplanning,
    reistijd_berekenen,
    thuisadres_instellen,
    contact_opslaan,
    contacten_zoeken,
    afspraak_verwijderen,
    tijd_vastleggen,
    tijdsbesteding_bekijken,
    weer_bekijken,
    events_zoeken,
    uitjes_zoeken,
    sport_vastleggen,
    sportoverzicht_bekijken,
    sportdoel_stellen,
    sportdoelen_bekijken,
    leerdoel_starten,
    oefening_vastleggen,
    leervoortgang_bekijken,
    herhalingen_vandaag,
    plaats_zoeken,
    boodschappen_toevoegen,
    boodschappenlijst_bekijken,
    prijzen_vergelijken,
    {"type": "web_search_20260209", "name": "web_search", "max_uses": 5},
    {"type": "web_fetch_20260209", "name": "web_fetch", "max_uses": 5},
]


def antwoord(client: anthropic.Anthropic, berichten: list, bij_tekst=None, bij_hulpmiddel=None) -> str:
    """Laat Claude reageren op het gesprek, met de tekst woord voor woord.

    `berichten` wordt aangevuld met de beurten van Claude en de resultaten van
    hulpmiddelen, zodat het volgende verzoek de hele geschiedenis meestuurt.
    `bij_tekst(stukje)` krijgt de tekst terwijl die binnenkomt en
    `bij_hulpmiddel(naam)` hoort welk hulpmiddel Claude gebruikt.
    """
    systeem = SYSTEEM + f"\nNu is het {datetime.now().strftime('%A %Y-%m-%d %H:%M')}."
    laatste = None
    for _ in range(MAX_HERVATTINGEN + 1):
        runner = client.beta.messages.tool_runner(
            model=MODEL,
            max_tokens=64000,
            system=systeem,
            tools=HULPMIDDELEN,
            messages=berichten,
            output_config={"effort": "medium"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            stream=True,
        )
        for stream in runner:
            for gebeurtenis in stream:
                if gebeurtenis.type == "content_block_start" and bij_hulpmiddel:
                    blok = gebeurtenis.content_block
                    if blok.type in ("tool_use", "server_tool_use"):
                        bij_hulpmiddel(blok.name)
                elif gebeurtenis.type == "content_block_delta" and bij_tekst:
                    if gebeurtenis.delta.type == "text_delta":
                        bij_tekst(gebeurtenis.delta.text)
            laatste = stream.get_final_message()
            berichten.append({"role": "assistant", "content": laatste.content})
            # Afgebroken of geweigerd: geen hulpmiddelen meer uitvoeren. Een half
            # hulpmiddel-verzoek zonder resultaat zou het volgende verzoek ongeldig maken.
            if laatste.stop_reason in ("refusal", "max_tokens"):
                if any(b.type == "tool_use" for b in laatste.content):
                    berichten.pop()
                break
            resultaat = runner.generate_tool_call_response()
            if resultaat is not None:
                berichten.append(resultaat)
        # Een lange zoekopdracht kan halverwege pauzeren; dan gaan we verder.
        if laatste is None or laatste.stop_reason != "pause_turn":
            break

    if laatste is None:
        return "Er kwam geen antwoord terug. Probeer het nog eens."
    if laatste.stop_reason == "refusal":
        return "Hier kan ik je helaas niet mee helpen."
    tekst = "".join(b.text for b in laatste.content if b.type == "text").strip()
    if laatste.stop_reason == "max_tokens":
        tekst += "\n\n_(Het antwoord werd afgebroken omdat het te lang werd.)_"
    return tekst or "Klaar."
