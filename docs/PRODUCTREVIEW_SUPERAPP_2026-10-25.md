# Productreview superapp — 25 oktober 2026

Status: eerste broncode-inventarisatie, **geen** claim dat alle schermen of transacties live getest zijn. Eigen code blijft leidend; externe producten zijn uitsluitend inspiratie.

## Bestaande producten en concrete verbeteringen

| Product | Aanwezig in code | Eerste verbetering | Prioriteit | Acceptatiecriterium |
|---|---|---|---|---|
| AI-assistent | `agent.py`, `ander_brein.py` | Gedeelde conversatiecontext inclusief toolacties; identieke veiligheidsgrenzen bij Claude/ChatGPT/Gemini | P0 | Vervolgvragen over eerdere toolresultaten slagen bij alle aanbieders |
| Chat | `chat.py`, `chat_js.js`, `sql/chat*.sql` | Onafhankelijke verificatie van sleutelbeheer, meerdere apparaten, herstel en berichtbezorging | P0 | E2E-tests met twee accounts en twee apparaten; server ziet geen plaintext |
| Betalingen/marktplaats | `supabase/functions/betalen/index.ts`, `winkelen.py` | Idempotente webhooks, statusovergangen, terugbetalingen en dubbele aankopen testen | P0 | Herhaalde webhook verwerkt betaling exact één keer |
| Accounts/privacy | `opslag.py`, `toegang.py`, `sql/beveiliging.sql` | Sessiegrenzen, autorisatie en dataseparatie tussen accounts testen | P0 | Account A kan geen data van B opvragen of muteren |
| Agenda/planning | `agendas.py`, `planning.py` | Agenda-conflicten, externe synchronisatie en veilige imports met tests | P1 | Dubbele imports voorkomen; tijdzones en conflicten correct |
| Reserveringen | `reserveren.py` | Annuleringen, wachtlijst en agenda-koppeling transactioneel testen | P1 | Geen dubbele boeking bij gelijktijdige aanvragen |
| Winkels/mandje | `winkelen.py`, `winkelkaart.py` | Voorraad- en prijsvalidatie bij afrekenen, winkeloverschrijdend overzicht | P1 | Prijs/voorraad opnieuw server-side gecontroleerd |
| Gezondheid/sport | `gezondheid.py`, `sport_scherm.py` | Herkomst en toestemmingen zichtbaar maken; veilige import zonder duplicaten | P2 | Gebruiker kan bron ontkoppelen en synchronisatie controleren |
| Bank/budget | `bank.py`, `budget.py` | Duidelijke read-only banktoegang, synchronisatiestatus en reconciliatie | P1 | Transacties niet dubbel geïmporteerd; foutstatus zichtbaar |
| Feedback | `verbeteren.py`, `sql/verbeteren.sql` | Afgeschermd beheerdersdashboard voor dagelijkse testresultaten, fouten en releases | P1 | Alleen beheerder ziet interne diagnostiek; gebruikers zien eigen meldingen |

## Marktinzichten, vertaald naar eigen code

- **WeChat/Weixin**: mini-programma's, betalingen en lokale diensten in één ecosysteem. Voor ons: consistente module-navigatie en één account, niet hun code kopiëren. Bron: https://www.tencent.com/products/weixin-wechat/
- **Telegram**: mini-apps, snelkoppelingen, mobiel-eerst en geïntegreerde diensten. Voor ons: lichte modules, heldere toestemmingen en snelle start. Bron: https://core.telegram.org/bots/webapps
- **Revolut**: budgetteren, gezamenlijke financiën en betaaloverzicht. Voor ons: één begrijpelijk financieel dashboard, zonder zelf bankfunctionaliteit of gereguleerde betaaldiensten te imiteren. Bron: https://apps.apple.com/nl/app/revolut-bankieren-meer/id932493382

## Besluit en uitvoervolgorde

1. **P0**: beveiligings- en integratietests voor accountgrenzen, chatversleuteling, AI-tools en betalingen. Geen financiële live-transacties in tests.
2. **P1**: beheerdersdashboard met testresultaten in de app, agenda/reservering-integratie en duidelijke statusmeldingen.
3. **P2**: personalisatie, sport/gezondheid en uitbreidbare mini-diensten.
4. Elke wijziging krijgt een eigen branch, tests en pull request; geen onbewezen 'gereed'-claims.

## Openstaande verificatie

Deze review is gebaseerd op aanwezige bronbestanden en een eerste inhoudelijke inspectie van acht modules. Werkende productstromen, performance, mobiele toegankelijkheid, Supabase RLS en productiebetalingen zijn **nog niet** end-to-end bewezen. De bestaande `verbeteren.py` bevat al gebruikersmeldingen; een beheerdersweergave voor automatische testbevindingen moet nog worden gebouwd.
