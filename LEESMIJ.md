# Mijn assistent

Een persoonlijke assistent die je in Safari op je iPad of telefoon gebruikt. Je praat er gewoon Nederlands mee.

**Wat de app kan** (tabbladen bovenaan; de chat met de assistent staat onderaan)
- ☀️ **Vandaag**: weer, je eerstvolgende afspraak met reistijd en vertrektijd, route en reis delen, tijdregistratie (vertrek, aankomst, weg, terug), taken afvinken en toevoegen, sportresultaat invullen en herhalingen.
- 📅 **Agenda**: dag- of weekoverzicht, afspraken toevoegen, wijzigen en verwijderen, foto's, geluid en notities als herinnering, en met 📲 een afspraak in Apple Agenda zetten met een melding op je vertrektijd.
- 🏃 **Sport**: sportdoelen met voortgang, resultaten en weekoverzicht; trainingen uit Apple Gezondheid via Strava.
- 🎉 **Uitgaan**: uitjes (OpenStreetMap) en events (Ticketmaster) in de buurt, gesorteerd op je voorkeuren en op een kaart, met ticketlink.
- 📚 **Leren**: leerdoelen, herhalingen op het juiste moment en voortgang.
- ⚙️ **Instellingen**: thuisadres, contacten, Strava, Ticketmaster, Anthropic-sleutel, zelftest en uitloggen.
- 💬 **Assistent** (heeft tegoed bij Anthropic nodig): plant je dag, zoekt op internet, maakt leerplannen en sportschema's en regelt alles hierboven via de chat. Alle tabbladen werken ook zonder tegoed.

**Nog niet** (volgende stappen): koppeling met je mail, budget, markt en portfolio.

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
- Wachtwoord vergeten? Claude kan het via Supabase opnieuw instellen.
- Kosten: Streamlit, Supabase en GitHub zijn gratis. Anthropic rekent per gebruik, meestal enkele centen per gesprek; zoeken op internet kost wat meer.
- Als de app een tijd niet gebruikt is, "slaapt" hij. Tik dan op de knop om hem te wekken; dat duurt even.
- Begin bij een nieuw onderwerp liefst een nieuw gesprek (knop onderaan); dat houdt het snel en goedkoop.
