"""Data-minimal service preparation; never persists or forwards form choices."""
import service_intake_core as core


def render_preparation(st):
    st.caption("Bereid je dienst voor met vaste keuzes. Vul hier geen persoonsgegevens of gezondheidsinformatie in.")
    with st.form("service_preparation", clear_on_submit=True):
        service = st.selectbox("Dienst", core.SERVICES, index=None, placeholder="Kies een dienst")
        purpose = st.selectbox("Doel", core.PURPOSES, index=None, placeholder="Kies een doel")
        submitted = st.form_submit_button("Keuze bekijken")
    if submitted:
        try:
            request = core.prepare_service_request(service, purpose)
        except ValueError:
            st.warning("Kies een dienst en een doel.")
        else:
            st.write("Dienst: " + request.service)
            st.write("Doel: " + request.purpose)
            st.caption("Alleen hier getoond. Er is niets opgeslagen, gedeeld of geboekt.")
    st.caption("Deze voorbereiding gebruikt geen cliëntdossier, AI-verwerking, leergeheugen of agendasynchronisatie. Cliëntopslag blijft uitgeschakeld.")
