# Universal People's OS — meestercode contract

## Waarom

De gebruiker mag dezelfde taak, afspraak of projectstap niet in meerdere onafhankelijke systemen hoeven bijwerken. De OS moet één begrijpelijke bron en één duidelijke plaats voor iedere handeling hebben.

## Uitgangspunten

- **Geen monolithisch bestand.** Een typevaste orkestratielaag verbindt bestaande modules; domeinlogica blijft bij de eigenaar.
- **Geen tweede database.** Persoonlijke taken komen uit het bestaande `Gegevens.taken`-model. Projectstappen komen uit `projectactie` / `aanpak` en de bestaande, per gesprek beveiligde projectberichten.
- **Leesmodel is niet de autorisatiebron.** `masterOverzicht` combineert alleen reeds geautoriseerde gegevens. Server-side toegang, gebruikersidentiteit en projectlidmaatschap moeten vóór de bronquery zijn vastgesteld.
- **Eén identiteit per bron.** `taak:<id>` en `project:<aanpak-id>:<stap-id>` voorkomen schijnbare dubbele records.
- **Waarom en bewijs.** Iedere projectstap verwijst terug naar het bevestigde projectdoel. Wijzigingen worden herleidbare projectacties, geen stille browserwijzigingen.
- **Expliciete toestemming.** Een checklist is een bestaande aanpak; iedere actieve deelnemer stemt voor de actuele versie. Nieuwe leden of nieuwe aanpakversies vereisen opnieuw akkoord.
- **Nooit geld via generieke AI-acties.** Betalingen blijven uitsluitend via de gespecialiseerde Stripe-backend met handtekeningvalidatie.
- **AI voert geen mutatie zonder bevestiging uit.** Idempotentiesleutels, actor-autorisatie en audit moeten op de server worden afgedwongen.
- **Fail-closed release.** PR-review, tests, gegenereerde webassets, migraties en productie-E2E moeten aantoonbaar kloppen voordat `main` kan worden gemerged of livegang mag worden gemeld.

## In deze PR

`mastercode.ts` is bewust een **read-only compositielaag**. De checklistmodule hergebruikt bestaande projectaanpakken, statusgeschiedenis en projectchatopslag.

## Nog nodig vóór volledige productie

1. Serverzijdige validatie van checklistgoedkeuring bij ieder schrijvend endpoint, inclusief oudere clients.
2. Echte multi-user end-to-end-tests, intrekking van lidmaatschap en gelijktijdige wijzigingen.
3. Harmonisatie van persoonlijke taken versus projectstappen in alle schermen, zonder privégegevens aan projectleden te lekken.
4. Webbuild naar `docs/app` en `nieuwe_app` synchroniseren en CI opnieuw laten slagen.
5. Onafhankelijke securityreview en controle van actieve productie-deployment.
