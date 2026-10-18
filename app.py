"""Webinterface van de assistent. Starten met: streamlit run app.py"""

import json
import math
import os
import time
from datetime import date, datetime, timedelta
from urllib.parse import quote, urlencode

import anthropic
import pydeck as pdk
import streamlit as st

import agent
import opslag
import planning
import reizen

# De server draait op UTC; datums en tijden horen in Nederlandse tijd.
os.environ["TZ"] = "Europe/Amsterdam"
time.tzset()

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


DAGEN = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"]
MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli",
           "augustus", "september", "oktober", "november", "december"]


def afspraak_tekst(regel: dict) -> str:
    """Eén afspraak uit de dagplanning als korte tekst met tijd, plek, contact en vertrektijd."""
    tijd = regel["start"][11:16] if "T" in regel["start"] else "hele dag"
    tekst = f"**{tijd}** {regel['titel']}"
    if regel.get("locatie"):
        tekst += f"  \n📍 {regel['locatie']}"
    if contact := regel.get("contact"):
        tekst += f"  \n👤 {contact['naam']}" + (f", {contact['telefoon']}" if contact.get("telefoon") else "")
    if reis := regel.get("reis"):
        tekst += f"  \n🚗 {reis['reistijd_minuten']} min reizen ({reis['afstand_km']} km)"
        if regel.get("vertrek_om"):
            tekst += f", vertrek om **{regel['vertrek_om']}**"
    return tekst


def kaart(regel: dict) -> None:
    """Kaart met de route naar de afspraak."""
    try:
        lijn = reizen.routelijn(regel["van_adres"], regel["locatie"])
    except Exception:
        st.caption("De kaart kon niet worden geladen.")
        return
    lons = [p[0] for p in lijn]
    lats = [p[1] for p in lijn]
    breedte = max(max(lons) - min(lons), max(lats) - min(lats), 0.005)
    beeld = pdk.ViewState(
        longitude=(min(lons) + max(lons)) / 2,
        latitude=(min(lats) + max(lats)) / 2,
        zoom=max(4, min(15, math.log2(360 / breedte) - 1.5)),
    )
    lagen = [
        pdk.Layer("PathLayer", data=[{"pad": [list(p) for p in lijn]}], get_path="pad",
                  get_color=[30, 120, 255], width_min_pixels=4),
        pdk.Layer("ScatterplotLayer", data=[{"plek": list(lijn[0]), "kleur": [40, 170, 80]},
                                            {"plek": list(lijn[-1]), "kleur": [220, 50, 50]}],
                  get_position="plek", get_fill_color="kleur", radius_min_pixels=7),
    ]
    st.pydeck_chart(pdk.Deck(layers=lagen, initial_view_state=beeld, map_provider="carto", map_style="road"),
                    height=260)


def route_knoppen(regel: dict) -> None:
    """Knoppen om te navigeren en je reis te delen."""
    van, naar = regel["van_adres"], regel["locatie"]
    google = "https://www.google.com/maps/dir/?" + urlencode(
        {"api": 1, "origin": van, "destination": naar, "travelmode": "driving"})
    apple = "https://maps.apple.com/?" + urlencode({"saddr": van, "daddr": naar, "dirflg": "d"})
    bericht = f"Ik ben op weg naar {regel['titel']} ({naar})."
    if regel.get("vertrek_om"):
        aankomst = datetime.strptime(regel["vertrek_om"], "%H:%M") + timedelta(minutes=regel["reis"]["reistijd_minuten"])
        bericht = (f"Ik ga naar {regel['titel']} ({naar}). Ik vertrek om {regel['vertrek_om']} "
                   f"en ben er rond {aankomst.strftime('%H:%M')}.")
    bericht += f" Route: {google}"

    links, rechts = st.columns(2)
    links.link_button("🧭 Navigeer (Apple Kaarten)", apple, width="stretch")
    rechts.link_button("🗺️ Navigeer (Google Maps)", google, width="stretch")
    links.link_button("💬 Deel via WhatsApp", "https://wa.me/?text=" + quote(bericht), width="stretch")
    rechts.link_button("✉️ Deel via sms", "sms:&body=" + quote(bericht), width="stretch")
    st.caption("Wil je dat iemand je live kan volgen? Start de route in Apple Kaarten en tik op "
               "\"Deel aankomsttijd\". Dan ziet de ander waar je bent en wanneer je aankomt.")


def vandaag_overzicht() -> None:
    """Het overzicht van vandaag bovenaan de voorpagina. Werkt ook zonder Claude."""
    nu = datetime.now()
    st.subheader(f"Vandaag, {DAGEN[nu.weekday()]} {nu.day} {MAANDEN[nu.month - 1]}")

    try:
        plan = dagplanning_vandaag(nu.date().isoformat())
    except opslag.GeenToegang:
        raise
    except Exception:
        plan = {"afspraken": [{**a, "waarschuwing": "Reistijd kon niet worden berekend."}
                                  for a in opslag.afspraken_tussen(nu.date().isoformat(), nu.date().isoformat())]}
    nog_te_gaan = [r for r in plan["afspraken"] if "T" not in r["start"] or r["start"][11:16] >= nu.strftime("%H:%M")]
    if nog_te_gaan:
        eerste, rest = nog_te_gaan[0], nog_te_gaan[1:]
        with st.container(border=True):
            st.caption("Eerstvolgende afspraak")
            st.markdown(afspraak_tekst(eerste))
            if eerste.get("waarschuwing"):
                st.warning(eerste["waarschuwing"])
            if eerste.get("reis"):
                kaart(eerste)
                route_knoppen(eerste)
        for regel in rest:
            st.markdown(afspraak_tekst(regel))
            if regel.get("waarschuwing"):
                st.warning(regel["waarschuwing"])
        if plan.get("tip"):
            st.caption("Tip: vertel de assistent je thuisadres, dan zie je ook hoe laat je van huis moet vertrekken.")
    else:
        st.caption("Geen afspraken meer vandaag.")

    taken = opslag.open_taken()
    if taken:
        st.markdown("**Taken**")
        for t in taken[:5]:
            label = t["titel"] + (f" (vóór {t['deadline']})" if t["deadline"] else "")
            if st.checkbox(label, key=f"taak_{t['id']}"):
                opslag.taak_afronden(t["id"])
                st.rerun()
        if len(taken) > 5:
            st.caption(f"En nog {len(taken) - 5} andere taken.")

    if herhalingen := opslag.herhalingen_vandaag():
        onderwerpen = sorted({h["onderwerp"] for h in herhalingen})
        st.info(f"📚 {len(herhalingen)} stap(pen) om vandaag te herhalen: {', '.join(onderwerpen)}.")
    st.divider()


def dagplanning_vandaag(datum: str) -> dict:
    # De cache vernieuwt zodra de afspraken of het thuisadres veranderen.
    sleutel = json.dumps([opslag.afspraken_tussen(datum, datum), opslag.instellingen().get("thuisadres", ""),
                          opslag.contacten_zoeken()], sort_keys=True)
    return _dagplanning_met_sleutel(datum, sleutel)


@st.cache_data(ttl=600, show_spinner="Reistijden berekenen...")
def _dagplanning_met_sleutel(datum: str, sleutel: str) -> dict:
    return planning.dagplanning(datum)


def zijbalk() -> None:
    with st.sidebar:
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

    vandaag_overzicht()
    zijbalk()

    sleutel = anthropic_sleutel()
    if not sleutel:
        st.warning("Er is nog geen Anthropic-sleutel ingesteld.")
        if nieuw := sleutel_formulier("Opslaan"):
            opslag.instellingen_bijwerken(anthropic_sleutel=nieuw)
            st.rerun()
        return
    client = anthropic.Anthropic(api_key=sleutel)

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
