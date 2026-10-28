"""Read-only Streamlit integration of the new OS workflow planning layer.

This intentionally does not bypass existing booking, messaging or payment services.
"""
import streamlit as st

from universal_intent import Action, plan_request
from universal_actions import CONTRACTS


def render_intent_preview() -> None:
    with st.expander("Slimme workflow (voorbeeld)", expanded=False):
        request = st.text_input("Wat wil je regelen?", key="uos_intent_request",
                                placeholder="Plan een intake en bereid een bevestiging voor")
        if not request.strip():
            st.caption("Beschrijf een taak om de voorgestelde stappen te bekijken.")
            return
        allowed = [action for action in Action if action.value in CONTRACTS]
        try:
            plan = plan_request(request, allowed_actions=allowed)
        except (ValueError, PermissionError) as exc:
            st.warning(str(exc))
            return
        if not plan.steps:
            st.info("Er is meer informatie nodig om een workflow voor te stellen.")
            return
        st.caption("Alleen een voorstel. Er worden geen afspraken, berichten of betalingen uitgevoerd.")
        for index, step in enumerate(plan.steps, 1):
            st.write(f"{index}. {step.action.value}")
        st.info("Uitvoering is nog niet ingeschakeld; daarvoor zijn geauthenticeerde koppelingen en toestemming nodig.")
