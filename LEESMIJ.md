# Mijn assistent

Een persoonlijke assistent die je in Safari op je iPad of telefoon gebruikt. Je praat er gewoon Nederlands mee.

**Wat de app kan** (een rustig menu bovenaan; op de telefoon via » linksboven; onderaan kun je altijd iets vragen aan de assistent)
- 🏠 **Vandaag**: je assistent groet je, met datum en weer, je dagschema dat vanzelf bijwerkt, meldingen (verkocht, bestellingen, berichten, gedeeld), je saldo op de marktplaats, je taken en korte seintjes. Wat er staat, kies je bij Instellingen › Voorpagina en menu.
- 📅 **Agenda**: alles op één plek, met een soort per afspraak (sport, uitgaan, etentje, werk en meer) en een melding op je vertrektijd via 📲. Dichtgeklapt onderaan: ideeën in de buurt, sportdoelen en tijdsbesteding.
- 💬 **Je assistent** (met de naam die je kiest): praten of typen, antwoorden worden voorgelezen; zoekt op internet, plant strak en onthoudt je voorkeuren. Naam en uiterlijk (avatar of eigen foto) kies je bij Instellingen.
- ⚙️ **Instellingen**: naam en uiterlijk van de assistent, hoe hij praat, stem, wat hij over je weet, thuisadres, voorpagina en menu, contacten, koppelingen (mail, Strava, Ticketmaster, Anthropic), je account, beheer (alleen de eigenaar) en uitloggen.
- **Werk en leren** (uitklapmenu):
  - ✉️ Mail: mails lezen, afspraken naar je agenda, antwoorden klaarzetten die jij verstuurt.
  - 📚 Leren en schrijven: leerdoelen met voortgangsbalk, oefentoetsen (meerkeuze, met uitleg), flitskaarten, mondeling overhoren, en hulp bij scripties en verslagen met echte wetenschappelijke bronnen. De app plant je herhalingen vanzelf.
  - 🤝 Projecten en delen: afspraken, taken, je boodschappenlijst en notities delen, en samen aan projecten werken.
  - 🔨 DIY en hobby: een plan met stappen, veiligheidstips, materialen met geschatte kosten en links naar winkels (Gamma, Praxis, Karwei, Hornbach, Action, Bol); zet materialen met één tik op je kooplijst of wenslijst.
  - 🧰 Hulpmiddelen: notities, een focustimer en een rekenhulp (ook btw, korting en procenten).
  - 📷 Foto scannen: maak of kies een foto; de assistent herkent producten, leest de tekst en zet afspraken, taken of producten op de goede plek. Gezichten worden bewust niet herkend.
- **Kopen en verkopen** (uitklapmenu): 🛒 Boodschappen (goedkoopste supermarkt), 🛍️ Kooplijst en ⭐ Wenslijst (prijzen vergelijken op internet, goedkoopste vooraan), en de marktplaats: 🔎 zoeken, 🏷️ verkopen, 🧾 bestellingen (ook je geboekte tijden) en 💬 berichten. Betalen kan via de app (Stripe, met kopersbescherming: het geld gaat pas naar de verkoper als de koper bevestigt dat alles goed is ontvangen) of buiten de app (Tikkie, overmaken, contant).

Wat je niet gebruikt, zet je uit bij Instellingen › Voorpagina en menu; dan verdwijnt het uit het menu.

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
