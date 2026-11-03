## 2026-11-03 · Evenementen met betaalde tickets
Wat:
- In Agenda › Evenementen staan nu drie delen: Ontdekken, Mijn tickets en Organiseren.
- Bij Ontdekken zie je komende evenementen met de begintijd en tot wanneer het loopt. Je kiest een ticketsoort en een aantal en betaalt in de app.
- Na betalen krijg je per ticket een eigen QR-code bij Mijn tickets. Bij terugbetalen worden niet-gebruikte tickets ingetrokken.
- Organisatoren maken in Studio › Tickets en inschrijvingen ticketsoorten (bijvoorbeeld Ringside en Staanplaats) met prijs en aantal, plus een omschrijving.
- Na de eindtijd verdwijnt een evenement vanzelf van de pagina en stopt de verkoop. Er wordt niets gewist.
Waarom: je wilt het boksgala van 28 februari helemaal via de app regelen. Tickets lopen via je eigen webshop en de bestaande betaling, zodat geld en controle op één plek blijven.

## 2026-11-03 · App bouwt weer (#198)
Wat: 23 bouwfouten en 13 falende tests opgelost. Het volledige gespreksscherm (nieuwe berichten, betaalverzoeken, projecten) en de volledige winkel staan er weer, en de terugknop na de assistent gaat weer naar de juiste plek. Al het nieuwe werk is bewaard.
Waarom: sinds 1 november gingen 76 wijzigingen direct naar de hoofdversie terwijl de controles rood waren. Daardoor bouwde de app niet meer en bleef de live app op 1 november staan.


## 2026-10-30 · Azure in de assistent (#163, #164)
Wat: de assistent gebruikt nu vanzelf Azure OpenAI als er geen Claude-sleutel is. De functie `ai` is live gezet (v13), met akkoord.
Waarom: jij had de Azure-sleutels in Supabase gezet, maar de app gebruikte ze nooit. Er stond wel al een Azure-route live, maar die stond niet in de code; die zit er nu ook in.

## 2026-10-30 · Rustiger Chat en Winkel
Wat:
- Bovenin Chat staan nu standaard drie knoppen: Chats, Community's en Winkel. Bellen zit als telefoonknop rechtsboven.
- Zelf kiezen kan in Instellingen › Weergave › "Bovenin Chat".
- Winkel is één scherm geworden. Verkopen (plus) en Bestellingen (tas, met teller) zijn knoppen rechtsboven.
- Een lege Belafspraak toont nu de knop "Zoek iemand".
Waarom: je gaf aan dat je verdwaalt door alle opties. Minder rijen betekent minder keuzes tegelijk, en wat je weinig gebruikt zet je zelf aan.
