"""Isolated event-driven Rive preview; no production router changes.

Run: streamlit run rive_preview.py
"""
import streamlit as st

from rive_assistant import DEFAULT_ASSET
from rive_chat_state import AssistantEvent, render_for_event, state_for_event

st.set_page_config(page_title="AI-assistent | Rive-test", layout="centered")
st.title("AI-assistent — Rive-test")
st.caption("Test de UI-reacties. Dit scherm simuleert gebeurtenissen; het voert geen echte AI-opdrachten uit.")
event = st.selectbox("Gebeurtenis", list(AssistantEvent), format_func=lambda e: {
    AssistantEvent.READY: "Gereed",
    AssistantEvent.USER_TYPING: "Gebruiker typt",
    AssistantEvent.USER_RECORDING: "Gebruiker spreekt",
    AssistantEvent.REQUEST_STARTED: "Verzoek gestart",
    AssistantEvent.RESPONSE_RECEIVED: "Antwoord ontvangen",
    AssistantEvent.RESPONSE_PRESENTED: "Antwoord getoond",
    AssistantEvent.ACTION_SUCCEEDED: "Actie geslaagd",
    AssistantEvent.ACTION_FAILED: "Actie mislukt",
}[e])
st.caption("Rive-status: " + state_for_event(event))
if not render_for_event(event):
    st.info("Het goedgekeurde Rive-exportbestand ontbreekt. Voeg assets/assistant.riv toe om het karakter te tonen.")
    st.code(str(DEFAULT_ASSET), language="text")
