# Samenwerken in de chat en tijdens videobellen

Open een geaccepteerd chatgesprek of groepskanaal en klap **Projectwerkruimte** open. Maak een tekstbestand of importeer en deel een eigen UTF-8-bestand met extensie `.txt` of `.md`. Kies hetzelfde bestand op beide apparaten om samen te schrijven.

Tijdens een bestaand één-op-één-(video)gesprek opent **Samen aan project werken** het bijbehorende gesprek en de werkruimte. Het beeld blijft in een compact venster staan. Dempen, camera uitzetten, ophangen en groot beeld blijven bereikbaar. Er wordt geen opname gestart. Groepsvideobellen is niet toegevoegd; een groepschat kan wel dezelfde tekstbestanden bewerken.

## Gelijktijdig bewerken

De editor gebruikt Yjs. Hij deelt CRDT-bewerkingen, niet telkens een vervangende volledige tekst. Gelijktijdige toevoegingen, vertraagde ontvangst en dubbele pakketten worden samengevoegd. Lokale IME-compositie wordt op een eigen versie toegepast en daarna samengevoegd, zodat intussen ontvangen tekst behouden blijft.

Updates gaan via de bestaande end-to-end-versleutelde chattransportlaag en servercontroles voor leden en kanaalrechten. Er komen geen openbare bestandslinks bij. Het afzonderlijke versiearchief gebruikt beveiligde databasefuncties; zie `PROJECTREGIE.md`. Alleen apparaten die de oorspronkelijke chatberichten kunnen ontsleutelen, kunnen de projectgeschiedenis reconstrueren. De assistent krijgt deze bestanden niet automatisch als AI-context.

Automatisch delen verstuurt in de actieve werkruimte maximaal circa één pakket per tien seconden, naast het bestaande ophalen van chatberichten. Een wijziging is onder normale omstandigheden binnen circa twaalf seconden zichtbaar bij een ander. Bij een achterstand, netwerkproblemen of de bestaande chatlimiet kan dat langer duren. **Nu delen / opnieuw proberen** kan een wachtende wijziging direct aanbieden.

## Opslag en grenzen

- Per gesprek maximaal 50 tekstbestanden; per bestand maximaal 50.000 tekens. Updates zijn begrensd op 256.000 bytes.
- Word-, Excel-, PDF- en andere binaire bestanden worden niet gezamenlijk bewerkt. Dit is een gedeelde tekst-/Markdown-editor, zonder opmaakeditor, gedeelde muisaanwijzers of cursorindicatoren.
- Delen wordt pas bevestigd na antwoord van de bestaande chatopslag. Bij een fout blijft de wijziging in het werkgeheugen klaarstaan; opnieuw aanbieden maakt geen dubbele tekst.
- Wachtende wijzigingen blijven binnen dezelfde browserpagina bewaard bij navigatie naar een ander apponderdeel. Ze zijn niet als offline back-up opgeslagen. Sluiten of herladen toont waar mogelijk een browserwaarschuwing; een mobiele browser kan processen zonder waarschuwing beëindigen. Download bij twijfel je eigen kopie.
- Uitloggen, verlopen toegang of een andere sessie wist tijdelijke werkruimtes. Een lopende import wordt bij accountwisseling niet meegenomen naar het nieuwe account.
- Zet verdwijnende berichten uit om samen te werken. Bestanden zijn afhankelijk van de oorspronkelijke versleutelde berichten: verlopen/verwijderde updates en ontbrekende apparaatsleutels kunnen niet worden hersteld. Losse chatupdates vormen geen onafhankelijke cloudschijf. Bevestigde snapshots kunnen apart worden gearchiveerd met `sql/project_archief.sql`; zie `PROJECTREGIE.md` voor herstel en bewaarbeperkingen.
- Rechten volgen de chat. In een alleen-lezen kanaal ontbreken schrijf- en importacties; de bestaande server blijft de bevoegdheid controleren.

## Dagelijkse acties

Vandaag is verbeterd: een nieuwe taak, afronden en de keuze uit een dagvoorstel krijgen eerst een controleerbaar voorbeeld. Een taak wordt pas als klaar getoond na bevestigde opslag. Een fout wist de invoer niet. Dezelfde toevoegopdracht heeft een vaste code, zodat opnieuw proberen na een verloren antwoord geen tweede taak maakt. Verouderde voorbeelden worden geweigerd. Afronden verwijdert geen gekoppelde afspraken.

## Verificatie en publicatie

Alle 136 Vitest-tests slagen, inclusief twee gelijktijdige Yjs-documenten, omgekeerde ontvangstvolgorde, dubbele pakketten, verloren antwoord, invoer tijdens verzending, emoji/IME, accountisolatie, kanaalrechten, verdwijnende gesprekken, compacte belbediening en dagelijkse acties. `npm run build` bouwt beide varianten en controleert TypeScript. `npm audit --omit=dev` meldt op dit uitvoermoment geen bekende kwetsbaarheden; dat is geen algemene beveiligingsgarantie.

```sh
cd web
npm ci
npm test
npm run build
```

Tests gebruiken nagebootst chattransport en belstatus. De echte encryptie gebruikt de bestaande chatcode. Er zijn geen echte gebruikersbestanden gedeeld, gesprekken opgezet of berichten verstuurd tijdens ontwikkeling. Een praktijktest met twee echte accounts/apparaten, microfoon/camera en netwerkonderbreking blijft nodig. Deze wijziging is nog niet live; `UITROL.md` beschrijft de resterende productievoorwaarden.

## Projectregie en chatbetalingen

De tien projectuitbreidingen, de lagen waarom/hoe/wanneer/als en de koppeling met bestaande betaal-, boekings- en reserveringsformulieren staan beschreven in [PROJECTREGIE.md](PROJECTREGIE.md).
