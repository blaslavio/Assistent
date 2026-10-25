import os
import json
import streamlit as st
from google import genai

try:
    from supabase import create_client
except ImportError:
    create_client = None

# ==========================================
# 1. PAGINA CONFIGURATIE & HIGH-END DESIGN
# ==========================================
st.set_page_config(
    page_title="SuperApp OS",
    page_icon=None,
    layout="centered",
    initial_sidebar_state="collapsed"
)

st.markdown("""
    <style>
    /* Strakke, uniforme typografie */
    html, body, [class*="css"], .stMarkdown, p, h1, h2, h3, h4, h5, h6, label {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #f4f4f5;
        text-align: left !important;
    }
    
    .stApp {
        background-color: #09090b;
    }

    /* App Header */
    .app-header {
        padding: 8px 0 20px 0;
        border-bottom: 1px solid #27272a;
        margin-bottom: 24px;
    }
    .app-title {
        font-size: 1.25rem;
        font-weight: 600;
        letter-spacing: -0.03em;
        color: #ffffff;
        margin: 0;
    }
    .app-subtitle {
        font-size: 0.82rem;
        color: #a1a1aa;
        margin-top: 4px;
    }

    /* Strakke minimalistische kaarten (Geen rommelige knoppen) */
    .notion-card {
        background: #121216;
        border: 1px solid #27272a;
        border-radius: 8px;
        padding: 16px 18px;
        margin-bottom: 12px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }
    .card-title {
        font-size: 0.9rem;
        font-weight: 600;
        color: #ffffff;
        margin-bottom: 4px;
    }
    .card-meta {
        font-size: 0.8rem;
        color: #a1a1aa;
    }

    /* Verberg standaard Streamlit elementen */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    header {visibility: hidden;}
    </style>
""", unsafe_allow_html=True)

# ==========================================
# 2. STATE INITIALISATIE
# ==========================================
if "nav_tab" not in st.session_state:
    st.session_state.nav_tab = "Agenda"

if "agenda_items" not in st.session_state:
    st.session_state.agenda_items = [
        {"titel": "Strategische Q4 Planning", "tijd": "09:00 - 10:30", "datum": "26-10-2026"}
    ]

if "taken_items" not in st.session_state:
    st.session_state.taken_items = [
        {"titel": "Supabase RLS beveiliging controleren", "status": "Open"}
    ]

if "samen_items" not in st.session_state:
    st.session_state.samen_items = [
        {"titel": "Gezin Sanne - Boodschappen & Kosten", "type": "Gezin"}
    ]

# ==========================================
# 3. UNIFORME, SLANKE NAVIGATIE
# ==========================================
st.markdown("<div class='app-header'><div class='app-title'>SuperApp OS</div><div class='app-subtitle'>Minimalistische workspace & planning</div></div>", unsafe_allow_html=True)

# Strakke selectie in plaats van rommelige knoppenstapels
nav_opsies = ["Agenda", "Taken", "Plannen", "Samenwerking", "Instellingen"]
geselecteerd = st.selectbox("Navigatie", nav_opsies, label_visibility="collapsed")

st.markdown("<br>", unsafe_allow_html=True)

# ==========================================
# 4. PAGINA INHOUD (VOLLEDIG UNIFORM)
# ==========================================

if geselecteerd == "Agenda":
    st.markdown("### Agenda & Planning")
    st.markdown("<div class='card-meta'>Overzicht van al je geplande afspraken.</div><br>", unsafe_allow_html=True)
    
    for item in st.session_state.agenda_items:
        st.markdown(
            f"<div class='notion-card'>"
            f"<div class='card-title'>{item['titel']}</div>"
            f"<div class='card-meta'>Tijd: {item['tijd']} &bull; Datum: {item['datum']}</div>"
            f"</div>",
            unsafe_allow_html=True
        )

elif geselecteerd == "Taken":
    st.markdown("### Taken & To-Do's")
    st.markdown("<div class='card-meta'>Beheer je actiepunten strak en overzichtelijk.</div><br>", unsafe_allow_html=True)
    
    for taak in st.session_state.taken_items:
        st.markdown(
            f"<div class='notion-card'>"
            f"<div class='card-title'>{taak['titel']}</div>"
            f"<div class='card-meta'>Status: {taak['status']}</div>"
            f"</div>",
            unsafe_allow_html=True
        )

elif geselecteerd == "Plannen":
    st.markdown("### Strategisch Plannen")
    st.markdown("<div class='card-meta'>Doelstellingen en lange termijn workflows.</div><br>", unsafe_allow_html=True)
    st.markdown("<div class='notion-card'><div class='card-title'>Q4 Optimalisatie</div><div class='card-meta'>Doorlopende synchronisatie en architectuurverbetering.</div></div>", unsafe_allow_html=True)

elif geselecteerd == "Samenwerking":
    st.markdown("### Samenwerking & Team")
    st.markdown("<div class='card-meta'>Gedeelde huishoudens, projecten en kosten zonder duplicaten.</div><br>", unsafe_allow_html=True)
    
    for s in st.session_state.samen_items:
        st.markdown(
            f"<div class='notion-card'>"
            f"<div class='card-title'>{s['titel']}</div>"
            f"<div class='card-meta'>Categorie: {s['type']} &bull; Realtime gesynchroniseerd</div>"
            f"</div>",
            unsafe_allow_html=True
        )

elif geselecteerd == "Instellingen":
    st.markdown("### Systeeminstellingen")
    st.markdown("<div class='card-meta'>Beheer je workspace configuratie en voorkeuren.</div><br>", unsafe_allow_html=True)
    
    with st.form("settings_clean_form"):
        st.text_input("Workspace Naam", value="Studio Minimalist OS")
        st.checkbox("Dark Mode / Monochrome UI", value=True)
        st.form_submit_button("Wijzigingen Opslaan")
