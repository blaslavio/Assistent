"""Voorbereiding van betaalverzoeken, reviews en leerbeloningen.

Geen betaalprovider actief totdat server-side verificatie is ingericht.
Nooit een saldo bijschrijven op basis van browserstatus of een klik.
"""
import os
from decimal import Decimal, InvalidOperation
import streamlit as st


def provider_status() -> dict:
    """Alleen aanwezigheid van configuratie; geen claim van werkende koppeling."""
    return {
        "stripe": bool(os.getenv("STRIPE_SECRET_KEY") and os.getenv("STRIPE_WEBHOOK_SECRET")),
        "mollie": bool(os.getenv("MOLLIE_API_KEY") and os.getenv("MOLLIE_WEBHOOK_SECRET")),
    }


def pagina() -> None:
    st.markdown("### Betalingen, reviews & beloningen")
    st.caption("Voorbereiden kan al. Uitvoering volgt na veilige providerkoppeling.")
    status = provider_status()
    st.caption("Stripe: configuratie aanwezig" if status["stripe"] else "Stripe: nog niet geconfigureerd")
    st.caption("Mollie: configuratie aanwezig" if status["mollie"] else "Mollie: nog niet geconfigureerd")

    with st.expander("Betaalverzoek voorbereiden", icon=":material/request_quote:"):
        with st.form("integratie_betaalconcept"):
            ontvanger = st.text_input("Ontvanger of klant")
            omschrijving = st.text_input("Omschrijving")
            bedrag = st.number_input("Bedrag in euro", min_value=0.01, value=25.00, step=1.0)
            if st.form_submit_button("Concept bewaren"):
                st.session_state["betaalverzoek_concept"] = {
                    "ontvanger": ontvanger.strip()[:160],
                    "omschrijving": omschrijving.strip()[:300],
                    "bedrag_cent": int((Decimal(str(bedrag)) * 100).quantize(Decimal("1"))),
                    "status": "concept",
                }
                st.success("Concept bewaard voor deze sessie. Er is niets verstuurd of afgeschreven.")
        if concept := st.session_state.get("betaalverzoek_concept"):
            st.write("Huidig concept:", concept["omschrijving"], "— €", f'{concept["bedrag_cent"]/100:.2f}')
            st.info("Betaallink en verzending worden beschikbaar na server-side koppeling en bevestiging.")

    with st.expander("Reviewuitnodiging voorbereiden", icon=":material/rate_review:"):
        with st.form("integratie_reviewconcept"):
            klant = st.text_input("Klant")
            dienst = st.text_input("Afgeronde dienst")
            if st.form_submit_button("Uitnodiging voorbereiden"):
                st.session_state["reviewuitnodiging_concept"] = {
                    "klant": klant.strip()[:160], "dienst": dienst.strip()[:200],
                    "status": "concept",
                }
                st.success("Concept bewaard. Geen uitnodiging verstuurd.")
        st.caption("Publicatie en verificatie van beoordelingen worden later gekoppeld aan afgeronde opdrachten.")

    with st.expander("Learn & Earn voorbereiden", icon=":material/school:"):
        st.info("Cursussen en voortgang blijven in de bestaande leermodule. Geldbeloningen staan uit totdat financiering, voorwaarden en uitbetaling zijn geverifieerd.")


# Nog in te vullen bij activering:
# STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
# MOLLIE_API_KEY, MOLLIE_WEBHOOK_SECRET
# Productie vereist: accountgebonden database, idempotente webhookverwerking,
# server-side verificatie van bedragen en status, auditlog, refunds en toegangscontrole.

def intent_naar_concept(tekst: str) -> dict:
    """Herken uitsluitend een eenvoudig betaalverzoek; voer niets uit."""
    import re
    tekst = tekst.strip()
    patroon = re.search(r"(?:€\s*|(?:van|voor)\s+)(\d+(?:[.,]\d{1,2})?)\s*(?:euro)?|\b(\d+(?:[.,]\d{1,2})?)\s*euro\b", tekst, re.I)
    is_betaling = bool(re.search(r"betaalverzoek|betaling vragen|factuur", tekst, re.I))
    if not is_betaling or not patroon:
        return {"type": "onbekend", "tekst": tekst}
    try:
        cent = int((Decimal((patroon.group(1) or patroon.group(2)).replace(",", ".")) * 100).quantize(Decimal("1")))
    except (InvalidOperation, ValueError):
        return {"type": "onbekend", "tekst": tekst}
    if not 1 <= cent <= 100000000:
        return {"type": "onbekend", "tekst": tekst}
    return {"type": "betaalconcept", "omschrijving": tekst[:300], "bedrag_cent": cent}


def intent_parser_pagina() -> None:
    st.markdown("#### Slimme opdracht")
    st.caption("Beschrijf je verzoek. De assistent maakt alleen een voorstel, nooit automatisch een betaling.")
    with st.form("intent_parser_concept_form"):
        opdracht = st.text_input("Opdracht", value=st.session_state.pop("pay_chat_opdracht", ""), placeholder="Maak een betaalverzoek van 75 euro voor een intake")
        ingediend = st.form_submit_button("Voorstel maken")
    if ingediend:
        st.session_state["intent_voorstel"] = intent_naar_concept(opdracht)
    voorstel = st.session_state.get("intent_voorstel")
    if not voorstel:
        return
    if voorstel["type"] == "betaalconcept":
        st.write(f'Betaalverzoek als concept: € {voorstel["bedrag_cent"] / 100:.2f}')
        st.caption(voorstel["omschrijving"])
        if st.button("Concept bevestigen", key="intent_bevestigen"):
            st.session_state["betaalverzoek_concept"] = {
                "ontvanger": "", "omschrijving": voorstel["omschrijving"],
                "bedrag_cent": voorstel["bedrag_cent"], "status": "concept",
            }
            st.success("Concept opgeslagen voor deze sessie. Er is niets verzonden of betaald.")
    else:
        st.info("Deze opdracht wordt nog niet automatisch uitgevoerd. Gebruik de bestaande agenda of chat voor andere acties.")
