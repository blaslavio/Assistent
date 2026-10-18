# Mijn assistent

Een persoonlijke assistent die je in Safari op je iPad of telefoon gebruikt. Je praat er gewoon Nederlands mee.

**Wat hij nu kan**
- Taken bijhouden ("Herinner me eraan mijn paspoort te verlengen vóór 1 november").
- Een eigen agenda bijhouden ("Zet tandarts op dinsdag om 10 uur in mijn agenda").
- Vakanties plannen: hij zoekt actuele informatie op internet en maakt een dagschema met kostenraming. Boeken doe je zelf.
- Leren: je noemt een onderwerp, hij maakt een leerplan, legt uit, overhoort je en houdt je voortgang bij. Herhalingen plant hij automatisch op het juiste moment.

**Nog niet** (volgende stappen): koppeling met je echte mail en agenda, budget, markt en portfolio.

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
1. Maak een account op [supabase.com](https://supabase.com) en maak een nieuw project (regio: Europa).
2. Open in het menu **SQL Editor**, plak dit en tik op **Run**:
   ```sql
   create table gegevens (id int primary key, data jsonb not null);
   alter table gegevens enable row level security;
   ```
3. Ga naar **Project Settings**, dan **API Keys**. Bewaar de **Project URL** en de **secret key** in je Notities.

### Stap 4. Streamlit: hier draait de app
1. Ga naar [share.streamlit.io](https://share.streamlit.io) en log in met je GitHub-account.
2. Tik op **Create app**, kies je repository `assistent` en als bestand `app.py`.
3. Open **Advanced settings** en plak bij **Secrets** (vul je eigen waarden in):
   ```toml
   ANTHROPIC_API_KEY = "jouw-anthropic-sleutel"
   APP_WACHTWOORD = "kies-een-goed-wachtwoord"
   SUPABASE_URL = "jouw-project-url"
   SUPABASE_KEY = "jouw-supabase-secret-key"
   ```
4. Tik op **Deploy**. Na een paar minuten krijg je een adres. Open het in Safari, tik op het deel-icoon en kies **Zet op beginscherm**. Dan staat hij als app op je iPad.

## Goed om te weten
- Het adres is openbaar, maar zonder je wachtwoord kan niemand iets zien of doen. Kies dus een sterk wachtwoord.
- Kosten: Streamlit, Supabase en GitHub zijn gratis. Anthropic rekent per gebruik, meestal enkele centen per gesprek; zoeken op internet kost wat meer.
- Als de app een tijd niet gebruikt is, "slaapt" hij. Tik dan op de knop om hem te wekken; dat duurt even.
- Begin bij een nieuw onderwerp liefst een nieuw gesprek (knop onderaan); dat houdt het snel en goedkoop.
