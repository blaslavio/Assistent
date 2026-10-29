"""Assistent op Streamlit: dit adres toont alleen de app uit web/ (gebouwd in nieuwe_app/).

De oude Streamlit-app is weg. Alle gegevens staan in Supabase en de app praat daar zelf mee; deze pagina zet hem
alleen op het scherm. Links met ?deel=, ?boek=, ?prik= en dergelijke handelt de app zelf af.
"""

import streamlit as st

import nieuwe_app

st.set_page_config(page_title="Assistent", page_icon=None, layout="wide", initial_sidebar_state="collapsed")
nieuwe_app.toon()
