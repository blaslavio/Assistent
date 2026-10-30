# Vakantie en particulier verblijf

Te vinden in **Agenda → Vakantie en verblijf**, en via de zoekbare groep Planning en koppelingen in Instellingen. De assistent heeft één navigatiehulpmiddel `vakantie_openen`; dat opent ditzelfde onderdeel en boekt niets.

## Privéreisplan

- Bestemming, aankomst, vertrek, 1–30 reizigers en 1–90 nachten.
- Begroting in eurocenten: verblijf + vervoer + dagbudget per persoon, inclusief heen- en terugreisdag. Dit zijn eigen schattingen, geen opgehaalde aanbiedingen of prijsvoorspellingen.
- Lokaal vergelijken met bestaande agenda-items, voorbereiding afvinken, plan bijstellen en verwijderen. Het vertrekkompas toont één volgende stap, rekening houdend met Amsterdamse kalenderdagen, budget, voorbereiding en de stand van de agenda. Het telt af tot de opgegeven aankomstdatum en berekent geen fysieke vertrektijd. Een afgevinkte checklist is geen bewijs van een boeking.
- Vanuit het plan de datums en reizigers meenemen naar verblijf zoeken; er wordt pas gezocht na de zoekopdracht.
- Een vaste agenda-ID voorkomt dubbele afspraken bij opnieuw proberen. De bestaande agenda bevat het verblijf inclusief terugreisdag. Tot 366 dagen per meerdaags item worden weergegeven; eerder werd na 60 dagen afgekapt.
- Bij het bevestigen van een gewijzigd privéplan schuift een eerder door dat plan gemaakte, ongewijzigde agenda-afspraak mee. Dit wordt vooraf in het controlepaneel uitgelegd. Handmatig gewijzigde afspraken en extra velden blijven behouden; het plan toont dan dat controle in de agenda nodig is. Er is een directe knop naar de betreffende dagen.
- Reisbrief eerst bekijken en dan expliciet kopiëren. Niets wordt automatisch gedeeld of naar de assistent gestuurd. Als de gebruiker het plan aan de agenda toevoegt, gelden de bestaande agenda-/AI-instellingen voor die afspraak.
- Opslag onder `vakanties` in de bestaande accountgegevens via de bestaande compare-and-swap-opslag. Geen tweede account- of agendasysteem.

## Aanbieden en aanvragen

Particulieren kunnen maximaal tien woningen/vakantieverblijven inrichten met plaats, land, beschrijving, voorwaarden, prijs per nacht, schoonmaak, capaciteit, voorzieningen en een beschikbaarheidsperiode. Per verblijf kun je nachten blokkeren voor eigen gebruik of boekingen buiten deze app. Die blokkades worden ook bij aanvragen en bevestigingen gecontroleerd; bevestigde reserveringen kunnen niet worden weggeblokkeerd. Aanbod kan concept blijven, gepauzeerd worden of na afhandeling van toekomstige bevestigde reserveringen worden verwijderd. De aanbieder moet aangeven dat hij mag verhuren. Voorzieningen en verhuurrecht zijn zelfverklaringen; geen verificatiekeurmerk.

Ingelogde gebruikers zoeken op datums, gastenaantal en plaats/land. De zoeklijst toont maximaal vijftig passende aanbiedingen. De resultaten worden op totaalprijs voor de gekozen nachten gesorteerd, inclusief schoonmaak. Er kunnen maximaal drie verblijven worden vergeleken, met dezelfde datums en gasten, inclusief een afgeronde prijs per persoon per nacht. Als je vanuit een reisplan zoekt, rekent de app de ruimte binnen het reisbudget uit na het opgegeven vervoer en het dagbudget voor alle reizigers. Bij een gewijzigde zoekperiode of gastenaantal worden die dagkosten opnieuw berekend. De vergelijking blijft alleen in het scherm en wordt bij een nieuwe zoekopdracht gewist. Zoeken accepteert ook bestemmingen uit het reisplan met komma’s, accenten, hoofdletters en extra spaties. Het exacte adres komt niet mee in zoekresultaten. Bij een aanvraag wordt de app-gebruikersnaam met de verhuurder gedeeld; verdere communicatie gaat via de bestaande app-chat. Exacte aankomsttijden, borg en annulering horen in de vooraf getoonde voorwaarden.

De server bepaalt het totaal: nachten × prijs + opgegeven schoonmaak, in EUR. Verplichte toeslagen moeten door de aanbieder in deze prijzen worden opgenomen. Een aanvraag houdt geen nachten vast. Alleen expliciete bevestiging door de verhuurder doet dat. Vertrek is exclusief: de volgende gast mag op die datum aankomen.

De verhuurder kan bevestigen, afwijzen of annuleren; de gast kan zijn eigen aanvraag/reservering annuleren. De UI vraagt vóór zo'n actie om controle. Annuleren geeft bezette nachten vrij. Dit verwerkt geen betaling of terugbetaling. Dit onderdeel verkoopt geen verzekeringen en bevat geen gekoppelde Stripe-checkout voor verblijven. De bestaande winkelbetalingen blijven ongewijzigd.

## Servergrenzen

`sql/vakantie_verhuur.sql` is vereist voor aanbod en aanvragen. Directe tabeltoegang is geblokkeerd met RLS en grants; beveiligde RPC's gebruiken de bestaande `private.gebruiker_id`-controle. Het aanbodslot serialiseert bevestigingen van dezelfde woning, inclusief gelijktijdige aanvragen. Prijs en voorwaarden worden vastgelegd bij aanvragen. Een aanbodwijziging vereist een nieuwe aanvraag; bevestigde prijsafspraken worden niet overschreven.

Een sessiewissel wist direct getoonde reserveringsadressen, vergelijking, bewerkingsformulieren en opdrachten; late antwoorden van de vorige sessie worden genegeerd. Aanvraag-ID's en versiecontroles beschermen tegen dubbel verwerken bij een verloren antwoord en tegen oude bewerkingen. Maximaal twintig open aanvragen en dertig nieuwe aanvragen per 24 uur per gast. Adressen zijn alleen voor de eigen aanbieder en bevestigde betrokken reserveringen beschikbaar. Bij annuleren wordt het reserveringsadres gewist; bij accountverwijdering worden bijbehorende reserveringen geannuleerd en het adres en vrije woningteksten afgeschermd/gewist. Reeds door iemand bekeken of gekopieerde gegevens kunnen daarmee niet worden teruggehaald.

## Activering en grenzen

De migratie moet door een bevoegde beheerverbinding op de productiedatabase worden uitgevoerd. Deze ontwikkelomgeving heeft die verbinding niet. Zonder migratie meldt de interface dat verhuur niet beschikbaar is; privéreisplannen gebruiken de bestaande opslag en blijven bruikbaar. Dit is geen bevestigde productie-uitrol.

Er is nog geen fotoservice voor verblijven, geverifieerd eigenaarschap, externe kalender-/platformsynchronisatie, toeristenbelastingberekening, schadeafhandeling of verblijfsbetaling. Beschikbaarheid wordt met reserveringen binnen deze app en eigen datumblokkades vergeleken. De aanbieder moet boekingen van andere platforms zelf als blokkade opnemen. Dit is een eerste functionele versie voor particuliere verblijven, geen compleet pakketreisplatform.

Validatie staat in `controle/vakanties.json`. De mobiele browsercontrole gebruikt uitsluitend fictieve lokale gegevens en is geen productie-E2E. Databaseproeven voeren de daadwerkelijke migratie en RPC's uit in een eigen PostgreSQL-container.
