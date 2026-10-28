# Integratiecontrole: 100.000 testgevallen

20 families met ieder 5000 reproduceerbare synthetische gevallen bij standaardinstellingen. Controle van werkstromen en grenzen; geen 100.000 gevonden verbeterpunten en geen echte dienstinteracties. Brondata wordt niet gewijzigd.

Seed: 10000020261028 · uitvoering: 2026-10-28T09:46:11.805638+00:00 · duur: 21.737 seconden.

Uitkomsten: geslaagd: 100000

| Familie | Geslaagd | Mislukt |
| --- | --- | --- |
| geld_exact | 5000 | 0 |
| geld_halve_cent | 5000 | 0 |
| invoervormen | 5000 | 0 |
| tijdzones | 5000 | 0 |
| overlap | 5000 | 0 |
| taakgrafen | 5000 | 0 |
| backup_roundtrip | 5000 | 0 |
| backup_integriteit | 5000 | 0 |
| backup_selectie | 5000 | 0 |
| csv_statistiek | 5000 | 0 |
| gzip_bestandsnamen | 5000 | 0 |
| csv_weigeringen | 5000 | 0 |
| bronverwijzingen | 5000 | 0 |
| capaciteit_unie | 5000 | 0 |
| zoeken_en_privacy | 5000 | 0 |
| dossierrelaties | 5000 | 0 |
| draagbare_bundel | 5000 | 0 |
| herstel_samenhang | 5000 | 0 |
| selectie_bewaakt_doelen | 5000 | 0 |
| zoeken_naar_sjabloon | 5000 | 0 |

Alle IDs, seeds, hashes en uitkomsten staan in `controle/integratie_100000.json.gz`.

De vijf nieuwe werkstroomfamilies controleren dossiers, draagbare bronnen, herstelverwijzingen, bronselectie en zoeken → dossier → sjabloon. De overige vijftien families breiden de bestaande grenscontroles uit met een nieuwe seed en 5000 gevallen per familie.

Dit is geen bewijs van 100.000 gevonden fouten of een certificering van alle apponderdelen. Echte opslagconcurrentie en schermen worden apart getest; externe diensten en de eerder benoemde handmatige controles blijven buiten deze synthetische reeks.
