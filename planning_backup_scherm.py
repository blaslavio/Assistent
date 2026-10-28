"""Planning exporteren en uitsluitend na voorbeeld en bevestiging toevoegen."""
import hashlib
import uuid
import streamlit as st
import opslag
import planning_backup


def _account() -> None:
    account = (st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))
    if st.session_state.get("_pb_account") != account:
        for sleutel in list(st.session_state):
            if sleutel.startswith("pb_"):
                del st.session_state[sleutel]
        st.session_state._pb_account = account


def pagina() -> None:
    _account()
    st.subheader("Planningback-up en herstel")
    st.caption("Alleen taken, opgeslagen afspraken en sjablonen. Geen accountinstellingen, wachtwoorden, betalingen, cloudbestanden, documenten, herhaalregels of assistentgesprekken. Bevat persoonlijke titels en notities; bewaar het bestand zorgvuldig.")
    onderdelen = ["taken", "afspraken", "sjablonen"]
    export_keuze = st.multiselect("Onderdelen in de back-up", onderdelen, default=onderdelen, key="pb_export_keuze")
    export_bronnen = st.toggle("Neem gekoppelde notities en webverwijzingen mee", value=False, key="pb_export_bronnen")
    st.caption("Cloudkoppelingen en cloudinhoud worden niet meegenomen. Notities en webverwijzingen kunnen persoonlijke gegevens bevatten.")
    if (tuple(sorted(export_keuze)), export_bronnen) != st.session_state.get("pb_export_onderdelen"):
        st.session_state.pop("pb_export_data", None)
        st.session_state.pb_export_onderdelen = (tuple(sorted(export_keuze)), export_bronnen)
    if st.button("Maak planningback-up", key="pb_export", disabled=not export_keuze):
        st.session_state.pop("pb_export_data", None)
        try:
            st.session_state.pb_export_data = planning_backup.exporteer(opslag.laden(vers=True), export_keuze, bronnen=export_bronnen)
        except (ValueError, TypeError, KeyError) as fout:
            st.error("Back-up maken is niet gelukt. Controleer de planningsgegevens: " + str(fout))
        except (OSError, opslag.httpx.HTTPError):
            st.error("De gegevens konden niet worden opgehaald. Probeer opnieuw.")
    if data := st.session_state.get("pb_export_data"):
        st.download_button("Download planningback-up (JSON)", data, file_name="assistent-planning.json", mime="application/json", key="pb_download", on_click="ignore")
        st.caption("De SHA-256-controlesom detecteert wijzigingen, maar bewijst niet wie het bestand heeft gemaakt.")
    st.subheader("Herstel voorbereiden")
    upload = st.file_uploader("Kies een planningback-up (JSON, maximaal 5 MB)", type=["json"], key="pb_upload_" + str(st.session_state.get("pb_upload_ronde", 0)), disabled=bool(st.session_state.get("pb_preview", {}).get("ingediend")))
    herstel_keuze = st.multiselect("Onderdelen om toe te voegen", onderdelen, default=onderdelen, key="pb_herstel_keuze", disabled=bool(st.session_state.get("pb_preview", {}).get("ingediend")))
    herstel_bronnen = st.toggle("Voeg meegeleverde notities en webverwijzingen ook toe", value=True, key="pb_herstel_bronnen", disabled=bool(st.session_state.get("pb_preview", {}).get("ingediend")))
    st.caption("Bij alleen afspraken worden taakverwijzingen weggelaten. Afhankelijkheden tussen meegenomen taken blijven behouden.")
    data = upload.getvalue() if upload is not None else None
    identiteit = (hashlib.sha256(data).hexdigest(), tuple(sorted(herstel_keuze)), herstel_bronnen) if data else None
    if identiteit != st.session_state.get("pb_upload_hash"):
        st.session_state.pb_upload_hash = identiteit
        st.session_state.pop("pb_preview", None)
    if st.button("Controleer bestand en toon herstelvoorbeeld", disabled=data is None or not herstel_keuze or bool(st.session_state.get("pb_preview", {}).get("ingediend")), key="pb_prepare"):
        st.session_state.pop("pb_preview", None)
        try:
            gekozen_data = planning_backup.selecteer(data, herstel_keuze, bronnen=herstel_bronnen)
            backup = planning_backup.lees(gekozen_data)
            huidig = opslag.laden(vers=True)
            voorstel = planning_backup.voorvertoning(backup, huidig)
            st.session_state.pb_preview = {"id": uuid.uuid4().hex, "data": gekozen_data, "voorstel": voorstel}
        except (ValueError, TypeError, KeyError) as fout:
            st.error(str(fout))
        except (OSError, opslag.httpx.HTTPError):
            st.error("Je huidige gegevens konden niet worden opgehaald. Probeer opnieuw.")
    if p := st.session_state.get("pb_preview"):
        v = p["voorstel"]
        if p.get("ingediend"):
            st.info("Herstel is nog niet bevestigd. Probeer dezelfde herstelknop opnieuw. Sessiegegevens wissen maakt eventueel al opgeslagen wijzigingen niet ongedaan.")
        st.warning(v["uitleg"])
        st.table([{"Onderdeel": k, "Nu aanwezig": v["huidig"][k], "Toevoegen": v["toevoegen"][k]} for k in v["toevoegen"]])
        with st.form("pb_bevestig_" + p["id"]):
            akkoord = st.checkbox("Ik wil deze gegevens toevoegen aan mijn huidige account")
            ja = st.form_submit_button("Voeg back-up toe", key="pb_apply")
        if ja:
            if not akkoord:
                st.error("Vink de bevestiging aan voordat je de back-up toevoegt.")
            else:
                try:
                    p["ingediend"] = True
                    r = opslag.planning_herstellen(p["id"], p["data"], v["basis"])
                except opslag.GeenToegang:
                    raise
                except (ValueError, opslag.OpslagConflict, opslag.OpslagNietIngericht, OSError, opslag.httpx.HTTPError) as fout:
                    if isinstance(fout, (ValueError, opslag.OpslagNietIngericht)):
                        p.pop("ingediend", None)
                    st.error(str(fout) if isinstance(fout, ValueError) else "Herstel is niet bevestigd. Gebruik dezelfde herstelknop opnieuw; de gegevens worden niet dubbel toegevoegd.")
                else:
                    st.success("Planning toegevoegd. Bestaande gegevens zijn behouden.")
                    st.json(r["toegevoegd"])
                    st.session_state.pop("pb_preview", None)
                    st.session_state.pop("pb_export_data", None)
    if st.button("Wis back-upgegevens uit deze sessie", key="pb_clear"):
        st.session_state.pb_upload_ronde = st.session_state.get("pb_upload_ronde", 0) + 1
        for k in ("pb_export_data", "pb_preview", "pb_upload_hash"):
            st.session_state.pop(k, None)
        st.rerun()
