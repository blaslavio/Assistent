# Integratie en lancering

De actuele applicatie heeft één werklijn: `main`, in `/workspace/Assistent`. De bewerkbare interface staat in `web/src`; `docs/app` en `nieuwe_app` worden uit dezelfde bron gegenereerd. De broncode van de app en beide bundels worden gezamenlijk getest.

De kaart gebruikt één renderer en één eigen reisschattingsmodel. De tijdscontrole hergebruikt dezelfde tijdzonefuncties als de projectplanning; zij maakt geen afspraken, boekingen of betalingen aan.

## Gecombineerde werking

- De nieuwste navigatie, chat, Azure-koppeling, accountaanmelding, offline meldingen, sport- en weekoverzicht en databasebeveiliging blijven behouden.
- Vandaag vraagt bevestiging voor taakacties en dagvoorstellen. Een mislukte opslag toont geen afgeronde taak. De volledige takenlijst blijft bereikbaar.
- Terugkerende taken behouden hun vervolgtaak en afrondtijd. De bevestigde taakactie behoudt de agenda en maakt bij een herhaalde aanvraag geen tweede vervolgtaak.
- Automatische webfoutmeldingen bevatten uitsluitend vaste fout- en schermcategorieën. De herstelmelding voor verbindingsproblemen blijft beschikbaar.
- De zelfstandige releasebewijscontrole accepteert alleen vers productie-E2E-bewijs voor dezelfde commit; een nieuwere mislukking blokkeert een eerdere geslaagde test. De regressies draaien in CI. Deze helper is geen vervanging voor een uitvoerbare productie-uitrolprocedure.
- Beide webbundels worden opnieuw gegenereerd uit de gecombineerde broncode. De CI-controle op overeenstemming blijft actief.

## Bewuste conflictkeuzes

De oude Python-applicatie, hulpmiddelen en hun test-/auditbestanden waren op main bewust verwijderd. Ze worden niet opnieuw als ongebruikte of onuitvoerbare modules toegevoegd. De oude opslagverbeteringen zijn daardoor niet van toepassing op het huidige Python-omhulsel. De ontwikkelcommits blijven via de mergegeschiedenis raadpleegbaar. Tests en auditcijfers uit eerdere documenten gelden voor hun toenmalige broncode, niet automatisch voor deze integratie.

De huidige SQL-versie behoudt de nieuwere indexen en ingetrokken functierechten uit main. Er worden tijdens deze integratie geen productiemigraties uitgevoerd.

## Validatie

De actuele lokale testuitslagen en bronhashes staan in `controle/samenvoeging.json`. De pull-requestchecks moeten daarnaast slagen voor precies de integratiecommit, inclusief webtests, beide builds, bijgewerkte bundels, Python-syntax, releasebewijsregressies en projectarchief op geïsoleerd PostgreSQL.

## Livewerking apart controleren

Samenvoegen bewijst geen actieve productieversie. Controleer na deployment de werkelijk geladen versie, aanmelden met testaccounts, accountwissel, samenwerken op twee apparaten, camera/microfoon, archiveren, boekingen, betalingen en mail. Gebruik betaaldienst-testmodus voor voorbereidende tests; registreer die niet als productie-E2E-bewijs. Controleer daarnaast back-up/herstel en toegang met ingetrokken rechten. De integratie wijzigt geen echte gebruikersgegevens en voert geen betaling of extern bericht uit.

Lokale uitslag: **234 webtests in 51 bestanden**, negen releasebewijsregressies en elf echte PostgreSQL-archieftests geslaagd, zonder skips. TypeScript, beide builds, herbouw zonder bestandsverschillen en Python-syntax geslaagd. Deze aantallen gelden voor deze integratie en zijn geen productiecertificering.
