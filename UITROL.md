# Release: werkstromen, communicatie en ontwerp

Doel: de lokale verbeteringen uit deze sessie toevoegen aan de actuele `main`, inclusief het bestaande nieuwe React-ontwerp. De projectuitbreiding is bijgewerkt met `main` op `2cade0e`, inclusief de nieuwe navigatie en de bestaande productiereleasepoort voor actuele E2E-bewijzen.

## Status

De code en gebouwde webbestanden staan klaar. **Deze release is nog niet live.** GitHub-toegang werkt; een productiebeheerverbinding met Supabase en Streamlit ontbreekt in deze omgeving. De aanwezigheid van `mijn_gegevens_veilig_bewaren` kon niet uit het publieke API-schema worden vastgesteld. De publiek beschikbare app-URL is `https://eisreyyrtvlgtjpqiyhpm2.streamlit.app`.

Er zijn geen productiegegevens, echte betalingen of gebruikersberichten gewijzigd. De bestaande tien externe/handmatige auditpunten blijven open; lokale tests certificeren geen echte login, externe AI, betalingen of mobiele apparaten.

## Projectmotor en aanvullend archief

Waarom, hoe, wanneer en als zijn gekoppeld aan dezelfde bevestigde projectfeiten. De chat kan een bestaande appbestelling als betaalverzoek delen; de ontvanger controleert eigen dienstgegevens en opent zelf de bestaande checkout. Boekingen en reserveringen blijven expliciete handelingen in de bestaande formulieren. Zie [PROJECTREGIE.md](PROJECTREGIE.md).

Voer bij uitrol ook `sql/project_archief.sql` transactioneel uit na de chatmigraties. Zonder deze migratie werken samen bewerken en projectvoorstellen verder, maar apart archiveren niet. Test met twee echte accounts, aparte apparaten en een testbetaling. De lokale tests vervangen geen vers productie-E2E-bewijs voor de exacte releasecommit.

## In deze release

- Projectwerkruimte in de chat: samen `.txt`/`.md` bewerken met Yjs via de bestaande versleutelde chat en een compacte belweergave. Zie `PROJECTWERKRUIMTE.md` voor grenzen en praktijktests.
- Vandaag vraagt bevestiging vóór taakacties en dagvoorstellen; mislukte opslag toont geen voltooiing en wist geen invoer. Afronden behoudt afspraken.

- Geteste werkdossiers, bronnen, planning, herstel, communicatieconcepten en privévoorkeuren uit deze sessie.
- Het actuele ontwerp van de repository, inclusief de nieuw gebouwde React-bundels in `docs/app/` en `nieuwe_app/`.
- In de nieuwe webinterface staan bij Instellingen ingangen naar privéconcepten, alle werktools en planningherstel. Die openen de bestaande beveiligde Streamlit-werkruimte; de tools zijn niet opnieuw in React geschreven.
- De bestaande Mail & Chat-hub houdt de route `communicatie`. Privéconcepten gebruiken `communicatiecentrum`, zodat de pagina’s elkaar niet overschrijven.
- De nieuwe webinterface schrijft via dezelfde versiecontrole als Python. Een conflict wordt gemeld; wijzigingen worden niet automatisch herhaald.
- Verlate webantwoorden van een eerder account worden geweigerd. Meegegeven parameters kunnen de huidige accountidentiteit niet vervangen.
- De assistentinvoer op de actuele assistentpagina gebruikt ook de centrale opdrachtrouter.

## Productievolgorde

1. Verbind de productiebeheeromgeving via beveiligde omgevingsinstellingen. Deel geen secrets in chat of Git.
2. Controleer de huidige databasefuncties en maak een back-up/snapshot van de relevante productiedatabase en de huidige appversie. Leg een onderhoudsvenster vast: oude geopende webclients gebruiken nog het oude schrijfpad.
3. Pauzeer de app tijdens de overgang. Voer `sql/veilige_opslag.sql` transactioneel uit in de bestaande Supabase-database. De migratie introduceert versiegebonden opslag en trekt de rechten op het oude schrijfpad in. Geen tabellen of gebruikersrecords worden gewist.
4. Publiceer deze volledige release en laat Streamlit de nieuwe Python-code en beide nieuwe webbundels laden. Oude clients moeten herladen; geef het oude schrijfpad geen rechten terug terwijl nieuwe clients actief zijn.
5. Controleer de exacte releasecommit, `/_stcore/health`, aanmelding met een eigen testaccount, het nieuwe instellingenontwerp, een concept opslaan, taak bevestigen, accountwissel en back-upvoorbeeld. Controleer op fouten in serverlogs zonder persoonsgegevens te publiceren.
6. Beëindig het onderhoud pas na deze controles. Werkende HTTP-pagina’s alleen bewijzen geen werkende opslag of correcte releaseversie.

## Terugdraaien

Pauzeer de app als de controle faalt. Zet een bekende apprelease terug en beoordeel de opslagfunctie/rechten samen met die appversie. Zet het oude schrijfpad niet terug aan naast actieve nieuwe clients: dat omzeilt versiecontrole. Herstel productiegegevens alleen uit een gecontroleerde snapshot als daar afzonderlijk aanleiding toe bestaat; een approllback vereist geen automatisch wissen van nieuwe gebruikersgegevens.

## Lokale bewijzen

De samengevoegde versie slaagde voor 1248 Python-tests zonder skips, inclusief 25 PostgreSQL-tests. Daarnaast slaagden de bestaande 138 pytest-tests (met 21 subtests) en 19 expliciete regressietests uit de actuele repository. De huidige 38 Vitest-webtests controleren webopslag, accountgrenzen, gelijktijdige projectbewerking, belbediening en bevestigde dagelijkse acties. `npm run build` bouwde beide productievarianten. Zes lokale Chromium-scenario’s en 1000 navigatieconfiguraties slaagden. Bandit rapporteerde op het bestaande CI-niveau (`-ll -ii`) geen open signalen; de twee vertrouwde AST-testuitvoeringen en twee veilige tijdelijke-mapcontroles hebben een gerichte, toegelichte uitzondering. Dit is geen volledige beveiligingscertificering. Deze uitkomsten bewijzen geen uitgevoerde productie-uitrol. De aparte releasecontrolebestanden en pull-requestchecks tonen de definitieve stand.
