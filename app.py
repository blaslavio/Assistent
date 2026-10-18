"""Webinterface van de assistent. Starten met: streamlit run app.py"""

import hmac
import os
from datetime import date, timedelta

import anthropic
import streamlit as st

import agent
import opslag

st.set_page_config(page_title="Mijn assistent", page_icon="✨", layout="centered")


def instelling(naam: str) -> str:
    """Lees een instelling uit .streamlit/secrets.toml of uit de omgeving."""
    try:
        if naam in st.secrets:
            return st.secrets[naam]
    except FileNotFoundError:
        pass
    return os.environ.get(naam, "")


# De opslag leest de Supabase-instellingen uit de omgeving.
for _naam in ("SUPABASE_URL", "SUPABASE_KEY", "SUPABASE_TOKEN"):
    if not os.environ.get(_naam) and instelling(_naam):
        os.environ[_naam] = instelling(_naam)


def wachtwoord_ok() -> bool:
    """Eenvoudige toegangscontrole zodat alleen jij de app kunt gebruiken."""
    wachtwoord = instelling("APP_WACHTWOORD")
    if not wachtwoord:
        st.error("Stel eerst APP_WACHTWOORD in (zie LEESMIJ.md).")
        return False
    if st.session_state.get("ingelogd"):
        return True
    invoer = st.text_input("Wachtwoord", type="password")
    if invoer and hmac.compare_digest(invoer, wachtwoord):
        st.session_state.ingelogd = True
        st.rerun()
    elif invoer:
        st.error("Onjuist wachtwoord.")
    return False


def zijbalk() -> None:
    with st.sidebar:
        st.header("Vandaag")
        vandaag = date.today()
        afspraken = opslag.afspraken_tussen(vandaag.isoformat(), (vandaag + timedelta(days=7)).isoformat())
        st.subheader("Agenda, komende 7 dagen")
        if afspraken:
            for a in afspraken:
                st.write(f"**{a['start'].replace('T', ' ')}** {a['titel']}")
        else:
            st.caption("Geen afspraken.")

        st.subheader("Open taken")
        taken = opslag.open_taken()
        if taken:
            for t in taken:
                st.write(f"- {t['titel']}" + (f" _(vóór {t['deadline']})_" if t["deadline"] else ""))
        else:
            st.caption("Geen open taken.")

        st.subheader("Leren")
        doelen = opslag.leerdoelen()
        if doelen:
            for d in doelen:
                st.write(d["onderwerp"])
                st.progress(opslag.voortgang(d) / 100)
            aantal = len(opslag.herhalingen_vandaag())
            if aantal:
                st.info(f"{aantal} stap(pen) om vandaag te herhalen.")
        else:
            st.caption("Nog geen leerdoelen.")


def foutmelding(fout: anthropic.APIError) -> str:
    if isinstance(fout, anthropic.AuthenticationError):
        return "De API-sleutel klopt niet. Controleer ANTHROPIC_API_KEY."
    if isinstance(fout, anthropic.RateLimitError):
        return "Het is even te druk. Probeer het over een minuut opnieuw."
    if isinstance(fout, anthropic.APIConnectionError):
        return "Geen verbinding met Claude. Controleer je internet."
    if isinstance(fout, anthropic.APIStatusError):
        return f"Er ging iets mis bij Claude (code {fout.status_code})."
    return "Er ging iets mis bij Claude."


def main() -> None:
    st.title("Mijn assistent")
    if not wachtwoord_ok():
        return

    sleutel = instelling("ANTHROPIC_API_KEY")
    if not sleutel:
        st.error("Stel eerst ANTHROPIC_API_KEY in (zie LEESMIJ.md).")
        return
    client = anthropic.Anthropic(api_key=sleutel)

    zijbalk()

    # Twee lijsten: wat de gebruiker ziet, en de volledige geschiedenis voor Claude.
    st.session_state.setdefault("chat", [])
    st.session_state.setdefault("berichten", [])

    for rol, tekst in st.session_state.chat:
        st.chat_message(rol).markdown(tekst)

    if vraag := st.chat_input("Waarmee kan ik helpen?"):
        st.chat_message("user").markdown(vraag)
        st.session_state.chat.append(("user", vraag))
        lengte_voor = len(st.session_state.berichten)
        st.session_state.berichten.append({"role": "user", "content": vraag})
        with st.chat_message("assistant"), st.spinner("Even denken..."):
            try:
                tekst = agent.antwoord(client, st.session_state.berichten)
            except anthropic.APIError as fout:
                # Gesprek terugzetten zodat een half afgemaakte beurt niet blijft hangen.
                del st.session_state.berichten[lengte_voor:]
                tekst = foutmelding(fout)
            st.markdown(tekst)
        st.session_state.chat.append(("assistant", tekst))
        st.rerun()

    if st.session_state.chat and st.button("Nieuw gesprek"):
        st.session_state.chat = []
        st.session_state.berichten = []
        st.rerun()


main()
