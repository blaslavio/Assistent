# Controle op 100 verbeterpunten

Lokale werk-, planning-, bestands- en herstelonderdelen plus benoemde open controles. Geen certificering van de volledige app of externe diensten. 100 controlepunten betekent niet 100 nieuwe fixes.

Testuitvoering: 2026-10-28T10:14:49.977019+00:00

Uitkomsten: geslaagd: 90, open: 10

| Nr. | Onderdeel | Controlepunt | Uitkomst | Bewijs of vervolgstap |
| --- | --- | --- | --- | --- |
| 1 | Opdrachten | Afspraak en taak | geslaagd | test_intenties.IntentiesTest.test_afspraak_en_taak |
| 2 | Opdrachten | Betaalopdracht en onbekende tekst schrijven niets | geslaagd | test_intenties.IntentiesTest.test_betaalopdracht_en_onbekende_tekst_schrijven_niets |
| 3 | Opdrachten | Herhaald bevestigen | geslaagd | test_intenties.IntentiesTest.test_herhaald_bevestigen |
| 4 | Opdrachten | Opslagfout geeft geen succes | geslaagd | test_intenties.IntentiesTest.test_opslagfout_geeft_geen_succes |
| 5 | Opdrachten | Chat bevestigen annuleren en herladen | geslaagd | test_intenties.IntentiesTest.test_chat_bevestigen_annuleren_en_herladen |
| 6 | Opdrachten | Voorstel bewerken | geslaagd | test_intenties.IntentiesTest.test_voorstel_bewerken |
| 7 | Opdrachten | Verloren antwoord geeft geen dubbel item | geslaagd | test_intenties.IntentiesTest.test_verloren_antwoord_geeft_geen_dubbel_item |
| 8 | Opdrachten | Vervolgvragen onthouden titel en datum | geslaagd | test_intenties.IntentiesTest.test_vervolgvragen_onthouden_titel_en_datum |
| 9 | Opdrachten | Gui accountwissel wist open context | geslaagd | test_intenties.IntentiesTest.test_gui_accountwissel_wist_open_context |
| 10 | Opdrachten | AI-tools tegen een echte provider | open | Nog niet uitgevoerd: controle met echte AI-provider en diens toolmachtigingen. |
| 11 | Agenda | Aansluiten is geen overlap | geslaagd | test_agendacontrole.AgendaControleTest.test_aansluiten_is_geen_overlap |
| 12 | Agenda | Deels geheel en meerdaags overlappen | geslaagd | test_agendacontrole.AgendaControleTest.test_deels_geheel_en_meerdaags_overlappen |
| 13 | Agenda | Hele dag en tijdzone | geslaagd | test_agendacontrole.AgendaControleTest.test_hele_dag_en_tijdzone |
| 14 | Agenda | Onleesbare afspraak blokkeert vrije claim | geslaagd | test_agendacontrole.AgendaControleTest.test_onleesbare_afspraak_blokkeert_vrije_claim |
| 15 | Agenda | Alternatieven behouden duur en planuren | geslaagd | test_agendacontrole.AgendaControleTest.test_alternatieven_behouden_duur_en_planuren |
| 16 | Agenda | Volle week geeft geen suggesties | geslaagd | test_agendacontrole.AgendaControleTest.test_volle_week_geeft_geen_suggesties |
| 17 | Agenda | Ongeldige planuren en weekend | geslaagd | test_agendacontrole.AgendaControleTest.test_ongeldige_planuren_en_weekend |
| 18 | Agenda | Alternatief is eerst een voorstel | geslaagd | test_agendacontrole.AgendaSchermTest.test_alternatief_is_eerst_een_voorstel |
| 19 | Agenda | Tussentijds toegevoegde afspraak weigert opslaan | geslaagd | test_agendacontrole.AgendaSchermTest.test_tussentijds_toegevoegde_afspraak_weigert_opslaan |
| 20 | Agenda | Externe agenda synchroniseren | open | Nog niet uitgevoerd: echte CalDAV/Google/Outlook-agenda en verversen van wijzigingen. |
| 21 | Planning | Alle blokken in een opslagactie | geslaagd | test_focusplan.FocusplanTest.test_alle_blokken_in_een_opslagactie |
| 22 | Planning | Fout in laatste blok bewaart niets | geslaagd | test_focusplan.FocusplanTest.test_fout_in_laatste_blok_bewaart_niets |
| 23 | Planning | Retry verloren antwoord en undo | geslaagd | test_focusplan.FocusplanTest.test_retry_verloren_antwoord_en_undo |
| 24 | Planning | Gewijzigde taakduur of nieuwe afspraak blokkeert | geslaagd | test_focusplan.FocusplanTest.test_gewijzigde_taakduur_of_nieuwe_afspraak_blokkeert |
| 25 | Planning | Weekend verleden en injectie worden geweigerd | geslaagd | test_focusplan.FocusplanTest.test_weekend_verleden_en_injectie_worden_geweigerd |
| 26 | Planning | Oude planner ziet hele dag en utc als nederlandse tijd | geslaagd | test_focusplan.FocusplanTest.test_oude_planner_ziet_hele_dag_en_utc_als_nederlandse_tijd |
| 27 | Planning | Lange taak wordt gesplitst | geslaagd | test_dagplan.DagplanTest.test_lange_taak_wordt_gesplitst |
| 28 | Planning | Atomair bevestigen en ongedaan | geslaagd | test_dagplan.DagplanOpslagTest.test_atomair_bevestigen_en_ongedaan |
| 29 | Planning | Gui bewerken weglaten en bevestigen | geslaagd | test_dagplan.DagplanOpslagTest.test_gui_bewerken_weglaten_en_bevestigen |
| 30 | Planning | Prestatie bij veel gelijktijdige sessies | open | Nog niet uitgevoerd: belastingtest met een representatieve dataset en meerdere appservers. |
| 31 | Taken en capaciteit | Cyclus en zelfverwijzing worden geweigerd | geslaagd | test_taakplanning.WerkdrukTest.test_cyclus_en_zelfverwijzing_worden_geweigerd |
| 32 | Taken en capaciteit | Verwijderde voorganger blijft blokkeren | geslaagd | test_taakplanning.WerkdrukTest.test_verwijderde_voorganger_blijft_blokkeren |
| 33 | Taken en capaciteit | Plannen is geen afronding | geslaagd | test_taakplanning.WerkdrukTest.test_plannen_is_geen_afronding |
| 34 | Taken en capaciteit | Heropenen voorganger blokkeert ook oud voorstel | geslaagd | test_taakplanning.WerkdrukTest.test_heropenen_voorganger_blokkeert_ook_oud_voorstel |
| 35 | Taken en capaciteit | Herplanning behoudt afgeronde en ongekozen voorgangers | geslaagd | test_taakplanning.WerkdrukTest.test_herplanning_behoudt_afgeronde_en_ongekozen_voorgangers |
| 36 | Taken en capaciteit | Oude planner en handmatige focus respecteren blokkade | geslaagd | test_taakplanning.WerkdrukTest.test_oude_planner_en_handmatige_focus_respecteren_blokkade |
| 37 | Taken en capaciteit | Afhankelijkheden opslaan en verouderde wijziging | geslaagd | test_taakplanning.WerkdrukTest.test_afhankelijkheden_opslaan_en_verouderde_wijziging |
| 38 | Taken en capaciteit | Geplande taak niet achteraf blokkeren | geslaagd | test_taakplanning.WerkdrukTest.test_geplande_taak_niet_achteraf_blokkeren |
| 39 | Taken en capaciteit | Deadline tekort ook als week genoeg ruimte heeft | geslaagd | test_taakplanning.WerkdrukTest.test_deadline_tekort_ook_als_week_genoeg_ruimte_heeft |
| 40 | Taken en capaciteit | Bediening op mobiele browsers | open | Nog niet uitgevoerd: handmatige controle op iOS Safari en Android, inclusief kleine schermen. |
| 41 | Bestanden | Gzip bewaart exact de originele bytes | geslaagd | test_bestandsgereedschap.BestandTest.test_gzip_bewaart_exact_de_originele_bytes |
| 42 | Bestanden | Leeg en al gecomprimeerd geeft eerlijke grootte | geslaagd | test_bestandsgereedschap.BestandTest.test_leeg_en_al_gecomprimeerd_geeft_eerlijke_grootte |
| 43 | Bestanden | Bestandsnaam en limiet | geslaagd | test_bestandsgereedschap.BestandTest.test_bestandsnaam_en_limiet |
| 44 | Bestanden | Csv met decimale komma en lege velden | geslaagd | test_bestandsgereedschap.BestandTest.test_csv_met_decimale_komma_en_lege_velden |
| 45 | Bestanden | Csv statistiek gebruikt meer dan het voorbeeld | geslaagd | test_bestandsgereedschap.BestandTest.test_csv_statistiek_gebruikt_meer_dan_het_voorbeeld |
| 46 | Bestanden | Csv onleesbaar dubbele headers en foute rijen | geslaagd | test_bestandsgereedschap.BestandTest.test_csv_onleesbaar_dubbele_headers_en_foute_rijen |
| 47 | Bestanden | Csv nan en extreme exponenten zijn geen grafiekgetallen | geslaagd | test_bestandsgereedschap.BestandTest.test_csv_nan_en_extreme_exponenten_zijn_geen_grafiekgetallen |
| 48 | Bestanden | Csv limiet en exacte som van grote getallen | geslaagd | test_bestandsgereedschap.BestandTest.test_csv_limiet_en_exacte_som_van_grote_getallen |
| 49 | Bestanden | Echt videofragment is afspeelbaar en heeft juiste duur | geslaagd | test_bestandsgereedschap.VideoTest.test_echt_videofragment_is_afspeelbaar_en_heeft_juiste_duur |
| 50 | Bestanden | Kwetsbaarheden van alle afhankelijkheden | open | Nog niet uitgevoerd: volledige dependency-audit tegen actuele advisories; dit vereist een actuele advisorybron. |
| 51 | Bronnen | Bronnen voor taak en afspraak geen valse doelen | geslaagd | test_werkbronnen.BronnenTest.test_bronnen_voor_taak_en_afspraak_geen_valse_doelen |
| 52 | Bronnen | Geen dubbele bron bij retry of zelfde inhoud | geslaagd | test_werkbronnen.BronnenTest.test_geen_dubbele_bron_bij_retry_of_zelfde_inhoud |
| 53 | Bronnen | Verloren antwoord blijft enkelvoudig | geslaagd | test_werkbronnen.BronnenTest.test_verloren_antwoord_blijft_enkelvoudig |
| 54 | Bronnen | Https geen actieve schema of credentials | geslaagd | test_werkbronnen.BronnenTest.test_https_geen_actieve_schema_of_credentials |
| 55 | Bronnen | Verdwenen doel en explicit verwijderen bewaart document | geslaagd | test_werkbronnen.BronnenTest.test_verdwenen_doel_en_explicit_verwijderen_bewaart_document |
| 56 | Bronnen | Cloud lokaal geweigerd en toegang bij open opnieuw | geslaagd | test_werkbronnen.BronnenTest.test_cloud_lokaal_geweigerd_en_toegang_bij_open_opnieuw |
| 57 | Bronnen | Geen downloadurl in cloudkoppeling | geslaagd | test_werkbronnen.BronnenTest.test_geen_downloadurl_in_cloudkoppeling |
| 58 | Bronnen | Scherm notitie koppelen zoeken en veilige verwijdering | geslaagd | test_werkbronnen.BronnenTest.test_scherm_notitie_koppelen_zoeken_en_veilige_verwijdering |
| 59 | Bronnen | Csv samenvatting zonder ruwe rijen en accountwisseling | geslaagd | test_werkbronnen.BronnenTest.test_csv_samenvatting_zonder_ruwe_rijen_en_accountwisseling |
| 60 | Bronnen | Echte document- en bestandsautorisatie | open | Nog niet uitgevoerd: cloudrechten en ingetrokken toegang testen met echte accounts; lokale tests gebruiken mocks. |
| 61 | Back-up en herstel | Roundtrip en geen geheimen of bijlagen | geslaagd | test_planning_backup.BackupTest.test_roundtrip_en_geen_geheimen_of_bijlagen |
| 62 | Back-up en herstel | Controlesom en versie | geslaagd | test_planning_backup.BackupTest.test_controlesom_en_versie |
| 63 | Back-up en herstel | Json grenzen en dubbele velden | geslaagd | test_planning_backup.BackupTest.test_json_grenzen_en_dubbele_velden |
| 64 | Back-up en herstel | Ongeldige referenties cyclus duur en ids | geslaagd | test_planning_backup.BackupTest.test_ongeldige_referenties_cyclus_duur_en_ids |
| 65 | Back-up en herstel | Herstel remapt en behield bestaand | geslaagd | test_planning_backup.BackupTest.test_herstel_remapt_en_behield_bestaand |
| 66 | Back-up en herstel | Stale preview weigert schrijven | geslaagd | test_planning_backup.BackupTest.test_stale_preview_weigert_schrijven |
| 67 | Back-up en herstel | Verloren antwoord en atomische schrijffout | geslaagd | test_planning_backup.BackupTest.test_verloren_antwoord_en_atomische_schrijffout |
| 68 | Back-up en herstel | Voorbeeld schrijft niets en scherm vraagt akkoord | geslaagd | test_planning_backup.BackupTest.test_voorbeeld_schrijft_niets_en_scherm_vraagt_akkoord |
| 69 | Back-up en herstel | Selectieve export en herstel behouden gekozen verwijzingen | geslaagd | test_werkcontrole.WerkcontroleTest.test_selectieve_export_en_herstel_behouden_gekozen_verwijzingen |
| 70 | Back-up en herstel | Versleutelde back-up en sleutelbeheer | open | Nog niet aanwezig: de JSON-export is niet versleuteld. Eerst een herstelbaar sleutel- en wachtwoordontwerp maken. |
| 71 | Opslag | Twee servers dezelfde opdracht | geslaagd | test_veilige_opslag.VeiligeOpslagTest.test_twee_servers_dezelfde_opdracht |
| 72 | Opslag | Verouderde kopie kan niets overschrijven | geslaagd | test_veilige_opslag.VeiligeOpslagTest.test_verouderde_kopie_kan_niets_overschrijven |
| 73 | Opslag | Nieuw lezen maakt oude schrijfkopie niet geldig | geslaagd | test_veilige_opslag.VeiligeOpslagTest.test_nieuw_lezen_maakt_oude_schrijfkopie_niet_geldig |
| 74 | Opslag | Losstaande opdrachten en accounts | geslaagd | test_veilige_opslag.VeiligeOpslagTest.test_losstaande_opdrachten_en_accounts |
| 75 | Opslag | Gelijktijdig herstel is enkelvoudig en bewaart idverwijzingen | geslaagd | test_veilige_opslag.VeiligeOpslagTest.test_gelijktijdig_herstel_is_enkelvoudig_en_bewaart_idverwijzingen |
| 76 | Opslag | Gelijktijdige bronkoppelingen en accountgrens | geslaagd | test_veilige_opslag.VeiligeOpslagTest.test_gelijktijdige_bronkoppelingen_en_accountgrens |
| 77 | Opslag | Localeschrijffout behoudt oud bestand en ruimt op | geslaagd | test_focusplan.FocusplanTest.test_localeschrijffout_behoudt_oud_bestand_en_ruimt_op |
| 78 | Opslag | Beschadigde lokale opslag geeft gerichte fout | geslaagd | test_focusplan.FocusplanTest.test_beschadigde_lokale_opslag_geeft_gerichte_fout |
| 79 | Opslag | Json resultaat herkent mislukte subtest | geslaagd | test_controlegereedschap.GereedschapTest.test_json_resultaat_herkent_mislukte_subtest |
| 80 | Opslag | Echte Supabase-aanmelding en productiemigratie | open | Nog niet uitgevoerd: de lokale databasefixture bootst login na; er is geen productieverbinding of migratie uitgevoerd. |
| 81 | Sjablonen en conceptacties | Alleen herbruikbare velden | geslaagd | test_sjablonen.SjablonenTest.test_alleen_herbruikbare_velden |
| 82 | Sjablonen en conceptacties | Afspraak neemt alleen duur en locatie over | geslaagd | test_sjablonen.SjablonenTest.test_afspraak_neemt_alleen_duur_en_locatie_over |
| 83 | Sjablonen en conceptacties | Concept nieuwe geldigheid zonder code | geslaagd | test_sjablonen.SjablonenTest.test_concept_nieuwe_geldigheid_zonder_code |
| 84 | Sjablonen en conceptacties | Validatie geen bool als minuten of verkeerd soort | geslaagd | test_sjablonen.SjablonenTest.test_validatie_geen_bool_als_minuten_of_verkeerd_soort |
| 85 | Sjablonen en conceptacties | Prijs en geldigheid worden niet verwisseld | geslaagd | test_actielinks.ParserTest.test_prijs_en_geldigheid_worden_niet_verwisseld |
| 86 | Sjablonen en conceptacties | Sessieduur is geen automatische geldigheid | geslaagd | test_actielinks.ParserTest.test_sessieduur_is_geen_automatische_geldigheid |
| 87 | Sjablonen en conceptacties | Geen verzonnen prijs en geen brede trefwoordrouting | geslaagd | test_actielinks.ParserTest.test_geen_verzonnen_prijs_en_geen_brede_trefwoordrouting |
| 88 | Sjablonen en conceptacties | Onjuiste prijzen en geldigheid worden geweigerd | geslaagd | test_actielinks.ParserTest.test_onjuiste_prijzen_en_geldigheid_worden_geweigerd |
| 89 | Sjablonen en conceptacties | Geldigheid op exacte grens | geslaagd | test_actielinks.ParserTest.test_geldigheid_op_exacte_grens |
| 90 | Sjablonen en conceptacties | Betaalwebhooks en checkout | open | Nog niet uitgevoerd: de bestaande betaalintegratie vereist sandboxbetalingen en webhooktests; conceptlinks voeren geen betaling uit. |
| 91 | Nieuwe gereedschappen en bediening | Controle van geldige data schrijft niets | geslaagd | test_werkcontrole.WerkcontroleTest.test_controle_van_geldige_data_schrijft_niets |
| 92 | Nieuwe gereedschappen en bediening | Dubbele ids en achterlopende teller | geslaagd | test_werkcontrole.WerkcontroleTest.test_dubbele_ids_en_achterlopende_teller |
| 93 | Nieuwe gereedschappen en bediening | Ontbrekende verwijzingen en cyclus | geslaagd | test_werkcontrole.WerkcontroleTest.test_ontbrekende_verwijzingen_en_cyclus |
| 94 | Nieuwe gereedschappen en bediening | Overlap maar aansluiten is geen overlap | geslaagd | test_werkcontrole.WerkcontroleTest.test_overlap_maar_aansluiten_is_geen_overlap |
| 95 | Nieuwe gereedschappen en bediening | Onleesbare data en rapportlimiet zijn zichtbaar | geslaagd | test_werkcontrole.WerkcontroleTest.test_onleesbare_data_en_rapportlimiet_zijn_zichtbaar |
| 96 | Nieuwe gereedschappen en bediening | Rapport bevat geen titels notities of instellingen | geslaagd | test_werkcontrole.WerkcontroleTest.test_rapport_bevat_geen_titels_notities_of_instellingen |
| 97 | Nieuwe gereedschappen en bediening | Audit heeft precies honderd punten en open blijft open | geslaagd | test_controlegereedschap.GereedschapTest.test_audit_heeft_precies_honderd_punten_en_open_blijft_open |
| 98 | Nieuwe gereedschappen en bediening | Audit geeft overgeslagen bewijs geen groene status | geslaagd | test_controlegereedschap.GereedschapTest.test_audit_geeft_overgeslagen_bewijs_geen_groene_status |
| 99 | Nieuwe gereedschappen en bediening | Werkstroom met echte schermen en opslag | geslaagd | test_gebruikersstroom.GebruikersstroomTest.test_werkstroom_met_echte_schermen_en_opslag |
| 100 | Nieuwe gereedschappen en bediening | Schermlezer en toetsenbordaudit | open | Nog niet uitgevoerd: volledige handmatige controle op focusvolgorde, foutmeldingen en schermlezernamen. |
