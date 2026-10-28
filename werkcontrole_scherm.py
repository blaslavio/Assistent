"""Leesgereedschap voor zoeken en gegevenskwaliteit, zonder automatische reparaties."""
import json
import streamlit as st
import gegevenscontrole
import opslag
import werkzoeken


def _account():
    account = (st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))
    if st.session_state.get("_wc_account") != account:
        for k in list(st.session_state):
            if k.startswith("wc_"):
                del st.session_state[k]
        st.session_state._wc_account = account


def zoeken_pagina():
    _account()
    st.subheader("Zoeken in mijn werk")
    st.caption("Zoekt alleen in je eigen opgeslagen taken, afspraken, bronnen en sjablonen. Geen accountinstellingen, cloudinhoud of externe websites.")
    vraag = st.text_input("Zoek op titel of inhoud", max_chars=160, key="wc_vraag")
    soorten = st.multiselect("Onderdelen om te doorzoeken", list(werkzoeken.SOORTEN), default=list(werkzoeken.SOORTEN), key="wc_soorten")
    open_ = st.checkbox("Alleen open taken en afspraken vanaf vandaag", key="wc_open")
    limiet = st.selectbox("Maximaal aantal resultaten", [25, 100, 500, 1000], index=3, key="wc_limiet")
    r = werkzoeken.zoek(opslag.laden(vers=True), vraag, soorten, open_, limiet=limiet)
    if not vraag.strip():
        st.info("Vul een zoekterm in. Accenten en hoofdletters maken geen verschil; alle woorden moeten voorkomen.")
        return
    st.caption(f"{r['totaal']} resultaten")
    if r.get("overgeslagen"):
        st.warning("Sommige gegevens zijn onleesbaar en overgeslagen. Bekijk Controle van mijn werkgegevens.")
    if r["begrensd"]:
        st.warning(f"De eerste {limiet} resultaten worden getoond. Verfijn je zoekopdracht.")
    pagina_max = max(1, (len(r["resultaten"]) + 24) // 25)
    if not 1 <= st.session_state.get("wc_page", 1) <= pagina_max:
        st.session_state.wc_page = 1
    pagina = st.number_input("Resultatenpagina", min_value=1, max_value=pagina_max, step=1, key="wc_page")
    for item in r["resultaten"][(pagina - 1) * 25:pagina * 25]:
        with st.container(border=True):
            st.text(item["titel"])
            st.caption(item["soort"] + " · " + item["status"] + (" · " + item["datum"] if item["datum"] else ""))
            if item["omschrijving"]:
                st.text(item["omschrijving"])
            if item["id"] is not None:
                if st.button("Open werkdossier", key="wc_context_" + item["soort"] + str(item["id"])):
                    import werkcontext_scherm
                    try:
                        werkcontext_scherm.openen(item["soort"], item["id"])
                    except ValueError as fout:
                        st.error(str(fout))
    st.download_button("Download deze zoekresultaten (JSON)", json.dumps(r, ensure_ascii=False, indent=2), file_name="werkzoekresultaten.json", mime="application/json", on_click="ignore")
    st.caption(f"De download bevat persoonlijke zoekresultaten, maximaal {limiet}. Bewaar deze zorgvuldig.")


def controle_pagina():
    _account()
    st.subheader("Controle van mijn werkgegevens")
    st.caption("Vindt fouten en aandachtspunten in de opgeslagen planning. Past niets aan en controleert geen externe diensten.")
    r = gegevenscontrole.controleer(opslag.laden(vers=True))
    if not r["volledig"]:
        st.warning("De controle is beperkt door onleesbare gegevens of de rapportlimiet. Niet alle gegevens zijn gecontroleerd.")
    elif not r["meldingen"]:
        st.success("Binnen deze controle zijn geen aandachtspunten gevonden.")
    st.write(r["samenvatting"])
    ernst = st.multiselect("Toon meldingen met niveau", ["fout", "waarschuwing", "informatie"], default=["fout", "waarschuwing", "informatie"], key="wc_ernst")
    st.dataframe([m for m in r["meldingen"] if m["ernst"] in ernst], hide_index=True)
    st.caption("IDs verwijzen naar records; de download bevat geen titels, notities, bron-URLs of accountgeheimen. Overlapmeldingen zijn aandachtspunten en kunnen bewust geplande afspraken betreffen.")
    st.download_button("Download gegevenscontrole (JSON)", json.dumps(r, ensure_ascii=False, indent=2), file_name="gegevenscontrole.json", mime="application/json", on_click="ignore")
    st.caption(r["beperking"])
