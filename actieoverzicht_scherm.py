"""Accountgebonden activiteiten met filters, export en veilige herstelactie."""

import json
from datetime import datetime
from zoneinfo import ZoneInfo
import streamlit as st
import actieoverzicht
import opslag


def pagina() -> None:
    import universal_os
    universal_os.bewaak_account()
    st.subheader("Activiteitenoverzicht")
    st.caption("Opgeslagen assistentopdrachten, conceptactielinks en bevestigde herstelacties. Losse gesprekken, niet-opgeslagen voorstellen en mislukte pogingen staan hier niet in.")
    regels = actieoverzicht.overzicht(opslag.laden(vers=True))
    if not regels:
        st.info("Er zijn nog geen opgeslagen opdrachten.")
        return
    soorten = st.multiselect("Onderdeel", sorted({r["soort"] for r in regels}))
    statussen = st.multiselect("Status", sorted({r["status"] for r in regels}))
    zoek = st.text_input("Zoek in activiteiten", max_chars=160).casefold().strip()
    selectie = [r for r in regels if (not soorten or r["soort"] in soorten)
                and (not statussen or r["status"] in statussen) and zoek in r["titel"].casefold()]
    st.caption(f"{len(selectie)} van {len(regels)} activiteiten")
    st.download_button("Exporteer deze selectie (JSON)", json.dumps(selectie, ensure_ascii=False, indent=2),
                       file_name="activiteiten.json", mime="application/json", on_click="ignore")
    pagina_nr = st.number_input("Pagina", min_value=1, max_value=max(1, (len(selectie) + 24) // 25), step=1)
    for regel in selectie[(pagina_nr - 1) * 25:pagina_nr * 25]:
        with st.container(border=True):
            st.write(regel["titel"])
            st.caption(f"{regel['soort']} · {regel['status']}")
            try:
                tijd = datetime.fromisoformat(regel["tijd"])
                st.caption(tijd.astimezone(ZoneInfo("Europe/Amsterdam")).isoformat(timespec="minutes") if tijd.tzinfo else "Tijdzone onbekend")
            except (TypeError, ValueError):
                st.caption("Tijdstip niet vastgelegd bij deze oudere opdracht.")
            with st.expander("Gebruikte gegevens en beperkingen"):
                if regel["herkomst"]:
                    st.json(regel["herkomst"])
                else:
                    st.write("Bij deze oudere opdracht is geen herkomst vastgelegd.")
            if regel["terugdraaibaar"]:
                akkoord = st.checkbox("Ik wil deze opdracht terugdraaien", key="ao_akkoord_" + regel["id"])
                if st.button("Ongedaan maken", key="ao_undo_" + regel["id"], disabled=not akkoord):
                    resultaat = opslag.intentie_ongedaan(regel["id"])
                    st.info(resultaat["tekst"])
                    st.caption("Ververs het overzicht om de actuele status te zien.")
    if st.button("Ververs overzicht"):
        st.rerun()
