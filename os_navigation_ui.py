"""Focused navigation preview for Streamlit.

Does not override legacy routing; users can discover destinations without duplicate menus.
"""
import streamlit as st
from os_navigation import destinations_for


def render_os_navigation() -> None:
    with st.sidebar.expander("Snel vinden", expanded=False):
        query = st.text_input("Zoek een onderdeel", key="os_nav_search",
                              placeholder="Agenda, klanten, documenten...")
        results = destinations_for(query)
        if not results:
            st.caption("Geen overeenkomende onderdelen.")
            return
        for destination in results:
            st.markdown(f"**{destination.label}**")
            st.caption(destination.description)
