# Diepgaande controle met 30.000 testgevallen

Synthetische grens- en invariantcontroles op 15 afgebakende families. Geen 30.000 gevonden fouten; geen bewijs dat de volledige app of externe diensten foutloos zijn.

Uitvoering: 2026-10-28T09:45:55.166322+00:00 · seed 20261028 · 30000 gevallen · 5.131 seconden.

Uitkomsten: geslaagd: 30000

| Familie | Geslaagd | Mislukt |
| --- | --- | --- |
| geld_exact | 2000 | 0 |
| geld_halve_cent | 2000 | 0 |
| invoervormen | 2000 | 0 |
| tijdzones | 2000 | 0 |
| overlap | 2000 | 0 |
| taakgrafen | 2000 | 0 |
| backup_roundtrip | 2000 | 0 |
| backup_integriteit | 2000 | 0 |
| backup_selectie | 2000 | 0 |
| csv_statistiek | 2000 | 0 |
| gzip_bestandsnamen | 2000 | 0 |
| csv_weigeringen | 2000 | 0 |
| bronverwijzingen | 2000 | 0 |
| capaciteit_unie | 2000 | 0 |
| zoeken_en_privacy | 2000 | 0 |

Alle individuele IDs, seeds, invoervingerafdrukken en uitkomsten staan in `controle/diepte_30000.json`.

Herhaal één geval met `.venv/bin/python tools/diepte_controle.py --familie NAAM --geval NUMMER`.

Deze reeks vervangt geen regressietests, echte diensttests, dependency-advisoryscan, prestatietest met productiegegevens of handmatige toegankelijkheidsaudit.
