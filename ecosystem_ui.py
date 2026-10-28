"""Master Hub role/command panel using local suggestions without side effects."""
import ecosystem_core as core


def render_command_stream(st):
    with st.expander("Co-Pilot en rollen", expanded=False):
        st.caption("Bereid je volgende stap voor. Je rol is een weergavekeuze en wijzigt je toegangsrechten niet.")
        with st.form("ecosystem_command", clear_on_submit=True):
            role = st.selectbox("Actieve rol", core.ROLES, key="ecosystem_role")
            prompt = st.text_input("Wat wil je voorbereiden?", max_chars=500)
            submitted = st.form_submit_button("Bekijk volgende stap")
        if submitted:
            # Discard previous navigation even if the new request is invalid.
            st.session_state.pop("master_hub_route", None)
            try:
                suggestion = core.suggest(prompt, role)
            except ValueError:
                st.warning("Kies een rol en schrijf een geldig verzoek van maximaal 500 tekens.")
            else:
                st.caption(suggestion.category + " - lokale suggestie")
                st.write(suggestion.message)
                st.session_state["master_hub_route"] = suggestion.route
        st.caption("Verzoeken worden door deze functie niet opgeslagen of doorgestuurd naar een AI-dienst. Publicaties, passen, wachtlijsten en afspraken worden niet automatisch aangemaakt.")
