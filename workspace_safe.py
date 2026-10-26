"""Veilige, optionele kern voor de Streamlit multi-stream workspace."""
import os
import re
from datetime import datetime, timezone
from uuid import uuid4

CATEGORIES = ("Dienstverlening", "Events & Club", "Community", "Algemeen")

def privacy_guard(value: str) -> str:
    value = re.sub(r"(?i)\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b", "[IBAN]", value)
    value = re.sub(r"(?i)\b[\w.+-]+@[\w.-]+\.[A-Z]{2,}\b", "[EMAIL]", value)
    value = re.sub(r"(?<!\d)(?:\+31|0031|0)[\s-]?6(?:[\s-]?\d){8}(?!\d)", "[TELEFOON]", value)
    return value

def classify_intent(prompt: str) -> str:
    words = set(re.findall(r"\w+", prompt.casefold()))
    if words & {"client", "cliënt", "klant", "massage", "herstel", "spier", "blessure"}:
        return "Dienstverlening"
    if words & {"event", "club", "ticket", "toernooi", "wedstrijd"}:
        return "Events & Club"
    if words & {"community", "groep", "leden"}:
        return "Community"
    return "Algemeen"

def create_record(prompt: str, user_id: str, role: str) -> dict:
    if not user_id or not user_id.strip():
        raise PermissionError("Authenticatie vereist")
    if not prompt or not prompt.strip():
        raise ValueError("Opdracht mag niet leeg zijn")
    return {
        "id": str(uuid4()), "user_id": user_id, "type": classify_intent(prompt),
        "titel": privacy_guard(prompt.strip()), "role": role,
        "created_at": datetime.now(timezone.utc).isoformat(), "status": "nieuw",
    }

def ai_answer(prompt: str, role: str, api_key: str | None = None) -> str:
    key = api_key or os.getenv("GEMINI_API_KEY")
    if not key:
        return "AI is niet geconfigureerd. De opdracht is niet extern uitgevoerd."
    try:
        from google import genai
        client = genai.Client(api_key=key)
        response = client.models.generate_content(
            model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
            contents=f"Rol: {role}. Beantwoord de vraag feitelijk; beweer geen acties te hebben uitgevoerd. Vraag: {privacy_guard(prompt)}",
        )
        return response.text or "Geen antwoord ontvangen."
    except Exception:
        return "AI-aanvraag mislukt. Er zijn geen externe acties uitgevoerd."

def render_workspace(user_id: str, role: str = "Gebruiker") -> None:
    import streamlit as st
    if not user_id:
        st.error("Log eerst in.")
        return
    st.subheader("Workspace")
    records = st.session_state.setdefault("workspace_records", [])
    category = st.selectbox("Categorie", ("Alles",) + CATEGORIES)
    for record in records:
        if record["user_id"] == user_id and (category == "Alles" or record["type"] == category):
            with st.expander(record["titel"][:90]):
                st.caption(f'{record["type"]} · {record["status"]}')
                if record.get("answer"):
                    st.write(record["answer"])
    prompt = st.chat_input("Stel een vraag of maak een opdracht")
    if prompt:
        record = create_record(prompt, user_id, role)
        record["answer"] = ai_answer(prompt, role)
        records.insert(0, record)
        st.rerun()
