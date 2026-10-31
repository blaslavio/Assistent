# Centrale kaart en compacte beveiligingsopties

De kaart heeft eigen bediening, kleuren, bestemmingskaarten, vervoermiddelkeuze en verbindingen met de bestaande app. MapLibre tekent de kaart; OpenFreeMap/OpenStreetMap leveren geografische gegevens. Dit is geen eigen wereldwijde gegevensverzameling of bewezen betere navigatiemotor dan Google of Apple.

## Verbindingen

- Agenda, vakantie, verblijf en evenementen zetten een adres en herkomst klaar. Een bekend agendapunt opent zonder nieuwe geocodering.
- De assistent kan via `kaart_openen` een adres klaarzetten, zonder automatisch te zoeken of accountgegevens te lezen.
- Appwinkels blijven via hun bestaande adrescode bereikbaar.
- Een geselecteerde kaartplek kan een nieuwe afspraak voorbereiden. Pas Opslaan bewaart deze via de bestaande versiegecontroleerde accountopslag. Een gewijzigde plaats krijgt geen oude coördinaten mee.
- Routebriefjes voor projecten en gesprekken blijven expliciete kopieervoorstellen. Er wordt niets automatisch gedeeld met alle onderdelen of externe diensten.

De centrale, getypeerde brug staat in `web/src/lib/kaartverbinding.ts` en `naar.ts`. Adressen en voorstellen blijven tot overdracht in geheugen; een sessiewissel wist ze. De optionele afspraakcoördinaten staan in bestaande account-JSON, zonder nieuwe databasetabel.

## Rust en privacy

Eén bestemming met één primaire navigatieknop; routeplanner en winkelopties zijn ingeklapt. Nabije winkels worden alleen na een expliciete zoekopdracht opgehaald. Verschuiven start geen nieuwe winkelzoekopdracht. Het thuisadres wordt alleen na de betreffende knop opgezocht. De kaartdienst ontvangt bij kaartgebruik wel het bekeken gebied. Privélabels staan niet in navigatielinks.

Licht, donker en automatisch volgen de bestaande thema-instelling. Eigen kleuren veranderen achtergrond, water, groen en gebouwen zonder kaartlabels te verwijderen. De kaartbediening gebruikt dezelfde appletterfamilie. De schematische stippellijn is geen wegroute. Reistijden blijven ruime lokale schattingen zonder live verkeer of OV-dienstregeling; Google, Apple of Waze berekent na de navigatieklik de daadwerkelijke route.

Beveiligingsopties gebruiken gedeelde compacte rijen: koppen van 15 px, toelichting van 13 px, vaste icoontjes en een uitklapbare uitleg. Geheugen en technische uitleg gebruiken dezelfde bouwsteen. Invoervelden blijven minimaal 16 px om automatisch inzoomen op iPhone te voorkomen; de letterfamilie blijft overal gelijk aan de app.

## Controle en grenzen

De webtests controleren overdracht, invoervalidatie, privacy, expliciete zoekacties en afspraakopslag. Een lokale Chromium-controle op 390 × 844 controleert de compacte tekst, dezelfde letterfamilie, uitklappen, kaartcanvas, eigen marker en schematische lijn, zonder horizontale overloop. Hiervoor is uitdrukkelijk een lokale kaartstijl zonder geografische tegels gebruikt. De externe kaartstijl gaf vanuit deze omgeving HTTP 403; actuele externe kaarttegels en live productie zijn daardoor niet geverifieerd. Bij een laadfout blijven bestemmingen en navigatie beschikbaar en verschijnt een melding.
