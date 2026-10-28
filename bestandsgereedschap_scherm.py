"""Gereedschappen voor lokale uploads met blijvende downloadresultaten per sessie."""

import hashlib

import streamlit as st

import bestandsgereedschap as tools


def _account() -> None:
    account = (st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))
    if st.session_state.get("_bt_account") != account:
        for sleutel in ("bt_resultaat", "_bt_invoer", "bt_fout"):
            st.session_state.pop(sleutel, None)
        st.session_state.bt_ronde = st.session_state.get("bt_ronde", 0) + 1
        st.session_state._bt_account = account


def pagina() -> None:
    _account()
    st.subheader("Bestandsgereedschap")
    st.caption("Verwerking op deze server, zonder upload naar een externe dienst. Resultaten blijven in je huidige sessie.")
    keuze = st.selectbox("Bewerking", ["Comprimeren", "Video knippen", "CSV analyseren"], key="bt_bewerking")
    st.caption("Maximaal 10 MB; voor CSV maximaal 2 MB. Een download is geen openbare deellink.")
    bestand = st.file_uploader("Kies een bestand", key=f"bt_upload_{st.session_state.bt_ronde}")
    start, duur = 0.0, 10.0
    beschikbaar = True
    if keuze == "Video knippen":
        st.caption("MP4 of MOV · maximaal 60 seconden uitvoer · maximaal 720p · opnieuw gecodeerd naar H.264/AAC, met mogelijk kwaliteitsverlies.")
        start = st.number_input("Begin op seconde", min_value=0.0, max_value=3600.0, value=0.0, step=0.5, key="bt_start")
        duur = st.number_input("Fragmentduur in seconden", min_value=0.1, max_value=60.0, value=10.0, step=0.5, key="bt_duur")
        beschikbaar = tools.video_beschikbaar()
        if not beschikbaar:
            st.info("Voor video knippen moeten FFmpeg en FFprobe op de server zijn geïnstalleerd.")
    elif keuze == "CSV analyseren":
        st.caption("CSV in UTF-8 met unieke kolomnamen. Komma, puntkomma of tab; decimale komma en punt worden ondersteund, geen duizendtalscheiding.")
    inhoud = bestand.getvalue() if bestand is not None else None
    identiteit = (bestand.name, hashlib.sha256(inhoud).hexdigest(), keuze, start, duur) if bestand is not None else None
    if identiteit != st.session_state.get("_bt_invoer"):
        st.session_state.pop("bt_resultaat", None)
        st.session_state.pop("bt_fout", None)
        st.session_state._bt_invoer = identiteit
    if st.button("Verwerken", key="bt_verwerk", type="primary", disabled=bestand is None or not beschikbaar):
        st.session_state.pop("bt_resultaat", None)
        st.session_state.pop("bt_fout", None)
        try:
            with st.spinner("Bestand verwerken…"):
                if keuze == "Comprimeren":
                    resultaat = tools.comprimeer(bestand.name, inhoud)
                elif keuze == "Video knippen":
                    resultaat = tools.knip_video(bestand.name, inhoud, start, duur)
                else:
                    resultaat = tools.analyseer_csv(bestand.name, inhoud)
            st.session_state.bt_resultaat = resultaat
        except (tools.Fout, OSError) as fout:
            st.session_state.bt_fout = str(fout) if isinstance(fout, tools.Fout) else "Bestandsverwerking is niet gelukt. Probeer het opnieuw."
    if fout := st.session_state.get("bt_fout"):
        st.error(fout)
    if resultaat := st.session_state.get("bt_resultaat"):
        st.success("Verwerking geslaagd. Het resultaat staat hieronder klaar om te downloaden.")
        st.write(resultaat["naam"])
        if resultaat["soort"] == "gzip":
            st.write(f"Origineel: {resultaat['origineel']:,} bytes · gzip: {resultaat['grootte']:,} bytes")
            if resultaat["grootte"] < resultaat["origineel"]:
                st.caption(f"{resultaat['besparing']:.1f}% kleiner, zonder verlies van bestandsinhoud.")
            else:
                st.caption("Het gzipbestand is niet kleiner. Lege of al gecomprimeerde bestanden kunnen door gzip groter worden.")
            st.code(resultaat["sha256"], language=None)
            st.caption("SHA-256 van het oorspronkelijke bestand, voor vergelijking van de inhoud.")
        elif resultaat["soort"] == "video":
            st.caption(f"Vanaf {resultaat['start']:g} seconden · uitvoerduur {resultaat['duur']:.2f} seconden")
            st.video(resultaat["data"], format="video/mp4")
        else:
            st.write(f"{resultaat['rijen']} gegevensrijen · {len(resultaat['kolommen'])} kolommen")
            st.caption("Voorbeeld en grafiek tonen maximaal de eerste 200 rijen. Statistieken gebruiken alle rijen; lege en niet-numerieke velden worden apart geteld.")
            st.dataframe(resultaat["voorbeeld"], hide_index=True)
            st.dataframe(resultaat["statistieken"], hide_index=True)
            import werkbronnen_scherm
            werkbronnen_scherm.csv_koppelen(resultaat)
            if resultaat["grafiek"]:
                kolom = st.selectbox("Numerieke kolom voor grafiek", list(resultaat["grafiek"]), key="bt_grafiek")
                st.bar_chart({kolom: resultaat["grafiek"][kolom]})
        st.download_button("Resultaat downloaden", resultaat["data"], file_name=resultaat["naam"],
                           mime=resultaat["mime"], key="bt_download", on_click="ignore")
    if st.button("Bestand en resultaat wissen", key="bt_wissen"):
        for sleutel in ("bt_resultaat", "bt_fout", "_bt_invoer"):
            st.session_state.pop(sleutel, None)
        st.session_state.bt_ronde += 1
        st.rerun()
