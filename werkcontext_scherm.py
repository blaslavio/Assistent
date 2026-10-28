"""Eén werkdossier verbindt zoeken, bronnen, planning en sjablonen."""
import json
import streamlit as st
import opslag
import werkcontext


def _account():
    account = (st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))
    if st.session_state.get("_wk_account") != account:
        for k in list(st.session_state):
            if k.startswith("wk_"):
                del st.session_state[k]
        st.session_state._wk_account = account


def openen(soort, record_id):
    _account()
    st.session_state.wk_ref = werkcontext.verwijzing(soort, record_id)
    st.session_state.ga_naar = "werkdossier"
    st.rerun()


def _rijen(titel, records):
    if not records:
        return
    st.markdown("**" + titel + "**")
    for r in records:
        st.text(("Afgerond · " if r.get("klaar") else "") + (r.get("titel") or r.get("naam") or "Naam ontbreekt"))
        if st.button("Bekijk samenhang", key="wk_open_" + titel + str(r["id"])):
            openen(r["soort"], r["id"])


def pagina():
    _account()
    st.subheader("Werkdossier")
    st.caption("De huidige samenhang binnen je eigen account. Bekijken wijzigt niets; een voorstel of opslag vraagt afzonderlijk bevestiging.")
    ref = st.session_state.get("wk_ref")
    if not ref:
        st.info("Open een resultaat via Zoeken in mijn werk om het dossier te bekijken.")
        if st.button("Ga naar zoeken", key="wk_search"):
            st.session_state.ga_naar = "werkzoeken"
            st.rerun()
        return
    try:
        g = opslag.laden(vers=True)
        dossier = werkcontext.samenhang(g, ref["soort"], ref["id"])
    except ValueError as fout:
        st.warning(str(fout))
        if st.button("Kies ander werk", key="wk_ander"):
            st.session_state.pop("wk_ref", None)
            st.session_state.ga_naar = "werkzoeken"
            st.rerun()
        return
    hoofd = dossier["hoofd"]
    st.text(hoofd.get("titel") or hoofd.get("naam") or "Werkrecord")
    st.caption(hoofd["soort"] + " · " + str(hoofd["id"]) + ((" · afgerond" if hoofd.get("klaar") else " · open") if hoofd["soort"] == "taak" else ""))
    if type(hoofd.get("minuten")) is int:
        st.text(f"Duur: {hoofd['minuten']} minuten")
    if type(hoofd.get("resterend_minuten")) is int:
        st.text(f"Nog nodig: {hoofd['resterend_minuten']} minuten")
    for veld in ("deadline", "start", "einde", "locatie", "notitie", "tekst"):
        if hoofd.get(veld):
            st.text(veld.capitalize() + ": " + hoofd[veld])
    for m in dossier["meldingen"]:
        st.warning(m)
    _rijen("Gekoppelde taak", [dossier["taak"]] if dossier["taak"] and hoofd["soort"] != "taak" else [])
    _rijen("Eerst afronden", dossier["voorgangers"])
    _rijen("Vervolgtaken", dossier["vervolgtaken"])
    _rijen("Gekoppelde afspraken", dossier["afspraken"])
    if dossier["bronnen"]:
        with st.expander("Gekoppelde bronnen", expanded=True):
            for b in dossier["bronnen"]:
                st.text(b["titel"])
                if b["soort"] == "notitie":
                    st.text(b["tekst"])
                elif b["soort"] == "url":
                    st.link_button("Open webverwijzing", b["url"])
                else:
                    st.caption("Cloudbron: toegang wordt opnieuw gecontroleerd bij Bronnen bij werk.")
    if dossier["historie"]:
        with st.expander("Recente uitvoerhistorie"):
            for r in dossier["historie"]:
                st.text(r["tekst"])
                st.caption((r["tijd"] or "Tijdstip onbekend") + (" · ongedaan" if r["ongedaan"] else ""))
    if hoofd["soort"] in {"taak", "afspraak"}:
        if st.button("Voeg een bron toe bij dit werk", key="wk_add_bron"):
            import werkbronnen_scherm
            try:
                werkbronnen_scherm.voor_doel(hoofd["soort"], hoofd["id"])
            except ValueError as fout:
                st.error(str(fout))
            else:
                st.session_state.ga_naar = "werkbronnen"
                st.rerun()
        if st.button("Voorbereiden als sjabloon", key="wk_template"):
            import sjablonen_scherm
            try:
                origineel = werkbronnen_doel(g, hoofd["soort"], hoofd["id"])
                sjablonen_scherm.uit_werk(hoofd["soort"], origineel)
            except ValueError as fout:
                st.error(str(fout))
            else:
                st.session_state.ga_naar = "sjablonen"
                st.rerun()
    if hoofd["soort"] == "bron" and st.button("Open bronnenoverzicht", key="wk_bronnen"):
        st.session_state.ga_naar = "werkbronnen"
        st.rerun()
    st.download_button("Download werkdossier (JSON)", json.dumps(dossier, ensure_ascii=False, indent=2), file_name="werkdossier.json", mime="application/json", on_click="ignore")
    st.caption("Deze download bevat persoonlijke werkgegevens en notities. Accountinstellingen en cloudinhoud worden niet toegevoegd.")


def werkbronnen_doel(g, soort, record_id):
    import werkbronnen
    return werkbronnen.doel(g, soort, record_id)
