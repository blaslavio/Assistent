"""Compact Azure controls. Explicit actions only; no automatic document upload or recording."""
import streamlit as st

import azure_documents
import azure_search_ready
import azure_services
import documenten
import opslag


def _configured(factory):
    try:
        return bool(factory())
    except (ValueError, azure_services.AzureError):
        return False


def settings():
    inst = opslag.instellingen()
    ai = _configured(azure_services.openai_config)
    speech = _configured(azure_services.speech_config)
    search = _configured(azure_search_ready.azure_config)
    st.caption("Configuratie op de server: " + " · ".join(
        f"{label}: {'aanwezig' if ready else 'ontbreekt'}"
        for label, ready in (("AI", ai), ("Documentzoeken", search), ("Spraak", speech))))
    st.caption("Aanwezige configuratie bewijst nog geen werkende verbinding. Acties kunnen Azure-verbruik veroorzaken.")
    with st.expander("AI-verbinding testen"):
        st.caption("De test stuurt alleen een korte testzin, geen accountgegevens.")
        if st.button("Test Azure OpenAI", key="azure_ai_test", disabled=not ai):
            try:
                st.success(azure_services.test_openai())
            except azure_services.AzureError as error:
                st.error(str(error))
    with st.expander("Eigen documenten doorzoeken"):
        st.caption("Alleen geselecteerde privédocumenten worden naar Azure gestuurd. Zakelijke en community-indexen zijn niet aangesloten.")
        consent = st.checkbox("Mijn zoekvragen en geselecteerde documentinhoud naar Azure sturen",
                              key="azure_index_consent")
        use_in_chat = st.toggle("Azure-documentzoeken gebruiken in de assistent",
                               value=bool(inst.get("azure_documentzoeken", False)),
                               disabled=not search, key="azure_documentzoeken_aan")
        if use_in_chat != bool(inst.get("azure_documentzoeken", False)):
            opslag.instellingen_bijwerken(azure_documentzoeken=use_in_chat)
        if use_in_chat:
            st.caption("Bij documentvragen krijgt het gekozen AI-model de gevonden fragmenten. Zet dit uit om daarmee te stoppen.")
        if search:
            try:
                docs = documenten.lijst()
                names = {d["id"]: d.get("titel", "Document") for d in docs}
                selected = st.multiselect("Documenten", list(names), format_func=lambda i: names[i],
                                          max_selections=10, key="azure_selected_docs")
                if st.button("Selectie indexeren", disabled=not consent or not selected, key="azure_index"):
                    count = azure_documents.index_documents(selected, consent=consent)
                    st.success(f"{count} documentdelen geïndexeerd.")
                query = st.text_input("Zoek in de Azure-index", max_chars=500, key="azure_query")
                if st.button("Zoeken", disabled=not consent or not query.strip(), key="azure_search"):
                    results = azure_documents.search(query, consent=consent)
                    for result in results:
                        st.write(result["titel"])
                        st.caption(result["bron"])
                        st.text(result["fragment"])
                    if not results:
                        st.info("Geen actuele toegankelijke fragmenten gevonden. Indexeer gewijzigde documenten opnieuw.")
                with st.expander("Documenten uit Azure verwijderen"):
                    st.caption("Verwijdert de zoekkopieën; de oorspronkelijke documenten blijven behouden.")
                    ids = st.text_input("Documentnummers, gescheiden door komma's", key="azure_delete_ids")
                    confirmed = st.checkbox("Deze zoekkopieën verwijderen", key="azure_delete_consent")
                    if st.button("Verwijderen uit Azure", disabled=not confirmed or not ids.strip(), key="azure_delete"):
                        count = azure_documents.remove_documents([int(i.strip()) for i in ids.split(",")], consent=confirmed)
                        st.success(f"Zoekkopieën van {count} documenten verwijderd.")
            except (azure_services.AzureError, PermissionError, ValueError, documenten.Fout):
                st.error("De documentactie is niet voltooid. Controleer de selectie, toegang en Azure Search-configuratie.")
        else:
            st.info("De Azure-zoekindex en serversleutels moeten nog worden ingesteld.")
    with st.expander("Azure-stem"):
        voice_on = st.toggle("Antwoorden met Azure laten voorlezen", value=bool(inst.get("azure_spraak_aan", False)),
                             key="azure_voice_enabled", disabled=not speech)
        if voice_on != bool(inst.get("azure_spraak_aan", False)):
            opslag.instellingen_bijwerken(azure_spraak_aan=voice_on)
        st.caption("Ingeschakeld: antwoordtekst wordt naar Azure Speech gestuurd. Accent en tempo volgen je steminstellingen.")
        if st.button("Test Azure-stem", key="azure_voice_test", disabled=not speech):
            try:
                st.audio(azure_services.speech_audio("De Azure-stem is klaar voor gebruik."), format="audio/mpeg")
            except azure_services.AzureError as error:
                st.error(str(error))


def recording():
    if not _configured(azure_services.speech_config):
        return None
    with st.expander("Inspreken met Azure", expanded=False):
        st.caption("Neem maximaal 60 seconden op. Alleen bij Omzetten wordt de opname naar Azure gestuurd.")
        audio = st.audio_input("Opname", sample_rate=16000, key="azure_recording")
        if st.button("Omzetten naar tekst", key="azure_transcribe", disabled=audio is None):
            try:
                st.session_state.azure_transcript = azure_services.transcribe(audio.getvalue())
            except azure_services.AzureError as error:
                st.error(str(error))
        if st.session_state.get("azure_transcript"):
            text = st.text_area("Herkende tekst controleren", value=st.session_state.azure_transcript,
                                key="azure_transcript_edit")
            if st.button("Gebruik tekst in chat", key="azure_send_transcript") and text.strip():
                st.session_state.pop("azure_transcript", None)
                st.session_state.pop("azure_transcript_edit", None)
                return text.strip()
    return None
