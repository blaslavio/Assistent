"""Webinterface van de assistent. Starten met: streamlit run app.py"""

from datetime import date, timedelta

import anthropic
import streamlit as st

import agent
import opslag
import reizen

st.set_page_config(page_title="Mijn assistent", page_icon="✨", layout="centered")

# Elke run van het script gebruikt het wachtwoord van deze sessie voor de database.
opslag.gebruik_wachtwoord(st.session_state.get("wachtwoord", ""))


def anthropic_sleutel() -> str:
    return opslag.instellingen().get("anthropic_sleutel", "")


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


def inloggen(wachtwoord: str) -> None:
    st.session_state.wachtwoord = wachtwoord
    opslag.gebruik_wachtwoord(wachtwoord)


def eerste_keer() -> None:
    """Eenmalig instellen: wachtwoord kiezen en Anthropic-sleutel invullen."""
    st.subheader("Welkom! Eerst even instellen")
    st.write("Kies een wachtwoord en plak je Anthropic-sleutel. Dit hoef je maar één keer te doen.")
    wachtwoord = st.text_input("Kies een wachtwoord (minstens 10 tekens)", type="password")
    herhaling = st.text_input("Herhaal het wachtwoord", type="password")
    if sleutel := sleutel_formulier("Opslaan"):
        if len(wachtwoord) < 10:
            st.error("Kies een wachtwoord van minstens 10 tekens.")
        elif wachtwoord != herhaling:
            st.error("De wachtwoorden zijn niet gelijk.")
        elif not opslag.registreer(wachtwoord):
            st.error("Er is al een wachtwoord ingesteld. Ververs de pagina en log in.")
        else:
            inloggen(wachtwoord)
            opslag.instellingen_bijwerken(anthropic_sleutel=sleutel)
            st.rerun()


def wachtwoord_ok() -> bool:
    """Toegangscontrole: zonder het juiste wachtwoord kan niemand bij de gegevens."""
    if st.session_state.get("wachtwoord"):
        return True
    if not opslag.is_geregistreerd():
        eerste_keer()
        return False
    invoer = st.text_input("Wachtwoord", type="password")
    if invoer and opslag.wachtwoord_klopt(invoer):
        inloggen(invoer)
        st.rerun()
    elif invoer:
        st.error("Onjuist wachtwoord. Na 10 foute pogingen moet je een kwartier wachten.")
    return False


def zijbalk() -> None:
    with st.sidebar:
        st.header("Vandaag")
        vandaag = date.today()
        afspraken = opslag.afspraken_tussen(vandaag.isoformat(), (vandaag + timedelta(days=7)).isoformat())
        st.subheader("Agenda, komende 7 dagen")
        if afspraken:
            contacten = {c["id"]: c for c in opslag.contacten_zoeken()}
            for a in afspraken:
                regel = f"**{a['start'].replace('T', ' ')}** {a['titel']}"
                if a.get("locatie"):
                    regel += f"  \n📍 {a['locatie']}"
                if contact := contacten.get(a.get("contact_id")):
                    regel += f"  \n👤 {contact['naam']}" + (f", {contact['telefoon']}" if contact.get("telefoon") else "")
                st.markdown(regel)
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


def zelftest(client: anthropic.Anthropic) -> None:
    """Controleert of Claude, de database en de routedienst bereikbaar zijn."""
    with st.spinner("Database controleren..."):
        try:
            opslag.laden()
            st.write("✅ Database werkt")
        except Exception as fout:
            st.write(f"❌ Database: {type(fout).__name__}: {fout}")
    with st.spinner("Routedienst controleren..."):
        try:
            reis = reizen.reistijd("Dam 1, Amsterdam", "Coolsingel 40, Rotterdam")
            st.write(f"✅ Reistijd Amsterdam naar Rotterdam: {reis['reistijd_minuten']} min, {reis['afstand_km']} km")
        except Exception as fout:
            st.write(f"❌ Routedienst: {type(fout).__name__}: {fout}")
    with st.spinner("Claude controleren..."):
        try:
            tekst = agent.antwoord(client, [{"role": "user", "content": "Zelftest: gebruik geen hulpmiddelen en antwoord alleen met OK."}])
            st.write(f"✅ Claude antwoordt: {tekst[:100]}")
        except anthropic.APIError as fout:
            st.write(f"❌ Claude: {foutmelding(fout)}")


def foutmelding(fout: anthropic.APIError) -> str:
    if isinstance(fout, anthropic.AuthenticationError):
        return "De Anthropic-sleutel klopt niet. Vervang hem via het menu links."
    if isinstance(fout, anthropic.RateLimitError):
        return "Het is even te druk. Probeer het over een minuut opnieuw."
    if isinstance(fout, anthropic.APIConnectionError):
        return "Geen verbinding met Claude. Controleer je internet."
    if isinstance(fout, anthropic.APIStatusError):
        melding = str(fout.body.get("error", {}).get("message", "")) if isinstance(fout.body, dict) else ""
        if "credit balance" in melding.lower():
            return "Je tegoed bij Anthropic is op of nog niet actief. Voeg tegoed toe onder Billing op console.anthropic.com."
        return f"Er ging iets mis bij Claude (code {fout.status_code}): {melding or fout.message}"
    return "Er ging iets mis bij Claude."


def main() -> None:
    st.title("Mijn assistent")
    if not opslag.online():
        st.caption("Lokale testmodus: gegevens staan in data/gegevens.json.")
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
    with st.sidebar.expander("Zelftest"):
        if st.button("Start zelftest"):
            zelftest(client)

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


try:
    main()
except opslag.GeenToegang:
    st.session_state.pop("wachtwoord", None)
    st.error("Geen toegang tot je gegevens. Ververs de pagina en log opnieuw in.")
except opslag.httpx.HTTPError:
    st.error("De database is even niet bereikbaar. Ververs de pagina over een minuut.")
