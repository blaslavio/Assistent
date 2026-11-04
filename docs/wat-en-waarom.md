## 2026-11-04 · Instellingen compacter
Wat: Instellingen toont nu alleen echte instellingen, in vier korte groepen op één scherm: Account en privacy, App en assistent, Betalen en afspraken, en Hulp. Je hoeft geen groep meer open te tikken. Apps zoals Budget, Kaart en Evenementen staan niet meer dubbel in Instellingen; je opent ze via Werkruimte of vindt ze met de zoekbalk.
Waarom: je vond dat instellingen samengevoegd konden worden. Er stonden apps tussen die geen instelling zijn, en elke groep kostte een extra tik.

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

## Webshop en boekingspagina beter in te richten (2026-11-04)
Wat: je winkel toont de vaste stappen naar open (winkel, betalingen, product, openen) met één knop voor de volgende stap, een knop Product toevoegen, uitverkocht bij voorraad 0, een Aanbieding-balk met einddatum en cijfers van de laatste 30 dagen. De boekingspagina staat nu in logische volgorde (wat, wanneer, regels, betalen, pagina), met prijs per soort, andere tijden per dag, regels (hoe kort van tevoren, hoe ver vooruit, pauze, maximum per dag), betaalgegevens en annuleerregels, en aanvragen kun je ook afwijzen of annuleren. Gasten zien de prijs.
Waarom: de tools waren te beperkt en niet logisch geordend. Alles gebruikt databasefuncties die al live staan, dus er is geen database-wijziging nodig.
