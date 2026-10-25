"""Instellingenhub voor de bestaande Streamlit-paginanavigatie.

Gebruik de bestaande instellingenrenderer als callback. Een tweede sidebar.radio
zou de mobiele hoofdnavigatie dupliceren en de scrollpositie verstoren.
"""
from collections.abc import Callable
import streamlit as st


def render_instellingen_hub(render: Callable[[], None] | None = None) -> None:
    """Toon instellingen zonder nieuwe navigatiewidgets of dubbele paginaroutes."""
    if render is None:
        st.info("Open Instellingen via de hoofdnavigatie.")
        return
    render()
