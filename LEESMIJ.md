# Mijn assistent

Een persoonlijke assistent die je in Safari op je iPad of telefoon gebruikt. Je praat er gewoon Nederlands mee.

**Wat de app kan** (een rustig menu bovenaan; op de telefoon via » linksboven; onderaan kun je altijd iets vragen aan de assistent)
- 🏠 **Vandaag**: je assistent groet je, met datum en weer, je dagschema dat vanzelf bijwerkt, meldingen (verkocht, bestellingen, berichten, gedeeld), je saldo op de marktplaats, je taken en korte seintjes. Wat er staat, kies je bij Instellingen › Voorpagina en menu.
- 📅 **Agenda**: alles op één plek, met een soort per afspraak (sport, uitgaan, etentje, werk en meer) en een melding op je vertrektijd via 📲. Dichtgeklapt onderaan: ideeën in de buurt, sportdoelen en tijdsbesteding.
- 💬 **Je assistent** (met de naam die je kiest): praten of typen, antwoorden worden voorgelezen; zoekt op internet, plant strak en onthoudt je voorkeuren. Naam en uiterlijk (avatar of eigen foto) kies je bij Instellingen.
- ⚙️ **Instellingen**: naam en uiterlijk van de assistent, hoe hij praat, stem, wat hij over je weet, thuisadres, voorpagina en menu, contacten, koppelingen (mail, Strava, Ticketmaster, Anthropic), je account, beheer (alleen de eigenaar) en uitloggen.
- **Leren en werk** (tegels in Instellingen):
  - ✉️ Mail: mails lezen, afspraken naar je agenda, antwoorden klaarzetten die jij verstuurt.
  - 📚 Leren en schrijven: leerdoelen met voortgangsbalk, oefentoetsen (meerkeuze, met uitleg), flitskaarten, mondeling overhoren, en hulp bij scripties en verslagen met echte wetenschappelijke bronnen. De app plant je herhalingen vanzelf.
  - 🤝 Projecten en delen: afspraken, taken, je boodschappenlijst en notities delen, en samen aan projecten werken.
  - 🔨 DIY en hobby: een plan met stappen, veiligheidstips, materialen met geschatte kosten en links naar winkels (Gamma, Praxis, Karwei, Hornbach, Action, Bol); zet materialen met één tik op je kooplijst of wenslijst.
  - 🧰 Hulpmiddelen: notities, een focustimer en een rekenhulp (ook btw, korting en procenten).
  - 📷 Foto scannen: maak of kies een foto; de assistent herkent producten, leest de tekst en zet afspraken, taken of producten op de goede plek. Gezichten worden bewust niet herkend.
- **Kopen en verkopen** (tegels in Instellingen): 🛒 Boodschappen (goedkoopste supermarkt), 🛍️ Kooplijst en ⭐ Wenslijst (prijzen vergelijken op internet, goedkoopste vooraan), en de marktplaats: 🔎 zoeken, 🏷️ verkopen, 🧾 bestellingen (ook je geboekte tijden) en 💬 berichten. Betalen kan via de app (Stripe, met kopersbescherming: het geld gaat pas naar de verkoper als de koper bevestigt dat alles goed is ontvangen) of buiten de app (Tikkie, overmaken, contant).

Wat je niet gebruikt, zet je uit bij Instellingen › Voorpagina en menu; dan verdwijnt het uit het menu.

**VR-ruimtes** (Werk en leren › 🥽 VR-ruimtes): iedereen kan een 3D-ruimte maken om een project te laten zien: foto's aan de muur, teksten op borden en 3D-modellen (.glb, tot 4 MB) op een sokkel, in vier sferen (galerie, museum, buiten, studio). Op de iPad veeg je om rond te kijken en loop je met ◀ ▶ langs alles; met een VR-bril tik je op VR en loop je met de duimstick. Openbare ruimtes staan bij Ontdekken en zijn te delen via `?ruimte=nummer`, ook zonder account. Drie meldingen = verborgen tot de beheerder kijkt. Gemaakt met A-Frame. SQL: sql/ruimtes.sql.

**Webshop** (Kopen en verkopen › 🏬 Winkels voor iedereen: alle winkels binnen de app, met zoeken; 📦 Mijn webshop voor Verkoper en Ondernemer): eigen winkel met vast adres (`?winkel=naam`), kleur, verzendkosten, retourtekst, producten met voorraad. Iedereen kan de winkel bekijken; bestellen met een gratis account, altijd betalen via de app (Stripe). Koper betaalt niets extra; de verkoper betaalt 5% commissie (minimaal € 0,35), ingehouden bij het uitbetalen. Niet betaalde bestellingen vervallen na 75 minuten en de voorraad komt terug. SQL: sql/webshop.sql.

**Winkelkaart** (🏬 Winkels › 🗺️ Kaart): alle winkels in de buurt uit OpenStreetMap (gratis), met de winkels uit de app voorop: groot en in hun eigen kleur op de kaart, en bovenaan de lijst. Een winkel die ook in OpenStreetMap staat, telt één keer (als die van ons). Winkeliers vullen het adres van hun winkel in bij 📦 Mijn webshop › 📍 Op de winkelkaart. SQL: sql/winkelkaart.sql.

**Reviews en marketing** (📦 Mijn webshop › 📣 Marketing en ⭐ Reviews): reviews kunnen alleen echte klanten geven, na een afgeronde bestelling of met een eenmalige bezoekcode (QR) die de winkel aan een klant in de winkel geeft (`?bezoek=CODE`, 14 dagen geldig, review binnen 60 dagen). De verkoper kan openbaar reageren en melden; de beheerder beslist (Account › Beheer). Marketing: cijfers (bezoeken, volgers, verkopen), actiebalk, kortingscodes (procent of bedrag, minimum, einddatum, max. gebruik; de korting gaat van de producten af en de commissie over wat de klant betaalt), nieuwtjes voor volgers (1 per dag, ook als melding op hun voorpagina), een A4-poster met QR-code, en posts laten schrijven door de assistent. SQL: sql/reviews_marketing.sql.

**Startpunt, bijleren en stem met gevoel**: op de voorpagina staat één rij knoppen (Verkopen, Dienst aanbieden, Winkels, Leren, de assistent); uit te zetten bij Voorpagina en menu. Onder elk antwoord staat 👍/👎; bij 👎 kun je zeggen wat beter kan. De assistent leert daarvan (Instellingen › 🧠 Wat de assistent over je weet). Elk antwoord krijgt een gevoel (blij, rustig, meelevend, enthousiast...): de stem van je apparaat past toon en tempo aan, en met een eigen ElevenLabs-sleutel (Instellingen › 🗣️ Stem) klinkt de stem echt menselijk, met lachjes en zuchten. Zonder tegoed valt hij terug op de stem van je apparaat.

**Kleuren en namens jou reageren**: elke soort in de agenda heeft een eigen kleur (aan te passen bij Instellingen › 🎨 Kleuren in de agenda); taken met een deadline staan als 🔔 herinnering op hun dag. Bij Instellingen › 🤝 Namens jou reageren kies je per kanaal (mail, berichten op de marktplaats): eerst vragen (standaard), zelf reageren aan je contacten, of helemaal zelf. Over geld, contracten, opzeggingen, wachtwoorden en codes vraagt de assistent altijd eerst; maximaal 25 per dag; alles staat bij Mail › 🤖 Namens jou verstuurd. Werkt als de app open staat.

**Accounttypes** (Instellingen › Account › Accounttype, gratis): iedereen houdt alle basisfuncties (agenda, taken, assistent, leren, lijstjes, marktplaats). 🙂 Particulier: tot 10 advertenties. 🏷️ Verkoper: tot 100 advertenties en een 📊 Verkoopoverzicht. 🏢 Ondernemer: bedrijfsprofiel met KvK en btw, label 'Zakelijk' met 14 dagen bedenktijd voor kopers, tot 1000 advertenties, klantenoverzicht en facturen (bewaar als PDF via Delen › Afdrukken in Safari). SQL: sql/niveaus.sql.

**Beveiliging** (Instellingen › Account › 🔐 Beveiliging): tweestapsverificatie met een code van 6 cijfers uit de app Wachtwoorden (iPhone/iPad) of een authenticator-app, met 8 herstelcodes voor als je telefoon kwijt is. Inloggen met Face ID gaat via Safari: laat Safari je wachtwoord bewaren. Je ziet op welke apparaten je bent ingelogd en recente inlogpogingen, en kunt overal anders uitloggen. Na inloggen gebruikt de app een tijdelijke sessiecode in plaats van je wachtwoord; een nieuw wachtwoord logt andere apparaten uit. Mislukte pogingen zie je bij de volgende keer inloggen.

Iedereen kan een gratis account maken met een gebruikersnaam, mailadres en wachtwoord, en inloggen met naam of mailadres. Wie met de assistent wil praten, zet zijn eigen Anthropic-sleutel bij Instellingen.

Het gesprek met de assistent heeft tegoed bij Anthropic nodig; de rest werkt ook zonder.

**Nog niet** (volgende stappen): budget, markt en portfolio, en Outlook-mail.

## Online zetten, helemaal op de iPad

Je maakt vier gratis accounts aan. Alles gaat in Safari.

### Stap 1. GitHub: hier staat de code
1. Maak een account op [github.com](https://github.com/signup).
2. Maak een nieuwe repository: tik op **+**, dan **New repository**. Naam: `assistent`, kies **Private**, en tik op **Create repository**.
3. Koppel GitHub aan Claude via [deze link](https://claude.ai/connect-github) en geef toegang tot de repository `assistent`.
4. Laat het mij weten in de chat; dan zet ik de code erin.

### Stap 2. Anthropic: het "brein"
1. Maak een account op [console.anthropic.com](https://console.anthropic.com).
2. Voeg wat tegoed toe onder **Billing** (bijvoorbeeld 10 euro).
3. Maak onder **API Keys** een sleutel aan en bewaar hem in je Notities. Deel hem met niemand.

### Stap 3. Supabase: hier worden je gegevens bewaard
Claude heeft de database ingericht. De app gebruikt alleen de openbare (publishable) sleutel; je gegevens zijn alleen te openen met het wachtwoord dat je in de app kiest. Na 10 foute pogingen blokkeert de database een kwartier.

### Stap 4. Streamlit: hier draait de app
1. Ga naar [share.streamlit.io](https://share.streamlit.io) en log in met je GitHub-account.
2. Tik op **Create app** en plak bij **Paste GitHub URL**: `https://github.com/blaslavio/assistent/blob/main/app.py`
3. Kies onder **Advanced settings** Python **3.12**. Secrets zijn niet nodig.
4. Tik op **Deploy**. Open het adres in Safari, tik op het deel-icoon en kies **Zet op beginscherm**.
5. De eerste keer kies je een wachtwoord en plak je je Anthropic-sleutel. Doe dit meteen na het online zetten.

## Goed om te weten

### Eén assistent voor vragen en opdrachten

Gebruik het invoerveld onderaan of open het gesprek met je assistent. Typ bijvoorbeeld
`Plan overleg morgen om 10:00` of `Taak belasting vrijdag`. Bewerk de titel, datum,
begin- en eindtijd en locatie, of de deadline en duur van een taak. Kies daarna
**Bevestigen** om het in je bestaande agenda of takenlijst op te slaan.
Bij een afspraak toont het voorstel overlap met bestaande afspraken uit de appagenda.
Er verschijnen maximaal drie vrije alternatieven binnen je planningsuren, met dezelfde
afspraakduur, in de zeven dagen vanaf het voorstel. Een alternatief kiezen slaat nog
niets op: je bevestigt het aangepaste voorstel zelf. Na handmatige wijzigingen kun je
**Beschikbaarheid controleren** kiezen. Bij bevestigen controleert de opslag opnieuw;
een tussentijds toegevoegde afspraak voorkomt zo het opslaan van overlap. Aansluitende
afspraken zijn toegestaan. Hele-dag- en meerdaagse afspraken worden meegenomen.
Onleesbare agendagegevens geven een melding en blokkeren de afspraakopslag.

Deze controle geldt uitsluitend voor afspraken in de app zelf. Gekoppelde agenda’s,
uitnodigingen, reistijd en pauzes zijn niet meegenomen. Een vrije suggestie betekent
daarom ‘vrij in de appagenda’. Taken zonder begintijd worden niet op overlap gecontroleerd.

**Plan mijn dag**: typ dit in hetzelfde invoerveld voor een bewerkbaar voorstel voor
vandaag. Open, nog ongeplande taken komen op volgorde van deadline (daarna prioriteit)
in vrije tijd binnen je planningsuren. De planner gebruikt de opgegeven taakduur of
30 minuten als die ontbreekt, blokken van maximaal twee uur en minstens tien minuten
pauze tussen blokken en afspraken. Hele-dag- en meerdaagse appafspraken blokkeren ook
tijd. Afgeronde taken en taken met lopende of toekomstige focusblokken worden overgeslagen.
Een verlopen deadline krijgt een waarschuwing; een taak blijft wel voorstelbaar voor vandaag.

Bewerk de begintijden en eindtijden of vink blokken uit. Niet passende minuten blijven
zichtbaar als ongepland; de planner schuift ze niet automatisch door naar morgen.
**Dagvoorstel bevestigen** controleert alle gekozen blokken opnieuw op overlap, pauzes,
taakwijzigingen, taakduur en de huidige dag en planningsuren. Het bewaart alle gekozen
blokken en het ontvangstbewijs samen, of helemaal niets. Taken worden niet afgevinkt.
Een nieuw verzoek voor dezelfde al ingeplande taken wordt geweigerd. Opnieuw proberen
na een verloren antwoord gebruikt dezelfde opdracht en maakt geen dubbele blokken.

**Annuleren** bewaart niets. **Nieuw dagvoorstel maken** ververst een nog niet ingediend
voorstel. Na een onzekere opslagpoging blijven de ingediende keuzes vaststaan tot het
opnieuw proberen; **Sluiten** draait een mogelijk al opgeslagen plan niet terug.
**Ongedaan maken** verwijdert het hele opgeslagen dagvoorstel uitsluitend wanneer alle
bijbehorende blokken nog ongewijzigd bestaan; de taken zelf blijven behouden.
Dit dagvoorstel gebruikt alleen de appagenda. De bestaande meerdaagse planner in Agenda
blijft afzonderlijk beschikbaar. Er is niets live uitgerold.

**Herplan de rest van vandaag** maakt een voorstel om toekomstige focusblokken van
vandaag te vervangen. Vaste afspraken, lopende blokken, afgeronde taken en reserveringen
op andere dagen blijven staan. Typ ook `Deze taak is nog niet af` om dit voorstel te
openen. Vul per taak de resterende minuten in en kies **Herbereken voorstel**. Verstreken
tijd wordt niet automatisch als gewerkt geteld. De resterende duur wordt pas bij
bevestiging opgeslagen en ook bij volgende dagvoorstellen gebruikt.

Bij `Dit overleg loopt een halfuur uit` wordt één eenduidige lopende of recent geëindigde
afspraak voorgesteld voor verlenging. Bij meerdere mogelijke afspraken kies je zelf:
open **Herplan de rest van vandaag**, kies de afspraak bij **Uitloop**, vul de minuten
in en herbereken. Een verlenging die een andere vaste afspraak raakt, wordt geweigerd.
Het wijzigingsoverzicht toont de te vervangen blokken en de verlenging. Ook taken
weglaten vereist herberekenen: hun bestaande blokken blijven dan behouden.

Een herplanning wordt in één keer opgeslagen, inclusief de resterende taakduur,
eventuele uitloop en het ontvangstbewijs. Blokken zonder passend tijdvak blijven
zichtbaar als ongepland; na expliciete bevestiging kunnen hun oude tijdvakken vervallen.
Ongedaan maken herstelt het oude schema, de vorige resterende minuten en de oorspronkelijke
afspraaktijd. Dat kan alleen als alle betrokken gegevens ongewijzigd zijn en er bij het
herstellen geen overlap met nieuwere afspraken of tekort aan pauze ontstaat.

### Bestandsgereedschap

Open **Instellingen › Thuis en handig › Bestandsgereedschap**. Deze pagina verwerkt
een upload op de appserver, zonder bestanden naar een externe dienst te sturen.
Ze gebruikt geen openbare Supabase-tabellen, fictieve downloadlinks of gesimuleerde
betalingen. De bestaande winkel-, betaal- en agendafuncties blijven afzonderlijk beschikbaar.

- **Comprimeren:** maakt een echt downloadbaar gzipbestand. De bestandsinhoud blijft
  behouden; de gemeten grootte en SHA-256 van het origineel worden getoond. Gzip kan
  lege of al gecomprimeerde bestanden juist groter maken; dat wordt expliciet gemeld.
- **Video knippen:** kies begintijd en fragmentduur voor MP4/MOV. De uitvoer is een
  downloadbare MP4, maximaal 60 seconden en 720p, opnieuw gecodeerd naar H.264/AAC.
  Dit is geen verliesloze video-optimalisatie. FFmpeg en FFprobe zijn vereist;
  `packages.txt` bevat hiervoor `ffmpeg`. Tijdelijke bestanden zijn per bewerking
  gescheiden en worden ook na een fout opgeruimd. Er is een verwerkingstimeout.
- **CSV analyseren:** UTF-8, maximaal 2 MB, 50.000 rijen en 100 unieke kolommen.
  Statistieken gebruiken alle gegevensrijen; het voorbeeld en de grafiek maximaal
  de eerste 200. Lege en niet-numerieke velden worden apart geteld. De analyse is
  als JSON te downloaden. Decimale punt en komma worden ondersteund zonder
  duizendtalscheiding. Er wordt geen datumnotatie afgeleid.

Uploads zijn maximaal 10 MB. Resultaten blijven in de huidige sessie beschikbaar
na een schermverversing. Een ander bestand of andere bewerkingsinstellingen wissen
het oude resultaat. Accountwisseling en **Bestand en resultaat wissen** ruimen de
resultaatstatus op. Er wordt geen permanente opslag, publieke relay of vervaltijd
beloofd; download het resultaat voordat je de sessie beëindigt.

### Tijdgebonden actielinks als accountconcept

Typ `Maak link voor PT sessie van 45 euro geldig voor 2 dagen` in het centrale
invoerveld. Er verschijnt een bewerkbaar voorstel voor titel, prijs en geldigheid.
De prijs is verplicht, wordt in gehele centen opgeslagen en krijgt geen fictieve
commissie. Een sessieduur zoals ‘training van 1 uur’ blijft onderdeel van de titel;
geef de geldigheid expliciet op met ‘geldig voor’ of ‘voor 2 dagen’. De standaard
geldigheid is zichtbaar als 24 uur, met een maximum van zeven dagen.

Na **Concept opslaan** staat het concept bij **Instellingen › Kopen en verkopen ›
Actielinks (concepten)**. De accountinterne verwijzing `?actie=code` opent de conceptkaart
na inloggen. De code is willekeurig, geen korte hash van titel en tijd. De vervaldatum
wordt bij elke opening gecontroleerd; exact op de vervaldatum is het concept verlopen.
Je kunt het ook meteen intrekken. Een ander account kan de kaart niet openen.

Opnieuw proberen na een verloren antwoord maakt geen tweede concept en verlengt de
geldigheid niet. Er wordt niets gepubliceerd, aangekocht of overgemaakt. Er zijn
geen `os.to`-adressen, publieke verkooplinks of betaalpagina’s aangemaakt. Dit vormt
de lokale, testbare basis voor een eventueel later te bouwen openbare koppeling.

### Lokale hulpmiddelen voor controle

Met het controlescript kun je elk onderdeel afzonderlijk of alles na elkaar nalopen:

```sh
.venv/bin/python tools/planning_controle.py --onderdeel herplanning
.venv/bin/python tools/planning_controle.py --onderdeel bestanden
.venv/bin/python tools/planning_controle.py --onderdeel actielinks
.venv/bin/python tools/planning_controle.py --onderdeel alles
.venv/bin/python tools/planning_controle.py --database-container assistent-pg-test
```

Beschikbare onderdelen zijn `invoer`, `agenda`, `dagplan`, `herplanning`, `bestanden`, `actielinks` en `opslag`.
Het hulpmiddel controleert syntax, Git-witruimtefouten en regressietests. Het gaat na
een testfout door met de overige onderdelen en eindigt met een foutstatus als iets
mislukt. Zonder geïsoleerde PostgreSQL-testcontainer worden de databasecontroles
uitdrukkelijk als overgeslagen gemeld. Er worden geen plugins geïnstalleerd en geen
productiedatabases of externe agenda’s benaderd.
Bij `Plan overleg morgen` vraagt de assistent naar de begintijd. Antwoord in hetzelfde
invoerveld, bijvoorbeeld `10:00`; titel en datum blijven behouden. Ook ontbrekende
titels of datums worden apart uitgevraagd. Typ `annuleren` of gebruik de knop om
te stoppen zonder iets op te slaan. Een nieuwe opdracht vervangt een onafgemaakte
opdracht; een vrije vraag verlaat de opdracht en gaat naar de bestaande AI-assistent.

Na bevestiging verschijnt **Ongedaan maken**. Dat verwijdert uitsluitend het door die
opdracht gemaakte, ongewijzigde item. Een intussen aangepaste of ingeplande taak
blijft behouden. Opnieuw proberen na een verloren antwoord maakt de verwijdering
niet dubbel. Een nieuw gesprek sluit open voorstellen en de directe ongedaan-knop;
opgeslagen items blijven staan. Open voorstellen en vervolgvragen zijn sessiegebonden.

De vroegere Universal OS-pagina verwijst nu naar het assistentgesprek. Typen,
microfoon en Siri gebruiken dezelfde router. Korte natuurlijke invoer zoals
`morgen 9u tandarts` krijgt ook eerst een voorstel. Bestaande snelle uitgaven blijven
werken. De laatste 100 opdrachtberichten worden binnen de accountgegevens bewaard;
de zichtbare gemengde gesprekshistorie en de AI-context leven in de huidige sessie.
Berichten worden niet automatisch geanonimiseerd.

Vaste Nederlandse opdrachtpatronen werken zonder AI-tegoed. Vrije vragen worden
in hetzelfde gesprek door de bestaande assistent verwerkt en vereisen diens sleutel.
De app heeft geen eigen
saldo, blockchain of betaalrekening en voert geen overboekingen uit. Bestaande
betalingen lopen via Bestellingen of Budget. Er worden geen transacties of
commissies gesimuleerd als echte betalingen.

Hosted opslag controleert binnen één databasetransactie of de gelezen gegevens
nog actueel zijn. Een verouderde kopie kan nieuwere wijzigingen niet overschrijven.
Universele opdrachten bewaren het item en het ontvangstbewijs samen; bij een conflict
wordt maximaal driemaal met verse gegevens geprobeerd. Dubbel bevestigen of opnieuw
proberen na een verloren antwoord maakt zo geen tweede item, ook bij meerdere
appservers. Bij overige schrijfacties vraagt de app na een conflict om opnieuw te
laden. Lokale bestandsopslag ondersteunt één appserver.

Na een onzekere opslagpoging blijft de ingediende inhoud vaststaan: **Opnieuw proberen**
gebruikt dezelfde opdracht. **Sluiten** draait een mogelijk al opgeslagen item niet
terug; controleer dan je agenda of takenlijst. Kloktijden die tijdens de zomer- of
wintertijdwisseling niet bestaan of dubbel voorkomen worden geweigerd.

**Voor een eventuele latere uitrol** (nu alleen code en lokale tests): voer eerst [sql/veilige_opslag.sql](sql/veilige_opslag.sql) uit in de Supabase
SQL Editor en werk daarna alle appservers naar deze versie bij. Plan hiervoor een
kort onderhoudsmoment: de migratie sluit het oude, onvoorwaardelijke schrijfpad af.
Oude appversies kunnen daarna niet meer opslaan. De nieuwe versie weigert hosted
opslag zolang de migratie ontbreekt; er is geen onveilige terugval. Bestaande gegevens
blijven behouden. Hiervoor is beheertoegang tot Supabase nodig; de openbare sleutel
van de app kan deze migratie niet uitvoeren.

Regressiecontroles: `.venv/bin/python -m unittest test_intenties test_agendacontrole test_dagplan test_herplanning -v`.
Databasecontroles gebruiken een geïsoleerde PostgreSQL-container en een tijdelijke
database; de Supabase-authenticatie wordt daarin nagebootst:

```sh
docker run --detach --rm --name assistent-pg-test --network none \
  -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17
# Wacht tot docker exec assistent-pg-test pg_isready -U postgres slaagt.
ASSISTENT_TEST_POSTGRES_CONTAINER=assistent-pg-test \
  .venv/bin/python -m unittest test_intenties test_agendacontrole test_dagplan test_herplanning test_veilige_opslag -v
docker stop assistent-pg-test
```

- Het adres en de code zijn openbaar, maar zonder je wachtwoord kan niemand je gegevens zien of je sleutel gebruiken. Kies dus een sterk wachtwoord.
- Wachtwoord vergeten? Claude kan het via Supabase opnieuw instellen (tabel private.gebruikers).
- De voorwaarden en privacyverklaring (teksten.py) zijn een concept: laat ze nakijken en vul een contactadres in.
- Kosten: Streamlit, Supabase en GitHub zijn gratis. Anthropic rekent per gebruik, meestal enkele centen per gesprek; zoeken op internet kost wat meer.
- Als de app een tijd niet gebruikt is, "slaapt" hij. Tik dan op de knop om hem te wekken; dat duurt even.
- Begin bij een nieuw onderwerp liefst een nieuw gesprek (knop onderaan); dat houdt het snel en goedkoop.

## Betalen via de app (Stripe)
- De betaalfunctie staat in `supabase/functions/betalen` (Supabase Edge Function, zonder JWT-controle; de functie controleert zelf naam en wachtwoord, en de handtekening van Stripe).
- De eigenaar zet de geheime Stripe-sleutel, het webhookgeheim en het adres van de app bij Instellingen › Account › 💳 Betalen via de app. Ze staan in de database (private.platform), nooit in de code.
- Webhook in Stripe: `https://lnjsekmlpjyiwdlzcowa.supabase.co/functions/v1/betalen`, gebeurtenissen `checkout.session.completed` en `checkout.session.async_payment_succeeded`.
- Kopersbescherming: € 0,50 + 3% per bestelling, betaald door de koper (aan te passen in private.platform).

## Slim inplannen, leerreeks en bieden

- **✨ Plan mijn taken in** (Agenda): open taken komen automatisch in vrije stukken van je agenda, vroegste deadline eerst, binnen de uren die je kiest (⚙️). Eerst een voorstel, pas na "Zet in mijn agenda" staan ze er als 🎯 focusblok. Vink je de taak af, dan verdwijnen de blokken die nog moesten komen. Bij een nieuwe taak geef je aan hoe lang hij duurt (`inplannen.py`).
- **🔥 Leerreeks** (Leren): elke dag je dagdoel halen (5 vragen, kaarten of herhalingen) bouwt een reeks op; op Vandaag komt 's avonds een seintje als je reeks in gevaar is (`opslag.leerreeks`).
- **💶 Bod doen** (Marktplaats): kopers bieden minstens de helft van de vraagprijs, de verkoper accepteert, wijst af of doet een tegenbod. Een akkoord geldt 48 uur: bestellen gaat dan voor de afgesproken prijs (`sql/biedingen.sql`, migratie `biedingen`).
- **⚡ Snel invoeren** (invoerveld onderaan): typ "morgen 9u tandarts in Ede" of "vrijdag belasting, 1 uur" en het staat meteen in je agenda of takenlijst, ook zonder Claude-tegoed. Met een tijd wordt het een afspraak (met soort en plaats), zonder tijd een taak. Vragen ("wat staat er morgen?") gaan gewoon naar de assistent. Daarna kun je het ongedaan maken of het toch aan de assistent vragen (`snelinvoer.py`).
- **🗣️ Siri en 🏠 Apple Woning** (Instellingen › Koppelingen): een opdracht "Assistent" in de app Opdrachten opent de app met `?zeg=<wat je zei>`; afspraken en taken komen er meteen in, vragen gaan naar de assistent. "Ingelogd blijven op dit apparaat" bewaart een apparaatsleutel in Safari (`onthouden.py`, `sql/apparaten.sql`, migratie `apparaten`), zodat Siri geen inlogscherm krijgt. Woning-scènes zijn opdrachten met dezelfde naam; de app toont knoppen (`shortcuts://run-shortcut?name=...`, `woning.py`) en de assistent zet ze klaar met `woning_bedienen`. Google Home en Gemini: nog geen open koppeling; later via een thuis-hub.
- **Rustige indeling**: bovenaan vier vaste knoppen (Vandaag, Agenda, assistent, Instellingen). Instellingen toont alle onderdelen als tegels in drie groepen (Kopen en verkopen, Leren en werk, Thuis en handig) en daaronder vier tegels voor de voorkeuren (Assistent, Weergave, Koppelingen, Account). Strakke iconen (Material) in plaats van emoji's. De agenda heeft één rij knoppen (Nieuw, Inplannen); ideeën, sport en tijd staan samen onder "Meer". `.streamlit/config.toml` zet een rustig kleurthema en verbergt de ontwikkelaarsknoppen.

**Documenten** (tegel in Instellingen › Leren en werk): documenten maken en bewerken met opmaak (kopjes, vet, lijstjes, afvinklijstjes, links, foto's). Alles wordt vanzelf bewaard in de database, dus het werkt op elk apparaat met een browser (iPad, iPhone, Mac, Windows). Een open scherm haalt wijzigingen van een ander apparaat vanzelf op; bij gelijktijdige wijzigingen kies je de nieuwste, die van jou of allebei. Eerdere versies (30 per document), prullenbak, importeren (Word, PDF, tekst) en downloaden als Word, PDF of tekst. De assistent kan documenten maken, lezen en aanvullen. Editor: Quill 2 via jsDelivr (editor.py). SQL: sql/documenten.sql. PDF met fpdf2; packages.txt installeert DejaVu-lettertypen voor €-teken en schuine letters.

## Je eigen agenda koppelen

Instellingen › Koppelingen › Agenda's. De app leest je afspraken alleen (wijzigen doe je in je eigen agenda) en
toont ze in Vandaag en Agenda; de assistent plant eromheen.
- Apple: Apple ID plus een app-specifiek wachtwoord (account.apple.com › Inloggen en beveiliging).
- Google: in Google Agenda › Instellingen › je agenda › Geheim adres in iCal-indeling.
- Outlook: Instellingen › Agenda › Gedeelde agenda's › Een agenda publiceren › ICS-link.
Afspraken worden 5 minuten onthouden (agendas.py); "Nu vernieuwen" haalt ze meteen opnieuw op.

## Budget, beleggen en ochtendoverzicht

- Budget (budget.py, geld_scherm.py, sql/budget.sql = migratie "budget"): bankafschrift (CSV van ING, Rabobank,
  bunq, SNS/ASN/RegioBank; TXT van ABN AMRO) inlezen, categorieën herkennen, budgetten, vaste lasten, spaardoelen.
  Typ onderaan "€12,50 lunch" om snel een uitgave toe te voegen.
- Beleggen (beleggen.py): portefeuille en volglijst met koersen van Yahoo Finance. Alleen meekijken, nooit handelen.
- Ochtendoverzicht op Vandaag ('s ochtends, of via ?ochtend=1 vanuit een iPhone-automatisering), met voorlezen.

## Takenlijst en inspreken

- Agenda › Taken: alle taken op volgorde (te laat, vandaag, deze week, later). "Uit mijn mail" laat de assistent
  nieuwe mail lezen en taken voorstellen (mailtaken.py, slim.taken_uit_mail); jij vinkt aan wat erop komt en ze
  worden meteen in vrije tijd in je agenda gezet. Nagekeken mails worden onthouden.
- Inspreken: de microfoon zit in het invoerveld onderaan, naast het pijltje (spraak.microfoon). Onder het laatste
  antwoord staat een knop Voorlezen.

## Facturen, verwacht en bankkoppeling

- **Facturen**: de assistent haalt rekeningen uit je mail (bedrag, vervaldatum, rekeningnummer, betaallink). Ze staan in Budget › Facturen. Per factuur één knop *Betalen*: link uit de mail of rekeningnummer om te kopiëren, *Ik heb betaald* en *Later herinneren* (komt in je agenda). De app betaalt nooit zelf. Staat het bedrag later op je afschrift of komt het via de bank binnen, dan gaat de factuur vanzelf op betaald.
- **Verwacht**: Budget › Verwacht laat zien wat er de komende 14 tot 90 dagen binnenkomt en afgaat (open facturen, vaste lasten, vaste inkomsten) en, als je saldo bekend is, wanneer je krap komt te zitten.
- **Bank koppelen** (Enable Banking, alleen lezen): de eigenaar maakt één keer een applicatie aan op enablebanking.com, met als redirect-URL het adres van de app, en zet het application ID en de .pem-sleutel in Budget › Bank. De sleutel gaat naar de database en wordt alleen gelezen door de Edge Function `bank` (supabase/functions/bank). Daarna kiest iedere gebruiker zijn bank, logt daar in en komt terug in de app. Nieuwe regels komen elke paar uur vanzelf binnen zolang de app open is. SQL: sql/bank.sql.


### Activiteitenoverzicht

Via **Instellingen → Thuis en handig → Activiteitenoverzicht** zie je opgeslagen
assistentopdrachten en conceptactielinks binnen je huidige account. Zoek op tekst,
filter op onderdeel/status en download de selectie als JSON. De weergave bevat
maximaal 25 activiteiten per pagina. Ongedaan maken vraagt een expliciete keuze
en gebruikt de bestaande opslagcontroles tegen gewijzigde gegevens.

Nieuwe taak-, afspraak- en planningsontvangstbewijzen bewaren het UTC-tijdstip,
de aantallen taken/afspraken in de gebruikte opslagversie en de beperkingen.
De pagina toont tijden in Europe/Amsterdam. Externe agenda’s, uitnodigingen en
reistijd vallen buiten de beschikbaarheidscontrole. Oudere ontvangstbewijzen
krijgen geen verzonnen tijdstip of herkomst. Gewijzigde of verwijderde resultaten
en verlopen/ingetrokken conceptlinks krijgen een actuele status. Dit is geen
volledig auditlog: losse gesprekken, onopgeslagen voorstellen, bestandsbewerkingen
en mislukte pogingen worden niet opgenomen. Er is niets gepubliceerd.

Gerichte controle: `.venv/bin/python tools/planning_controle.py --onderdeel activiteiten`.


### Herbruikbare sjablonen

Via **Instellingen → Thuis en handig → Sjablonen** bewaar je maximaal 100
accountgebonden sjablonen: taken, afspraken, conceptaanbiedingen, werkdagplanning
en de CSV-analyse. Begin leeg of neem titel, duur, locatie en/of prijs over uit
een opgeslagen assistentopdracht of conceptactie. Datum, deadline, resultaat-ID,
linkcode en bestanden worden niet gekopieerd. Voor CSV is het sjabloon een
snelkoppeling naar het bestaande gereedschap; er zijn geen extra analyseparameters.

Bij gebruik kies je voor afspraken opnieuw datum en tijd; voor taken een
optionele deadline. Daarna verschijnt het bestaande bewerkbare voorstel, met
dezelfde beschikbaarheids-, opslag- en bevestigingscontroles. Een werkdagvoorstel
wordt opnieuw berekend met de actuele gegevens en ingestelde planningsuren. Een
conceptaanbieding krijgt pas na bevestiging een nieuwe code en geldigheidsperiode.
CSV vereist opnieuw een upload en een klik op Verwerken. Sjablonen opslaan voert
geen opdracht uit. Verwijderen vraagt bevestiging en weigert een inmiddels
gewijzigde sjabloonversie. Bij een onzekere opslag gebruikt opnieuw proberen
hetzelfde ID en dezelfde inhoud. Sjablooninstellingen kun je per gebruik aanpassen
in het voorstel; een ander vast sjabloon maak je als nieuw sjabloon.

Gerichte controle: `.venv/bin/python tools/planning_controle.py --onderdeel sjablonen`.
De databasecontroles gebruiken alleen de expliciet opgegeven lokale testcontainer.


### Taakafhankelijkheden en capaciteit

Via **Instellingen → Leren en werk → Taken en capaciteit** stel je in welke
taken eerst afgerond moeten zijn. Dagplanning, herplanning en de bestaande
meerdaagse taakplanner plannen een geblokkeerde taak niet in. Een tijdvak
reserveren voor een voorganger geldt niet als afronden. Ook bij bevestiging
wordt de actuele status opnieuw gecontroleerd. Zelfverwijzingen, kringverwijzingen
en nieuwe verwijzingen naar verwijderde taken worden geweigerd. Een bestaande
verwijzing naar een later verwijderde taak blijft zichtbaar als blokkade tot je
haar uit de selectie haalt. Sjablonen nemen deze taak-ID’s niet over.

Afhankelijkheden opslaan verplaatst geen afspraken. Je kunt een al ingeplande
taak pas met een onafgeronde voorganger blokkeren nadat haar lopende/toekomstige
blokken via Agenda zijn verwijderd. De opslag weigert verouderde bewerkingen
en probeert een schrijfconflict maximaal drie keer opnieuw.

Het capaciteitsoverzicht kijkt 1, 7, 14 of 31 dagen vooruit. Het telt vrije tijd
binnen de planningsuren, voegt overlappende afspraken samen en houdt rekening
met hele dagen, weekendinstellingen en pauzes rond bestaande afspraken. Per
deadline wordt minimaal tijdtekort berekend; zonder deadline telt werk mee op
het eind van de gekozen periode. Werk na die periode valt buiten het overzicht.
Resterende minuten gaan vóór de oorspronkelijke taakduur; ontbrekende duren
worden zichtbaar op 30 minuten geschat. Toekomstige reserveringen voor dezelfde
taak worden zonder dubbeltelling gecrediteerd, tot maximaal de resterende duur.
Verstreken deadlines en geblokkeerde taken krijgen een eigen waarschuwing.

Vrije tijd is een bovengrens: pauzes tussen nieuwe focusblokken en de mogelijkheid
om lange taken in losse gaten te plaatsen zijn nog niet afgetrokken. Geen
aangetoond tijdtekort betekent dus niet dat alles past. Alleen de opgeslagen
appagenda telt mee; externe agenda’s, reistijd en uitnodigingen zijn niet
gecontroleerd. In dagvoorstellen en bij het bestaande Inplannen staat eveneens
een uitklapbaar capaciteitsoverzicht. Berekenen schrijft niets weg.

Gerichte controle: `.venv/bin/python tools/planning_controle.py --onderdeel werkdruk`.


### Bronnen bij werk

**Instellingen → Leren en werk → Bronnen bij werk** koppelt notities,
resultaatsamenvattingen, HTTPS-webverwijzingen, eigen clouddocumenten en
cloudbestanden aan opgeslagen taken of afspraken. Een cloudbron wordt gekozen
uit de eigen zoekresultaten; toegang wordt bij koppelen en openen opnieuw door
de bestaande dienst gecontroleerd. Bij cloudbestanden wordt alleen het ID
bewaard, nooit de tijdelijke downloadlink. Deze cloudroutes zijn lokaal met
gemockte diensten getest; echte cloudtoegang is niet uitgevoerd.

**Bestandsgereedschap → CSV analyseren** kan na een expliciete keuze een
samenvatting koppelen: rijaantal, kolomnamen en maximaal tien kolomstatistieken.
Geen ruwe rijen of uploadinhoud worden daarbij opgeslagen. Lange samenvattingen
worden beperkt tot bestandsnaam en aantallen; het volledige rapport blijft
downloadbaar. Opslag is herhaalbaar met hetzelfde opdracht-ID, identieke
koppelingen worden samengevoegd en verwijderde koppelingen worden niet door een
late herhaling teruggezet. Er gelden maximaal 100 bronnen per doel en 1000 per
account. Zoekfilters en paginering tonen maximaal 25 bronnen tegelijk.
Verwijderde doelen blijven herkenbaar; verwijderen van een koppeling verwijdert
nooit het oorspronkelijke document, bestand of de taak/afspraak.

### Planningback-up en herstel

**Instellingen → Thuis en handig → Planningback-up en herstel** exporteert
uitsluitend taken, opgeslagen afspraken en sjablonen naar een JSON-bestand met
formaatversie 1 en SHA-256-controlesom. Geen accountinstellingen, accountgeheimen,
betalingen, cloudbestanden, documenten, bronkoppelingen, herhaalregels of
gesprekken. Titels en notities zijn persoonlijke gegevens en worden wel
meegenomen; de export is geen volledige accountback-up en is niet versleuteld.
Een controlesom detecteert wijzigingen maar bewijst geen afzender. Historische
afspraken waarvan de taak al is verwijderd worden als losse afspraken
geëxporteerd. Herstel van herhalende afspraken neemt alleen de opgeslagen
afspraakinstanties mee, niet de herhaalregel.

Upload is begrensd op 5 MB, 10.000 records, 100 sjablonen en vijftien niveaus
JSON-nesting. Dubbele JSON-velden, ongeldige schema’s, cyclische/ontbrekende
taakverwijzingen, ongeldige tijden en controlesommen worden geweigerd. Ontbrekende
voorgangers moeten eerst via Taken en capaciteit worden hersteld.

Een herstelvoorbeeld toont aantallen vóór en na toevoegen en waarschuwt dat
afspraken dubbel kunnen staan of overlappen. Bevestigen voegt toe met nieuwe
IDs en vertaalt taakafhankelijkheden en focusverwijzingen mee. Bestaande gegevens
blijven behouden; er wordt niets opnieuw gepland. Alle wijzigingen worden in
één opslagactie geschreven. Gewijzigde gegevens na het voorbeeld blokkeren
herstel totdat een nieuw voorbeeld is gemaakt. Herhalen van dezelfde opdracht
na een verloren antwoord voegt niets dubbel toe. Een tweede, nieuw bevestigd
herstelvoorbeeld is een nieuwe toevoeging; dit is geen automatische samenvoeging
op titel. Onzekere aanvragen houden hun inhoud vast.

Back-upinhoud, herstelvoorbeelden, bronselecties en uploadresultaten worden bij
accountwisseling uit hun nieuwe sessievelden verwijderd. De knop om back-updata
te wissen reset ook de upload. De nieuwe schermen gebruiken zichtbare tekstlabels
en formulieren met bevestiging. De bestaande taakmenuknop heet nu Taakopties.
Dit vervangt geen volledige handmatige audit op mobiel of met een schermlezer.

Gerichte controles: `tools/planning_controle.py --onderdeel backup` en
`tools/planning_controle.py --onderdeel bronnen` (uitvoeren met `.venv/bin/python`).
De databasecontroles testen daarnaast gelijktijdig herstel, gelijktijdige
bronkoppelingen en accountscheiding in een geïsoleerde lokale PostgreSQL-database.
De twintig concrete verbeterpunten staan in [VERBETERINGEN_20.md](VERBETERINGEN_20.md).


### Controle op 100 verbeterpunten en extra gereedschap

De genummerde controlepunten staan in `tools/audit_100.json`: 90 concrete,
afzonderlijke testbewijzen en 10 expliciet open controles waarvoor lokale tests
niet voldoende zijn. `tools/audit_100.py` maakt `AUDIT_100.md` en een JSON-rapport
op basis van dezelfde testuitvoering. Het controleert bronvingerafdrukken; na
een bronwijziging krijgt oud testbewijs geen groene status. Overgeslagen tests
blijven overgeslagen. De controle is afgebakend op werk, planning, bestandsbewerking,
opslag en herstel, met expliciete open punten voor externe diensten en handmatige
controles. Dit is geen certificering van alle apponderdelen of bewijs van 100
nieuwe opgeloste fouten.

**Nieuwe functies:**

- Instellingen → Leren en werk → Zoeken in mijn werk: zoeken in eigen taken,
  afspraken, bronnen en sjablonen; accent- en hoofdletterongevoelig, meerdere
  zoekwoorden, onderdeel- en statusfilter, 25 resultaten per pagina en JSON-export.
  Maximaal 1000 zoekresultaten worden opgenomen; een melding vraagt om verfijning.
  Er is geen gedeelde zoekindex of cache met accountinhoud.
- Instellingen → Thuis en handig → Controle van mijn werkgegevens: leescontrole
  op dubbele IDs, ontbrekende voorgangers, taakcycli of afhankelijke wachtketens,
  ongeldige deadlines/duren, overlappen, verdwenen focustaken, ongeldige sjablonen,
  verweesde bronnen en een achtergelopen ID-teller. Alleen codes en numerieke
  verwijzingen komen in de download; geen titels, notities of accountgeheimen.
  De controle repareert niets. Onleesbare gegevens en limieten worden vermeld;
  maximaal 200 meldingen en maximaal 20.000 records per verzameling. Bij overlap
  wordt per afspraak één gevonden overlap gemeld, niet iedere mogelijke combinatie.
- Planningback-up en herstel: kies afzonderlijk taken, afspraken en/of sjablonen
  voor export en herstel. Bij alleen afspraken worden verwijzingen naar niet
  meegenomen taken verwijderd. De controlesom wordt voor de selectie opnieuw
  berekend en alle bestaande herstelcontroles blijven gelden.

**Verbeterde bestaande code:** de meerdaagse taakplanner bewaart alle focusblokken
nu in één opslagactie, controleert de actuele taakstatus, resterende duur,
planningsuren, deadlines, overlap en pauzes opnieuw, en gebruikt een ontvangstbewijs
tegen duplicaten na een verloren antwoord. Ongedaan maken verwijdert uitsluitend
ongewijzigde blokken; herhalen zet een teruggedraaide planning niet opnieuw terug.
Lopende blokken tellen al als ingepland. Hele dagen en UTC-afspraken worden naar
Nederlandse tijd omgerekend. De standaardklok gebruikt Europe/Amsterdam.

Lokale opslag gebruikt een uniek tijdelijk bestand met beperkte bestandsrechten,
flush/fsync en atomisch vervangen; een schrijffout laat het oude bestand intact
en verwijdert tijdelijke bestanden. Beschadigde JSON, dubbele velden en niet-eindige
getallen geven een gerichte fout en worden niet automatisch gereset. Dit maakt
lokale opslag niet geschikt voor meerdere onafhankelijke serverprocessen; voor
online gebruik blijft de database met CAS nodig.

**Lokale tools:**

```sh
.venv/bin/python tools/planning_controle.py --database-container NAAM --rapport-json controle/testresultaten.json
.venv/bin/python tools/audit_100.py --resultaten controle/testresultaten.json
.venv/bin/python tools/omgeving_controle.py --uitvoer controle/omgeving.json
.venv/bin/python tools/werkdata_controle.py PAD_NAAR_LOKALE_JSON --uitvoer controle/werkgegevens.json
```

De testrunner controleert syntax van alle Python-bestanden die `rg` in het project
vindt en exporteert desgewenst teststatus plus bronvingerafdrukken, zonder testinhoud
of tracebacks. De omgevingstool controleert geïnstalleerde pakketvereisten en de
beschikbaarheid van FFmpeg/FFprobe zonder netwerk of credentials. Dit is geen
kwetsbaarhedenscan tegen een actuele CVE-database. De werkdatatool leest uitsluitend
het opgegeven bestand, weigert overschrijven daarvan en voert geen reparaties uit.
De gegenereerde lokale rapporten staan onder `controle/`.

Laatste volledige lokale uitvoering voor deze uitbreiding: **189 tests geslaagd,
0 overgeslagen**, inclusief 22 PostgreSQL-integratietests. De syntaxcontrole
behandelde 124 Python-bestanden. Het 100-puntenrapport bevat **90 geslaagde lokale
controlepunten en 10 open punten**, met een actuele bronvingerafdruk. De lokale
omgevingscontrole vond geen pakketconflicten en vond FFmpeg en FFprobe. Er is
niets uitgerold of aan externe accounts gewijzigd.


### Nieuwe interface: map- en toolcontrole

De zeven mappen gebruiken nu één catalogus in `gereedschappen.py`, met 35
hoofdgereedschappen (routes). Dezelfde gegevens voeden navigatie, favorieten,
bovenbalk en beschikbaarheidsinformatie. **Instellingen → Alle gereedschappen**
(of **Zoek tools in alle mappen**) toont een zoekbaar overzicht met mapfilter,
beschikbaarheidsfilter en JSON-download. Tools die een online account of een
ander accounttype vereisen, blijven herkenbaar met uitleg. De catalogus regelt
zichtbaarheid en vervangt geen backendautorisatie.

Elke map blijft zichtbaar. Een lege map toont waarom eigen tools ontbreken en
biedt passende gedeelde hulpmiddelen. Nieuwe werktools kunnen nu als favoriet of
bovenbalkitem worden opgeslagen. Beschadigde of dubbele voorkeuren worden veilig
gefilterd; accountwisseling wist de widgets van de vorige voorkeurenselectie.
Cursussen volgen de module Leren, niet het aan- of uitzetten van Chat.

De mobiele bovenbalk gebruikt korte, herkenbare labels, mag naar een tweede regel
en houdt klikdoelen van minimaal 44 pixels hoog. Instellingen heeft een zichtbare
naam. Tegels stapelen icoon en titel, zodat lange woorden beter passen. De naam
Bestandtools verwijst naar het bewerkingsgereedschap en blijft onderscheiden van
de cloudmap Bestanden.

**1000 controles betekent hier 1000 concrete configuratiescenario’s**, geen 1000
gevonden fouten: lokaal/online × vier accounttypen (inclusief onbekend) × 25
combinaties van uitgeschakelde modules × vijf voorkeurvarianten. De echte
`paginas()`-functie wordt uitgevoerd met afgeschermde callbacks; alle routes,
zichtbaarheidsgrenzen, groepsvolgorde, voorkeuren, badges en mapdekking worden per
scenario gecontroleerd. Een aparte broncontrole verifieert alle callbacknamen.
De details staan in `INTERFACE_CONTROLE_1000.md` en `controle/interface_1000.json`.

Nieuwe lokale ontwikkeltools:

```sh
.venv/bin/python tools/planning_controle.py --onderdeel interface
.venv/bin/python tools/interface_controle.py --resultaten controle/testresultaten.json --browser controle/interface/browsercontrole.json
```

Een browserpreview kan uitsluitend met aparte testgegevens onder `/tmp` en zonder
externe pagina-inhoud, echte login of achtergrondtaken worden gestart:

```sh
ASSISTENT_LOKAAL=1 ASSISTENT_INTERFACE_DATA=/tmp/assistent-preview/data.json .venv/bin/python -m streamlit run tools/interface_lokaal.py --server.address=127.0.0.1 --server.port=8511 --server.headless=true --browser.gatherUsageStats=false
```

De browsercontrole gebruikt een aparte lokale Chromium met CDP op 127.0.0.1:9227.
`tools/interface_browser_controle.py` controleert desktop 1440×1000 en mobiel
390×844, blokkeert verzoeken buiten de preview en bewaart screenshots en
bronvingerafdrukken in `controle/interface/`. Vereist Chromium en de lokaal
beschikbare Python-module websockets; er is geen productiedependency toegevoegd.
Deze controle is geen echte Safari-/Android-test en geen volledige schermlezeraudit.
`tools/interface_controle.py` weigert oud of ontbrekend test-/browserbewijs als
actueel geslaagd te presenteren. Er is geen aanmeldroute in de productieapp
omzeild of aangepast.

Uitvoering van deze interfacecontrole: **1198 tests geslaagd, 0 overgeslagen**,
inclusief de 1000 configuratiescenario’s en 22 PostgreSQL-integratietests. Alle
131 Python-bestanden zijn op syntax gecontroleerd. Drie lokale Chromium-
browserscenario’s slagen; de screenshots staan onder `controle/interface/`.
Het bestaande 100-puntenrapport is opnieuw gemaakt en houdt 10 externe of
handmatige controles expliciet open. Zie ook `NIEUWE_INTERFACE_VERBETERINGEN.md`.
De tijdelijke preview, aparte browser en testdatabase zijn na controle gestopt.


### Diepgaande controle en hardening

`VERDIEPING_EN_CORRECTIES.md` beschrijft de concreet aangetoonde problemen en
correcties van deze ronde. De nieuwe 30.000-gevallencontrole combineert 15
reproduceerbare families met onafhankelijke rekenregels en terugleescontroles.
Het aantal gevallen is geen aantal gevonden fouten en vervangt geen volledige
app- of dienstverificatie. Gerichte regressies staan in `test_verdieping.py`.

De zakelijke centconversie, cursusprijzen en handmatige budgetbedragen zijn
verhard met Decimal-afronding en weigering van onleesbare of niet-eindige invoer.
Er worden geen historische financiële records aangepast en er is niets live
geboekt of gepubliceerd. De zoekfunctie houdt alleen de gekozen 25/100/500/1000
resultaten vast, geeft een correcte totaaltelling en exporteert geen geneste
onleesbare datum- of tekstobjecten. Nieuwe tekstgrenzen weigeren NUL/andere
onveilige controletekens en losse Unicode-surrogaten, met behoud van normale
meertalige tekst en toegestane notitieregels. Klokwisselingen worden voor
conceptgeldigheid als UTC-duur behandeld; ambigue naïeve afspraakklokken
worden niet als bewezen vrije of bezette instanten gebruikt.

Nieuwe lokale commando’s:

```sh
.venv/bin/python tools/diepte_controle.py
.venv/bin/python tools/diepte_controle.py --familie geld_halve_cent --geval 17
.venv/bin/python tools/planning_controle.py --onderdeel verdieping
.venv/bin/python tools/bron_review.py
```

De bronreview maakt een Python-bronkaart en syntaxcontrole van lokale JavaScript-
en inline scripts. Brede uitzonderingen en dynamische code worden als
beoordelingslocaties genoemd, niet automatisch als fouten. De tool voert die
code niet uit en toont geen bronregels of stringwaarden. De diepcontrole schrijft
geen appgegevens en benadert geen diensten. Alle testgevallen, seeds, hashes en
uitkomsten staan in `controle/diepte_30000.json`; de leesbare samenvatting staat
in `DIEPTECONTROLE_30000.md`. De eerder benoemde open controles blijven open.

Laatste uitvoering van deze verdiepingsronde: **30.000 invariant-/grensgevallen
geslaagd**, naast **1215 regressie- en integratietests zonder skips**, waaronder
22 PostgreSQL-integratietests. De bronreview parseerde 137 Python-bestanden en
vond zes geldige JavaScript-/inline-scripts. Drie lokale Chromium-scenario’s
slaagden opnieuw. De negen vooraf vastgelegde gerichte afwijkingen zijn na de
correcties opnieuw gecontroleerd: `controle/bevindingen_30000_na.json`. Brede
uitzonderingen en grote functies blijven afzonderlijke reviewkandidaten; de
tien eerder benoemde externe/handmatige controles blijven open. Er zijn geen
productiegegevens, betalingen of externe publicaties gewijzigd.

## Werkdossier en integratiecontrole

Zoeken, taken, eigen afspraken en bronnen openen nu hetzelfde werkdossier.
Daar staan de samenhang, gekoppelde bronnen en recente ontvangstbewijzen bij
elkaar. Vanuit het dossier kun je een bron of sjabloon voorbereiden; toevoegen
blijft een afzonderlijk bevestigde handeling. De catalogus bevat nu 36 tools.

Planningback-up v2 kan optioneel gekoppelde notities en HTTPS-links meenemen.
Herstel geeft records nieuwe IDs en bewaart de onderlinge verwijzingen in één
opslaghandeling. Cloudbestandsverwijzingen en accountconfiguratie worden niet
meegenomen. De standaardexport zonder bronnen blijft v1; oude back-ups blijven
bruikbaar. Bevestigd herstel is ook zichtbaar in het activiteitenoverzicht.

De wijzigingen, grenzen en herhaalcommando’s staan in
[INTEGRATIE_EN_WERKSTROMEN.md](INTEGRATIE_EN_WERKSTROMEN.md).
De laatste integratieronde slaagde voor **100.000 reproduceerbare synthetische
testgevallen**, **1232 regressie- en integratietests zonder skips**, waaronder
24 PostgreSQL-tests, en vier lokale Chromium-scenario’s. De 30.000 eerdere
grenstests en 1000 navigatieconfiguraties zijn eveneens opnieuw geslaagd.
De bronreview parseerde 143 Python-bestanden en zes JavaScript-/inline-scripts.
Dit zijn testuitkomsten, geen aantallen gevonden verbeterpunten of een
garantie voor alle externe diensten. Tien handmatige/externe auditpunten
blijven open. Er is niets live gezet.

```sh
.venv/bin/python tools/integratie_controle.py
.venv/bin/python tools/planning_controle.py --onderdeel integratie
```

Zie [INTEGRATIECONTROLE_100000.md](INTEGRATIECONTROLE_100000.md) voor de
twintig testfamilies en `controle/integratie_100000.json.gz` voor de gevalhashes,
bronhashes en uitkomsten zonder echte accountgegevens.

## Communicatie, privacy en privéprofiel

Het nieuwe communicatiecentrum staat bij **Instellingen → Thuis en handig →
Communicatie**, met ingangen bij Assistent en Account. Bewaar privéconcepten,
kies schrijfstijl en ondertekening, download je eigen communicatiegegevens of
ruim oude concepten expliciet op. De catalogus bevat daarmee 37 tools.

Typ in het assistentgesprek `communicatie`, `communicatieprivacy`,
`profielinstellingen` of `schrijf bericht: jouw tekst`. Dit opent het juiste
scherm zonder externe AI-aanvraag. Een concept wordt pas bewaard na bevestigen;
de module verstuurt geen berichten en verandert geen openbaar profiel.

Optionele externe schrijfhulp staat standaard uit. Na inschakelen controleer
je eerst het tekstvoorbeeld en geef je per aanvraag toestemming. Het aparte
AI-verzoek krijgt geen tools, geheugen, accountcontext of gesprekshistorie.
Maskering van e-mailadressen en nummerpatronen is een hulpmiddel; controleer
zelf het voorbeeld. Deze privacykeuzes gelden voor het communicatiecentrum,
niet voor alle bestaande mail-, chat- of profielkoppelingen.

Opslag beschermt tegen dubbele retries en verouderde formulieren. Wijzigingen
uit een andere sessie vereisen eerst herladen; tijdelijke formulieren worden
bij accountwisseling gewist. Zie [COMMUNICATIE.md](COMMUNICATIE.md) voor de
werking, privacygrenzen en controlecommando’s.
