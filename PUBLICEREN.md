# De nieuwe webinterface publiceren

De actuele interface wordt uitsluitend uit `main` gebouwd. De vaste werkmap is `/workspace/Assistent`; `web/src` is de bewerkbare interfacebron. De oude Streamlit-link is geen bewijs dat deze versie gepubliceerd is. Het doeladres voor de nieuwe interface is `https://blaslavio.github.io/Assistent/app/`, maar dat adres is pas bruikbaar na een bevestigde Pages-publicatie.

## Eenmalige GitHub-instelling

Open `https://github.com/blaslavio/Assistent/settings/pages` en kies onder **Build and deployment → Source** voor **GitHub Actions**. De huidige integratie krijgt HTTP 403 op het inschakelen van Pages en kan deze instelling niet zelf activeren. De officiële configure-pages-action kan een uitgeschakelde site ook niet met alleen GITHUB_TOKEN activeren.

Na inschakelen kan de workflow **Publish web interface** handmatig op `main` worden uitgevoerd. Een uitvoering vanaf een andere ref publiceert niet. Hij controleert de webtests, bouwt beide varianten en publiceert `docs/`. De rootpagina opent standaard de nieuwe interface; bestaande oude gereedschappen blijven via hun expliciete route bereikbaar.

Controleer vóór het delen van de link:

1. De publicatieworkflow is geslaagd voor de bedoelde commit.
2. `/Assistent/app/` en het genoemde hoofdscript geven HTTP 200.
3. `/Assistent/app/publicatie.json` noemt de bedoelde commit en branch.
4. Een browser toont de nieuwe interface; een oude cache wordt niet aangezien voor de nieuwe versie.

## Interface versus volledige serverrelease

De workflow publiceert alleen statische webbestanden. Hij past geen productiedatabase aan, verandert de Streamlit-app niet en bewijst geen werking van login, mail, betalingen of boekingen. Het publicatiemanifest vermeldt daarom expliciet `server_release_verified: false`.

Voor de volledige serverrelease blijven de productiebeheerverbinding, migraties (waaronder `sql/project_archief.sql`) en de verse productie-E2E-bewijzen uit `UITROL.md` vereist. De bestaande release-evidence-controle wordt niet verwijderd of als geslaagd voorgesteld.

Voor **Vakantie en verblijf** is daarnaast `sql/vakantie_verhuur.sql` nodig; de particuliere verhuur-RPC’s zijn zonder die migratie niet actief. Zie [VAKANTIES.md](VAKANTIES.md) voor het onderscheid tussen privéplannen, reserveringen en betalingen.
