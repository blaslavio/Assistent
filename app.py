"""Webinterface van de assistent. Starten met: streamlit run app.py"""

import hashlib
import hmac
import os
import secrets
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


def _hash(wachtwoord: str, zout: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", wachtwoord.encode(), bytes.fromhex(zout), 200_000).hex()


def wachtwoord_klopt(invoer: str) -> bool:
    if vast := instelling("APP_WACHTWOORD"):
        return hmac.compare_digest(invoer, vast)
    opgeslagen = opslag.instellingen()
    if "wachtwoord_hash" not in opgeslagen:
        return False
    return hmac.compare_digest(_hash(invoer, opgeslagen["wachtwoord_zout"]), opgeslagen["wachtwoord_hash"])


def anthropic_sleutel() -> str:
    return instelling("ANTHROPIC_API_KEY") or opslag.instellingen().get("anthropic_sleutel", "")


def sleutel_werkt(sleutel: str) -> str | None:
    """Test de sleutel bij Anthropic. Geeft een foutmelding terug, of None als hij werkt."""
    try:
        anthropic.Anthropic(api_key=sleutel).models.list(limit=1)
    except anthropic.AuthenticationError:
        return "Deze sleutel werkt niet bij Anthropic. Maak een nieuwe aan via Create Key."
    except anthropic.PermissionDeniedError:
        return "Deze sleutel heeft geen toegang. Controleer je tegoed bij Anthropic."
    except anthropic.APIError:
        return "Anthropic is even niet bereikbaar. Probeer het zo opnieuw."
    return None


def sleutel_formulier(knoptekst: str) -> str | None:
    """Veld om de Anthropic-sleutel in te vullen. Geeft de sleutel terug als hij werkt."""
    sleutel = "".join(st.text_input("Anthropic-sleutel", type="password").split())
    if st.button(knoptekst):
        if not sleutel:
            st.error("Plak eerst je Anthropic-sleutel.")
            return None
        with st.spinner("Sleutel controleren..."):
            fout = sleutel_werkt(sleutel)
        if fout:
            st.error(fout)
            return None
        return sleutel
    return None


def eerste_keer() -> None:
    """Eenmalig instellen: wachtwoord kiezen en Anthropic-sleutel invullen."""
    st.subheader("Welkom! Eerst even instellen")
    st.write("Kies een wachtwoord en plak je Anthropic-sleutel. Dit hoef je maar één keer te doen.")
    wachtwoord = st.text_input("Kies een wachtwoord", type="password")
    herhaling = st.text_input("Herhaal het wachtwoord", type="password")
    if sleutel := sleutel_formulier("Opslaan"):
        if len(wachtwoord) < 8:
            st.error("Kies een wachtwoord van minstens 8 tekens.")
        elif wachtwoord != herhaling:
            st.error("De wachtwoorden zijn niet gelijk.")
        else:
            zout = secrets.token_hex(16)
            opslag.instellingen_bijwerken(
                wachtwoord_zout=zout, wachtwoord_hash=_hash(wachtwoord, zout), anthropic_sleutel=sleutel
            )
            st.session_state.ingelogd = True
            st.rerun()


def wachtwoord_ok() -> bool:
    """Eenvoudige toegangscontrole zodat alleen jij de app kunt gebruiken."""
    if st.session_state.get("ingelogd"):
        return True
    if not instelling("APP_WACHTWOORD") and "wachtwoord_hash" not in opslag.instellingen():
        eerste_keer()
        return False
    invoer = st.text_input("Wachtwoord", type="password")
    if invoer and wachtwoord_klopt(invoer):
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

        with st.expander("Anthropic-sleutel vervangen"):
            if sleutel := sleutel_formulier("Nieuwe sleutel opslaan"):
                opslag.instellingen_bijwerken(anthropic_sleutel=sleutel)
                st.success("Opgeslagen.")


def foutmelding(fout: anthropic.APIError) -> str:
    if isinstance(fout, anthropic.AuthenticationError):
        return "De Anthropic-sleutel klopt niet. Vervang hem via het menu links."
    if isinstance(fout, anthropic.RateLimitError):
        return "Het is even te druk. Probeer het over een minuut opnieuw."
    if isinstance(fout, anthropic.APIConnectionError):
        return "Geen verbinding met Claude. Controleer je internet."
    if isinstance(fout, anthropic.APIStatusError):
        return f"Er ging iets mis bij Claude (code {fout.status_code})."
    return "Er ging iets mis bij Claude."


def main() -> None:
    st.title("Mijn assistent")
    if not opslag.online():
        st.warning(
            "Let op: de database is niet ingesteld, dus je gegevens gaan verloren als de app herstart. "
            "Zet SUPABASE_URL, SUPABASE_KEY en SUPABASE_TOKEN bij Secrets in Streamlit."
        )
    if not wachtwoord_ok():
        return

    sleutel = anthropic_sleutel()
    if not sleutel:
        st.warning("Er is nog geen Anthropic-sleutel ingesteld.")
        if nieuw := sleutel_formulier("Opslaan"):
            opslag.instellingen_bijwerken(anthropic_sleutel=nieuw)
            st.rerun()
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
