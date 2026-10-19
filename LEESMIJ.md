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
