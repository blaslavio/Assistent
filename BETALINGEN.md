# Eén betaaladministratie

De actuele betaalcode staat in `supabase/functions/betalen/index.ts` en de bestaande SQL-functies. De interface zet een aanvraag klaar en toont de door de server gecontroleerde status. De kaart, routebriefjes en projectvoorstellen maken geen tweede betaaladministratie en voeren geen betaling uit.

De bestaande uitgangspunten blijven:

- Eén bestelling gekoppeld aan bevoegde koper en verkoper; een retour-URL is geen betaalbewijs.
- Bedragen en vrijgave worden aan de serverzijde gecontroleerd; een clientbedrag is geen bron van waarheid.
- Handtekeningcontrole van webhooks, unieke verwerking van events en idempotente externe opdrachten zijn vereisten.
- Bij een onduidelijke externe uitkomst eerst de werkelijke dienststatus controleren; niet blind opnieuw uitvoeren.
- Terugbetalen en uitbetalen vragen bevoegde uitvoering en afstemming met de betaaldienst; AI en kaartvoorstellen beslissen dat niet zelfstandig.
- Geen geheimen, persoonsgegevens of volledige betaalpayloads in logs.

Dit zijn ontwerp- en controle-eisen, geen verklaring dat alle productiegevallen zijn getest. Vóór vrijgave moeten onder meer timeout na een geslaagde externe opdracht, dubbele webhook, gelijktijdige aanvraag, mislukte transfer, terugbetaling en herstel in de bedoelde omgeving worden getest. Reële dienstconfiguratie, herstelproef en actuele E2E-bewijzen blijven onderdeel van de vrijgavecontrole.
