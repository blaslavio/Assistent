"""Isolated manual preview for the approved Rive assistant.

Run: streamlit run rive_preview.py
Does not modify the production app router or assistant backend.
"""
import streamlit as st

from rive_assistant import DEFAULT_ASSET, STATES, render_assistant_character

st.set_page_config(page_title="AI-assistent | Rive-test", layout="centered")
st.title("AI-assistent — Rive-test")
st.caption("Preview van het goedgekeurde karakter; geen verbinding met echte AI-antwoorden.")
state = st.selectbox("Animatiestand", STATES, format_func=lambda s: {
    "idle": "Rust", "listening": "Luisteren", "thinking": "Nadenken",
    "speaking": "Spreken", "success": "Succes", "error": "Fout"
}[s])
if not render_assistant_character(state):
    st.info("Plaats het goedgekeurde exportbestand op assets/assistant.riv om de animatie te bekijken.")
    st.code(str(DEFAULT_ASSET), language="text")
