# Productiviteit V1 — minimale werkbare integratie

Deze uitbreiding voegt één ingangsplek toe onder **Werkruimte → Privé → Productiviteit**, met drie tabbladen: Inbox, Dagplanner en Automatiseren.

## Waarom en wat is echt geïmplementeerd

- **Inbox** verenigt de bestaande eigen taken (te laat, vandaag of hoge prioriteit) en de bestaande *voorJou*-meldingen uit huishoudens en bestellingen. Een taak wordt maximaal één keer getoond. De betrokken bron wordt geopend; er ontstaat geen tweede takenmodel. De externe meldingen zijn alleen zichtbaar bij een geslaagde echte ophaling.
- **Slimme dagplanner** berekent maximaal vier focusblokken binnen 09:00–18:00 op basis van de bestaande taken en afspraken. Houdt rekening met doorlopende afspraken, hele dagen, al gekoppelde focusblokken en bestaande deadlines. De plannen wijzigen niets zonder expliciet bevestigen. Vlak vóór de opslag haalt \`api.bijwerken\` de actuele gegevens op, controleert de plannen opnieuw en gebruikt de bestaande versieafhankelijke serveropslag. Bij afwijkingen is er geen opslag.
- **Automatiseringsregels** bieden drie persistente triggers (te laat, vandaag, hoge prioriteit) om taken in de inbox te prioriteren. De voorkeur wordt als \`instellingen.productiviteit_regels_v1\` in de reeds aanwezige eigen gegevens opgeslagen. Geen nieuwe database, token, API of permissie.

## Grenzen — geen fictieve functionaliteit

Deze eerste versie is een veilige fundering, geen achtergrondwerker. Regels tonen alleen bestaande taken; ze versturen geen berichten, voeren geen betalingen uit en plannen niets zelfstandig. Een generieke workfloweditor met actie-uitvoering vereist aparte server-side autorisatie, idempotentie, logs en per-actie-goedkeuring. Chatgoedkeuringen, projectchecklists, alle boekingen, externe mailboxen en betaalproviders zitten nog **niet** in de universele inbox.

De dagplanner is deterministisch, geen aanroep naar een AI-model. Er worden geen anderen automatisch uitgenodigd. Hij plant geen gesynchroniseerde externe agenda om en kan afspraken niet zelf verplaatsen. Gedurende de voorgestelde periode wordt na bevestiging alleen een eigen focusafspraak opgeslagen. Planvoorstellen die verlopen of conflicteren worden opnieuw berekend.

## Controle en uitrol

Unit-tests in \`web/src/lib/productiviteit.test.ts\` dekken regelvalidatie, enkelvoudige meldingen, onveranderde brondata bij berekenen, conflicten, doorlopende en hele-dagafspraken, dubbelen en hercontrole vóór mutatie.

Laat de bestaande \`.github/workflows/web.yml\` op de PR de Vitest-tests, TypeScript-check en builds uitvoeren. Verifieer daarna de daadwerkelijke browserweergave en twee-sessie-conflicten met geauthenticeerde testaccounts. Laat de PR open zolang de CI niet aantoonbaar groen is. De gegenereerde \`docs/app\`- en \`nieuwe_app\`-assets moeten via de bestaande read-only verificatiestap overeenkomen met de code vóór release. Deze branch activeert geen productiedienst en wijzigt niets in \`main\`.
