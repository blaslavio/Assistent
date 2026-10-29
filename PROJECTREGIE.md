# Projectmotor: waarom → hoe → wanneer → als

In **Chat → gesprek → Projectwerkruimte → Projectregie** staan de vier lagen bij elkaar. Gebruik **Voorstel** of de knop bij een chatbericht om eerst een doel, besluit, vraag of actie te bevestigen. Voorstellen zijn pas gedeeld na bevestiging; een AI-antwoord wordt nooit vanzelf een projectfeit.

## Een complete werkroute

1. **Waarom:** bevestig bijvoorbeeld ‘We bouwen samen een boekingspagina’. De bron en de echte berichtafzender blijven zichtbaar.
2. **Hoe:** kies dat doel, maak stappen en vul per stap het resultaatcriterium, de verantwoordelijke, duur, voorgangers en eventueel een alternatief in. Controleer de volledige aanpak voordat je deelt. Blokkades en stapresultaten worden apart bevestigd. Aanpassen maakt een nieuwe aanpakversie; parallelle voorstellen blijven zichtbaar.
3. **Wanneer:** geef eigen beschikbare tijd op, bevestig eventueel een deadline en vraag een tijdvoorstel. De motor controleert de opgegeven vensters, stapvolgorde en eigen appagenda. Nederlandse klokwissels worden expliciet behandeld. Een voorstel voor een andere deelnemer leest diens agenda niet. Vastleggen vraagt een aparte bevestiging en hercontrole; het verstuurt geen uitnodigingen. Deel je eigen bevestigde tijd desgewenst daarna met het project.
4. **Als:** bewaar persoonlijke voorwaarden, bijvoorbeeld ‘appbetaling 42 bevestigd én ontwerpresultaat klaar’. Combineer maximaal vijf voorwaarden met alle/minstens één. Controleer ze zelf met actuele eigen dienstinformatie. De uitkomst is voldaan, niet voldaan of onbekend. Alleen voldaan biedt een vervolgvoorstel: planning, bestellingen, het bestaande boekings-/reserveringsformulier, een chatconcept of een handmatige controle.
5. **Uitvoeren:** controleer en bevestig de handeling in het bestaande formulier. Een voldane voorwaarde betaalt, boekt, reserveert of verstuurt niets automatisch.

De voorwaarden worden op verzoek gecontroleerd; er draait geen achtergrondplanner. Dienstbewijs verloopt na één minuut. Een onbereikbare dienst, ontbrekende registratie of onbekende betaalwijze blijft onbekend. Een apparaatklok is geen serverbewijs dat iets daadwerkelijk is uitgevoerd. Een nieuwe aanpak vraagt herbeoordeling van eraan gekoppelde stapvoorwaarden.

## Betalen vanuit de chat

In een geaccepteerde één-op-één-chat zonder verdwijnende berichten staat **Betaalverzoek in deze chat**. De verkoper kan een bestaande geaccepteerde appbestelling met precies deze wederpartij kiezen en het verzoek na controle delen. Een groepschat krijgt deze betaalfunctie niet.

De versleutelde kaart bevat uitsluitend het bestelnummer. De ontvanger haalt bedrag en status zelf op uit de eigen, geauthenticeerde administratie. De app controleert koper/verkoper en wederpartij op numeriek account-ID; ontbrekende identificatie wordt geweigerd. Daarna kan de koper zelf verder naar Stripe Checkout. Vlak daarvoor worden status, titel en bedrag opnieuw gecontroleerd. De kaart kan geen bankrekening of betaaladres meesmokkelen; alleen HTTPS op `checkout.stripe.com` wordt als checkout geopend.

‘Betaald’ typen in chat, een AI-antwoord of een handmatig gemelde contante betaling geldt niet als betaaldienstbewijs. Terugbetaalde, betwiste en geannuleerde orders geven geen betaalvoorwaarde vrij. De bestaande betaaldienst en server blijven verantwoordelijk voor checkout, webhooks, toestemming en afhandeling. Een dubbel gedeelde kaart verwijst naar dezelfde bestelling; de kaart zelf schrijft geen geld af.

Boekingen en reserveringen gebruiken eigen dienststatus en openen de bestaande beveiligde formulieren. Er is geen universele koppeling met willekeurige externe diensten toegevoegd. Een nog niet aangesloten dienst kan geen bevestiging leveren.

## Tien aanvullende onderdelen

| Onderdeel | Werking |
| --- | --- |
| Projectgeheugen | Alleen expliciet bevestigde kennis, besluiten, vragen en acties |
| Chat naar actie | Werkelijk chatbericht als bron, voorstel vóór delen, eigen taak met teruglink |
| Samen focussen | Geselecteerd tekstcitaat als tijdelijk aandachtspunt; gewijzigde/ambigue tekst wordt gemeld |
| Sinds mijn bezoek | Tijdlijn van feiten en bestandsupdates; bezoekmarkering bewust per apparaat |
| Werkstanden | Vandaag, Samenwerken en Ondernemen; eigen voorkeur per project |
| AI-toestemming | Standaard uit; actuele toestemming van deelnemers én bekende bronbijdragers |
| Versiearchief | Aparte versleutelde snapshots; bekijken en herstel expliciet bevestigen |
| Bereikbaarheid | Vrijwillige, tijdelijke projectstatus; geen aanwezigheidstracking |
| Overdracht | Downloadbare feiten, herkomst, aanpakken en tijden; geen verborgen AI-samenvatting |
| Oefenen | Lokale capaciteitsverdeling, zonder opslag of berichten |

## Techniek en privacy

De projectmotor gebruikt begrensde berichttypen en deterministische controles bovenop de bestaande versleutelde chat en Yjs-bestanden. Daarmee zijn bewijs, voorstel en uitvoering afzonderlijk controleerbaar. Dit introduceert geen eigen cryptografie.

Projectfeiten worden gedeeld binnen het gesprek. Persoonlijke als-regels en dienstcontroles blijven binnen het eigen account; betaal- en reserveringsdetails worden niet automatisch als projectkennis gedeeld. Een chatconcept overschrijft geen bestaande invoer en wordt nooit automatisch verstuurd.

AI krijgt uitsluitend het vooraf getoonde, geselecteerde projectcontextpakket, maximaal 16.000 tekens. De toestemming wordt vlak vóór de aanvraag opnieuw gecontroleerd met volledige actuele leesbare geschiedenis. De geïsoleerde aanvraag heeft geen tools, persoonlijk geheugen of overige chatgeschiedenis. Uitvoer blijft een privévoorstel. Een hersteld bestand met onbekende bronbijdragers wordt voor AI geblokkeerd.

## Onafhankelijk archief

Voer bij een gecontroleerde database-uitrol `sql/project_archief.sql` uit, na de bestaande chatmigraties. Zolang deze migratie ontbreekt, geeft het archief een foutmelding in plaats van verzonnen succes. Het archief ondersteunt maximaal 50 bestanden per gesprek en 200 snapshots per bestand. Lijsten worden begrensd en gepagineerd. Dezelfde archiefopdracht kan veilig worden herhaald, maar gewijzigde inhoud onder hetzelfde opdracht-ID wordt geweigerd.

Chatberichten wissen verwijdert deze afzonderlijke snapshots niet. De catalogus vindt archiefbestanden ook zonder oorspronkelijke bestandsberichten. Herstel vanuit de catalogus maakt een nieuw bestand; herstel in een bestaand bestand controleert eerst dat de tekst sinds de preview niet is veranderd. Het bewaart bekende oorspronkelijke bijdragers voor latere AI-toestemming.

Dit is geen permanente externe back-up: verwijderen van het gesprek, account of gekoppeld apparaat volgt de database-cascades. Lezen vereist lidmaatschap en de passende apparaatsleutel; nieuwe apparaten kunnen niet vanzelf oude versies ontsleutelen. Er is geen automatische sleuteloverdracht of onbeperkte bewaartermijn.

## Verificatie en uitrol

De lokale verificatie omvat 127 Vitest-tests, beide TypeScript/Vite-builds 1.260 Python-tests zonder overgeslagen tests (waaronder 11 PostgreSQL-tests van het echte archiefschema en 25 veilige-opslagtests), plus 358 upstream-pytest-tests en 21 subtests. De productieafhankelijkhedenaudit meldt op dit uitvoermoment geen bekende kwetsbaarheden. De webtests gebruiken nagebootste transport-, AI- en betaalantwoorden; er zijn geen echte betalingen, boekingen, berichten of videogesprekken uitgevoerd. De bestaande productiereleasepoort voor verse E2E-bewijzen blijft ongewijzigd. Deze uitbreiding is nog niet live. Zie `UITROL.md`.

## Extra privacy en eenvoudige bediening

In de ontwikkelversie zijn de volgende beschermingen toegevoegd:

- **Project afschermen:** verbergt de projectinhoud tegen meekijken zonder de editor te sluiten of lokale bewerkingen te wissen. Met de optionele schakelaar gebeurt dit wanneer de app naar de achtergrond gaat. Dit is een visueel schermgordijn; chat, videogesprek en account blijven actief. Het beveiligt niet tegen iemand die het apparaat zelf bedient.
- **Project-AI pauzeren:** blokkeert nieuwe projectaanvragen op dit apparaat tijdens de huidige sessie, wist het getoonde AI-voorbeeld/antwoord en probeert een lopende aanvraag af te breken. Het draait eerder verstuurde informatie niet terug en trekt toestemming op andere apparaten niet in. Hervatten vereist opnieuw het normale voorbeeld en toestemming.
- **Kortere toestemming:** kies 15 minuten, 1 uur (standaard) of 24 uur. ‘Wie mag wat?’ opent het privacyoverzicht met de actuele toestemming en eindtijd per deelnemer/bronbijdrager. Oudere clients krijgen eerst een herkenbare intrekking voordat het nieuwe toestemmingstype wordt gedeeld; als de tweede stap mislukt, blijft hun eerdere toestemming ingetrokken. Intrekken blijft een expliciet gedeeld voorstel.
- **Afgeschermd AI-voorbeeld:** herkenbare e-mailadressen, Nederlandse mobiele nummers en rekeningnummers uit de ondersteunde patronen (NL/BE/DE/GB/ES) worden lokaal door labels vervangen. De bronbestanden blijven intact. Herkenbare Anthropic-/Stripe-/Supabase-sleutels en PEM-privésleutels blokkeren de aanvraag. Ook de provider-aanroep zelf weigert onafgeschermde herkende gegevens. Dit is patroonherkenning, geen volledige anonimisering: controleer onder andere namen, adressen en medische tekst zelf.
- **Gerichte dienstcontrole:** alleen diensttypen die in de persoonlijke regels voorkomen worden opgehaald. Voor uitsluitend tijd-/stapvoorwaarden worden geen betaal-, boekings- of reserveringsdiensten aangeroepen. Resultaten bevatten in de regelmotor geen naam, titel of bedrag. Een storing blijft onbekend en accountwisselingen leveren geen bruikbaar bewijs op.
- **Persoonlijke regels opruimen:** verwijderen vraagt een preview en bevestiging, weigert intussen gewijzigde regels en kan na een verloren antwoord veilig worden herhaald. Het verwijdert geen betalingen, afspraken of gedeelde berichten.

Waarom deze keuzes: schermprivacy helpt tijdens samenwerken en schermdelen; korte toestemming verkleint onbedoelde toegang; gegevensminimalisatie verkleint wat de AI-provider ontvangt; gerichte controles voorkomen onnodige gegevensopvragingen; duidelijke bevestiging voorkomt verkeerd verwijderen. De bestaande versleuteling, broncontrole en expliciete uitvoering blijven de basis.

Lokaal geslaagd: **127 webtests en beide TypeScript/Vite-builds**. De aanvullende tests controleren maskering, sleutelblokkade, pauze/accountisolatie, afbreken van AI-aanvragen, korte looptijd, compatibele intrekking, afschermen met behoud van invoer, gerichte dienstcontrole en veilig verwijderen.

`.github/workflows/project-checks.yml` voegt webtests/builds en de bestaande geïsoleerde PostgreSQL-archieftests toe aan ontwikkelpushes en pull requests. Deze wijziging verandert geen productiedatabase en publiceert geen productieapp.
