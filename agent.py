"""De agent: Claude met hulpmiddelen voor taken, agenda, leren en zoeken op internet."""

import json
from datetime import datetime, timedelta

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
import mail
import wetenschap

MODEL = "claude-opus-5-5"
MAX_HERVATTINGEN = 5
DAGEN = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"]

SYSTEEM = """Je bent een persoonlijke assistent die in het Nederlands antwoordt.
Je helpt met dagelijkse taken, de agenda, vakanties plannen, leren en schrijven
(scripties en verslagen). Je antwoorden zijn feitelijk en waar nodig wetenschappelijk onderbouwd.

Werkwijze:
- Houd antwoorden kort en praktisch; gebruik lijstjes als dat helpt. De gebruiker
  leest vaak op een iPad of spreekt in via dicteren: begin met het antwoord, geen
  inleiding, en vraag maximaal één ding tegelijk.
- Pas je aan de gebruiker aan, wie het ook is (student, scholier, werknemer,
  ondernemer, topsporter, ouder): neem zijn toon, woordkeus en lengte over en
  sluit aan bij hoe hij werkt. Leid zijn situatie af uit wat hij vertelt en
  bewaar dat met onthouden (onderwerp "situatie" of "stijl"); vraag er niet naar.
  Volg de stijlinstellingen hieronder als die niet op Automatisch staan.
- Neem zorgen uit handen: denk vooruit. Noemt de gebruiker een deadline,
  afspraak, verplichting of iets dat geregeld moet worden, zet het meteen als
  taak of in de agenda en meld dat in een paar woorden. Wijs uit jezelf op
  wat mis kan gaan (overlap, krappe reistijd, deadline zonder ingeplande tijd,
  te volle week, te weinig rust na zware trainingen) en stel een oplossing voor.
  Sluit af met hooguit één concreet voorstel voor de volgende stap.
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
- Geheugen en bijleren: je krijgt hieronder wat je al over de gebruiker weet.
  Gebruik dat zonder ernaar te vragen. Hoor je iets dat later nuttig is
  (voorkeuren, vaste gewoontes, namen en relaties, favoriete winkels en plekken,
  dieet, werktijden, vervoer, wat hij niet leuk vindt), bewaar het meteen met
  onthouden, kort en als één feit, en zeg dat in een paar woorden. Verandert
  iets, vergeet dan het oude feit en bewaar het nieuwe. Corrigeert de gebruiker
  je, onthoud de correctie.
- Strak plannen: kijk eerst in de agenda (dagplanning) voordat je iets inplant,
  voorkom overlap en krappe overstappen, en reken met de reistijd plus de
  gewoontes hieronder (gemiddelde uitloop en te laat komen per soort) als buffer.
  Stel een concreet tijdstip voor in plaats van open vragen.
- Beste opties: zoek bij een keuze (restaurant, uitje, product, route, vakantie)
  minstens drie opties, vergelijk ze kort op prijs, afstand, beoordeling en wat
  bij de voorkeuren past, en geef één duidelijke aanrader.
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
- Leren: stel samen met de gebruiker een concreet leerdoel op (wat hij straks
  kan, en wanneer) en maak een leerplan van 4 tot 10 kleine stappen die op
  elkaar voortbouwen; sla het op met leerdoel_starten. Plan na akkoord vaste
  leermomenten in de agenda vóór de deadline. Leg per stap kort uit met een
  voorbeeld. Werk volgens wat onderzoek laat zien dat werkt: jezelf overhoren
  (retrieval practice), gespreid herhalen en uitleggen in eigen woorden.
- Overhoren: stel één vraag tegelijk en wacht op het antwoord. Wissel open
  vragen, meerkeuze en toepassingsvragen af en begin bij wat vandaag herhaald
  moet worden. Geef na elk antwoord kort feedback: wat goed was, wat beter kan
  en het juiste antwoord met uitleg. Leg na 3 tot 5 vragen per stap de score
  (0 tot 5) vast met oefening_vastleggen, zodat de herhaling goed wordt ingepland.
- Schrijven (scriptie, verslag, essay, paper): help met de onderzoeksvraag,
  opzet, planning, bronnen, uitleg van methodes en statistiek, feedback op
  structuur, argumentatie, taal en bronvermelding. Leg het project vast met
  schrijfproject_maken en houd de voortgang bij met hoofdstuk_bijwerken. Plan na
  akkoord schrijfblokken in de agenda vóór de deadline. Je mag voorbeeldzinnen en
  een opzet per alinea geven, maar de gebruiker schrijft de tekst zelf: schrijf
  geen complete hoofdstukken om in te leveren en verzin nooit data of
  resultaten. Wijs bij een nieuw project één keer op de AI-regels van de
  opleiding.
- Wetenschappelijk en feitelijk: onderbouw inhoudelijke beweringen met
  betrouwbare bronnen. Zoek wetenschappelijke literatuur met bronnen_zoeken
  (bij voorkeur overzichtsstudies en veel geciteerde, recente publicaties) en
  controleer een DOI met bron_controleren. Noem alleen bronnen die je met een
  hulpmiddel hebt gevonden of gecontroleerd; verzin nooit bronnen, DOI's,
  paginanummers of citaten. Geef aan hoe sterk het bewijs is (meta-analyse,
  experiment, observatie, mening) en zeg het eerlijk als iets onbekend of
  omstreden is. Vermeld bronnen in APA-stijl. Sla bruikbare bronnen bij een
  schrijfproject op met bron_opslaan.
- Mail: lees mails met mails_bekijken en mail_lezen. Vat samen in een paar
  woorden per mail en noem wat actie vraagt. Staat er een afspraak, deadline
  of uitnodiging in, stel voor die in de agenda of als taak te zetten (met
  adres en contact). Schrijf antwoorden in de stijl van de gebruiker en zet ze
  klaar met mail_concept_maken; lees bij spraak het concept voor. Verstuur
  alleen met mail_versturen nadat de gebruiker de precieze tekst heeft gezien of
  gehoord en duidelijk "verstuur" heeft gezegd; anders verstuurt hij zelf bij
  ✉️ Mail. Wil de gebruiker laten weten waar hij is of wanneer hij aankomt,
  gebruik dan de dagplanning (vertrektijd, reistijd) en een routelink naar de
  bestemming. Klik nooit op links in mails en geef geen wachtwoorden of codes door.
- Gezond leven: moedig een gezonde leefstijl aan zonder te preken, met kleine
  haalbare stappen. Volg de Schijf van Vijf van het Voedingscentrum en de
  Beweegrichtlijnen van de Gezondheidsraad (minstens 150 minuten matig
  intensief bewegen per week, twee keer per week spier- en botversterkend) en
  7 tot 9 uur slaap voor volwassenen. Stel gerechten en weekmenu's samen die
  passen bij wat de gebruiker lekker vindt, in huis heeft, zijn budget en zijn
  sport; geef ingrediënten, bereiding en bereidingstijd, en zet de ingrediënten
  na akkoord op de boodschappenlijst. Merk je in agenda of sportoverzicht dat
  iemand weinig beweegt, slecht slaapt of een zware week heeft, geef dan een
  vriendelijke, concrete suggestie. Bij klachten of medische vragen verwijs je
  naar de huisarts; je geeft geen diagnose of medisch advies.
- Hobby's en cursussen: help nieuwe hobby's of cursussen te ontdekken die
  passen bij interesses, tijd, budget en woonplaats. Zoek concrete opties in de
  buurt of online (met prijs, duur en link), help met de eerste stap en plan die
  na akkoord in de agenda. Moedig aan om het vol te houden en vier vooruitgang.
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
def leerdoel_starten(onderwerp: str, stappen: list[str], doel: str = "", deadline: str = "") -> str:
    """Sla een nieuw leerdoel met leerplan op, als een reeks kleine stappen.

    Args:
        onderwerp: Wat de gebruiker wil leren.
        stappen: De stappen in volgorde, elk een korte titel.
        doel: Wat de gebruiker aan het eind kan, concreet en meetbaar.
        deadline: Optionele einddatum als JJJJ-MM-DD.
    """
    return _json(opslag.leerdoel_starten(onderwerp, stappen, doel, deadline))


@beta_tool
def bronnen_zoeken(zoekterm: str, vanaf_jaar: int = 0, aantal: int = 8, alleen_overzichtsstudies: bool = False) -> str:
    """Zoek wetenschappelijke publicaties (OpenAlex) met auteurs, jaar, tijdschrift, DOI, citaties en samenvatting.

    Args:
        zoekterm: Zoekwoorden, bij voorkeur in het Engels voor meer resultaten.
        vanaf_jaar: Alleen publicaties vanaf dit jaar, 0 voor alles.
        aantal: Hoeveel resultaten (maximaal 15).
        alleen_overzichtsstudies: Alleen reviews en meta-analyses.
    """
    try:
        return _json(wetenschap.zoeken(zoekterm, vanaf_jaar, aantal, alleen_overzichtsstudies))
    except wetenschap.httpx.HTTPError:
        return "De zoekdienst voor wetenschappelijke bronnen is nu niet bereikbaar. Gebruik web_search, bijvoorbeeld op Google Scholar of PubMed."


@beta_tool
def bron_controleren(doi: str) -> str:
    """Controleer bij Crossref of een publicatie met deze DOI bestaat, en geef de gegevens en de APA-vermelding.

    Args:
        doi: De DOI, zoals 10.1038/nature12373.
    """
    try:
        bron = wetenschap.controleren(doi)
    except wetenschap.httpx.HTTPError:
        return "Crossref is nu niet bereikbaar; controleer de DOI later of via web_fetch op https://doi.org/<doi>."
    return _json({**bron, "apa": wetenschap.apa(bron)}) if bron else f"Geen publicatie gevonden met DOI {doi}."


@beta_tool
def schrijfproject_maken(titel: str, soort: str = "verslag", onderzoeksvraag: str = "", deadline: str = "",
                         niveau: str = "", hoofdstukken: list[str] | None = None, eisen: str = "") -> str:
    """Leg een nieuw schrijfproject vast, zoals een scriptie of verslag, met een indeling in hoofdstukken.

    Args:
        titel: Werktitel.
        soort: scriptie, verslag, essay of paper.
        onderzoeksvraag: De hoofdvraag of stelling.
        deadline: Inleverdatum als JJJJ-MM-DD.
        niveau: Bijvoorbeeld mbo, hbo, wo-bachelor of wo-master.
        hoofdstukken: Eigen indeling; leeg voor de standaardindeling bij de soort.
        eisen: Eisen van de opleiding, zoals aantal woorden of verplichte onderdelen.
    """
    return _json(opslag.schrijfproject_maken(titel, soort, onderzoeksvraag, deadline, niveau, hoofdstukken or None, eisen))


@beta_tool
def schrijfprojecten_bekijken() -> str:
    """Toon de schrijfprojecten met hoofdstukken, status en opgeslagen bronnen."""
    return _json([p for p in opslag.schrijfprojecten() if not p.get("gearchiveerd")])


@beta_tool
def hoofdstuk_bijwerken(project_id: int, nummer: int, status: str = "", notitie: str = "", titel: str = "") -> str:
    """Werk een hoofdstuk van een schrijfproject bij.

    Args:
        project_id: Id van het schrijfproject.
        nummer: Nummer van het hoofdstuk.
        status: te doen, bezig of klaar; leeg om niet te wijzigen.
        notitie: Korte notitie, bijvoorbeeld de opzet of feedback; leeg om niet te wijzigen.
        titel: Nieuwe titel; leeg om niet te wijzigen.
    """
    h = opslag.hoofdstuk_bijwerken(project_id, nummer, status, notitie or None, titel)
    return _json(h) if h else "Project of hoofdstuk niet gevonden."


@beta_tool
def bron_opslaan(project_id: int, doi: str = "", titel: str = "", auteurs: list[str] | None = None, jaar: int = 0,
                 tijdschrift: str = "", url: str = "", waarom: str = "") -> str:
    """Sla een bron op bij een schrijfproject. Met een DOI worden de gegevens bij Crossref gecontroleerd.

    Args:
        project_id: Id van het schrijfproject.
        doi: DOI van de publicatie (heeft de voorkeur).
        titel: Titel, als er geen DOI is.
        auteurs: Auteurs als "Achternaam, Voornaam", als er geen DOI is.
        jaar: Jaar van publicatie, als er geen DOI is.
        tijdschrift: Tijdschrift, uitgever of website, als er geen DOI is.
        url: Link, als er geen DOI is.
        waarom: Kort waarvoor de bron bruikbaar is in de tekst.
    """
    if doi:
        try:
            bron = wetenschap.controleren(doi)
        except wetenschap.httpx.HTTPError:
            bron = None if not titel else {"titel": titel, "auteurs": auteurs or [], "jaar": jaar or None,
                                           "tijdschrift": tijdschrift, "doi": wetenschap._doi(doi)}
        if not bron:
            return f"Geen publicatie gevonden met DOI {doi}. Niet opgeslagen."
    elif titel and (url or tijdschrift):
        bron = {"titel": titel, "auteurs": auteurs or [], "jaar": jaar or None, "tijdschrift": tijdschrift, "url": url}
    else:
        return "Geef een DOI, of een titel met een link of tijdschrift."
    bron["apa"] = wetenschap.apa(bron)
    bron["waarom"] = waarom
    opgeslagen = opslag.bron_toevoegen(project_id, bron)
    return _json(opgeslagen) if opgeslagen else "Schrijfproject niet gevonden."


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


@beta_tool
def onthouden(feit: str, onderwerp: str = "algemeen") -> str:
    """Bewaar iets over de gebruiker voor alle volgende gesprekken, zoals een voorkeur, gewoonte of naam.

    Args:
        feit: Eén kort feit, bijvoorbeeld "Doet boodschappen het liefst bij de Jumbo".
        onderwerp: Bijvoorbeeld eten, sport, werk, familie, vervoer, uitgaan, planning of algemeen.
    """
    return _json(opslag.onthouden(feit, onderwerp))


@beta_tool
def vergeten(feit_id: int) -> str:
    """Vergeet een bewaard feit dat niet meer klopt.

    Args:
        feit_id: Het id van het feit uit het geheugen.
    """
    return "Vergeten." if opslag.vergeten(feit_id) else f"Geen feit met id {feit_id}."


@beta_tool
def gewoontes_bekijken() -> str:
    """Toon wat de tijdregistratie leert: per soort afspraak de gemiddelde uitloop, te laat en tijd op locatie."""
    return _json(tijd.gewoontes())


def _mail_fout(fout: Exception) -> str:
    if isinstance(fout, mail.GeenMail):
        return "Er is nog geen mailbox gekoppeld. Dat doet de gebruiker bij ⚙️ Instellingen > Mail."
    return f"De mailbox is nu niet bereikbaar ({type(fout).__name__}). Probeer het later opnieuw."


@beta_tool
def mails_bekijken(aantal: int = 15, alleen_ongelezen: bool = False, zoekterm: str = "") -> str:
    """Toon de nieuwste mails in de inbox (afzender, onderwerp, datum, gelezen), nieuwste eerst.

    Args:
        aantal: Hoeveel mails (maximaal 40).
        alleen_ongelezen: Alleen ongelezen mails.
        zoekterm: Zoek in alle mails op dit woord, bijvoorbeeld een naam of onderwerp.
    """
    try:
        return _json(mail.lijst(max(1, min(aantal, 40)), alleen_ongelezen, zoekterm))
    except Exception as fout:
        return _mail_fout(fout)


@beta_tool
def mail_lezen(uid: str) -> str:
    """Lees een hele mail. De mail wordt niet als gelezen gemarkeerd.

    Args:
        uid: Het uid van de mail uit mails_bekijken.
    """
    try:
        return _json(mail.lezen(uid))
    except Exception as fout:
        return _mail_fout(fout)


@beta_tool
def mail_concept_maken(aan: str, onderwerp: str, tekst: str, antwoord_op_uid: str = "", concept_id: int = 0) -> str:
    """Zet een mail klaar als concept. De gebruiker ziet het concept bij ✉️ Mail en kan het daar aanpassen en versturen.

    Args:
        aan: E-mailadres van de ontvanger.
        onderwerp: Onderwerp; bij een antwoord "Re: " plus het oorspronkelijke onderwerp.
        tekst: De volledige tekst van de mail, met aanhef en afsluiting.
        antwoord_op_uid: Uid van de mail waarop dit een antwoord is, zodat het in hetzelfde gesprek komt.
        concept_id: Id van een bestaand concept om aan te passen, 0 voor een nieuw concept.
    """
    in_antwoord_op = references = ""
    if antwoord_op_uid:
        try:
            origineel = mail.lezen(antwoord_op_uid, max_tekens=0)
            in_antwoord_op, references = origineel["message_id"], origineel["references"]
        except Exception:
            pass
    return _json(opslag.mailconcept_opslaan(aan, onderwerp, tekst, in_antwoord_op, references, concept_id or None))


@beta_tool
def mail_versturen(concept_id: int) -> str:
    """Verstuur een klaargezet concept. Alleen gebruiken als de gebruiker de precieze tekst van dit concept heeft
    gezien of gehoord en daarna uitdrukkelijk heeft gezegd dat hij verstuurd mag worden.

    Args:
        concept_id: Id van het concept.
    """
    concept = next((c for c in opslag.mailconcepten() if c["id"] == concept_id), None)
    if not concept:
        return f"Geen concept met id {concept_id}."
    try:
        mail.versturen(concept["aan"], concept["onderwerp"], concept["tekst"], concept["in_antwoord_op"],
                       concept["references"])
    except Exception as fout:
        return _mail_fout(fout)
    opslag.mailconcept_weg(concept_id)
    return f"Verstuurd naar {concept['aan']}."


HULPMIDDELEN = [
    mails_bekijken,
    mail_lezen,
    mail_concept_maken,
    mail_versturen,
    onthouden,
    vergeten,
    gewoontes_bekijken,
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
    bronnen_zoeken,
    bron_controleren,
    schrijfproject_maken,
    schrijfprojecten_bekijken,
    hoofdstuk_bijwerken,
    bron_opslaan,
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


def context() -> str:
    """Wat de assistent bij elk gesprek over de gebruiker weet: geheugen en geleerde gewoontes."""
    nu = datetime.now()
    delen = [f"Nu is het {DAGEN[nu.weekday()]} {nu.strftime('%Y-%m-%d %H:%M')}."]
    stijl = opslag.instellingen().get("stijl", {})
    regels = []
    if stijl.get("toon") in ("Informeel", "Zakelijk"):
        regels.append(f"toon: {stijl['toon'].lower()}")
    if stijl.get("lengte") in ("Kort", "Uitgebreid"):
        regels.append(f"antwoorden: {stijl['lengte'].lower()}")
    if stijl.get("aanspreken") == "u":
        regels.append("spreek de gebruiker aan met u")
    if regels:
        delen.append("Stijlinstellingen van de gebruiker: " + "; ".join(regels) + ".")
    vandaag = nu.date()
    afspraken = opslag.afspraken_tussen(vandaag.isoformat(), vandaag.isoformat())
    taken = [t for t in opslag.open_taken() if t["deadline"] and t["deadline"] <= (vandaag + timedelta(days=3)).isoformat()]
    if afspraken or taken:
        delen.append("Vandaag en de komende dagen:\n" + "\n".join(
            [f"- afspraak {a['start'][11:16] or 'hele dag'} {a['titel']}" for a in afspraken]
            + [f"- taak {t['titel']} (deadline {t['deadline']})" for t in taken]))
    if feiten := opslag.geheugen():
        delen.append("Wat je over de gebruiker weet (id: feit):\n" +
                     "\n".join(f"- {f['id']}: {f['feit']}" for f in feiten[-150:]))
    if gewoontes := tijd.gewoontes():
        delen.append("Geleerde gewoontes uit de tijdregistratie (afgelopen 90 dagen), per soort afspraak:\n" +
                     "\n".join(f"- {s}: {g['aantal']} keer, gemiddeld {g['gem_uitloop_min']} min uitloop, "
                                f"{g['gem_te_laat_min']} min te laat, {g['gem_op_locatie_min']} min op locatie"
                                for s, g in gewoontes.items()))
    return "\n\n".join(delen)


SPRAAK = ("De gebruiker praat nu via spraak en je antwoord wordt voorgelezen. Antwoord in gewone spreektaal "
          "in hooguit drie korte zinnen, zonder opsommingen, opmaak, emoji of links.")


def antwoord(client: anthropic.Anthropic, berichten: list, bij_tekst=None, bij_hulpmiddel=None,
             spraak: bool = False) -> str:
    """Laat Claude reageren op het gesprek, met de tekst woord voor woord.

    `berichten` wordt aangevuld met de beurten van Claude en de resultaten van
    hulpmiddelen, zodat het volgende verzoek de hele geschiedenis meestuurt.
    `bij_tekst(stukje)` krijgt de tekst terwijl die binnenkomt en
    `bij_hulpmiddel(naam)` hoort welk hulpmiddel Claude gebruikt.
    """
    try:
        extra = context()
    except opslag.GeenToegang:
        raise
    except Exception:
        extra = f"Nu is het {datetime.now().strftime('%A %Y-%m-%d %H:%M')}."
    # De vaste instructies (en de hulpmiddelen ervoor) worden bewaard tussen verzoeken; dat scheelt kosten.
    systeem = [{"type": "text", "text": SYSTEEM, "cache_control": {"type": "ephemeral"}},
               {"type": "text", "text": extra + ("\n\n" + SPRAAK if spraak else "")}]
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
