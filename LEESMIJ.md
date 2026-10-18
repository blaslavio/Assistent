# Mijn assistent

Een persoonlijke assistent die je in Safari op je iPad of telefoon gebruikt. Je praat er gewoon Nederlands mee.

**Wat de app kan** (zes tabbladen; onderaan kun je altijd iets vragen aan de assistent)
- ☀️ **Vandaag**: zo rustig mogelijk: datum en weer, je dagschema dat vanzelf bijwerkt, je eerstvolgende afspraak met route en je taken. Wat er op staat, kies je bij ⚙️ Instellingen.
- 📅 **Agenda**: alles op één plek. Bij iets nieuws kies je de soort: afspraak, sport, uitgaan, etentje, werk, familie en vrienden, gezondheid, reizen of overig. Met 📲 zet je het in Apple Agenda met een melding op je vertrektijd. Onderaan (dichtgeklapt): ideeën in de buurt, sportdoelen en tijdsbesteding.
- 💬 **Assistent** (heeft tegoed bij Anthropic nodig): praat met 🎤 Praat en laat antwoorden voorlezen, met een stem naar keuze (Nederland of Vlaanderen, man of vrouw), ook handsfree. Antwoorden verschijnen woord voor woord. Zoekt op internet en vergelijkt opties, plant strak met je reistijd en gewoontes, en onthoudt je voorkeuren (te zien en te wissen bij ⚙️ Instellingen).
- 🛒 **Boodschappen**: lijst om af te vinken en de goedkoopste supermarkt bij jou in de buurt (open prijsgegevens van Checkjebon).
- 📚 **Leren en schrijven**: leerdoel met leerplan, overhoren met feedback en herhalingen op het juiste moment. Hulp bij scripties, verslagen en essays: onderzoeksvraag, opzet, planning in je agenda, echte wetenschappelijke bronnen (OpenAlex en Crossref) met APA-bronnenlijst, en feedback op je tekst (Word, pdf of getypt).
- ⚙️ **Instellingen**: hoe de assistent praat (past zich vanzelf aan jou aan), stem, wat hij over je weet, thuisadres, voorpagina en tabbladen, contacten, koppelingen, zelftest en uitloggen.

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
