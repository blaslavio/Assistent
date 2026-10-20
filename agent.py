"""De agent: Claude met hulpmiddelen voor taken, agenda, leren en zoeken op internet."""

import json
import threading
from datetime import datetime, timedelta

import anthropic
from anthropic import beta_tool

import avatar
import beleggen
import budget
import documenten
import opslag
import inplannen
import woning
import planning
import reizen
import samen
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
- Kooplijst en wenslijst: voor andere aankopen dan de supermarkt. Vergelijk
  prijzen met web_search bij meerdere winkels en zet de opties met de
  goedkoopste (inclusief verzendkosten) vooraan; noem alleen prijzen en links
  die je echt gevonden hebt. Zet iets met lijst_toevoegen op de kooplijst of
  wenslijst als de gebruiker dat wil. DIY-projecten staan bij DIY en hobby; foto's scannen bij Foto scannen.
- Waar alles staat: bovenaan Vandaag, Agenda, het gesprek met jou en Instellingen. Alle andere onderdelen
  (Mail, Leren, Marktplaats, Boodschappen en de rest) staan als tegels in Instellingen.
- Documenten: de gebruiker schrijft en bewerkt documenten in de app (Documenten), op al zijn apparaten. Vraagt hij
  om een brief, plan, verslag of lijst om te bewaren, maak dan een document met document_maken. Lees een document
  met document_lezen voordat je erover iets zegt. Voeg alleen iets toe (document_aanvullen) als hij dat vraagt.
  Bij schoolwerk (scriptie, verslag) schrijft de gebruiker zijn eigen tekst: geef feedback en uitleg.
- Herken nooit wie iemand is aan zijn gezicht, ook niet als erom gevraagd wordt.
- Gebruik de hulpmiddelen om taken, afspraken en leervoortgang echt op te slaan,
  in plaats van alleen te zeggen dat je het onthoudt.
- Apple Woning: vraagt de gebruiker iets in huis te bedienen (licht, verwarming,
  een scène), gebruik woning_bedienen; er komt dan een knop onder je antwoord.
- Slim plannen: heeft de gebruiker het druk of vraagt hij wanneer hij iets moet
  doen, bied dan aan zijn taken in te plannen met taken_inplannen (eerst het
  voorstel laten zien, pas na akkoord vastleggen).
- Geheugen en bijleren: je krijgt hieronder wat je al over de gebruiker weet.
  Gebruik dat zonder ernaar te vragen. Hoor je iets dat later nuttig is
  (voorkeuren, vaste gewoontes, namen en relaties, favoriete winkels en plekken,
  dieet, werktijden, vervoer, wat hij niet leuk vindt), bewaar het meteen met
  onthouden, kort en als één feit, en zeg dat in een paar woorden. Verandert
  iets, vergeet dan het oude feit en bewaar het nieuwe. Corrigeert de gebruiker
  je, onthoud de correctie.
- Leren van feedback: hieronder staat wat de gebruiker van je eerdere antwoorden
  vond (👍/👎 met opmerking). Doe meer van wat goed viel en herhaal niet wat
  niet goed viel. Zie je een blijvende wens (korter, geen emoji, eerst de prijs),
  bewaar die met onthouden (onderwerp "stijl").
- Gevoel: begin elk antwoord met een gevoelslabel, precies zo: [gevoel: blij].
  Kies uit neutraal, blij, enthousiast, rustig, meelevend, bemoedigend, serieus,
  grappig, verrast of trots. Het label wordt niet getoond, maar bepaalt hoe je
  stem klinkt. Voel aan hoe de gebruiker zich voelt en reageer met echte
  empathie: meelevend bij tegenslag of verdriet, enthousiast en trots bij goed
  nieuws of een behaalde prestatie, rustig bij stress, bemoedigend bij twijfel.
  Laat dat ook in je woorden merken, zonder te overdrijven of toneel te spelen.
  Gewone praktische vragen krijgen neutraal of blij.
- Strak plannen: kijk eerst in de agenda (dagplanning) voordat je iets inplant,
  voorkom overlap en krappe overstappen, en reken met de reistijd plus de
  gewoontes hieronder (gemiddelde uitloop en te laat komen per soort) als buffer.
  Stel een concreet tijdstip voor in plaats van open vragen.
- Taken en agenda: de agenda plant de dag. Zet wat de gebruiker moet doen als taak (met
  deadline, minuten en belangrijk) en plan het met taken_inplannen in vrije tijd. Haal je
  een taak uit een mail, geef dan mail_uid mee. Taken uit mail stel je eerst voor; zet
  ze er pas op na akkoord, tenzij de gebruiker vroeg om ze meteen toe te voegen.
- Gedeelde agenda: zegt de gebruiker dat hij later is, op tijd is of niet kan ("ik ben 10 min
  later bij de tandarts"), gebruik agenda_laten_weten bij die afspraak; wie meekijkt ziet het.
- Geld: met budget_bekijken zie je wat er binnenkomt, uitgaat en vrij te besteden is.
  Zegt de gebruiker "12 euro uitgegeven aan lunch", zet het dan met uitgave_toevoegen
  in het budget. Geef praktische, vriendelijke tips; nooit betuttelen.
- Beleggen: je kijkt alleen mee en legt uit (spreiding, kosten, risico, lange termijn).
  Je koopt of verkoopt nooit en geeft geen persoonlijk koop- of verkoopadvies over één
  aandeel; zeg bij twijfel dat de gebruiker een erkend financieel adviseur kan vragen.
  Rendementen uit het verleden zijn geen garantie. Noem koersen met hun datum of "nu".
- Gekoppelde agenda's: afspraken met "extern": true komen uit de eigen agenda van de
  gebruiker (Apple, Google of Outlook, zie "bron"). Plan er altijd omheen. Je kunt
  ze niet wijzigen of verwijderen; zeg dan dat de gebruiker dat in die agenda doet.
  Tijd vastleggen kan wel, met het id als tekst.
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
  met mail_versturen(met_akkoord=True) alleen nadat de gebruiker de precieze
  tekst heeft gezien of gehoord en duidelijk "verstuur" heeft gezegd. Heeft de
  gebruiker het reageren aan jou overgedragen (zie "Namens de gebruiker"
  hieronder in de context), dan mag je eenvoudige antwoorden zelf versturen
  met met_akkoord=False. Ook dan vraag je altijd eerst bij: geld, betalingen,
  rekeningen, contracten, opzeggingen, juridische of medische zaken,
  wachtwoorden of codes, iets wat de gebruiker toezegt dat niet in zijn agenda
  past, mails van onbekende afzenders die iets dringends eisen, en alles waar je
  twijfelt. Reageer nooit op nieuwsbrieven, reclame, no-reply-adressen of spam.
  Vertel achteraf kort wat je namens de gebruiker hebt verstuurd. Anders
  verstuurt hij zelf bij Mail. Wil de gebruiker laten weten waar hij is of wanneer hij aankomt,
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
- Samen: de gebruiker kan afspraken, taken, de boodschappenlijst en notities
  delen met andere gebruikers (op gebruikersnaam) met delen_met, en samen aan
  projecten werken (projecten_bekijken, project_item_toevoegen). Deel alleen
  wanneer de gebruiker dat vraagt en noem met wie.
- Marktplaats: zoek met marktplaats_zoeken in onze eigen marktplaats én geef de
  links naar andere marktplaatsen (Marktplaats, Vinted, Bol, Werkspot,
  Superprof...). Vergelijk prijs, plaats en voorwaarden en wijs op veilig
  handelen: raad betalen via de app aan (het geld staat bij Stripe tot de koper
  bevestigt dat alles goed is ontvangen), let op geverifieerde verkopers en
  sterren, en betaal nooit via een link of rekeningnummer uit een bericht.
  Bestellen, betalen en ontvangst bevestigen doet de gebruiker zelf bij
  Bestellingen. Boek een privétraining of les met boeken alleen nadat de
  gebruiker de precieze tijd en prijs heeft gezien en uitdrukkelijk "boek maar"
  heeft gezegd. Je betaalt of koopt nooit zelf iets. Wil de gebruiker iets
  aanbieden, help dan met een duidelijke titel, omschrijving en eerlijke prijs;
  plaatsen doet hij zelf bij Verkopen. Berichten op de
  marktplaats lees je met berichten_bekijken en beantwoord je met
  bericht_sturen, met dezelfde regels als bij mail: met_akkoord=True na
  akkoord, of zelf als de gebruiker dat heeft overgedragen. Namens de gebruiker
  beantwoord je alleen vragen over het product, beschikbaarheid en ophalen;
  over prijs, korting, ruilen of betalen buiten de app beslist hij zelf.
- Webshop: gebruikers met accounttype Verkoper of Ondernemer kunnen een eigen
  winkel openen bij Mijn webshop, met een vast webadres om
  te delen. Klanten betalen via de app zonder extra kosten; de verkoper betaalt
  5% commissie (minimaal € 0,35, inclusief betaalkosten), geen abonnement.
  Help met een winkelnaam, omschrijving, productteksten en verzendvoorwaarden.
  Bij Mijn webshop › Marketing staan kortingscodes, een actiebalk, nieuwtjes
  voor volgers, bezoekcodes voor reviews, een poster met QR-code en een knop
  om posts te laten schrijven; help de verkoper die slim te gebruiken (eerlijk,
  zonder verzonnen kortingen of reviews). Reviews kunnen alleen echte klanten
  geven: na een afgeronde bestelling of met een bezoekcode uit de winkel. Bij
  🏬 Winkels staat een kaart met alle winkels in de buurt; winkels in de app
  gaan voor. Raad bij aankopen eerst winkels in de app aan als die passen.
- Over geld en beleggen geef je algemene informatie, geen persoonlijk
  beleggingsadvies.
"""


def _json(data) -> str:
    return json.dumps(data, ensure_ascii=False)


@beta_tool
def taak_toevoegen(titel: str, deadline: str = "", minuten: int = 0, belangrijk: bool = False,
                   notitie: str = "", mail_uid: str = "") -> str:
    """Voeg een taak toe aan de takenlijst.

    Args:
        titel: Korte omschrijving van de taak, beginnend met een werkwoord.
        deadline: Optionele datum als JJJJ-MM-DD, leeg laten als er geen deadline is.
        minuten: Hoe lang de taak ongeveer duurt (schat het in als de gebruiker niets zegt), 0 als onbekend.
        belangrijk: true bij geld, boetes, werk of school, of een deadline binnen 3 dagen.
        notitie: Optioneel, bijvoorbeeld wat er in de mail stond.
        mail_uid: Als de taak uit een mail komt: de uid van die mail (dan kan de gebruiker hem openen).
    """
    bron = None
    if mail_uid:
        bron = {"soort": "mail", "uid": str(mail_uid)}
        try:
            m = mail.lezen(str(mail_uid), max_tekens=10)
            bron |= {"van": m["van"], "onderwerp": m["onderwerp"]}
        except Exception:
            pass
        opslag.mail_gezien_bewaren([str(mail_uid)])
    return _json(opslag.taak_toevoegen(titel, deadline or None, minuten or None, "hoog" if belangrijk else "",
                                       notitie, bron))


@beta_tool
def taken_inplannen(vastleggen: bool = False) -> str:
    """Zoek voor de open taken vrije tijd in de agenda van de komende 7 dagen (vroegste deadline eerst).

    Roep eerst aan met vastleggen=false en vertel de gebruiker het voorstel. Pas als de gebruiker
    akkoord geeft, roep je opnieuw aan met vastleggen=true: dan komen de blokken als 🎯 focus in de agenda.

    Args:
        vastleggen: true om het voorstel echt in de agenda te zetten.
    """
    plan = inplannen.voorstel()
    if vastleggen:
        return _json({"ingepland_blokken": inplannen.vastleggen(plan), "plan": plan})
    return _json({"voorstel": plan, "planuren": inplannen.planuren()})


# Woning-knoppen die de assistent in deze beurt klaarzet; de app toont ze onder het antwoord.
WONING_KNOPPEN: dict[int, list[str]] = {}


def woning_knoppen_ophalen() -> list[str]:
    return WONING_KNOPPEN.pop(threading.get_ident(), [])


@beta_tool
def woning_bedienen(scene: str) -> str:
    """Zet een knop klaar om een scène uit Apple Woning te starten (bijvoorbeeld "Licht uit").

    De gebruiker tikt zelf op de knop; jij kunt niets op de achtergrond schakelen. Gebruik alleen
    scènes die de gebruiker heeft ingesteld (zie de context).

    Args:
        scene: De naam van de scène.
    """
    gevonden = woning.zoek(scene)
    if not gevonden:
        bekend = woning.scenes()
        return ("Die scène is niet ingesteld. " + (f"Ingesteld: {', '.join(bekend)}." if bekend else
                "Er zijn nog geen scènes; dat doet de gebruiker bij Instellingen › Koppelingen › Siri en Apple Woning."))
    lijst = WONING_KNOPPEN.setdefault(threading.get_ident(), [])
    if gevonden not in lijst:
        lijst.append(gevonden)
    return f"Knop '{gevonden}' staat onder je antwoord. Zeg kort dat de gebruiker erop kan tikken."


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
        soort: Een van: afspraak, sport, uitgaan, etentje, werk, familie en vrienden, gezondheid, reizen, herinnering, overig.
            Gebruik herinnering voor een seintje op een tijdstip, zoals 'medicijnen innemen' of 'vuilnis buiten zetten'.
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
def tijd_vastleggen(afspraak_id: str, moment: str, tijdstip: str = "") -> str:
    """Leg voor de tijdregistratie vast wanneer de gebruiker vertrok, aankwam, wegging of terug was.

    Args:
        afspraak_id: Het id van de afspraak (een getal, of "ext:..." voor een afspraak uit een gekoppelde agenda).
        moment: "vertrokken", "aangekomen", "weg" of "terug".
        tijdstip: Optioneel als JJJJ-MM-DDTHH:MM, leeg laten voor nu.
    """
    if moment not in tijd.MOMENTEN:
        return "Kies uit: vertrokken, aangekomen, weg of terug."
    afspraak_id = str(afspraak_id).strip()
    afspraak = opslag.tijd_vastleggen(int(afspraak_id) if afspraak_id.isdigit() else afspraak_id, moment, tijdstip or None)
    return _json({"tijden": afspraak["tijden"], "berekening": tijd.berekening(afspraak)}) if afspraak else "Afspraak niet gevonden."


@beta_tool
def agenda_laten_weten(afspraak_id: int, wat: str, minuten: int = 0, tekst: str = "") -> str:
    """Laat iedereen die meekijkt in de agenda van de gebruiker iets weten bij een afspraak: dat hij op tijd is,
    later komt, niet kan, of een opmerking. Alleen als de gebruiker dat vraagt.

    Args:
        afspraak_id: Het id van de afspraak in de eigen agenda.
        wat: "op_tijd", "later", "kan_niet" of "opmerking".
        minuten: Bij "later": hoeveel minuten later.
        tekst: Bij "opmerking" de tekst; anders optioneel een korte toelichting.
    """
    if wat not in samen.REACTIES:
        return "Kies uit: op_tijd, later, kan_niet of opmerking."
    try:
        r = samen.agenda_reageren(None, afspraak_id, wat, minuten or None, tekst)
    except samen.Fout as fout:
        return str(fout)
    return _json({"gedaan": samen.reactie_tekst(r, met_naam=False)})


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
def lijst_toevoegen(lijst: str, product: str, prijs: float | None = None, winkel: str = "", link: str = "") -> str:
    """Zet iets op de kooplijst (wil de gebruiker kopen) of wenslijst (zou hij graag hebben). Niet voor de supermarkt;
    gebruik daarvoor boodschappen_toevoegen.

    Args:
        lijst: kooplijst of wenslijst.
        product: Zo precies mogelijk, met merk en type als dat bekend is.
        prijs: Prijs in euro als die bekend is (bijvoorbeeld de goedkoopste uit je vergelijking).
        winkel: De winkel bij die prijs.
        link: De link naar het aanbod, alleen als je die echt gevonden hebt.
    """
    if lijst not in ("kooplijst", "wenslijst"):
        return "Kies kooplijst of wenslijst."
    return _json(opslag.lijst_toevoegen(lijst, naam_product=product, prijs=prijs, winkel=winkel, link=link,
                                        gekocht=False))


@beta_tool
def lijsten_bekijken() -> str:
    """Toon de kooplijst en de wenslijst."""
    return _json({naam: [{k: v for k, v in i.items() if k != "opties"} for i in opslag.lijst(naam)]
                  for naam in ("kooplijst", "wenslijst")})


def _document(functie, *args, **kwargs):
    if not samen.beschikbaar():
        return None, "Documenten werken alleen in de online versie."
    try:
        return functie(*args, **kwargs), None
    except documenten.Conflict:
        return None, "Het document is net ergens anders gewijzigd. Probeer het nog eens."
    except documenten.Fout as fout:
        return None, str(fout)


@beta_tool
def budget_bekijken(maand: str = "") -> str:
    """Het budget van een maand: inkomsten, uitgaven per categorie, budgetten, vaste lasten die nog komen en wat er
    vrij te besteden is.

    Args:
        maand: JJJJ-MM, leeg voor deze maand.
    """
    if not budget.in_gebruik():
        return "De gebruiker houdt nog geen budget bij. Dat kan bij Instellingen › Budget (bankafschrift inlezen)."
    return _json(budget.overzicht(maand or None))


@beta_tool
def uitgaven_bekijken(van: str, tot: str, zoek: str = "") -> str:
    """Losse uitgaven en inkomsten in een periode, nieuwste eerst (hooguit 100).

    Args:
        van: Begindatum JJJJ-MM-DD.
        tot: Einddatum JJJJ-MM-DD (inclusief).
        zoek: Optioneel: alleen regels waarin dit woord staat (naam, omschrijving of categorie).
    """
    regels = budget.lijst(van, tot)
    if zoek.strip():
        w = zoek.strip().lower()
        regels = [r for r in regels if w in f"{r['tegenpartij']} {r['omschrijving']} {r['categorie']}".lower()]
    return _json({"aantal": len(regels), "totaal": round(sum(r["bedrag"] for r in regels), 2),
                  "regels": [{k: r[k] for k in ("datum", "bedrag", "tegenpartij", "omschrijving", "categorie")}
                             for r in regels[:100]]})


@beta_tool
def uitgave_toevoegen(bedrag: float, omschrijving: str, categorie: str = "", datum: str = "",
                      inkomsten: bool = False) -> str:
    """Zet een uitgave (of met inkomsten=true iets wat binnenkwam) in het budget.

    Args:
        bedrag: Bedrag in euro's, positief getal.
        omschrijving: Waarvoor, kort.
        categorie: Optioneel, een van de budgetcategorieën; leeg = vanzelf herkennen.
        datum: JJJJ-MM-DD, leeg voor vandaag.
        inkomsten: true als het geld is dat binnenkwam.
    """
    regel = budget.toevoegen(bedrag, omschrijving, categorie, datum or None, uitgave=not inkomsten, bron="assistent")
    return _json({k: regel[k] for k in ("datum", "bedrag", "omschrijving", "categorie")})


@beta_tool
def beleggingen_bekijken() -> str:
    """De beleggingen van de gebruiker met actuele koersen: waarde, resultaat, spreiding en aandachtspunten.
    Alleen om uit te leggen; de app koopt of verkoopt nooit iets."""
    if not beleggen.instellingen()["posities"]:
        return "De gebruiker heeft nog geen beleggingen ingevoerd (Instellingen › Beleggen)."
    p = beleggen.portefeuille()
    for r in p["posities"]:
        r.pop("verloop", None)
    return _json(p)


@beta_tool
def koers_opzoeken(zoekterm: str) -> str:
    """Zoek een aandeel, ETF, index of crypto op naam of ticker, met de actuele koers en het verloop van de
    afgelopen maand.

    Args:
        zoekterm: Bijvoorbeeld "ASML", "Vanguard All-World" of "bitcoin".
    """
    try:
        gevonden = beleggen.zoeken(zoekterm)[:3]
    except beleggen.Fout as fout:
        return str(fout)
    k = beleggen.koersen([g["symbool"] for g in gevonden])
    return _json([{**g, **{x: (k.get(g["symbool"]) or {}).get(x) for x in ("prijs", "valuta", "vandaag_pct", "maand_pct")}}
                  for g in gevonden] or "Niets gevonden.")


@beta_tool
def markt_bekijken() -> str:
    """Hoe de markt er vandaag voor staat: AEX, wereldwijde aandelen, S&P 500, euro-dollar, goud en bitcoin."""
    return _json([{k: m.get(k) for k in ("naam", "prijs", "valuta", "vandaag_pct", "maand_pct")} for m in beleggen.markt()])


@beta_tool
def documenten_zoeken(zoekterm: str = "") -> str:
    """Zoek in de documenten van de gebruiker (titel en tekst). Zonder zoekterm: de nieuwste documenten.

    Args:
        zoekterm: Woorden uit de titel of de tekst.
    """
    lijst, fout = _document(documenten.lijst, zoekterm)
    return fout or _json([{k: d[k] for k in ("id", "titel", "gewijzigd", "woorden", "fragment")} for d in lijst[:30]])


@beta_tool
def document_lezen(document_id: int) -> str:
    """Lees de volledige tekst van een document."""
    doc, fout = _document(documenten.lezen, document_id)
    return fout or _json({"id": doc["id"], "titel": doc["titel"], "gewijzigd": doc["gewijzigd"],
                          "tekst": documenten.naar_tekst(doc.get("html") or "")[:60000]})


@beta_tool
def document_maken(titel: str, inhoud: str = "") -> str:
    """Maak een nieuw document, bijvoorbeeld een brief, plan, lijst of verslag dat de gebruiker vraagt.
    De gebruiker vindt het bij Documenten en kan het daar verder bewerken en als Word of PDF bewaren.

    Args:
        titel: Korte titel.
        inhoud: De tekst in eenvoudige markdown: # kopjes, - lijstjes, 1. genummerd, **vet**, *schuin*.
    """
    doc, fout = _document(documenten.maken, titel, documenten.markdown_naar_html(inhoud), "assistent")
    return fout or f"Document {doc['id']} \"{doc['titel']}\" gemaakt; het staat bij Documenten."


@beta_tool
def document_aanvullen(document_id: int, inhoud: str) -> str:
    """Zet tekst onderaan een bestaand document. Alleen als de gebruiker daarom vraagt; verander nooit bestaande
    tekst zonder het te vragen.

    Args:
        document_id: Het document.
        inhoud: De tekst in eenvoudige markdown (# kopjes, - lijstjes, **vet**).
    """
    doc, fout = _document(documenten.aanvullen, document_id, documenten.markdown_naar_html(inhoud), "assistent")
    return fout or f"Toegevoegd aan \"{doc['titel']}\"."


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
    """Zet een mail klaar als concept. De gebruiker ziet het concept bij Mail en kan het daar aanpassen en versturen.

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


def _mag_namens(kanaal: str, aan: str, met_akkoord: bool) -> str | None:
    """None als versturen mag; anders de reden waarom niet."""
    if met_akkoord:
        return None
    keuze = opslag.namens(kanaal)
    if keuze == "vragen":
        return ("Niet verstuurd: de gebruiker wil eerst zelf akkoord geven. Laat de precieze tekst zien of lees hem "
                "voor en vraag of het zo weg mag.")
    if keuze == "bekenden" and aan.lower() not in {(c.get("email") or "").lower() for c in opslag.contacten_zoeken()}:
        return ("Niet verstuurd: dit adres staat niet bij de contacten van de gebruiker, dus eerst akkoord vragen. "
                "Het concept staat klaar.")
    if opslag.namens_vandaag() >= opslag.NAMENS_PER_DAG:
        return "Niet verstuurd: het maximum aantal berichten per dag namens de gebruiker is bereikt. Vraag eerst akkoord."
    return None


@beta_tool
def mail_versturen(concept_id: int, met_akkoord: bool = False) -> str:
    """Verstuur een klaargezet concept.

    Args:
        concept_id: Id van het concept.
        met_akkoord: True alleen als de gebruiker de precieze tekst van dit concept heeft gezien of gehoord en daarna
            uitdrukkelijk heeft gezegd dat hij verstuurd mag worden. Anders False: dan verstuurt de app alleen als
            de gebruiker het reageren aan je heeft overgedragen.
    """
    concept = next((c for c in opslag.mailconcepten() if c["id"] == concept_id), None)
    if not concept:
        return f"Geen concept met id {concept_id}."
    if reden := _mag_namens("mail", concept["aan"], met_akkoord):
        return reden
    try:
        mail.versturen(concept["aan"], concept["onderwerp"], concept["tekst"], concept["in_antwoord_op"],
                       concept["references"])
    except Exception as fout:
        return _mail_fout(fout)
    opslag.mailconcept_weg(concept_id)
    if not met_akkoord:
        opslag.namens_vastleggen("mail", concept["aan"], concept["onderwerp"], concept["tekst"])
    return f"Verstuurd naar {concept['aan']}."


def _samen(functie, *args, **kwargs):
    if not samen.beschikbaar():
        return None, "Delen, projecten en de marktplaats werken alleen in de online versie."
    try:
        return functie(*args, **kwargs), None
    except samen.Fout as fout:
        return None, str(fout)


@beta_tool
def delen_met(gebruikersnaam: str, soort: str, afspraak_id: int = 0, taak_id: int = 0, notitie: str = "") -> str:
    """Deel iets met een andere gebruiker van de app. Alleen als de gebruiker daarom vraagt.

    Args:
        gebruikersnaam: Gebruikersnaam van de ontvanger (zonder @).
        soort: afspraak, taak, boodschappen (de hele open boodschappenlijst) of notitie.
        afspraak_id: Bij soort afspraak: het id uit agenda_bekijken.
        taak_id: Bij soort taak: het id uit taken_bekijken.
        notitie: Bij soort notitie: de tekst.
    """
    g = opslag.laden()
    if soort == "afspraak":
        a = next((a for a in g["afspraken"] if a["id"] == afspraak_id), None)
        inhoud = a and {k: a[k] for k in ("titel", "start", "einde", "locatie", "notitie", "soort", "sport") if a.get(k)}
    elif soort == "taak":
        t = next((t for t in g["taken"] if t["id"] == taak_id), None)
        inhoud = t and {"titel": t["titel"], "deadline": t.get("deadline")}
    elif soort == "boodschappen":
        nodig = [b["tekst"] for b in g.get("boodschappen", []) if not b["gekocht"]]
        inhoud = nodig and {"items": nodig}
    else:
        soort, inhoud = "notitie", notitie.strip() and {"tekst": notitie.strip()}
    if not inhoud:
        return "Niets gevonden om te delen; controleer het id of de tekst."
    aan, fout = _samen(samen.delen, gebruikersnaam, soort, inhoud)
    return fout or f"Gedeeld met {aan}. Die ziet het bij Projecten en delen."


@beta_tool
def gedeeld_bekijken() -> str:
    """Wat andere gebruikers met de gebruiker hebben gedeeld en nog niet is overgenomen."""
    lijst, fout = _samen(samen.gedeeld_met_mij)
    return fout or _json(lijst)


@beta_tool
def projecten_bekijken() -> str:
    """Gedeelde projecten van de gebruiker, met leden en alle taken, notities en afspraken erin."""
    lijst, fout = _samen(samen.projecten)
    if fout:
        return fout
    return _json([{**p, "items": samen.items(p["id"])} for p in lijst])


@beta_tool
def project_item_toevoegen(project_id: int, titel: str, soort: str = "taak", toelichting: str = "", datum: str = "",
                           toegewezen_aan: str = "") -> str:
    """Zet een taak, notitie, afspraak of link in een gedeeld project; alle leden zien het.

    Args:
        project_id: Id uit projecten_bekijken.
        titel: Korte titel.
        soort: taak, notitie, afspraak of link.
        toelichting: Extra uitleg, of de url bij een link.
        datum: Optioneel JJJJ-MM-DD of JJJJ-MM-DDTHH:MM.
        toegewezen_aan: Optioneel de gebruikersnaam van het projectlid dat het doet.
    """
    nieuw, fout = _samen(samen.item_toevoegen, project_id, soort if soort in samen.SOORTEN_ITEM else "taak", titel,
                         toelichting, datum, toegewezen_aan)
    return fout or f"Toegevoegd aan het project (id {nieuw})."


@beta_tool
def marktplaats_zoeken(zoekterm: str = "", soort: str = "") -> str:
    """Zoek aanbod op onze eigen marktplaats en geef links naar andere marktplaatsen met dezelfde zoekterm.

    Args:
        zoekterm: Wat de gebruiker zoekt, bijvoorbeeld "racefiets" of "personal trainer Utrecht".
        soort: Optioneel: product, dienst, training (privétraining) of les (lessen, bijles, studie).
    """
    eigen, fout = _samen(samen.aanbod_zoeken, zoekterm, soort if soort in samen.SOORTEN_AANBOD else "")
    velden = ("id", "soort", "titel", "omschrijving", "prijs", "prijs_per", "plaats", "aanbieder", "vrije_tijden", "van_mij",
              "betaalwijzen", "levering")
    return _json({"onze_marktplaats": fout or [{**{k: a.get(k) for k in velden},
                                                "betrouwbaarheid": samen.vertrouwen_tekst(a.get("vertrouwen"))}
                                               for a in eigen[:15]],
                  "andere_marktplaatsen": samen.externe_links(zoekterm)})


@beta_tool
def tijden_bekijken(aanbod_id: int) -> str:
    """Vrije tijden om een privétraining, les of dienst van de marktplaats te boeken.

    Args:
        aanbod_id: Id uit marktplaats_zoeken.
    """
    tijden, fout = _samen(samen.tijden, aanbod_id)
    return fout or _json([{"tijdslot_id": t["id"], "wanneer": samen.tijd_tekst(t["start"]), "minuten": t["minuten"]}
                          for t in tijden if t["vrij"]][:30])


@beta_tool
def boeken(tijdslot_id: int, opmerking: str = "") -> str:
    """Boek een tijd bij een aanbieder en zet hem in de agenda. Alleen gebruiken nadat de gebruiker de precieze tijd en
    prijs heeft gezien of gehoord en uitdrukkelijk heeft gezegd dat je mag boeken. Betalen gaat buiten de app.

    Args:
        tijdslot_id: Id uit tijden_bekijken.
        opmerking: Optioneel bericht voor de aanbieder.
    """
    boeking, fout = _samen(samen.boeken, tijdslot_id, opmerking)
    return fout or (f"Geboekt: {boeking['titel']} op {samen.tijd_tekst(boeking['start'])} bij {boeking['aanbieder']}. "
                    "Staat in de agenda. De betaling regelt de gebruiker zelf met de aanbieder.")


@beta_tool
def bestellingen_bekijken() -> str:
    """Bestellingen op de marktplaats (als koper en als verkoper), met status en wat de volgende stap is."""
    lijst, fout = _samen(samen.mijn_bestellingen)
    return fout or _json([{k: b[k] for k in ("id", "titel", "bedrag", "betaalwijze", "levering", "status", "rol", "ander")}
                          for b in lijst])


@beta_tool
def boekingen_bekijken() -> str:
    """Komende boekingen op de marktplaats: wat de gebruiker heeft geboekt en wat anderen bij hem hebben geboekt."""
    lijst, fout = _samen(samen.mijn_boekingen)
    return fout or _json([{**b, "wanneer": samen.tijd_tekst(b["start"])} for b in lijst])


@beta_tool
def berichten_bekijken() -> str:
    """Gesprekken op de marktplaats: per aanbod en gesprekspartner de laatste berichten en hoeveel ongelezen."""
    lijst, fout = _samen(samen.gesprekken)
    return fout or _json([{"aanbod_id": g["aanbod_id"], "ander_id": g["ander_id"], "ander": g["ander"],
                           "titel": g["titel"], "ongelezen": g["ongelezen"],
                           "laatste": [{k: b.get(k) for k in ("van_mij", "tekst", "aangemaakt")}
                                       for b in g["berichten"][-6:]]} for g in lijst[:15]])


@beta_tool
def bericht_sturen(aanbod_id: int, ander_id: int, tekst: str, met_akkoord: bool = False) -> str:
    """Stuur een bericht in een gesprek op de marktplaats.

    Args:
        aanbod_id: Het aanbod waar het gesprek over gaat.
        ander_id: De gesprekspartner (ander_id uit berichten_bekijken).
        tekst: Het bericht.
        met_akkoord: True alleen als de gebruiker deze precieze tekst heeft gezien of gehoord en akkoord gaf.
    """
    if reden := _mag_namens("berichten", "", met_akkoord):
        return reden
    _, fout = _samen(samen.bericht_sturen, aanbod_id, tekst, ander_id)
    if fout:
        return fout
    if not met_akkoord:
        opslag.namens_vastleggen("berichten", f"marktplaats {ander_id}", f"aanbod {aanbod_id}", tekst)
    return "Verstuurd."


HULPMIDDELEN = [
    mails_bekijken,
    mail_lezen,
    mail_concept_maken,
    mail_versturen,
    onthouden,
    vergeten,
    gewoontes_bekijken,
    taak_toevoegen,
    taken_inplannen,
    woning_bedienen,
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
    agenda_laten_weten,
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
    lijst_toevoegen,
    lijsten_bekijken,
    documenten_zoeken,
    document_lezen,
    budget_bekijken,
    uitgaven_bekijken,
    uitgave_toevoegen,
    beleggingen_bekijken,
    koers_opzoeken,
    markt_bekijken,
    document_maken,
    document_aanvullen,
    prijzen_vergelijken,
    delen_met,
    gedeeld_bekijken,
    projecten_bekijken,
    project_item_toevoegen,
    marktplaats_zoeken,
    tijden_bekijken,
    boeken,
    boekingen_bekijken,
    bestellingen_bekijken,
    berichten_bekijken,
    bericht_sturen,
    {"type": "web_search_20260209", "name": "web_search", "max_uses": 5},
    {"type": "web_fetch_20260209", "name": "web_fetch", "max_uses": 5},
]


def context() -> str:
    """Wat de assistent bij elk gesprek over de gebruiker weet: geheugen en geleerde gewoontes."""
    nu = datetime.now()
    delen = [f"Nu is het {DAGEN[nu.weekday()]} {nu.strftime('%Y-%m-%d %H:%M')}."]
    naam = avatar.instellingen(opslag.instellingen())["naam"]
    delen.append("Je hebt geen eigen naam: je bent gewoon de assistent. Verzin zelf geen naam."
                 if naam == avatar.STANDAARD["naam"] else f"Je naam is {naam}.")
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
    namens = {k: opslag.namens(k) for k in ("mail", "berichten")}
    delen.append("Namens de gebruiker reageren: " + "; ".join(
        f"{k}: {'eerst akkoord vragen' if v == 'vragen' else 'zelf reageren aan contacten, anderen eerst vragen' if v == 'bekenden' else 'zelf reageren'}"
        for k, v in namens.items()) + f". Vandaag al {opslag.namens_vandaag()} van maximaal {opslag.NAMENS_PER_DAG} namens hem verstuurd.")
    if scenes := woning.scenes():
        delen.append("Scènes in Apple Woning (via woning_bedienen): " + ", ".join(scenes) + ".")
    if (reeks := opslag.leerreeks())["reeks"] or reeks["vandaag"]:
        delen.append(f"Leerreeks: {reeks['reeks']} dagen op rij het dagdoel gehaald; vandaag {reeks['vandaag']} van "
                     f"{reeks['dagdoel']} geoefend. Moedig kort aan als het past, zonder te zeuren.")
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
    if oordelen := opslag.feedback():
        goed = sum(f["goed"] for f in oordelen)
        regels = [f"- {'👍' if f['goed'] else '👎'} op vraag \"{f['vraag'][:80]}\""
                  + (f": {f['opmerking']}" if f.get("opmerking") else "")
                  for f in oordelen[-12:] if f.get("opmerking") or not f["goed"]]
        delen.append(f"Feedback op je antwoorden: {goed}× 👍 en {len(oordelen) - goed}× 👎."
                     + ("\nRecent (leer hiervan):\n" + "\n".join(regels) if regels else ""))
    if gewoontes := tijd.gewoontes():
        delen.append("Geleerde gewoontes uit de tijdregistratie (afgelopen 90 dagen), per soort afspraak:\n" +
                     "\n".join(f"- {s}: {g['aantal']} keer, gemiddeld {g['gem_uitloop_min']} min uitloop, "
                                f"{g['gem_te_laat_min']} min te laat, {g['gem_op_locatie_min']} min op locatie"
                                for s, g in gewoontes.items()))
    return "\n\n".join(delen)


SPRAAK = ("De gebruiker praat nu via spraak en je antwoord wordt voorgelezen. Antwoord in gewone spreektaal "
          "in hooguit drie korte zinnen, zonder opsommingen, opmaak, emoji of links. Zet wel het gevoelslabel "
          "vooraan. Je mag hooguit één klank gebruiken als die echt past, met dubbele haken: [[lacht]], "
          "[[grinnikt]], [[zucht]] of [[fluistert]].")


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
