"""Webinterface van de assistent. Starten met: streamlit run app.py"""

import html
import importlib
import json
import math
import re
import os
import time
from datetime import date, datetime, time as kloktijd, timedelta
from urllib.parse import quote, urlencode, urlparse

import anthropic
import pydeck as pdk
import streamlit as st

import activiteiten
import agendas
import agent
import avatar
import bank
import beleggen
import boodschappen
import budget
import documenten
import documenten_scherm
import editor
import events
import geld_scherm
import ics
import mail
import mailtaken
import media
import opslag
import planning
import reizen
import ruimte
import ruimte_scherm
import samen
import samen_scherm
import slim
import spraak
import strava
import teksten
import tijd
import werk_scherm
import weer
import wetenschap
import inplannen
import onthouden
import snelinvoer
import woning
import winkelkaart

# Na een update haalt Streamlit alleen app.py opnieuw op. Eigen modules die op schijf veranderd zijn,
# laden we hier opnieuw, anders draait de nieuwe app.py met oude modules.
for _module in (opslag, agendas, budget, bank, beleggen, mailtaken, reizen, weer, tijd, planning, ics, media, events, activiteiten, boodschappen, strava, wetenschap,
                mail, samen, teksten, winkelkaart, inplannen, snelinvoer, woning, documenten, documenten_scherm, samen_scherm, avatar, slim, werk_scherm, ruimte, ruimte_scherm, geld_scherm, agent, spraak):
    _gewijzigd = os.path.getmtime(_module.__file__)
    if _gewijzigd > getattr(_module, "_geladen_om", 0):
        importlib.reload(_module)
        _module._geladen_om = _gewijzigd

# De server draait op UTC; datums en tijden horen in Nederlandse tijd.
os.environ["TZ"] = "Europe/Amsterdam"
time.tzset()

st.set_page_config(page_title="Mijn assistent", page_icon="✨", layout="centered")

# Elke run van het script gebruikt de naam en het wachtwoord van deze sessie voor de database.
opslag.gebruik_account(st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))


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


def inloggen(naam: str, wachtwoord: str, gebruiker: dict) -> None:
    st.session_state.naam = naam
    st.session_state.wachtwoord = wachtwoord
    st.session_state.ik = gebruiker
    st.session_state.apparaat_naam = apparaat()
    opslag.gebruik_account(naam, wachtwoord)


def apparaat_herkennen() -> bool:
    """Op een onthouden apparaat (bijvoorbeeld je eigen iPhone) log je vanzelf in."""
    if st.session_state.pop("apparaat_wis", False):
        onthouden.wissen()
        return False
    sleutel = onthouden.lezen()
    if not sleutel or st.session_state.get("apparaat_geprobeerd"):
        return False
    st.session_state.apparaat_geprobeerd = True
    if not (sessie := opslag.apparaat_inloggen(sleutel, apparaat())):
        onthouden.wissen()
        return False
    inloggen(sessie["naam"], sessie["token"], opslag.inloggen(sessie["naam"], sessie["token"]) or {})
    st.session_state.apparaat_token = sleutel
    return True


def ik() -> dict:
    """De ingelogde gebruiker: id, naam (gebruikersnaam), weergavenaam en of hij beheerder is."""
    return st.session_state.get("ik") or {}


def eerste_keer() -> None:
    """Eenmalig instellen door de eigenaar: wachtwoord kiezen en Anthropic-sleutel invullen."""
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
            inloggen("", wachtwoord, opslag.inloggen("", wachtwoord) or {})
            opslag.instellingen_bijwerken(anthropic_sleutel=sleutel)
            st.rerun()


def apparaat() -> str:
    """Een korte naam voor het apparaat, voor het overzicht van inlogs."""
    agent_tekst = st.context.headers.get("User-Agent", "")
    soort = next((n for k, n in (("iPad", "iPad"), ("iPhone", "iPhone"), ("Android", "Android"), ("Macintosh", "Mac"),
                                 ("Windows", "Windows"), ("Linux", "Linux")) if k in agent_tekst), "onbekend apparaat")
    browser = next((n for k, n in (("Edg", "Edge"), ("CriOS", "Chrome"), ("Chrome", "Chrome"), ("Firefox", "Firefox"),
                                   ("Safari", "Safari")) if k in agent_tekst), "browser")
    return f"{browser} op {soort}"


def aanmelden(naam: str, wachtwoord: str, code: str = "") -> str | None:
    """Logt in. Geeft een foutmelding, of None (gelukt of er is nog een code nodig)."""
    antwoord = opslag.aanmelden(naam, wachtwoord, code, apparaat())
    if token := antwoord.get("token"):
        st.session_state.pop("twee_stap_login", None)
        inloggen(naam, token, opslag.inloggen(naam, token) or {})
        if st.session_state.get("onthoud_apparaat", True) and (sleutel := opslag.apparaat_onthouden(apparaat())):
            st.session_state.apparaat_token = st.session_state.apparaat_bewaar = sleutel
        if opslag.online():
            try:
                st.session_state.mislukt_melding = opslag.beveiliging().get("mislukt_recent", 0)
            except Exception:
                pass
        st.rerun()
    if antwoord.get("code_nodig"):
        st.session_state.twee_stap_login = (naam, wachtwoord)
    return antwoord.get("fout")


def inlogformulier() -> None:
    if wacht := st.session_state.get("twee_stap_login"):
        code_formulier(*wacht)
        return
    with st.form("inloggen"):
        naam = st.text_input("Gebruikersnaam of mailadres", autocomplete="username",
                             help="Nog nooit een gebruikersnaam gekozen omdat je de app als eerste instelde? Laat dit leeg.")
        wachtwoord = st.text_input("Wachtwoord", type="password", autocomplete="current-password")
        onthoud = st.checkbox("Ingelogd blijven op dit apparaat", value=True,
                              help="Handig op je eigen iPhone of iPad, en nodig voor Siri. Niet doen op een "
                                   "computer van een ander.") if opslag.online() else False
        if st.form_submit_button("Inloggen", type="primary", width="stretch") and wachtwoord:
            st.session_state.onthoud_apparaat = onthoud
            if fout := aanmelden(naam.strip().lower().lstrip("@"), wachtwoord):
                st.error(fout)
            elif st.session_state.get("twee_stap_login"):
                st.rerun()
    st.caption("Tip: laat Safari je wachtwoord bewaren. Dan log je voortaan in met Face ID.")


def code_formulier(naam: str, wachtwoord: str) -> None:
    """Tweede stap: de code uit de app met verificatiecodes (of een herstelcode)."""
    st.markdown("**Tweestapsverificatie**")
    with st.form("code"):
        code = st.text_input("Code uit je app", autocomplete="one-time-code", max_chars=12,
                             placeholder="6 cijfers",
                             help="Open Wachtwoorden (of je authenticator-app) en typ de code bij Mijn assistent. "
                                  "Telefoon kwijt? Gebruik een van je herstelcodes.")
        if st.form_submit_button("Bevestigen", type="primary", width="stretch") and code.strip():
            if fout := aanmelden(naam, wachtwoord, code.strip()):
                st.error(fout)
    if st.button("Terug"):
        st.session_state.pop("twee_stap_login", None)
        st.rerun()


def account_maken_formulier() -> None:
    st.caption("Gratis. Je mailadres is nodig om te kunnen kopen en verkopen; anderen zien het niet.")
    with st.form("account_maken"):
        naam = st.text_input("Kies een gebruikersnaam", placeholder="bijvoorbeeld sanne.devries",
                             help="3 tot 30 tekens: kleine letters, cijfers, punt of streepje. Anderen vinden je hiermee.")
        weergavenaam = st.text_input("Je naam zoals anderen hem zien", placeholder="Sanne")
        email = st.text_input("Mailadres", placeholder="sanne@voorbeeld.nl", autocomplete="email")
        wachtwoord = st.text_input("Kies een wachtwoord (minstens 10 tekens)", type="password",
                                   autocomplete="new-password")
        herhaling = st.text_input("Herhaal het wachtwoord", type="password", autocomplete="new-password")
        akkoord = st.checkbox("Ik ben 16 jaar of ouder en ga akkoord met de voorwaarden en de privacyverklaring")
        if st.form_submit_button("Account maken", type="primary", width="stretch"):
            naam = naam.strip().lower().lstrip("@")
            if wachtwoord != herhaling:
                st.error("De wachtwoorden zijn niet gelijk.")
            elif fout := opslag.account_maken(naam, weergavenaam.strip(), email.strip(), wachtwoord, akkoord):
                st.error(fout)
            else:
                st.session_state.welkom = True
                if fout := aanmelden(naam, wachtwoord):
                    st.error(fout)
    with st.expander("Voorwaarden"):
        st.markdown(teksten.voorwaarden())
    with st.expander("Privacyverklaring"):
        st.markdown(teksten.privacy())


def wachtwoord_ok() -> bool:
    """Toegangscontrole: zonder de juiste naam en het juiste wachtwoord kan niemand bij de gegevens."""
    if st.session_state.get("wachtwoord"):
        if "ik" not in st.session_state:
            # Sessie van voor de update met meerdere gebruikers.
            st.session_state.ik = opslag.inloggen(st.session_state.get("naam", ""), st.session_state.wachtwoord) or {}
        return True
    if not opslag.is_geregistreerd():
        eerste_keer()
        return False
    if st.session_state.pop("verwijderd", False):
        st.success("Je account en gegevens zijn verwijderd.")
    if not opslag.online():
        inlogformulier()
        return False
    if apparaat_herkennen():
        return True
    keuze = st.segmented_control("Account", ["Inloggen", "Account maken"], default="Inloggen",
                                 label_visibility="collapsed", key="inlogkeuze")
    if keuze == "Account maken":
        account_maken_formulier()
    else:
        inlogformulier()
    return False


DAGEN = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"]
MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli",
           "augustus", "september", "oktober", "november", "december"]


def afspraak_tekst(regel: dict) -> str:
    """Eén afspraak uit de dagplanning als korte tekst met tijd, plek, contact en vertrektijd."""
    begin = regel["start"][11:16] if "T" in regel["start"] else "hele dag"
    tekst = f"{tijd.icoon(regel)} **{begin}** {regel['titel']}"
    if regel.get("locatie"):
        tekst += f"  \n:material/location_on: {regel['locatie']}"
    if contact := regel.get("contact"):
        tekst += f"  \n:material/person: {contact['naam']}" + (f", {contact['telefoon']}" if contact.get("telefoon") else "")
    if reis := regel.get("reis"):
        tekst += f"  \n:material/directions_car: {reis['reistijd_minuten']} min reizen ({reis['afstand_km']} km)"
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
    links.link_button("Navigeer (Apple Kaarten)", apple, width="stretch")
    rechts.link_button("Navigeer (Google Maps)", google, width="stretch")
    links.link_button("Deel via WhatsApp", "https://wa.me/?text=" + quote(bericht), width="stretch")
    rechts.link_button("Deel via sms", "sms:&body=" + quote(bericht), width="stretch")
    st.caption("Wil je dat iemand je live kan volgen? Start de route in Apple Kaarten en tik op "
               "\"Deel aankomsttijd\". Dan ziet de ander waar je bent en wanneer je aankomt.")


KNOP = {"vertrokken": "Ik vertrek nu", "aangekomen": "Ik ben er", "weg": "Ik ga weg", "terug": "Ik ben terug"}
BLAUW, GROEN, ROOD = "#2f7de1", "#2fae5a", "#e0443e"


def tijd_knop(regel: dict) -> None:
    """Eén knop voor het volgende moment van de tijdregistratie."""
    moment = tijd.volgend_moment(regel)
    if moment and st.button(KNOP[moment], key=f"tijd_{regel['id']}_{moment}", type="primary", width="stretch"):
        opslag.tijd_vastleggen(regel["id"], moment)
        st.rerun()


def _uren(minuten: int) -> str:
    return f"{minuten // 60} u {minuten % 60:02d}" if minuten >= 60 else f"{minuten} min"


def tijdbalk(stukken: list[tuple[int, str]]) -> str:
    """Gekleurde balk; elk stuk is (minuten, kleur)."""
    totaal = sum(m for m, _ in stukken) or 1
    delen = "".join(f'<div style="flex:{m / totaal};background:{kleur}"></div>' for m, kleur in stukken if m)
    return f'<div style="display:flex;height:14px;border-radius:7px;overflow:hidden;margin:2px 0 10px">{delen}</div>'


def tijdsbesteding_overzicht(vandaag: date) -> bool:
    """Per afspraak van vandaag: blauw reistijd (heen en terug), groen op locatie, rood uitloop."""
    dag = tijd.tijdsbesteding(vandaag.isoformat(), vandaag.isoformat())
    week = tijd.tijdsbesteding((vandaag - timedelta(days=6)).isoformat(), vandaag.isoformat())
    if not week["afspraken"]:
        return False
    st.markdown(f'<span style="color:{BLAUW}">■</span> reistijd &nbsp; <span style="color:{GROEN}">■</span> op locatie'
                f' &nbsp; <span style="color:{ROOD}">■</span> uitloop', unsafe_allow_html=True)
    for r in dag["afspraken"]:
        tekst = (f"{r['titel']}: reizen {_uren(r['reistijd'])} (heen {_uren(r['heen'])}, terug {_uren(r['terug'])}),"
                 f" op locatie {_uren(r['op_locatie'])}")
        if r["uitloop"]:
            tekst += f", uitloop {_uren(r['uitloop'])}"
        if r.get("te_laat"):
            tekst += f", {r['te_laat']} min te laat aangekomen"
        st.caption(tekst)
        st.markdown(tijdbalk([(r["heen"], BLAUW), (r["op_locatie"], GROEN), (r["uitloop"], ROOD), (r["terug"], BLAUW)]),
                    unsafe_allow_html=True)
    t = week["totaal_minuten"]
    st.caption(f"Afgelopen 7 dagen: reizen {_uren(t['reistijd'])}, op locatie {_uren(t['op_locatie'])},"
               f" uitloop {_uren(t['uitloop'])}")
    st.markdown(tijdbalk([(t["reistijd"], BLAUW), (t["op_locatie"], GROEN), (t["uitloop"], ROOD)]), unsafe_allow_html=True)
    return True


def sport_zonder_resultaat(nu: datetime) -> list[dict]:
    """Sportafspraken van vandaag die voorbij zijn en nog geen resultaat hebben."""
    vandaag = nu.date().isoformat()
    return [a for a in opslag.afspraken_tussen(vandaag, vandaag)
            if a.get("sport") and not a.get("sport_resultaat")
            and ("weg" in a.get("tijden", {}) or (a.get("einde") or a["start"]) <= nu.isoformat(timespec="minutes"))]


def sport_overzicht(nu: datetime, toon_week: bool = True) -> None:
    """Resultaat invullen na een sportafspraak, en wat je deze week gesport hebt."""
    vandaag = nu.date().isoformat()
    week = tijd.sportoverzicht((nu.date() - timedelta(days=6)).isoformat(), vandaag)
    klaar = sport_zonder_resultaat(nu)
    if not klaar and not (toon_week and week["aantal"]):
        return
    st.markdown("**Sport**")
    for a in klaar:
        with st.expander(f"{tijd.sport_icoon(a['sport'])} Hoe ging {a['titel']}?", expanded=True):
            with st.form(f"sport_{a['id']}", border=False):
                minuten = st.number_input("Minuten gesport", 0, 600, tijd.sportminuten(a), step=5)
                km = st.number_input("Afstand in km (0 als het niet telt)", 0.0, 500.0, 0.0, step=0.5)
                gevoel = st.select_slider("Hoe voelde het?", options=[1, 2, 3, 4, 5], value=3,
                                          format_func=lambda g: ["😫", "😕", "🙂", "😀", "🤩"][g - 1])
                if st.form_submit_button("Opslaan"):
                    opslag.sport_vastleggen(a["id"], int(minuten), float(km), gevoel)
                    st.rerun()
    if toon_week and week["aantal"]:
        soorten = ", ".join(f"{tijd.sport_icoon(s)} {n}" for s, n in week["per_sport"].items())
        tekst = f"Afgelopen 7 dagen: {week['aantal']} keer gesport, {_uren(week['minuten'])}"
        if week["afstand_km"]:
            tekst += f", {week['afstand_km']} km"
        st.caption(f"{tekst} ({soorten})")


def app_url() -> str:
    return (st.context.url or "").split("?")[0]


def strava_terugkomst() -> None:
    """Strava stuurt na toestemming terug naar de app met een code in de link."""
    code = st.query_params.get("code")
    if not code or "scope" not in st.query_params:
        return
    scope = st.query_params.get("scope", "")
    st.query_params.clear()
    if "activity:read" not in scope:
        st.error("Geef bij Strava toestemming om je trainingen te bekijken, anders werkt de koppeling niet.")
        return
    try:
        naam = strava.code_inwisselen(code)
        st.session_state.pop("strava_bijgewerkt", None)
        st.success(f"Strava is gekoppeld{' met ' + naam if naam else ''}. Je trainingen komen nu vanzelf binnen.")
    except opslag.httpx.HTTPError:
        st.error("Koppelen met Strava is niet gelukt. Controleer je Client ID en Client Secret en probeer het opnieuw.")


def strava_bijwerken(forceer: bool = False) -> None:
    """Haalt hooguit elk kwartier nieuwe trainingen op bij Strava."""
    if not strava.gekoppeld():
        return
    laatst = st.session_state.get("strava_bijgewerkt", 0)
    if not forceer and time.time() - laatst < 15 * 60:
        return
    st.session_state.strava_bijgewerkt = time.time()
    try:
        if nieuw := strava.bijwerken():
            st.toast(f"{nieuw} training(en) uit Strava overgenomen.", icon="🏅")
    except opslag.httpx.HTTPError:
        st.toast("Strava is even niet bereikbaar.", icon="⚠️")


def strava_instellingen() -> None:
    with st.expander("Strava (sport en gezondheid)"):
        inst = opslag.instellingen()
        if strava.gekoppeld():
            st.write(f"Gekoppeld{' met ' + inst['strava_naam'] if inst.get('strava_naam') else ''}.")
            if st.button("Trainingen nu ophalen"):
                strava_bijwerken(forceer=True)
            if st.button("Ontkoppelen"):
                strava.ontkoppelen()
                st.rerun()
            return
        st.write("Strava neemt je trainingen over van Apple Gezondheid, je Apple Watch of Garmin. "
                 "De assistent haalt ze daarna bij Strava op.")
        st.markdown("1. Open de Strava-instellingen voor ontwikkelaars en maak een app aan. "
                    "Vul in: naam **Mijn assistent**, categorie **Training**, website **"
                    f"{app_url() or 'de link van deze app'}** en bij *Authorization Callback Domain*:")
        st.code(urlparse(app_url()).netloc or "de naam van deze app", language=None)
        st.link_button("Open Strava-instellingen", "https://www.strava.com/settings/api")
        st.markdown("2. Vul hieronder de Client ID en het Client Secret in die Strava je geeft.")
        client_id = st.text_input("Client ID", value=inst.get("strava_client_id", "")).strip()
        geheim = "".join(st.text_input("Client Secret", type="password").split())
        if st.button("Opslaan", key="strava_opslaan"):
            if client_id and geheim:
                opslag.instellingen_bijwerken(strava_client_id=client_id, strava_client_secret=geheim)
                st.rerun()
            else:
                st.error("Vul allebei in.")
        if inst.get("strava_client_id") and inst.get("strava_client_secret"):
            st.markdown("3. Geef toestemming bij Strava. Daarna kom je vanzelf terug in de app.")
            st.link_button("Verbind met Strava", strava.koppel_link(inst["strava_client_id"], app_url()), type="primary")


def weer_kort() -> str:
    """Het weer in een paar woorden, voor naast de datum."""
    try:
        data = weer.voorspelling(opslag.instellingen().get("thuisadres", ""))
    except Exception:
        return ""
    icoon, tekst = weer.omschrijving(data["current"]["weather_code"])
    dag = data["daily"]
    regen = dag["precipitation_probability_max"][0]
    return (f"{icoon} {round(data['current']['temperature_2m'])}° {tekst}, "
            f"{round(dag['temperature_2m_min'][0])}° tot {round(dag['temperature_2m_max'][0])}°"
            + (f", {regen}% kans op regen" if regen >= 30 else ""))


def weer_bij_afspraak(regel: dict) -> None:
    """Verwachting op de plek en het tijdstip van een afspraak, met een tip bij regen."""
    if not regel.get("locatie") or "T" not in regel["start"]:
        return
    try:
        verwachting = weer.op_moment(regel["locatie"], regel["start"])
    except Exception:
        return
    if verwachting:
        tekst = (f"{verwachting['icoon']} {verwachting['temperatuur']}° daar, "
                 f"{verwachting['kans_op_regen']}% kans op regen")
        if verwachting["kans_op_regen"] >= 50:
            tekst += ". Neem een paraplu of regenjas mee."
        st.caption(tekst)


@st.cache_data(max_entries=200, show_spinner=False)
def _media_inhoud(media_id: int, _wachtwoord: str) -> bytes:
    # Een bestand verandert nooit, dus het mag bewaard blijven zolang de app draait.
    return media.ophalen(media_id)


def herinneringen(afspraak: dict) -> None:
    """Notitie, foto's en geluidsfragmenten bij een afspraak."""
    nummer = st.session_state.setdefault(f"upload_{afspraak['id']}", 0)
    bestaande = media.lijst(afspraak["id"])
    with st.expander(f"Herinneringen ({len(bestaande)})" if bestaande else "Foto's, geluid of notitie toevoegen"):
        notitie = st.text_area("Notitie", value=afspraak.get("herinnering", ""), key=f"notitie_{afspraak['id']}",
                               placeholder="Wat wil je onthouden?")
        if notitie != afspraak.get("herinnering", "") and st.button("Notitie opslaan", key=f"nopslaan_{afspraak['id']}"):
            opslag.afspraak_bijwerken(afspraak["id"], herinnering=notitie)
            st.rerun()

        for m in bestaande:
            inhoud = _media_inhoud(m["id"], st.session_state.get("wachtwoord", ""))
            if m["soort"] == "foto":
                st.image(inhoud, width="stretch")
            else:
                st.audio(inhoud, format=m.get("mime") or "audio/wav")
            if st.button("Weghalen", key=f"weg_{m['id']}"):
                media.weghalen(m["id"])
                st.rerun()

        fotos = st.file_uploader("Foto's of geluid toevoegen", type=["jpg", "jpeg", "png", "heic", "webp", "m4a", "mp3", "wav"],
                                 accept_multiple_files=True, key=f"bestanden_{afspraak['id']}_{nummer}")
        opname = st.audio_input("Of spreek iets in", key=f"opname_{afspraak['id']}_{nummer}")
        nieuw = [(b.name, b.type or "", b.getvalue()) for b in fotos or []]
        if opname:
            nieuw.append((f"opname {datetime.now():%H:%M}", "audio/wav", opname.getvalue()))
        if nieuw:
            fouten = []
            with st.spinner("Opslaan..."):
                for naam, mime, inhoud in nieuw:
                    soort = "geluid" if mime.startswith("audio") or naam.lower().endswith((".m4a", ".mp3", ".wav")) else "foto"
                    try:
                        media.toevoegen(afspraak["id"], soort, naam, mime, inhoud)
                    except media.TeGroot:
                        fouten.append(f"{naam} is te groot (maximaal 10 MB).")
                    except opslag.GeenToegang:
                        raise
                    except Exception:
                        fouten.append(f"{naam} kon niet worden gelezen.")
            st.session_state[f"upload_{afspraak['id']}"] = nummer + 1
            if fouten:
                st.session_state["media_fouten"] = fouten
            st.rerun()
    for fout in st.session_state.pop("media_fouten", []):
        st.error(fout)


def contact_opties() -> dict[int, str]:
    return {c["id"]: c["naam"] for c in sorted(opslag.contacten_zoeken(), key=lambda c: c["naam"].lower())}


def afspraak_formulier(sleutel: str, afspraak: dict | None = None) -> None:
    """Formulier voor een nieuwe afspraak, of om een bestaande te wijzigen."""
    a = afspraak or {}
    start = datetime.fromisoformat(a["start"]) if "T" in a.get("start", "T") and a.get("start") else None
    einde = datetime.fromisoformat(a["einde"]) if a.get("einde") and "T" in a["einde"] else None
    contacten = contact_opties()
    with st.form(sleutel, clear_on_submit=not afspraak, border=False):
        titel = st.text_input("Wat", value=a.get("titel", ""), placeholder="Bijvoorbeeld: samen hardlopen")
        soort = st.pills("Soort", list(tijd.SOORTEN), default=tijd.soort_van(a), key=f"{sleutel}_soort",
                         format_func=lambda s: f"{tijd.SOORTEN[s]} {s.capitalize()}") or "afspraak"
        kol1, kol2, kol3 = st.columns(3)
        dag = kol1.date_input("Datum", value=start.date() if start else date.today(), format="DD-MM-YYYY")
        begin = kol2.time_input("Begin", value=start.time() if start else datetime.now().replace(minute=0).time(), step=900)
        eind = kol3.time_input("Einde", value=einde.time() if einde else None, step=900)
        locatie = st.text_input("Adres (straat, huisnummer, plaats)", value=a.get("locatie", ""),
                                help="Met een adres berekent de app je reistijd en vertrektijd.")
        meer = st.expander("Meer: met wie, welke sport, notitie", expanded=bool(afspraak))
        opties = [0, *contacten, -1]
        namen = {0: "Geen", -1: "Nieuw contact", **contacten}
        contact_id = meer.selectbox("Met wie", opties, index=opties.index(a.get("contact_id") or 0)
                                  if (a.get("contact_id") or 0) in opties else 0, format_func=namen.get)
        nieuw_naam = meer.text_input("Naam nieuw contact", placeholder="Alleen bij Nieuw contact")
        nieuw_tel = meer.text_input("Telefoon nieuw contact", placeholder="Optioneel")
        sport = meer.selectbox("Welke sport (bij soort Sport)", SPORTEN, index=SPORTEN.index(a.get("sport", "")) if a.get("sport", "") in SPORTEN else 0,
                             format_func=lambda s: s.capitalize() if s else "Geen sport")
        notitie = meer.text_area("Notitie", value=a.get("notitie", ""), height=68)
        if st.form_submit_button("Opslaan", type="primary"):
            if not titel.strip():
                st.error("Vul in wat de afspraak is.")
                return
            if sport:
                soort = "sport"
            elif soort == "sport":
                sport = "sport"
            if contact_id == -1:
                contact_id = opslag.contact_opslaan(nieuw_naam.strip(), telefoon=nieuw_tel.strip())["id"] if nieuw_naam.strip() else 0
            velden = {
                "titel": titel.strip(),
                "start": f"{dag.isoformat()}T{begin.strftime('%H:%M')}",
                "einde": f"{dag.isoformat()}T{eind.strftime('%H:%M')}" if eind else None,
                "locatie": locatie.strip(), "contact_id": contact_id or None, "notitie": notitie.strip(),
            }
            if afspraak:
                opslag.afspraak_bijwerken(afspraak["id"], **velden, sport=sport if soort == "sport" else "", soort=soort)
            else:
                opslag.afspraak_toevoegen(velden["titel"], velden["start"], velden["einde"], velden["notitie"],
                                          velden["locatie"], velden["contact_id"], sport if soort == "sport" else "", soort)
            st.toast("Afspraak opgeslagen.", icon="✅")
            st.rerun()


def dagplanning_veilig(datum: str) -> list[dict]:
    """Afspraken van een dag met reistijd; zonder reistijd als de routedienst niet werkt."""
    try:
        return dagplanning_vandaag(datum)["afspraken"]
    except opslag.GeenToegang:
        raise
    except Exception:
        contacten = {c["id"]: c for c in opslag.contacten_zoeken()}
        return [{**a, "contact": contacten.get(a.get("contact_id"))} for a in opslag.afspraken_tussen(datum, datum)]


def afspraak_kaart(regel: dict, afspraak: dict) -> None:
    """Eén afspraak in de agenda, met knoppen voor iPhone-agenda, wijzigen, verwijderen en herinneringen."""
    with st.container(border=True):
        st.markdown(tijd.label_html(tijd.soort_van(afspraak)), unsafe_allow_html=True)
        st.markdown(afspraak_tekst(regel))
        if afspraak.get("notitie"):
            st.caption(afspraak["notitie"])
        if afspraak.get("herinnering"):
            st.caption(f"{afspraak['herinnering']}")
        if afspraak.get("extern"):
            st.caption(f":material/event: Uit je {afspraak.get('bron', 'agenda')}. Wijzigen doe je in die agenda.")
            return
        k1, k2, k3 = st.columns(3)
        k1.download_button("Naar agenda", ics.bestand([{**afspraak, **regel}]), file_name=f"afspraak-{afspraak['id']}.ics",
                           mime="text/calendar", key=f"ics_{afspraak['id']}", width="stretch",
                           help="Zet de afspraak in Apple Agenda, met een melding als je moet vertrekken.")
        with k2.popover("Wijzigen", width="stretch"):
            afspraak_formulier(f"wijzig_{afspraak['id']}", afspraak)
        with k3.popover("Weg", width="stretch"):
            st.write("Deze afspraak verwijderen?")
            if st.button("Ja, verwijderen", key=f"verwijder_{afspraak['id']}", type="primary"):
                opslag.afspraak_verwijderen(afspraak["id"])
                st.rerun()
        herinneringen(afspraak)


def agenda_tabblad() -> None:
    """De agenda plant je dag: je afspraken en (in Taken) wat je moet doen, dat in vrije tijd wordt ingepland."""
    aantal = len(opslag.open_taken())
    deel = st.segmented_control("Onderdeel", ["Agenda", "Taken"], default="Agenda", key="agenda_deel",
                                format_func=lambda d: f"Taken ({aantal})" if d == "Taken" and aantal else d,
                                label_visibility="collapsed") or "Agenda"
    if deel == "Taken":
        takenlijst()
    else:
        agenda_overzicht()


def _wanneer(datum: str) -> str:
    d = date.fromisoformat(datum)
    verschil = (d - date.today()).days
    if verschil == 0:
        return "vandaag"
    if verschil == 1:
        return "morgen"
    return f"{DAGEN[d.weekday()]} {d.day} {MAANDEN[d.month - 1]}"


def taak_rij(t: dict, gepland: str | None) -> None:
    """Eén taak: afvinken, met wanneer hij moet of is ingepland, en een menu om hem aan te passen."""
    delen = []
    if t.get("deadline"):
        delen.append(("te laat: " if t["deadline"] < date.today().isoformat() else "vóór ") + _wanneer(t["deadline"]))
    if gepland:
        delen.append(f"ingepland {_wanneer(gepland[:10])} {gepland[11:16]}")
    if t.get("minuten"):
        delen.append(f"{t['minuten']} min")
    if (bron := t.get("bron")) and bron.get("soort") == "mail":
        delen.append(f"mail van {bron.get('van', '')}")
    titel = f"**{t['titel']}**" if t.get("prioriteit") == "hoog" else t["titel"]
    rij = st.container(horizontal=True, vertical_alignment="center", horizontal_alignment="distribute")
    if rij.checkbox(titel + (f"  \n:gray[{' · '.join(delen)}]" if delen else ""), key=f"takenlijst_{t['id']}"):
        opslag.taak_afronden(t["id"])
        st.toast(f"Goed gedaan: {t['titel']}", icon="🎉")
        st.rerun()
    with rij.popover("", icon=":material/more_horiz:"):
        with st.form(f"taak_wijzig_{t['id']}", border=False):
            titel_nieuw = st.text_input("Taak", value=t["titel"])
            deadline = st.date_input("Deadline", value=date.fromisoformat(t["deadline"]) if t.get("deadline") else None,
                                     format="DD-MM-YYYY")
            minuten = st.select_slider("Hoe lang ongeveer?", options=[5, 15, 30, 45, 60, 90, 120, 180, 240],
                                       value=min([5, 15, 30, 45, 60, 90, 120, 180, 240],
                                                 key=lambda m: abs(m - int(t.get("minuten") or 30))),
                                       format_func=lambda m: f"{m} min" if m < 60 else f"{m / 60:g} uur")
            belangrijk = st.toggle("Belangrijk", value=t.get("prioriteit") == "hoog")
            if t.get("notitie"):
                st.caption(t["notitie"])
            if st.form_submit_button("Opslaan", type="primary"):
                opslag.taak_bijwerken(t["id"], titel=titel_nieuw.strip() or t["titel"],
                                      deadline=deadline.isoformat() if deadline else None, minuten=minuten,
                                      prioriteit="hoog" if belangrijk else "")
                st.rerun()
        if (bron := t.get("bron")) and bron.get("soort") == "mail" and "mail" in PAGINA:
            if st.button("Open de mail", key=f"taak_mail_{t['id']}", icon=":material/mail:"):
                st.session_state.mail_open = bron["uid"]
                ga_naar("mail")
        if st.button("Verwijderen", key=f"taak_weg_{t['id']}", icon=":material/delete:"):
            opslag.taak_verwijderen(t["id"])
            st.rerun()


def mail_voorstel_inhoud(plek: str) -> None:
    """Wat de assistent in je mail vond: taken en afspraken om aan te vinken. Niets komt erbij zonder jouw akkoord."""
    v = mailtaken.wachtend()
    if v.get("bezig") and not (v.get("taken") or v.get("afspraken") or v.get("facturen")):
        if plek in ("taken", "budget"):
            st.caption("De assistent kijkt je nieuwe mail na...")
        return
    if not (v.get("taken") or v.get("afspraken") or v.get("facturen")):
        if st.session_state.pop("mail_net_nagekeken", False):
            st.toast("Niets nieuws voor je agenda, takenlijst of facturen in je mail.", icon=":material/mark_email_read:")
        return
    taken, afspraken, facturen = v.get("taken", []), v.get("afspraken", []), v.get("facturen", [])
    delen = []
    if taken:
        delen.append(f"{len(taken)} {'taak' if len(taken) == 1 else 'taken'}")
    if afspraken:
        delen.append(f"{len(afspraken)} {'afspraak' if len(afspraken) == 1 else 'afspraken'}")
    if facturen:
        delen.append(f"{len(facturen)} {'factuur' if len(facturen) == 1 else 'facturen'}")
    with st.container(border=True):
        st.markdown(f"**Uit je mail: {', '.join(delen[:-1]) + ' en ' + delen[-1] if len(delen) > 1 else delen[0]}**")
        st.caption("Vink aan wat erbij moet.")
        gekozen_afspraken, gekozen_taken, gekozen_facturen = [], [], []
        for i, f in enumerate(facturen):
            extra = ([f"betalen vóór {_wanneer(f['vervaldatum'])}"] if f["vervaldatum"] and f["soort"] == "uitgave"
                     else [f"verwacht {_wanneer(f['vervaldatum'])}"] if f["vervaldatum"] else [])
            extra += (["wordt afgeschreven"] if f["automatisch"] else []) + ([f["omschrijving"]] if f["omschrijving"] else [])
            bedrag = f"€ {budget.euro(f['bedrag'])}" if f["soort"] == "uitgave" else f"+€ {budget.euro(f['bedrag'])}"
            label = f":material/receipt_long: {f['van']} · {bedrag}" + (f"  \n:gray[{' · '.join(extra)}]" if extra else "")
            if st.checkbox(label, value=True, key=f"{plek}_mailfactuur_{i}", help=f.get("waarom")):
                gekozen_facturen.append(f)
        for i, a in enumerate(afspraken):
            wanneer = _wanneer(a["datum"]) + (f" {a['begin']}" if a.get("begin") else "")
            extra = [wanneer] + ([a["locatie"]] if a.get("locatie") else []) + [f"van {a['bron']['van']}"]
            if st.checkbox(f":material/event: {a['titel']}  \n:gray[{' · '.join(extra)}]", value=True,
                           key=f"{plek}_mailafspraak_{i}", help=a.get("waarom")):
                gekozen_afspraken.append(a)
        for i, t in enumerate(taken):
            extra = ([f"vóór {_wanneer(t['deadline'])}"] if t["deadline"] else []) + [f"van {t['bron']['van']}"]
            titel = f"**{t['titel']}**" if t["prioriteit"] == "hoog" else t["titel"]
            if st.checkbox(f":material/check_circle: {titel}  \n:gray[{' · '.join(extra)}]", value=True,
                           key=f"{plek}_mailtaak_{i}", help=t.get("waarom")):
                gekozen_taken.append(t)
        herinneren = st.toggle("Betaalherinnering op mijn takenlijst", value=True, key=f"{plek}_mail_herinner",
                               help="Voor facturen die je zelf moet betalen; niet bij automatische incasso.") \
            if any(f["soort"] == "uitgave" and not f["automatisch"] for f in facturen) else False
        plannen = st.toggle("Taken meteen inplannen in mijn agenda", value=True, key=f"{plek}_mail_plannen",
                            help="In vrije tijd binnen je planuren, vóór de deadline.") if taken or herinneren else False
        kol1, kol2 = st.columns(2)
        if kol1.button("Toevoegen", type="primary", width="stretch", key=f"{plek}_mail_toe",
                       disabled=not (gekozen_taken or gekozen_afspraken or gekozen_facturen)):
            r = mailtaken.verwerken(gekozen_taken, gekozen_afspraken, plannen, gekozen_facturen, herinneren)
            stukken = []
            if r["facturen"]:
                stukken.append(f"{r['facturen']} bij je facturen")
            if r["afspraken"]:
                stukken.append(f"{r['afspraken']} in je agenda")
            if r["taken"]:
                stukken.append(f"{r['taken']} op je takenlijst")
            if r["blokken"]:
                stukken.append(f"{r['blokken']} {'blok' if r['blokken'] == 1 else 'blokken'} ingepland")
            st.toast("Gedaan: " + ", ".join(stukken) + ".", icon=":material/check:")
            st.rerun()
        if kol2.button("Niet nodig", width="stretch", key=f"{plek}_mail_niet"):
            mailtaken.verwerken([], [], False)
            st.rerun()


def mail_voorstel(plek: str) -> None:
    """Toont het voorstel; zolang de assistent op de achtergrond nakijkt, kijkt dit stukje af en toe of het klaar is."""
    bezig = mailtaken.wachtend().get("bezig", False)

    def stukje() -> None:
        opslag.gebruik_account(st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))
        mail_voorstel_inhoud(plek)
        if bezig and not mailtaken.wachtend().get("bezig"):
            st.rerun()  # klaar: één keer de hele pagina, zodat het voorstel niet meer ververst hoeft te worden

    st.fragment(stukje, run_every=15 if bezig else None)()


def mail_bij_budget() -> None:
    """Knop en voorstel op de facturenpagina van Budget."""
    if not mail.gekoppeld() or "Mail" in onderdelen_uit():
        return
    if st.button("Facturen uit mijn mail", icon=":material/mark_email_read:", key="budget_mail",
                 help="De assistent leest je nieuwe mail en stelt facturen, taken en afspraken voor. Jij kiest wat "
                      "erbij komt. Dit gebeurt ook vanzelf, elke paar uur."):
        mail_nakijken()
    mail_voorstel("budget")


geld_scherm.mail_hulp = mail_bij_budget


def mail_nakijken() -> None:
    """Meteen nakijken, als de gebruiker erom vraagt."""
    try:
        v = werk_scherm.met_claude("Je mail nakijken op taken en afspraken...", mailtaken.nu_nakijken)
    except Exception:
        st.error("Je mailbox is nu niet bereikbaar. Probeer het zo opnieuw.")
        return
    if v is not None:
        st.session_state.mail_net_nagekeken = True


def takenlijst() -> None:
    """Alles wat je moet doen, gesorteerd op wanneer; de agenda plant het in je vrije tijd."""
    with st.container(horizontal=True, vertical_alignment="center"):
        with st.popover("Nieuw", icon=":material/add:"):
            with st.form("takenlijst_nieuw", clear_on_submit=True, border=False):
                titel = st.text_input("Nieuwe taak", placeholder="Wat moet er gebeuren?")
                deadline = st.date_input("Deadline (optioneel)", value=None, format="DD-MM-YYYY")
                minuten = st.select_slider("Hoe lang ongeveer?", options=[5, 15, 30, 45, 60, 90, 120, 180, 240],
                                           value=30, format_func=lambda m: f"{m} min" if m < 60 else f"{m / 60:g} uur")
                belangrijk = st.toggle("Belangrijk")
                if st.form_submit_button("Toevoegen", type="primary") and titel.strip():
                    opslag.taak_toevoegen(titel.strip(), deadline.isoformat() if deadline else None, minuten,
                                          "hoog" if belangrijk else "")
                    st.rerun()
        if mail.gekoppeld() and "Mail" not in onderdelen_uit():
            if st.button("Uit mijn mail", icon=":material/mark_email_read:",
                         help="De assistent leest je nieuwe mail en stelt taken en afspraken voor. Jij kiest wat "
                              "erbij komt. Dit gebeurt ook vanzelf, elke paar uur."):
                mail_nakijken()
        with st.popover("Inplannen", icon=":material/auto_awesome:", help="Plan mijn taken in"):
            taken_inplannen()
    mail_voorstel("taken")

    taken = opslag.open_taken()
    if not taken:
        st.caption("Geen open taken. Tik op Nieuw, typ onderaan \"vrijdag belasting, 1 uur\""
                   + (", of laat de assistent je mail nakijken." if mail.gekoppeld() else "."))
        if not mail.gekoppeld():
            st.caption("Tip: koppel je mail bij Instellingen › Koppelingen, dan haalt de assistent taken uit je mail.")
        return
    vandaag = date.today()
    nu = datetime.now().isoformat(timespec="minutes")
    gepland: dict[int, str] = {}
    for a in opslag.afspraken_tussen(vandaag.isoformat(), (vandaag + timedelta(days=60)).isoformat(), extern=False):
        if a.get("taak_id") and a["start"] >= nu[:10] and (a.get("einde") or a["start"]) >= nu:
            gepland[a["taak_id"]] = min(gepland.get(a["taak_id"], "9999"), a["start"])
    week = (vandaag + timedelta(days=6)).isoformat()
    groepen = {"Te laat": [], "Vandaag": [], "Deze week": [], "Later": [], "Zonder datum": []}
    for t in taken:
        wanneer = min(filter(None, [t.get("deadline"), (gepland.get(t["id"]) or "")[:10] or None]), default=None)
        if t.get("deadline") and t["deadline"] < vandaag.isoformat():
            groepen["Te laat"].append(t)
        elif wanneer == vandaag.isoformat():
            groepen["Vandaag"].append(t)
        elif wanneer and wanneer <= week:
            groepen["Deze week"].append(t)
        elif wanneer:
            groepen["Later"].append(t)
        else:
            groepen["Zonder datum"].append(t)
    for naam, lijst in groepen.items():
        if lijst:
            st.markdown(f"**{naam}**" if naam != "Te laat" else f"**:red[{naam}]**")
            for t in lijst:
                taak_rij(t, gepland.get(t["id"]))
    niet_gepland = [t for t in taken if t["id"] not in gepland]
    if niet_gepland:
        st.caption(f"{len(niet_gepland)} {'taak staat' if len(niet_gepland) == 1 else 'taken staan'} nog niet in je "
                   "agenda. Tik op Inplannen om ze in je vrije tijd te zetten.")


def agenda_overzicht() -> None:
    """Dag- of weekoverzicht met bovenaan één rij knoppen; de extra's samen onderaan."""
    sport_overzicht(datetime.now(), toon_week=False)
    with st.container(horizontal=True, vertical_alignment="center"):
        weergave = st.segmented_control("Weergave", ["Dag", "Week"], default="Week", key="agenda_weergave",
                                        label_visibility="collapsed") or "Week"
        vanaf = st.date_input("Vanaf", value=date.today(), format="DD-MM-YYYY", label_visibility="collapsed",
                              width=150)
        with st.popover("Nieuw", icon=":material/add:"):
            afspraak_formulier("nieuwe_afspraak")
        with st.popover("Inplannen", icon=":material/auto_awesome:", help="Plan mijn taken in"):
            taken_inplannen()
    dagen = [vanaf + timedelta(days=i) for i in range(7 if weergave == "Week" else 1)]
    alle = {a["id"]: a for a in opslag.afspraken_tussen(dagen[0].isoformat(), dagen[-1].isoformat())}
    taken = [t for t in opslag.open_taken() if t["deadline"] and dagen[0].isoformat() <= t["deadline"] <= dagen[-1].isoformat()]
    if not alle and not taken:
        st.caption("Niets gepland. Tik op Nieuw, of typ onderaan bijvoorbeeld \"vrijdag 10u kapper\".")
    agenda_lijst(dagen, alle, taken)

    # Extra's in één blok, zodat de agenda rustig blijft.
    st.write("")
    with st.expander("Meer: ideeën, sport en tijd"):
        ideeen, sport, tijdblok = st.tabs(["Ideeën", "Sport", "Tijd"])
        with ideeen:
            events_overzicht()
        with sport:
            sport_tabblad(datetime.now())
        with tijdblok:
            if not tijdsbesteding_overzicht(date.today()):
                st.caption("Nog niets vastgelegd. Gebruik op Vandaag de knoppen \"Ik vertrek nu\" en \"Ik ben er\".")


def blok_tekst(blok: dict) -> str:
    start, einde = datetime.fromisoformat(blok["start"]), datetime.fromisoformat(blok["einde"])
    return f"{DAGEN[start.weekday()]} {start.day} {MAANDEN[start.month - 1]}, {start:%H:%M}–{einde:%H:%M}"


def snel_uitgave(zin: str) -> bool:
    """'€12,50 lunch' als uitgave in je budget. False als de zin geen uitgave is of het budget niet aan staat."""
    if not (u := snelinvoer.uitgave(zin)) or "Budget" in onderdelen_uit() or not samen.beschikbaar():
        return False
    regel = budget.toevoegen(u["bedrag"], u["omschrijving"], bron="snel")
    tekst = f"Uitgave: **{u['omschrijving']}**, € {budget.euro(u['bedrag'])} ({regel['categorie'].lower()})"
    st.session_state.snel_toegevoegd = {"wat": "uitgave", "id": regel["sleutel"], "datum": regel["datum"],
                                        "tekst": tekst, "zin": zin}
    return True


def snel_toevoegen(zin: str) -> dict:
    """Zet een zin in gewone taal als afspraak of taak weg en onthoudt wat er gebeurde (voor ongedaan maken)."""
    r = snelinvoer.lees(zin)
    if r["wat"] == "afspraak":
        item = opslag.afspraak_toevoegen(r["titel"], r["start"], r["einde"], locatie=r["locatie"], soort=r["soort_agenda"])
        start, einde = datetime.fromisoformat(r["start"]), datetime.fromisoformat(r["einde"])
        wanneer = f"{DAGEN[start.weekday()]} {start.day} {MAANDEN[start.month - 1]}, {start:%H:%M}–{einde:%H:%M}"
        tekst = f"{tijd.SOORTEN.get(r['soort_agenda'], '📅')} In je agenda: **{r['titel']}**, {wanneer}"
        tekst += f" · :material/location_on: {r['locatie']}" if r["locatie"] else ""
    else:
        item = opslag.taak_toevoegen(r["titel"], r["deadline"], r["minuten"])
        tekst = f"Nieuwe taak: **{r['titel']}**"
        if r["deadline"]:
            d = date.fromisoformat(r["deadline"])
            tekst += f", vóór {DAGEN[d.weekday()]} {d.day} {MAANDEN[d.month - 1]}"
        tekst += f" · {r['minuten']} min" if r["minuten"] else ""
    st.session_state.snel_toegevoegd = {"wat": r["wat"], "id": item["id"], "tekst": tekst, "zin": zin}
    return r


def snel_melding() -> None:
    """Eén keer laten zien wat er snel is toegevoegd, met ongedaan maken."""
    if not (laatst := st.session_state.pop("snel_toegevoegd", None)):
        return

    def ongedaan(naar_assistent: bool) -> None:
        opslag.gebruik_account(st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))
        if laatst["wat"] == "uitgave":
            for r in budget.lijst(laatst["datum"], laatst["datum"]):
                if r.get("sleutel") == laatst["id"]:
                    budget.weg(r["id"])
        else:
            (opslag.afspraak_verwijderen if laatst["wat"] == "afspraak" else opslag.taak_verwijderen)(laatst["id"])
        if naar_assistent:
            st.session_state.vooraf_vraag = laatst["zin"]
            st.session_state.ga_naar = "assistent"
        else:
            st.toast("Weggehaald.", icon="↩️")

    with st.container(border=True):
        st.markdown(laatst["tekst"])
        kol1, kol2 = st.columns(2)
        kol1.button("Ongedaan maken", on_click=ongedaan, args=(False,), width="stretch", key="snel_terug")
        kol2.button(f"Vraag het {avatar.aanspreken(mijn_avatar())}", on_click=ongedaan, args=(True,), width="stretch",
                    key="snel_vraag", help="Haalt dit weer weg en stelt je zin als vraag aan de assistent.")


def taken_inplannen() -> None:
    """Open taken automatisch in vrije tijd zetten: eerst een voorstel, pas na akkoord in de agenda."""
    uren = inplannen.planuren()
    st.markdown("**Plan mijn taken in**")
    st.caption(f"In je vrije tijd tussen {uren['van']} en {uren['tot']}"
               f"{' (ook in het weekend)' if uren['weekend'] else ' op werkdagen'}, vroegste deadline eerst.")
    if st.toggle("Tijden aanpassen", key="planuren_open"):
        with st.form("planuren", border=False):
            van = st.time_input("Vanaf", value=kloktijd.fromisoformat(uren["van"]), step=1800)
            tot = st.time_input("Tot", value=kloktijd.fromisoformat(uren["tot"]), step=1800)
            weekend = st.checkbox("Ook in het weekend", value=uren["weekend"])
            if st.form_submit_button("Opslaan") and van < tot:
                opslag.instellingen_bijwerken(planuren={"van": f"{van:%H:%M}", "tot": f"{tot:%H:%M}", "weekend": weekend})
                st.session_state.pop("planvoorstel", None)
                st.rerun()
    if st.button("Maak een voorstel", width="stretch",
                 type="secondary" if st.session_state.get("planvoorstel") else "primary"):
        st.session_state.planvoorstel = inplannen.voorstel()
    plan = st.session_state.get("planvoorstel")
    if plan is None:
        return
    if not plan:
        st.info("Alle open taken staan al in je agenda, of je hebt geen open taken. Voeg een taak toe op Vandaag.")
        return
    for regel in plan:
        tekst = f"**{regel['titel']}** · {regel['minuten']} min"
        if regel.get("te_laat"):
            tekst += " · :red[deadline is al voorbij]"
        st.markdown(tekst + "".join(f"  \n:material/schedule: {blok_tekst(b)}" for b in regel["blokken"]))
        if regel.get("past_niet"):
            st.caption(f"{regel['past_niet']}")
    kol1, kol2 = st.columns(2)
    if kol1.button("Zet in mijn agenda", type="primary", width="stretch",
                   disabled=not any(r["blokken"] for r in plan)):
        aantal = inplannen.vastleggen(plan)
        st.session_state.pop("planvoorstel")
        st.toast(f"{aantal} {'blok' if aantal == 1 else 'blokken'} ingepland. Vink de taak af als hij klaar is.", icon="🎯")
        st.rerun()
    if kol2.button("Annuleren", width="stretch"):
        st.session_state.pop("planvoorstel")
        st.rerun()


def kleurenuitleg(soorten: set[str]) -> None:
    """Welke kleur bij welke soort hoort, alleen voor wat er in beeld is."""
    if soorten:
        st.markdown(" ".join(tijd.label_html(s, "Taak" if s == "taak" else "") for s in tijd.KLEUREN if s in soorten),
                    unsafe_allow_html=True)


def taak_in_agenda(t: dict) -> None:
    k = tijd.kleur("taak")
    kol1, kol2 = st.columns([6, 1], vertical_alignment="center")
    kol1.markdown(f'<div style="border-left:4px solid {k};padding:2px 10px"><b>Taak:</b> {html.escape(t["titel"])}'
                  f' <span style="opacity:.6">deadline</span></div>', unsafe_allow_html=True)
    if kol2.button("✓", key=f"agenda_taak_{t['id']}", help="Afvinken"):
        opslag.taak_afronden(t["id"])
        st.toast(f"Goed gedaan: {t['titel']}", icon="🎉")
        st.rerun()


def agenda_lijst(dagen: list[date], alle: dict, taken: list[dict] | None = None) -> None:
    taken = taken or []
    if not alle and not taken:
        return

    kleurenuitleg({tijd.soort_van(a) for a in alle.values()} | ({"taak"} if taken else set()))
    export = []
    for dag in dagen:
        regels = [r for r in dagplanning_veilig(dag.isoformat()) if r.get("id") in alle] if alle else []
        deze_taken = [t for t in taken if t["deadline"] == dag.isoformat()]
        if not regels and not deze_taken:
            continue
        st.markdown(f"#### {DAGEN[dag.weekday()].capitalize()} {dag.day} {MAANDEN[dag.month - 1]}")
        for t in deze_taken:
            taak_in_agenda(t)
        for regel in regels:
            afspraak_kaart(regel, alle[regel["id"]])
            if not alle[regel["id"]].get("extern"):
                export.append({**alle[regel["id"]], **regel})
    if len(export) > 1:
        st.download_button(f"Alle {len(export)} afspraken naar je agenda", ics.bestand(export),
                           file_name="afspraken.ics", mime="text/calendar", width="stretch")
    st.caption("Tip: met Naar agenda komt een afspraak in Apple Agenda, met een melding op het moment dat je moet vertrekken.")


MAATSTAF_TEKST = {"keer_per_week": "Aantal keer per week", "minuten_per_week": "Minuten per week",
                  "km_per_week": "Kilometers per week", "langste_km": "Afstand in één keer (km)",
                  "totaal_km": "Kilometers bij elkaar"}
SPORTEN = ["", "hardlopen", "fitness", "fietsen", "zwemmen", "wandelen", "voetbal", "tennis", "padel", "yoga"]


def sport_tabblad(nu: datetime) -> None:
    """Sportdoelen met voortgang, en wat je de afgelopen week deed."""
    doelen = opslag.sportdoelen()
    if not doelen:
        st.caption("Nog geen doelen. Stel er hieronder een, of vraag de assistent om een opbouwschema.")
    for doel in doelen:
        v = tijd.doel_voortgang(doel)
        with st.container(border=True):
            icoon = tijd.sport_icoon(doel["sport"]) if doel["sport"] else "🎯"
            st.markdown(f"{icoon} **{doel['omschrijving']}**")
            st.progress(v["procent"] / 100, text=v["tekst"] + (" ✅" if v["procent"] >= 100 else ""))
            if "dagen_te_gaan" in v:
                st.caption(f"Nog {v['dagen_te_gaan']} dagen tot {doel['deadline']}." if v["dagen_te_gaan"] >= 0
                           else f"De deadline ({doel['deadline']}) is voorbij.")
            if st.button("Doel stoppen", key=f"stop_{doel['id']}"):
                opslag.sportdoel_stoppen(doel["id"])
                st.rerun()

    with st.expander("Nieuw doel"):
        with st.form("nieuw_doel", border=False):
            omschrijving = st.text_input("Wat wil je bereiken?", placeholder="Bijvoorbeeld: 10 km hardlopen voor de zomer")
            sport = st.selectbox("Sport", SPORTEN, format_func=lambda s: s.capitalize() if s else "Alle sporten")
            maatstaf = st.selectbox("Hoe meten we het?", list(MAATSTAF_TEKST), format_func=MAATSTAF_TEKST.get)
            waarde = st.number_input("Doel (getal)", min_value=0.5, value=3.0, step=0.5)
            met_deadline = st.checkbox("Met een einddatum")
            deadline = st.date_input("Einddatum", value=nu.date() + timedelta(days=60), format="DD-MM-YYYY")
            if st.form_submit_button("Doel opslaan"):
                if not omschrijving.strip():
                    st.error("Omschrijf je doel.")
                else:
                    opslag.sportdoel_stellen(omschrijving.strip(), maatstaf, float(waarde), sport,
                                             deadline.isoformat() if met_deadline else "")
                    st.rerun()
    st.divider()
    sport_overzicht(nu)


def events_instellen() -> None:
    st.caption("Om events te tonen is een gratis sleutel van Ticketmaster nodig. Dat doe je één keer.")
    st.markdown("1. Maak een gratis account aan bij Ticketmaster for Developers.  \n"
                "2. Open daarna *My Apps*. Daar staat je **Consumer Key**.  \n"
                "3. Vul die hieronder in.")
    st.link_button("Gratis sleutel aanvragen", "https://developer-acct.ticketmaster.com/user/register")
    invoer = "".join(st.text_input("Consumer Key", type="password", key="tm_sleutel").split())
    if st.button("Opslaan", key="tm_opslaan"):
        if not invoer:
            st.error("Vul eerst de sleutel in.")
            return
        opslag.instellingen_bijwerken(ticketmaster_sleutel=invoer)
        try:
            events.zoeken(aantal=1)
        except opslag.httpx.HTTPStatusError:
            opslag.instellingen_bijwerken(ticketmaster_sleutel="")
            st.error("Ticketmaster accepteert deze sleutel niet. Controleer of je de Consumer Key hebt gebruikt.")
            return
        except opslag.httpx.HTTPError:
            st.warning("Opgeslagen, maar Ticketmaster is even niet bereikbaar.")
        st.rerun()


def event_kaart(e: dict, in_agenda: set) -> None:
    with st.container(border=True):
        if e["afbeelding"]:
            st.image(e["afbeelding"], width="stretch")
        dag = datetime.fromisoformat(e["datum"]) if e["datum"] else None
        wanneer = f"{DAGEN[dag.weekday()]} {dag.day} {MAANDEN[dag.month - 1]}" if dag else ""
        regels = [f"**{e['naam']}**", f"{wanneer}" + (f", {e['tijd']}" if e["tijd"] else "")]
        if e["locatie"]:
            regels.append(f"{e['locatie']}")
        if e["prijs"]:
            regels.append(f"{e['prijs']}")
        st.markdown("  \n".join(regels))
        links, rechts = st.columns(2)
        if e["tickets"]:
            links.link_button("Tickets kopen", e["tickets"], type="primary", width="stretch")
        start = f"{e['datum']}T{e['tijd']}" if e["tijd"] else e["datum"]
        if (e["naam"], start) in in_agenda:
            rechts.button("In je agenda", key=f"ev_{e['tickets']}", disabled=True, width="stretch")
        elif rechts.button("In agenda zetten", key=f"ev_{e['tickets']}", width="stretch"):
            opslag.afspraak_toevoegen(e["naam"], start, locatie=e["locatie"], notitie=f"Tickets: {e['tickets']}",
                                      soort="uitgaan")
            st.rerun()


def uitje_regel(a: dict, voorkeuren: list[str]) -> str:
    links = []
    if a["website"]:
        links.append(f"[website]({a['website']})")
    route = urlencode({"daddr": f"{a['lat']},{a['lon']}", "q": a["naam"]})
    links.append(f"[route](https://maps.apple.com/?{route})")
    ster = " ⭐" if a["voorkeur"] in voorkeuren else ""
    return f"{a['icoon']} **{a['naam']}**{ster} · {a['soort']} · {a['afstand_km']} km · " + " · ".join(links)


def buurt_kaart(uitjes: list[dict], evenementen: list[dict], voorkeuren: list[str]) -> None:
    """Alle uitjes en events op één kaart. Namen worden leesbaar als je inzoomt."""
    punten = [{"plek": [a["lon"], a["lat"]], "naam": f"{a['icoon']} {a['naam']}", "label": a["naam"], "info": f"{a['soort']}, {a['afstand_km']} km",
               "kleur": [47, 125, 225, 220] if a["voorkeur"] in voorkeuren else [120, 140, 170, 160]} for a in uitjes]
    punten += [{"plek": [e["lon"], e["lat"]], "naam": f"{e['naam']}", "label": e["naam"], "info": f"{e['datum']} {e['tijd']}, {e['locatie']}",
                "kleur": [235, 120, 30, 230] if e["voorkeur"] in voorkeuren else [235, 170, 110, 170]}
               for e in evenementen if e.get("lat") is not None]
    if not punten:
        return
    try:
        lat, lon, _ = reizen.coordinaten(opslag.instellingen().get("thuisadres", "") or "Amsterdam")
    except Exception:
        lat, lon = punten[0]["plek"][1], punten[0]["plek"][0]
    lagen = [
        pdk.Layer("ScatterplotLayer", data=punten, get_position="plek", get_fill_color="kleur",
                  get_radius=60, radius_min_pixels=4, radius_max_pixels=14, pickable=True),
        # Tekst in meters: onleesbaar klein als je uitzoomt, leesbaar als je inzoomt.
        pdk.Layer("TextLayer", data=punten, get_position="plek", get_text="label", get_size=45, size_units="meters",
                  size_max_pixels=15, get_pixel_offset=[0, -14], get_color=[30, 30, 30], character_set="auto",
                  outline_width=2, outline_color=[255, 255, 255], font_settings={"sdf": True}),
        pdk.Layer("ScatterplotLayer", data=[{"plek": [lon, lat]}], get_position="plek", get_fill_color=[40, 170, 80],
                  radius_min_pixels=7),
    ]
    st.pydeck_chart(pdk.Deck(layers=lagen, initial_view_state=pdk.ViewState(latitude=lat, longitude=lon, zoom=11.5),
                             map_provider="carto", map_style="road",
                             tooltip={"html": "<b>{naam}</b><br/>{info}"}), height=360)
    st.caption("🔵 uitjes · 🟠 events · 🟢 thuis. Felle kleur past bij je voorkeur. Zoom in om de namen te lezen, "
               "tik op een punt voor meer.")


def voorkeuren_kiezen() -> list[str]:
    opgeslagen = opslag.instellingen().get("voorkeuren", [])
    gekozen = st.pills("Waar heb je zin in?", activiteiten.VOORKEUREN, selection_mode="multi", default=opgeslagen,
                       key="voorkeuren_keuze")
    if sorted(gekozen) != sorted(opgeslagen):
        opslag.instellingen_bijwerken(voorkeuren=gekozen)
    return gekozen


def events_overzicht() -> None:
    """Uitjes en events in de buurt, gesorteerd op voorkeur, op een kaart en in een lijst."""
    voorkeuren = voorkeuren_kiezen()
    thuis = opslag.instellingen().get("thuisadres", "")
    try:
        regen = weer.voorspelling(thuis)["daily"]["precipitation_probability_max"][0] >= 50
    except Exception:
        regen = False

    try:
        uitjes = activiteiten.sorteren(activiteiten.in_de_buurt(thuis), voorkeuren, regen)
    except Exception:
        uitjes = []
        st.caption("De uitjes konden niet worden geladen. Probeer het later opnieuw.")
    evenementen, events_fout = [], False
    if events.sleutel():
        try:
            evenementen = events.sorteren(events.zoeken(aantal=50), voorkeuren)
        except opslag.httpx.HTTPError:
            events_fout = True

    buurt_kaart(uitjes, evenementen, voorkeuren)

    if uitjes:
        st.markdown("**Uitjes**")
        if regen:
            st.caption("Er is vandaag regen voorspeld, dus uitjes binnen staan eerst.")
        st.markdown("  \n".join(uitje_regel(a, voorkeuren) for a in uitjes[:5]))
        if len(uitjes) > 5:
            with st.expander(f"Alle uitjes ({len(uitjes)})"):
                st.markdown("  \n".join(uitje_regel(a, voorkeuren) for a in uitjes[5:]))

    st.markdown("**Events**")
    if st.button("Laat de assistent meer zoeken", help="De assistent zoekt op internet bij lokale zalen, "
                 "Eventbrite, Paylogic, gemeenten en sites van organisatoren."):
        wens = f" Mijn voorkeuren: {', '.join(voorkeuren)}." if voorkeuren else ""
        vraag_assistent(
            "Zoek activiteiten en events in de buurt van mijn thuisadres in de komende twee weken in alle openbare "
            "bronnen: uitagenda's van de gemeente en regio, lokale zalen, theaters, clubs, festivals, markten, "
            "Eventbrite, Paylogic en sites van organisatoren." + wens + " Geef per event de datum, plek, prijs en de "
            "directe link naar de ticketpagina, en vraag of ik er een in mijn agenda wil.")
    if not events.sleutel():
        st.caption("Stel events één keer in bij Instellingen (gratis sleutel van Ticketmaster).")
        return
    if events_fout:
        st.caption("De events konden niet worden geladen. Probeer het later opnieuw.")
        return
    if not evenementen:
        st.caption("Geen events gevonden in de komende twee weken.")
        return
    datums = sorted(e["datum"] for e in evenementen)
    in_agenda = {(a["titel"], a["start"]) for a in opslag.afspraken_tussen(datums[0], datums[-1])}
    for e in evenementen[:3]:
        event_kaart(e, in_agenda)
    if len(evenementen) > 3:
        with st.expander(f"Alle events ({len(evenementen)})"):
            for e in evenementen[3:]:
                event_kaart(e, in_agenda)
    st.caption("Je koopt tickets op de site van Ticketmaster. Ben je daar ingelogd, dan staan je gegevens al klaar "
               "en betaal je direct, bijvoorbeeld met Apple Pay of iDEAL.")


VOORPAGINA = {"ochtend": "Ochtendoverzicht ('s ochtends, met voorlezen)", "weer": "Weer naast de datum", "startpunt": "Snel aan de slag (verkopen, dienst aanbieden, leren, winkels)",
              "afspraken": "Geplande afspraken (dagschema)",
              "meldingen": "Meldingen (verkocht, bestellingen, berichten, gedeeld)",
              "saldo": "Saldo van de marktplaats", "budget": "Budget: wat je deze maand nog vrij kunt besteden",
              "taken": "Taken",
              "seintjes": "Korte seintjes (herhalen, sportresultaat)",
              "woning": "Knoppen voor Apple Woning (als je scènes hebt ingesteld)"}
# Wat je in het menu aan of uit kunt zetten (de sleutels staan zo in je instellingen).
ONDERDELEN = {"Documenten": "Documenten", "Mail": "Mail", "Leren": "Leren en schrijven", "Samen": "Projecten en delen",
              "DIY": "DIY en hobby", "Hulpmiddelen": "Hulpmiddelen (notities, timer, rekenen)",
              "Scannen": "Foto scannen", "VR-ruimtes": "VR-ruimtes (projecten in 3D)",
              "Boodschappen": "Boodschappen",
              "Lijstjes": "Kooplijst en wenslijst", "Marktplaats": "Marktplaats (kopen en verkopen bij elkaar)",
              "Budget": "Budget (uitgaven, vaste lasten, sparen)", "Beleggen": "Beleggen (alleen meekijken)"}
# De pagina's van deze beurt, op url; gevuld door paginas().
PAGINA: dict = {}


# Wat standaard uit staat op de voorpagina (aan te zetten bij Instellingen › Weergave).
VOORPAGINA_UIT = {"startpunt"}


def voorpagina() -> dict:
    return {k: k not in VOORPAGINA_UIT for k in VOORPAGINA} | opslag.instellingen().get("voorpagina", {})


def mijn_avatar() -> dict:
    return avatar.instellingen(opslag.instellingen())


def ga_naar(url: str) -> None:
    """Naar een andere pagina, ook vanuit een knop in een stukje dat zichzelf bijwerkt."""
    st.session_state.ga_naar = url
    st.rerun(scope="app")


def groet(nu: datetime) -> str:
    deel = "Goedemorgen" if nu.hour < 12 else "Goedemiddag" if nu.hour < 18 else "Goedenavond"
    naam = samen_scherm.ik().get("weergavenaam") or ""
    return f"{deel}{', ' + naam if naam else ''}"


def vandaag_overzicht() -> None:
    """De voorpagina: zo rustig mogelijk. Wat er staat, kies je bij Instellingen › Voorpagina en menu."""
    nu = datetime.now()
    keuze = voorpagina()
    regel = f"{DAGEN[nu.weekday()].capitalize()} {nu.day} {MAANDEN[nu.month - 1]}"
    if keuze["weer"] and (w := weer_kort()):
        regel += f" · {w}"
    st.markdown(f'<div style="display:flex;gap:14px;align-items:center;margin-bottom:8px">'
                f'<img src="{avatar.adres(mijn_avatar())}" width="56" height="56" style="border-radius:50%;flex-shrink:0">'
                f'<div><b>{html.escape(groet(nu))}</b><br><span style="opacity:.6">{html.escape(regel)}</span></div></div>',
                unsafe_allow_html=True)
    if keuze["ochtend"]:
        ochtendoverzicht(nu, keuze)
    if mail.gekoppeld() and "Mail" not in onderdelen_uit():
        mail_voorstel("vandaag")
    if keuze["startpunt"]:
        startpunt()
    if keuze["afspraken"]:
        dagschema()
    if samen.beschikbaar():
        nieuw = samen_scherm.nieuw_kort()
        if keuze["meldingen"]:
            meldingen_blok(nieuw.get("meldingen", []))
        if keuze["saldo"] and "Marktplaats" not in onderdelen_uit():
            saldo_blok(nieuw.get("saldo"))
    if keuze["budget"] and "Budget" not in onderdelen_uit() and samen.beschikbaar():
        budget_blok()
    if keuze["taken"]:
        taken_blok()
    if keuze["woning"]:
        woning.knoppen(woning.scenes(), "vandaag")
    if keuze["seintjes"]:
        seintjes(nu)


def budget_blok() -> None:
    """Eén regel: wat je deze maand nog vrij kunt besteden. Alleen als je het budget gebruikt."""
    try:
        tekst = budget.kort(voorpagina=True)
    except Exception:
        return
    if tekst and "budget" in PAGINA:
        st.page_link(PAGINA["budget"], label=tekst, icon=":material/account_balance_wallet:")


def ochtend_tekst(nu: datetime) -> list[str]:
    """Het ochtendoverzicht in een paar korte zinnen, zonder Claude (snel en gratis)."""
    zinnen = []
    if w := weer_kort():
        zinnen.append(f"Het weer: {w.split(' ', 1)[1] if ' ' in w else w}.")
    regels = [r for r in dagplanning_veilig(nu.date().isoformat()) if "T" in r["start"]]
    hele_dag = [r["titel"] for r in dagplanning_veilig(nu.date().isoformat()) if "T" not in r["start"]]
    if regels:
        eerste = next((r for r in regels if r["start"][11:16] >= nu.strftime("%H:%M")), regels[0])
        zin = f"Je hebt vandaag {len(regels)} {'afspraak' if len(regels) == 1 else 'afspraken'}"
        zin += f". De eerste is {eerste['titel']} om {eerste['start'][11:16]}"
        if eerste.get("vertrek_om"):
            zin += f"; vertrek om {eerste['vertrek_om']}"
        zinnen.append(zin + ".")
    else:
        zinnen.append("Je agenda is vandaag leeg.")
    if hele_dag:
        zinnen.append(f"Vandaag ook: {', '.join(hele_dag)}.")
    vandaag = nu.date().isoformat()
    taken = [t for t in opslag.open_taken() if t["deadline"] and t["deadline"] <= vandaag]
    if taken:
        zinnen.append(f"{len(taken)} {'taak moet' if len(taken) == 1 else 'taken moeten'} vandaag af: "
                      f"{', '.join(t['titel'] for t in taken[:3])}.")
    if "Budget" not in onderdelen_uit():
        try:
            if f := budget.facturen_kort():
                zinnen.append(f)
        except Exception:
            pass
    v = mailtaken.wachtend()
    if n := len(v.get("taken", [])) + len(v.get("afspraken", [])) + len(v.get("facturen", [])):
        zinnen.append(f"In je mail staan {n} nieuwe dingen voor je agenda, takenlijst of facturen; kijk of ze erbij moeten."
                      if n > 1 else "In je mail staat iets nieuws voor je agenda, takenlijst of facturen; kijk of het erbij moet.")
    if "Budget" not in onderdelen_uit() and samen.beschikbaar():
        try:
            if b := budget.kort():
                zinnen.append(b)
        except Exception:
            pass
    if "Beleggen" not in onderdelen_uit():
        try:
            if b := beleggen.kort():
                zinnen.append(b)
        except Exception:
            pass
    return zinnen


def ochtendoverzicht(nu: datetime, keuze: dict) -> None:
    """'s Ochtends (tot 12 uur, of als je via ?ochtend komt) een kort overzicht van je dag, met voorlezen."""
    vandaag = nu.date().isoformat()
    gevraagd = st.session_state.get("ochtend_gevraagd")
    if st.session_state.get("ochtend_weg") == vandaag or not (gevraagd or 5 <= nu.hour < 12):
        return
    if opslag.instellingen().get("ochtend_gezien") == vandaag and not gevraagd:
        return
    zinnen = ochtend_tekst(nu)
    with st.container(border=True):
        kop = st.container(horizontal=True, vertical_alignment="center", horizontal_alignment="distribute")
        kop.markdown("**Je dag in het kort**")

        def sluiten() -> None:
            opslag.gebruik_account(st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))
            st.session_state.ochtend_weg = vandaag
            st.session_state.pop("ochtend_gevraagd", None)
            opslag.instellingen_bijwerken(ochtend_gezien=vandaag)

        kop.button("", icon=":material/close:", key="ochtend_sluit", on_click=sluiten, help="Voor vandaag sluiten",
                   type="tertiary")
        st.markdown("\n".join(f"- {z}" for z in zinnen))
        spraak.knop(stem(), f"{groet(nu)}. " + " ".join(zinnen), antwoord_id=f"ochtend-{vandaag}", key="ochtend_spraak",
                    alleen_voorlezen=True,
                    automatisch=bool(gevraagd), gevoel="blij")
        if mail.gekoppeld() and "Mail" not in onderdelen_uit():
            v = mailtaken.wachtend()
            if not (v.get("taken") or v.get("afspraken")) and st.button(
                    "Mail nakijken op taken en afspraken", key="ochtend_mail", icon=":material/mark_email_read:"):
                mail_nakijken()
                st.rerun()
        if st.button(f"Plan mijn dag met {avatar.aanspreken(mijn_avatar())}", key="ochtend_plan",
                     icon=":material/auto_awesome:"):
            vraag_assistent("Kijk naar mijn dag (agenda, taken, weer) en stel een strakke planning voor vandaag voor, "
                            "met wat ik als eerste moet doen.", "Plan mijn dag")


def startpunt() -> None:
    """Eén rij knoppen: van hier begin je met verkopen, een dienst aanbieden, leren of winkelen."""
    uit = onderdelen_uit()
    opties = {}
    if samen.beschikbaar() and "Marktplaats" not in uit:
        opties |= {"Verkopen": ("verkopen", "product"), "Dienst aanbieden": ("verkopen", "dienst"),
                   "Winkels": ("winkels", None)}
    if "Leren" not in uit:
        opties["Leren"] = ("leren", None)
    opties[f"{mijn_avatar()['naam']}"] = ("assistent", None)

    def gekozen() -> None:
        keuze = st.session_state.get("startpunt")
        st.session_state.startpunt = None
        if keuze in opties:
            url, soort = opties[keuze]
            if soort:
                st.session_state.aanbod_soort = soort
                st.session_state.aanbod_open = True
            st.session_state.ga_naar = url

    st.pills("Snel aan de slag", list(opties), key="startpunt", on_change=gekozen, label_visibility="collapsed")


def meldingen_blok(meldingen: list) -> None:
    """Wat er op de marktplaats en bij Samen voor je is gebeurd; tik erop om erheen te gaan."""
    for pagina, tekst in meldingen[:5]:
        icoon, rest = tekst.split(" ", 1)
        if pagina in PAGINA:
            st.page_link(PAGINA[pagina], label=rest, icon=icoon)
        else:
            st.caption(tekst)
    if len(meldingen) > 5:
        st.caption(f"En nog {len(meldingen) - 5} meer.")


def saldo_blok(saldo: dict | None) -> None:
    if not saldo:
        return
    if not any(saldo.values()):
        return
    delen = [f"verdiend **{samen.euro(saldo['verdiend'])}**" + (f" ({saldo['verkocht']} verkocht)" if saldo["verkocht"] else "")]
    if saldo["onderweg"]:
        delen.append(f"onderweg **{samen.euro(saldo['onderweg'])}**")
    if saldo["uitgegeven"]:
        delen.append(f"uitgegeven **{samen.euro(saldo['uitgegeven'])}**")
    st.markdown("Deze maand: " + " · ".join(delen),
                help="Onderweg is betaald via de app; je krijgt het zodra de koper bevestigt dat alles goed is ontvangen."
                if saldo["onderweg"] else None)


def seintjes(nu: datetime) -> None:
    """Hooguit één regel met wat aandacht vraagt; de rest staat op de plek zelf."""
    delen = []
    if herhalingen := opslag.herhalingen_vandaag():
        delen.append(f"{len(herhalingen)} keer herhalen (Leren)")
    if (reeks := opslag.leerreeks())["reeks"] and not reeks["vandaag_gehaald"] and nu.hour >= 17:
        delen.append(f"oefen vandaag even, dan blijft je reeks van {reeks['reeks']} dagen staan")
    if sport_zonder_resultaat(nu):
        delen.append("hoe ging je training? (Agenda)")
    if namens := opslag.namens_vandaag():
        delen.append(f"{namens} keer namens je gereageerd (Mail)")
    if concepten := opslag.mailconcepten():
        delen.append(f"{len(concepten)} antwoord klaar om te versturen (Mail)")
    if opslag.sportdoelen() and not tijd.sportoverzicht((nu.date() - timedelta(days=6)).isoformat(),
                                                         nu.date().isoformat())["aantal"]:
        delen.append("deze week nog niet bewogen, even een rondje?")
    if not opslag.instellingen().get("thuisadres"):
        delen.append("vul je thuisadres in voor vertrektijden (Instellingen)")
    if delen:
        st.caption(" · ".join(delen))


def schema_html(regels: list[dict], nu: datetime) -> str:
    """Tijdschema van de dag: voorbij is grijs, wat nu bezig is staat vet, met een rode lijn op het huidige moment."""
    klok = nu.strftime("%H:%M")
    rijen, lijn_gezet = [], False

    def rij(tijdstip: str, tekst: str, stijl: str = "", kleur: str = "transparent") -> str:
        return (f'<div style="display:flex;gap:12px;padding:5px 0 5px 8px;border-left:4px solid {kleur};{stijl}">'
                f'<div style="width:46px;flex-shrink:0;font-variant-numeric:tabular-nums">{tijdstip}</div>'
                f'<div>{tekst}</div></div>')

    for r in regels:
        if "T" not in r["start"]:
            rijen.append(rij("hele dag", f"{tijd.icoon(r)} {html.escape(r['titel'])}", kleur=tijd.kleur(tijd.soort_van(r))))
            continue
        begin = r["start"][11:16]
        eind = (r.get("einde") or "")[11:16]
        momenten = [(r["vertrek_om"], "vertrek")] if r.get("vertrek_om") else []
        momenten.append((begin, "begin"))
        for moment, wat in momenten:
            if not lijn_gezet and moment > klok:
                rijen.append(f'<div style="border-top:2px solid {ROOD};margin:4px 0;font-size:12px;color:{ROOD}">nu {klok}</div>')
                lijn_gezet = True
            voorbij = (eind or begin) < klok if wat == "begin" else moment < klok
            grijs = "opacity:.45;" if voorbij else ""
            if wat == "vertrek":
                rijen.append(rij(moment, f'<span style="color:{BLAUW}">vertrekken naar {html.escape(r["titel"])}</span>', grijs))
            else:
                bezig = begin <= klok < eind if eind else False
                tekst = f"{tijd.icoon(r)} {html.escape(r['titel'])}"
                if eind:
                    tekst += f' <span style="opacity:.6">tot {eind}</span>'
                if bezig:
                    tekst = f"<b>{tekst}</b> · nu bezig"
                rijen.append(rij(moment, tekst, grijs, tijd.kleur(tijd.soort_van(r))))
    if not lijn_gezet:
        rijen.append(f'<div style="border-top:2px solid {ROOD};margin:4px 0;font-size:12px;color:{ROOD}">nu {klok}</div>')
    return "".join(rijen)


@st.fragment(run_every=60)
def dagschema() -> None:
    """Het schema van vandaag. Werkt elke minuut vanzelf bij zolang de app open staat."""
    opslag.gebruik_account(st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))
    nu = datetime.now()
    regels = dagplanning_veilig(nu.date().isoformat())
    if not regels:
        st.caption("Vandaag niets gepland.")
        return
    st.markdown(schema_html(regels, nu), unsafe_allow_html=True)

    # De eerstvolgende afspraak (of een afspraak waarvan de tijdregistratie nog loopt) krijgt de knoppen.
    klok = nu.strftime("%H:%M")
    nog_te_gaan = [r for r in regels if "T" in r["start"] and (
        r["start"][11:16] >= klok or (r.get("einde") or "")[11:16] > klok or (r.get("tijden") and tijd.volgend_moment(r)))]
    if nog_te_gaan:
        eerste = nog_te_gaan[0]
        with st.container(border=True):
            st.markdown(afspraak_tekst(eerste))
            weer_bij_afspraak(eerste)
            if eerste.get("waarschuwing"):
                st.warning(eerste["waarschuwing"])
            tijd_knop(eerste)
            if eerste.get("reis"):
                with st.expander("Route, navigeren en delen"):
                    kaart(eerste)
                    route_knoppen(eerste)
    for regel in nog_te_gaan[1:]:
        if regel.get("waarschuwing"):
            st.warning(regel["waarschuwing"])


def taak_label(t: dict, vandaag: str) -> str:
    if not t["deadline"]:
        return t["titel"]
    if t["deadline"] < vandaag:
        return f"{t['titel']} · :red[te laat]"
    if t["deadline"] == vandaag:
        return f"{t['titel']} · :orange[vandaag]"
    return f"{t['titel']} · vóór {t['deadline']}"


def taken_blok() -> None:
    """De belangrijkste open taken om af te vinken; nieuwe taak via de plusknop."""
    taken = opslag.open_taken()
    vandaag = date.today().isoformat()
    kol1, kol2 = st.columns([5, 1], vertical_alignment="center")
    kol1.markdown("**Taken**" if taken else ":gray[Geen open taken]")
    with kol2.popover("", icon=":material/add:", help="Nieuwe taak"):
        with st.form("nieuwe_taak", clear_on_submit=True, border=False):
            titel = st.text_input("Nieuwe taak", placeholder="Wat moet er gebeuren?")
            deadline = st.date_input("Deadline (optioneel)", value=None, format="DD-MM-YYYY")
            minuten = st.select_slider("Hoe lang duurt het ongeveer?", options=[15, 30, 45, 60, 90, 120, 180, 240],
                                       value=30, format_func=lambda m: f"{m} min" if m < 60 else f"{m / 60:g} uur")
            st.caption("Sneller: typ onderaan gewoon \"vrijdag belasting, 1 uur\".")
            if st.form_submit_button("Toevoegen", type="primary") and titel.strip():
                opslag.taak_toevoegen(titel.strip(), deadline.isoformat() if deadline else None, minuten)
                st.rerun()

    def afvinken(t: dict) -> None:
        if st.checkbox(taak_label(t, vandaag), key=f"taak_{t['id']}"):
            opslag.taak_afronden(t["id"])
            st.toast(f"Goed gedaan: {t['titel']}", icon="🎉")
            st.rerun()

    for t in taken[:5]:
        afvinken(t)
    if len(taken) > 5 or mail.gekoppeld():
        def naar_taken() -> None:
            st.session_state.agenda_deel = "Taken"
            st.session_state.ga_naar = "agenda"

        st.button(f"Alle {len(taken)} taken" if len(taken) > 5 else "Takenlijst", type="tertiary", on_click=naar_taken,
                  icon=":material/checklist:", key="naar_takenlijst")


def leren_tabblad() -> None:
    """Leren (leerdoelen, leerplan en overhoren) en schrijven (scripties en verslagen)."""
    keuze = st.segmented_control("Onderdeel", ["Leren", "Scriptie en verslagen"], default="Leren",
                                 key="leren_keuze", label_visibility="collapsed") or "Leren"
    if keuze == "Leren":
        leerdoelen_onderdeel()
    else:
        schrijven_onderdeel()


def leerreeks_blok() -> None:
    """Elke dag een beetje: dagdoel, reeks en de afgelopen week (zoals bij taal-apps)."""
    r = opslag.leerreeks()
    if not r["reeks"] and not r["vandaag"] and not any(r["week"]):
        st.caption(f"Oefen elke dag even: haal je dagdoel van {r['dagdoel']} vragen of kaarten en bouw een reeks op.")
        return
    dagletters = ["ma", "di", "wo", "do", "vr", "za", "zo"]
    vandaag = date.today()
    week = " ".join(f"{'🔥' if gehaald else '⚪'}{dagletters[(vandaag - timedelta(days=6 - i)).weekday()]}"
                    for i, gehaald in enumerate(r["week"]))
    kol1, kol2 = st.columns([2, 3], vertical_alignment="center")
    kol1.metric("Reeks", f"{r['reeks']} {'dag' if r['reeks'] == 1 else 'dagen'}",
                f"beste: {r['beste']}" if r["beste"] > r["reeks"] else None, delta_color="off")
    with kol2:
        st.progress(min(1.0, r["vandaag"] / r["dagdoel"]),
                    text=("Dagdoel gehaald!" if r["vandaag_gehaald"]
                          else f"Vandaag {r['vandaag']} van {r['dagdoel']}"))
        st.caption(week)


def leerdoelen_onderdeel() -> None:
    if werk_scherm.oefenen_bezig():
        return
    leerreeks_blok()
    herhalingen = opslag.herhalingen_vandaag()
    if herhalingen:
        st.markdown(f"**Vandaag herhalen ({len(herhalingen)})**")
        if st.button("Overhoor me over de herhalingen van vandaag", type="primary", width="stretch"):
            vraag_assistent("Overhoor me over mijn herhalingen van vandaag.")
        with st.expander("Zelf een score geven"):
            for h in herhalingen:
                st.markdown(f"**{h['onderwerp']}**: stap {h['nummer']}, {h['titel']}")
                score = st.select_slider("Hoe goed ken je dit?", options=list(range(6)), value=3,
                                         key=f"score_{h['leerdoel_id']}_{h['nummer']}",
                                         format_func=lambda x: ["😶 0", "😣 1", "😕 2", "🙂 3", "😀 4", "🤩 5"][x])
                if st.button("Opslaan", key=f"oefen_{h['leerdoel_id']}_{h['nummer']}"):
                    opslag.oefening_vastleggen(h["leerdoel_id"], h["nummer"], score)
                    st.rerun()

    doelen = opslag.leerdoelen()
    werk_scherm.totaal_voortgang(doelen)
    if not doelen:
        st.caption("Nog geen leerdoelen. Start er hieronder een; de assistent maakt het leerplan en overhoort je.")
    for d in doelen:
        with st.container(border=True):
            st.markdown(f"**{d['onderwerp']}**" + (f"  \n:material/flag: {d['doel']}" if d.get("doel") else ""))
            tekst = f"{opslag.voortgang(d)}% beheerst"
            if d.get("deadline"):
                tekst += f" · klaar op {d['deadline']}"
            st.progress(opslag.voortgang(d) / 100, text=tekst)
            werk_scherm.oefenknoppen(d)
            with st.expander("Leerplan"):
                for stap in d["stappen"]:
                    score = "" if stap["score"] is None else f" · score {stap['score']}/5"
                    volgende = f" · herhalen op {stap['herhalen_op']}" if stap["herhalen_op"] else " · nog niet geoefend"
                    st.markdown(f"{stap['nummer']}. {stap['titel']}{score}{volgende}")

    with st.expander("Nieuw leerdoel"):
        with st.form("nieuw_leerdoel", border=False):
            onderwerp = st.text_input("Wat wil je leren?", placeholder="Bijvoorbeeld: Spaans voor op vakantie")
            doel = st.text_input("Wat wil je straks kunnen?", placeholder="Bijvoorbeeld: eten bestellen en de weg vragen")
            met_deadline = st.checkbox("Met een einddatum")
            deadline = st.date_input("Einddatum", value=date.today() + timedelta(days=30), format="DD-MM-YYYY")
            stappen = st.text_area("Stappen (één per regel)", placeholder="Laat leeg, dan maakt de assistent het leerplan")
            if st.form_submit_button("Starten") and onderwerp.strip():
                lijst = [r.strip() for r in stappen.splitlines() if r.strip()]
                einde = deadline.isoformat() if met_deadline else ""
                if lijst:
                    opslag.leerdoel_starten(onderwerp.strip(), lijst, doel.strip(), einde)
                    st.rerun()
                else:
                    vraag_assistent(f"Maak een leerplan voor: {onderwerp.strip()}."
                                    + (f" Doel: {doel.strip()}." if doel.strip() else "")
                                    + (f" Klaar op {einde}." if einde else "")
                                    + " Stel het plan voor en sla het op als ik akkoord ben.")
    st.caption("Zo leer je het best, volgens onderzoek: jezelf overhoren, gespreid herhalen en het in eigen woorden "
               "uitleggen. De app plant je herhalingen vanzelf.")


SOORT_SCHRIJVEN = {"scriptie": "Scriptie", "verslag": "Verslag", "essay": "Essay", "paper": "Paper"}
NIVEAUS = ["", "mbo", "hbo", "wo-bachelor", "wo-master", "anders"]


def tekst_uit_bestand(bestand) -> str:
    """Leest de tekst uit een geüpload Word-, pdf- of tekstbestand."""
    naam = bestand.name.lower()
    if naam.endswith(".pdf"):
        import pypdf
        return "\n".join(pagina.extract_text() or "" for pagina in pypdf.PdfReader(bestand).pages)
    if naam.endswith(".docx"):
        import docx
        return "\n".join(alinea.text for alinea in docx.Document(bestand).paragraphs)
    return bestand.getvalue().decode("utf-8", errors="replace")


def feedback_vragen(project: dict) -> None:
    """Een tekst (bestand of getypt) laten nakijken door de assistent."""
    bestand = st.file_uploader("Je tekst (Word, pdf of tekst)", type=["docx", "pdf", "txt"], key=f"tekst_{project['id']}")
    getypt = st.text_area("Of typ of plak een stuk tekst", key=f"getypt_{project['id']}", height=120)
    waarop = st.pills("Let vooral op", ["Structuur", "Argumentatie", "Onderbouwing en bronnen", "Taal en stijl",
                                        "APA-bronvermelding"], selection_mode="multi", key=f"waarop_{project['id']}")
    if st.button("Nakijken", key=f"nakijken_{project['id']}", type="primary"):
        try:
            tekst = tekst_uit_bestand(bestand) if bestand else getypt
        except Exception:
            st.error("Dit bestand kon niet worden gelezen. Probeer het als Word- of pdf-bestand.")
            return
        if not tekst.strip():
            st.error("Kies een bestand of vul tekst in.")
            return
        punten = ", ".join(waarop) if waarop else "structuur, argumentatie, onderbouwing, taal en bronvermelding"
        vraag_assistent(
            f"Geef feedback op deze tekst voor mijn {project['soort']} \"{project['titel']}\" (project {project['id']}). "
            f"Let vooral op: {punten}. Geef de 3 tot 5 belangrijkste verbeterpunten met een voorbeeld, wat al goed is, "
            f"en waar een bewering een (wetenschappelijke) bron nodig heeft.\n\nTekst:\n{tekst[:60000]}",
            label=f"Feedback op mijn tekst ({bestand.name if bestand else f'{len(tekst.split())} woorden'})")


def schrijfproject_kaart(project: dict) -> None:
    pid = project["id"]
    with st.container(border=True):
        regel = f"**{project['titel']}** · {SOORT_SCHRIJVEN.get(project['soort'], project['soort'])}"
        if project.get("deadline"):
            dagen = (date.fromisoformat(project["deadline"]) - date.today()).days
            regel += f" · inleveren {project['deadline']} ({'nog ' + str(dagen) + ' dagen' if dagen >= 0 else 'verlopen'})"
        st.markdown(regel)
        if project.get("onderzoeksvraag"):
            st.caption(f"{project['onderzoeksvraag']}")
        klaar = sum(h["status"] == "klaar" for h in project["hoofdstukken"])
        st.progress(klaar / max(1, len(project["hoofdstukken"])), text=f"{klaar} van {len(project['hoofdstukken'])} onderdelen klaar")

        k1, k2, k3 = st.columns(3)
        if k1.button("Opzet en planning", key=f"opzet_{pid}", width="stretch",
                     help="Een opzet per hoofdstuk en schrijfblokken in je agenda tot de deadline."):
            vraag_assistent(f"Help me met de opzet en planning van mijn {project['soort']} \"{project['titel']}\" "
                            f"(project {pid}). Scherp de onderzoeksvraag aan als dat nodig is, geef per hoofdstuk "
                            "een korte opzet en stel schrijfblokken in mijn agenda voor tot de deadline.")
        if k2.button("Bronnen zoeken", key=f"bronnen_{pid}", width="stretch",
                     help="Wetenschappelijke bronnen die echt bestaan, met APA-vermelding."):
            vraag_assistent(f"Zoek de belangrijkste wetenschappelijke bronnen voor mijn {project['soort']} "
                            f"\"{project['titel']}\" (project {pid}). Geef per bron in één zin wat ik eraan heb, "
                            "en sla de beste op bij het project.")
        with k3.popover("Feedback", width="stretch"):
            feedback_vragen(project)

        with st.expander("Onderdelen"):
            for h in project["hoofdstukken"]:
                kol1, kol2 = st.columns([3, 2], vertical_alignment="center")
                kol1.markdown(f"{h['nummer']}. {h['titel']}" + (f"  \n:gray[{h['notitie']}]" if h.get("notitie") else ""))
                status = kol2.segmented_control("Status", opslag.STATUS, default=h["status"], key=f"hst_{pid}_{h['nummer']}",
                                                label_visibility="collapsed")
                if status and status != h["status"]:
                    opslag.hoofdstuk_bijwerken(pid, h["nummer"], status)
                    st.rerun()
        with st.expander(f"Bronnen ({len(project['bronnen'])})"):
            if not project["bronnen"]:
                st.caption("Nog geen bronnen. Tik op Bronnen zoeken.")
            bronnen = sorted(project["bronnen"], key=lambda b: b.get("apa", b["titel"]).lower())
            for b in bronnen:
                kol1, kol2 = st.columns([8, 1], vertical_alignment="center")
                kol1.markdown((b.get("apa") or b["titel"]) + (f"  \n:gray[{b['waarom']}]" if b.get("waarom") else ""))
                if kol2.button("✕", key=f"bron_weg_{pid}_{b['id']}", help="Verwijderen"):
                    opslag.bron_verwijderen(pid, b["id"])
                    st.rerun()
            if bronnen:
                lijst = "\n\n".join(b.get("apa", b["titel"]).replace("*", "") for b in bronnen)
                st.download_button("Bronnenlijst downloaden", lijst, file_name="bronnenlijst.txt", key=f"bronlijst_{pid}")
        with st.popover("⋯ Meer"):
            if st.button("Project afsluiten", key=f"archiveer_{pid}"):
                opslag.schrijfproject_archiveren(pid)
                st.rerun()


def schrijven_onderdeel() -> None:
    projecten = [p for p in opslag.schrijfprojecten() if not p.get("gearchiveerd")]
    if not projecten:
        st.caption("De assistent helpt met je onderzoeksvraag, opzet, planning, echte wetenschappelijke bronnen en "
                   "feedback op je tekst. Jij schrijft de tekst zelf.")
    for project in projecten:
        schrijfproject_kaart(project)

    with st.expander("Nieuwe scriptie of nieuw verslag", expanded=not projecten):
        with st.form("nieuw_schrijfproject", border=False):
            titel = st.text_input("Werktitel of onderwerp", placeholder="Bijvoorbeeld: Effect van thuiswerken op werkgeluk")
            kol1, kol2 = st.columns(2)
            soort = kol1.selectbox("Soort", list(SOORT_SCHRIJVEN), format_func=SOORT_SCHRIJVEN.get)
            niveau = kol2.selectbox("Niveau", NIVEAUS, format_func=lambda n: n or "Kies (optioneel)")
            vraag = st.text_input("Onderzoeksvraag of stelling", placeholder="Mag nog ruw zijn; de assistent helpt")
            met_deadline = st.checkbox("Met een inleverdatum")
            deadline = st.date_input("Inleverdatum", value=date.today() + timedelta(days=60), format="DD-MM-YYYY")
            eisen = st.text_area("Eisen van je opleiding (optioneel)", placeholder="Bijvoorbeeld: 8000 woorden, APA, verplicht een interview",
                                 height=68)
            if st.form_submit_button("Starten", type="primary"):
                if not titel.strip():
                    st.error("Vul een werktitel of onderwerp in.")
                else:
                    opslag.schrijfproject_maken(titel.strip(), soort, vraag.strip(),
                                                deadline.isoformat() if met_deadline else "", niveau, eisen=eisen.strip())
                    st.rerun()
    st.caption("Let op: houd je aan de regels van je opleiding over het gebruik van AI. De assistent helpt je op weg, "
               "maar de tekst en de keuzes zijn van jou.")


def stem() -> dict:
    return spraak.instellingen(opslag.instellingen().get("stem"))


def app_adres() -> str:
    """Het webadres van de app zelf, zoals de browser het gebruikt."""
    try:
        deel = urlparse(st.context.url or "")
        if deel.netloc:
            return f"{deel.scheme}://{deel.netloc}"
    except Exception:
        pass
    return "https://jouw-app.streamlit.app"


def siri_en_woning() -> None:
    """Uitleg en instellingen om de assistent vanuit Siri te gebruiken en Apple Woning te bedienen."""
    adres = app_adres()
    st.markdown("**Siri**")
    st.markdown(
        "Zeg straks *\"Hé Siri, assistent\"* en spreek in wat je wilt: *\"morgen 9 uur tandarts\"* komt meteen in "
        "je agenda, een vraag gaat naar je assistent. Eén keer instellen in de app **Opdrachten**:\n\n"
        "1. Tik op **+** (nieuwe opdracht) en noem hem **Assistent**.\n"
        "2. Voeg **Dicteer tekst** toe.\n"
        "3. Voeg **Codeer URL** toe (die pakt vanzelf de gedicteerde tekst).\n"
        f"4. Voeg **Open URL's** toe en typ: `{adres}/?zeg=` en tik daarna op **Variabele** › **Gecodeerde URL**.\n"
        "5. Klaar. Zeg \"Hé Siri, assistent\" om het te proberen.")
    st.caption("Tip: log één keer in met \"Ingelogd blijven op dit apparaat\" aan. Dan opent Siri de app zonder "
               "inloggen. Je ziet je apparaten bij Account › Beveiliging.")
    st.divider()
    st.markdown("**Ochtendoverzicht elke ochtend**")
    st.markdown(
        "Laat je iPhone of iPad elke ochtend je dag openen: weer, eerste afspraak met vertrektijd, taken en je budget.\n\n"
        "1. Open **Opdrachten** › **Automatisering** › **+** › **Tijdstip**, bijvoorbeeld 7:00, elke dag.\n"
        "2. Kies **Voer direct uit**.\n"
        f"3. Voeg **Open URL's** toe met: `{adres}/?ochtend=1`\n"
        "4. Klaar. Je kunt het overzicht ook laten voorlezen met de luidsprekerknop.")
    st.divider()
    st.markdown("**Apple Woning**")
    st.markdown(
        "Maak in **Opdrachten** per scène een opdracht met de actie **Bedien woning** (bijvoorbeeld *Licht uit*). "
        "Zet hieronder dezelfde namen. Dan krijg je knoppen op Vandaag, en je assistent zet ze klaar als je "
        "vraagt *\"doe het licht uit\"*. Jij tikt zelf, zo kan niemand anders je huis bedienen.")
    huidig = woning.scenes()
    with st.form("woning", border=False):
        tekst = st.text_area("Namen van je opdrachten (één per regel)", value="\n".join(huidig), height=120,
                             placeholder="\n".join(woning.VOORBEELDEN[:3]))
        if st.form_submit_button("Opslaan", type="primary"):
            namen = list(dict.fromkeys(r.strip() for r in tekst.splitlines() if r.strip()))[:20]
            opslag.instellingen_bijwerken(woning=namen)
            st.rerun()
    if huidig:
        st.caption("Probeer ze hier:")
        woning.knoppen(huidig, "instellingen")
    st.caption("Google Home en Gemini laten nog geen gewone apps aansluiten. Dat kan later via een thuis-hub "
               "(bijvoorbeeld Home Assistant).")


def stem_instellingen() -> None:
    """Regio, man of vrouw, tempo, en of antwoorden vanzelf worden voorgelezen."""
    huidig = stem()
    regio = st.segmented_control("Accent", list(spraak.REGIO), default=huidig["regio"], key="stem_regio") or huidig["regio"]
    geslacht = st.segmented_control("Stem", spraak.GESLACHT, default=huidig["geslacht"], key="stem_geslacht") or huidig["geslacht"]
    snelheid = st.select_slider("Tempo", [0.8, 0.9, 1.0, 1.1, 1.2, 1.3], value=huidig["snelheid"], key="stem_snelheid",
                                format_func=lambda s: {0.8: "rustig", 1.0: "normaal", 1.3: "snel"}.get(s, ""))
    voorlezen = st.toggle("Antwoorden altijd voorlezen", value=huidig["voorlezen"], key="stem_voorlezen",
                          help="Uit: alleen voorlezen als je zelf hebt ingesproken.")
    doorpraten = st.toggle("Doorpraten zonder te tikken (handsfree, bijvoorbeeld in de auto)", value=huidig["doorpraten"],
                           key="stem_doorpraten", help="Na het voorlezen luistert de assistent meteen weer.")
    st.markdown("**Natuurlijke stem met gevoel**")
    st.caption("De assistent kiest bij elk antwoord een gevoel (blij, rustig, meelevend, enthousiast...) en laat dat "
               "horen. Met de stem van je apparaat verandert alleen de toon een beetje. Met ElevenLabs klinkt de stem "
               "echt menselijk: met warmte, enthousiasme, een lach of een zucht. Daarvoor maak je een eigen account "
               "op elevenlabs.io (er is een gratis proefversie met een beperkt aantal minuten) en plak je hier je "
               "API-sleutel.")
    heeft_sleutel = bool(opslag.instellingen().get("elevenlabs_sleutel"))
    if st.session_state.pop("stem_natuurlijk_aan", False):
        st.session_state.stem_natuurlijk = True
    standaard = {} if "stem_natuurlijk" in st.session_state else {"value": huidig["natuurlijk"] and heeft_sleutel}
    natuurlijk = st.toggle("Natuurlijke stem gebruiken (ElevenLabs)", key="stem_natuurlijk", disabled=not heeft_sleutel,
                           **standaard,
                           help=None if heeft_sleutel else "Vul eerst hieronder je ElevenLabs-sleutel in.")
    stem_id = huidig.get("stem_id", "")
    with st.popover("ElevenLabs-sleutel" + (" (ingesteld)" if heeft_sleutel else "")):
        with st.form("eleven", border=False):
            nieuwe_sleutel = "".join(st.text_input("API-sleutel", type="password").split())
            stem_id = st.text_input("Stem-ID (optioneel)", value=stem_id,
                                    help="Laat leeg voor een standaardstem. Een Nederlandse stem kies je in de "
                                         "Voice Library van ElevenLabs; kopieer daar het Voice ID.").strip()
            if st.form_submit_button("Opslaan en testen", type="primary"):
                test = nieuwe_sleutel or opslag.instellingen().get("elevenlabs_sleutel", "")
                try:
                    with st.spinner("Stem testen..."):
                        geluid = spraak.natuurlijk_voorlezen("Hallo! [[lacht]] Wat fijn dat je er bent.", "blij",
                                                             {**huidig, "stem_id": stem_id}, test)
                except (spraak.StemFout, Exception) as fout:
                    st.error(str(fout) if isinstance(fout, spraak.StemFout) else "ElevenLabs is niet bereikbaar.")
                else:
                    opslag.instellingen_bijwerken(elevenlabs_sleutel=test, stem={**huidig, "stem_id": stem_id,
                                                                                 "natuurlijk": True})
                    st.session_state.stem_natuurlijk_aan = True
                    st.session_state.stem_test_geluid = geluid
                    st.session_state.stem_test_ok = True
                    st.rerun()
    if st.session_state.pop("stem_test_ok", False):
        st.success("De natuurlijke stem werkt. Tik op 🔊 hieronder om te luisteren.")
    nieuw = {"regio": regio, "geslacht": geslacht, "snelheid": snelheid, "voorlezen": voorlezen, "doorpraten": doorpraten,
             "natuurlijk": natuurlijk, "stem_id": stem_id}
    if nieuw != huidig:
        opslag.instellingen_bijwerken(stem=nieuw)
    spraak.knop(nieuw, "Hallo! Zo klink ik. Waar kan ik je mee helpen?", key="stem_test", alleen_voorlezen=True,
                gevoel="blij", geluid=st.session_state.get("stem_test_geluid"))
    st.caption("Tik op 🔊 om te luisteren. Zonder ElevenLabs klinkt het natuurlijker met een verbeterde stem op je "
               "iPad: Instellingen > Toegankelijkheid > Gesproken materiaal > Stemmen > Nederlands, bijvoorbeeld "
               "Claire of Xander (Nederland) of Ellen (Vlaanderen).")


def geheugen_instellingen() -> None:
    """Wat de assistent heeft onthouden; je kunt feiten toevoegen of laten vergeten."""
    feiten = opslag.geheugen()
    if not feiten:
        st.caption("Nog niets. De assistent onthoudt vanzelf je voorkeuren en gewoontes als je ermee praat.")
    for f in sorted(feiten, key=lambda f: (f["onderwerp"], f["id"])):
        kol1, kol2 = st.columns([6, 1], vertical_alignment="center")
        kol1.markdown(f"{f['feit']}  \n:gray[{f['onderwerp']}]")
        if kol2.button("✕", key=f"vergeet_{f['id']}", help="Vergeten"):
            opslag.vergeten(f["id"])
            st.rerun()
    with st.form("nieuw_feit", clear_on_submit=True, border=False):
        kol1, kol2 = st.columns([5, 1], vertical_alignment="bottom")
        feit = kol1.text_input("Iets dat de assistent moet weten", placeholder="Bijvoorbeeld: ik eet geen vlees")
        if kol2.form_submit_button("➕") and feit.strip():
            opslag.onthouden(feit.strip())
            st.rerun()
    if oordelen := opslag.feedback():
        goed = sum(f["goed"] for f in oordelen)
        st.markdown(f"**Wat je van de antwoorden vond** · {goed}× 👍 · {len(oordelen) - goed}× 👎")
        for f in [f for f in reversed(oordelen) if f.get("opmerking")][:10]:
            kol1, kol2 = st.columns([6, 1], vertical_alignment="center")
            kol1.caption(f"{'👍' if f['goed'] else '👎'} {f['opmerking']}  \n:gray[bij: {f['vraag'][:60]}]")
            if kol2.button("✕", key=f"fbweg_{f['id']}", help="Vergeten"):
                opslag.feedback_vergeten(f["id"])
                st.rerun()
    if gewoontes := tijd.gewoontes():
        st.markdown("**Geleerd uit je tijdregistratie**")
        for soort, g in gewoontes.items():
            st.caption(f"{tijd.SOORTEN.get(soort, '')} {soort.capitalize()}: {g['aantal']} keer, gemiddeld "
                       f"{g['gem_uitloop_min']} min uitloop en {g['gem_te_laat_min']} min te laat. "
                       "De assistent plant hier ruimte voor.")


# --- Mail -------------------------------------------------------------------

def mail_instellen() -> None:
    """Mailbox koppelen met een app-specifiek wachtwoord."""
    huidig = mail.instellingen()
    aanbieder = st.selectbox("Aanbieder", list(mail.AANBIEDERS), key="mail_aanbieder",
                             index=list(mail.AANBIEDERS).index(huidig.get("aanbieder", "iCloud")))
    info = mail.AANBIEDERS[aanbieder]
    st.caption(f"Je hebt een app-wachtwoord nodig, niet je gewone wachtwoord. {info['uitleg']}")
    if info["hulp"]:
        st.link_button("App-wachtwoord maken", info["hulp"])
    with st.form("mail_instellen", border=False):
        adres = st.text_input("Mailadres", value=huidig.get("adres", ""))
        naam = st.text_input("Je naam (zoals ontvangers die zien)", value=huidig.get("naam", ""))
        wachtwoord = st.text_input("App-wachtwoord", type="password",
                                   placeholder="Al opgeslagen" if huidig.get("wachtwoord") else "")
        imap = smtp = ""
        poort = info["smtp_poort"]
        if aanbieder == "Anders":
            imap = st.text_input("IMAP-server", value=huidig.get("imap", ""))
            smtp = st.text_input("SMTP-server", value=huidig.get("smtp", ""))
            poort = st.number_input("SMTP-poort", value=int(huidig.get("smtp_poort") or 587), step=1)
        if st.form_submit_button("Koppelen", type="primary"):
            nieuw = {"aanbieder": aanbieder, "adres": adres.strip(), "naam": naam.strip(),
                     "wachtwoord": "".join(wachtwoord.split()) or huidig.get("wachtwoord", ""),
                     "imap": imap.strip() or info["imap"], "smtp": smtp.strip() or info["smtp"], "smtp_poort": int(poort)}
            if not (nieuw["adres"] and nieuw["wachtwoord"] and nieuw["imap"]):
                st.error("Vul je mailadres en app-wachtwoord in.")
                return
            try:
                mail.testen(nieuw)
            except Exception:
                st.error("Inloggen lukt niet. Controleer je mailadres en of je een app-wachtwoord hebt gebruikt.")
                return
            opslag.instellingen_bijwerken(mail=nieuw)
            st.success("Je mail is gekoppeld.")
    if mail.gekoppeld():
        aan = opslag.instellingen().get("mail_nakijken", True)
        if st.toggle("Mail vanzelf nakijken op taken, afspraken en facturen", value=aan, key="mail_nakijken_aan",
                     help="Hooguit elke twee uur, zolang de app open is. Spam en reclame tellen niet mee. "
                          "Je krijgt een voorstel; er komt niets bij zonder dat jij het aanvinkt.") != aan:
            opslag.instellingen_bijwerken(mail_nakijken=not aan)
            st.rerun()
    st.caption("Outlook en Hotmail laten dit soort koppelingen niet meer toe. Stuur je Outlook-mail eventueel door "
               "naar een iCloud- of Gmail-adres.")


@st.cache_data(ttl=120, show_spinner="Mail ophalen...")
def _mails(_wachtwoord: str, sleutel: str, aantal: int) -> list[dict]:
    return mail.lijst(aantal)


@st.cache_data(ttl=600, show_spinner="Mail openen...")
def _mail(_wachtwoord: str, sleutel: str, uid: str) -> dict:
    return mail.lezen(uid)


def mail_concepten() -> None:
    """Antwoorden die de assistent heeft klaargezet: aanpassen, versturen of weggooien."""
    for c in opslag.mailconcepten():
        with st.container(border=True):
            st.caption(f"Klaar om te versturen · aan {c['aan']}")
            onderwerp = st.text_input("Onderwerp", value=c["onderwerp"], key=f"co_{c['id']}")
            tekst = st.text_area("Tekst", value=c["tekst"], key=f"ct_{c['id']}", height=200)
            k1, k2 = st.columns(2)
            if k1.button("Versturen", key=f"cv_{c['id']}", type="primary", width="stretch"):
                try:
                    mail.versturen(c["aan"], onderwerp, tekst, c["in_antwoord_op"], c["references"])
                except Exception:
                    st.error("Versturen lukte niet. Probeer het zo opnieuw.")
                else:
                    opslag.mailconcept_weg(c["id"])
                    st.toast("Verstuurd.", icon="📤")
                    st.rerun()
            if k2.button("Weggooien", key=f"cw_{c['id']}", width="stretch"):
                opslag.mailconcept_weg(c["id"])
                st.rerun()


def mail_tabblad() -> None:
    """Je inbox, en antwoorden die de assistent klaarzet. Versturen doe je zelf."""
    if not mail.gekoppeld():
        st.caption("Koppel je mailbox één keer. Daarna vat de assistent je mail samen, zet afspraken in je agenda "
                   "en schrijft antwoorden die jij alleen nog hoeft te versturen.")
        mail_instellen()
        return
    mail_concepten()
    namens_overzicht()
    wachtwoord = st.session_state.get("wachtwoord", "")
    sleutel = mail.instellingen()["adres"]
    kol1, kol2 = st.columns([3, 1], vertical_alignment="center")
    if kol1.button("Wat vraagt actie?", width="stretch"):
        vraag_assistent("Welke mails vragen actie? Vat ze kort samen en stel voor wat ik ermee doe.")
    if opslag.namens("mail") != "vragen" and st.button(f"Laat {avatar.aanspreken(mijn_avatar())} je inbox afhandelen",
                                                      width="stretch"):
        vraag_assistent("Loop mijn ongelezen mails na. Beantwoord namens mij wat je volgens mijn instelling mag "
                        "beantwoorden, zet de rest klaar als concept, zet afspraken en taken in mijn agenda en vertel "
                        "kort wat je hebt gedaan en wat ik zelf moet beslissen.", label="Inbox afhandelen")
    if st.button("Taken en afspraken uit mijn mail", width="stretch", icon=":material/checklist:",
                 help="De assistent stelt taken en afspraken voor; jij kiest wat erbij komt. Dit gebeurt ook "
                      "vanzelf, elke paar uur."):
        mail_nakijken()
        st.session_state.agenda_deel = "Taken"
        ga_naar("agenda")
    if kol2.button("↻", width="stretch", help="Vernieuwen"):
        _mails.clear()
    try:
        mails = _mails(wachtwoord, sleutel, 20)
    except Exception:
        st.caption("Je mailbox is nu niet bereikbaar. Probeer het zo opnieuw.")
        return
    if not mails:
        st.caption("Je inbox is leeg.")
    open_uid = st.session_state.get("mail_open")
    for m in mails:
        stip = "" if m["gelezen"] else "● "
        if st.button(f"{stip}{m['van']} · {m['onderwerp']} · {m['datum'][5:]}", key=f"mail_{m['uid']}",
                     type="tertiary"):
            st.session_state.mail_open = None if open_uid == m["uid"] else m["uid"]
            st.rerun()
        if open_uid == m["uid"]:
            mail_openen(wachtwoord, sleutel, m["uid"])


def namens_overzicht() -> None:
    """Wat de assistent de afgelopen tijd namens je heeft verstuurd."""
    if not (log := opslag.namens_log()):
        return
    with st.expander(f"Namens jou verstuurd ({len(log)})"):
        for r in reversed(log[-30:]):
            st.markdown(f"**{r['moment'][8:10]}-{r['moment'][5:7]} {r['moment'][11:16]}** · "
                        f"{'✉️' if r['kanaal'] == 'mail' else '🏪'} aan {r['aan']} · {r['onderwerp']}")
            st.caption(r["tekst"][:600])


def namens_instellingen() -> None:
    """Hoe zelfstandig de assistent namens je mag reageren."""
    naam = avatar.aanspreken(mijn_avatar())
    st.caption(f"Standaard zet {naam} antwoorden klaar en verstuur jij ze. Je kunt het reageren ook aan {naam} "
               "overdragen. Over geld, betalingen, contracten, opzeggingen, wachtwoorden en codes vraagt "
               f"{naam} altijd eerst. Alles wat namens jou weggaat, zie je bij Mail. "
               f"Maximaal {opslag.NAMENS_PER_DAG} per dag. Dit gebeurt als de app open staat of als je het vraagt.")
    keuzes = {"mail": ("Mail", list(opslag.NAMENS)), "berichten": ("Berichten op de marktplaats", ["vragen", "zelf"])}
    for kanaal, (titel, opties) in keuzes.items():
        nu = opslag.namens(kanaal) if opslag.namens(kanaal) in opties else "vragen"
        keuze = st.radio(titel, opties, index=opties.index(nu), format_func=opslag.NAMENS.get, key=f"namens_{kanaal}")
        if keuze != nu:
            opslag.namens_instellen(kanaal, keuze)
            st.toast("Opgeslagen.", icon="✅")


def kleuren_instellingen() -> None:
    """Een eigen kleur per soort in de agenda."""
    eigen = dict(opslag.instellingen().get("kleuren", {}))
    kolommen = st.columns(2)
    for i, soort in enumerate(tijd.KLEUREN):
        label = "🔔 Taak met deadline" if soort == "taak" else f"{tijd.SOORTEN[soort]} {soort.capitalize()}"
        gekozen = kolommen[i % 2].color_picker(label, value=tijd.kleur(soort), key=f"kleur_{soort}")
        if gekozen != tijd.kleur(soort):
            eigen[soort] = gekozen
            opslag.instellingen_bijwerken(kleuren=eigen)
    if eigen and st.button("Standaardkleuren terug"):
        opslag.instellingen_bijwerken(kleuren={})
        for soort in tijd.KLEUREN:
            st.session_state.pop(f"kleur_{soort}", None)
        st.rerun()


def mail_openen(wachtwoord: str, sleutel: str, uid: str) -> None:
    try:
        m = _mail(wachtwoord, sleutel, uid)
    except Exception:
        st.caption("Deze mail kon niet worden geopend.")
        return
    with st.container(border=True):
        st.caption(f"Van {m['van']} <{m['van_adres']}> · {m['datum']}"
                   + (f" · :material/attach_file: {', '.join(m['bijlagen'])}" if m["bijlagen"] else ""))
        st.text(m["tekst"][:4000] + (" ..." if len(m["tekst"]) > 4000 else ""))
        wens = st.text_input("Wat wil je ongeveer antwoorden? (optioneel, of laat de assistent voorstellen)",
                             key=f"wens_{uid}")
        k1, k2 = st.columns(2)
        if k1.button("Antwoord klaarzetten", key=f"antw_{uid}", type="primary", width="stretch"):
            vraag_assistent(f"Lees mail {uid} en zet een antwoord klaar." + (f" Wat ik wil zeggen: {wens}" if wens else ""),
                            label=f"Antwoord op de mail van {m['van']}" + (f": {wens}" if wens else ""))
        if k2.button("Naar agenda of taken", key=f"agenda_{uid}", width="stretch"):
            vraag_assistent(f"Lees mail {uid}. Staan er afspraken, deadlines of taken in? Stel voor wat je in mijn "
                            "agenda of takenlijst zet.", label=f"Afspraken uit de mail van {m['van']}")


STIJL = {"toon": ["Automatisch", "Informeel", "Zakelijk"], "lengte": ["Automatisch", "Kort", "Uitgebreid"],
         "aanspreken": ["je", "u"]}


def stijl_instellingen() -> None:
    """Hoe de assistent praat. Automatisch: hij neemt jouw toon en lengte over."""
    huidig = {"toon": "Automatisch", "lengte": "Automatisch", "aanspreken": "je"} | opslag.instellingen().get("stijl", {})
    toon = st.segmented_control("Toon", STIJL["toon"], default=huidig["toon"], key="stijl_toon") or huidig["toon"]
    lengte = st.segmented_control("Antwoorden", STIJL["lengte"], default=huidig["lengte"], key="stijl_lengte") or huidig["lengte"]
    aanspreken = st.segmented_control("Aanspreken met", STIJL["aanspreken"], default=huidig["aanspreken"],
                                      key="stijl_aanspreken") or huidig["aanspreken"]
    nieuw = {"toon": toon, "lengte": lengte, "aanspreken": aanspreken}
    if nieuw != huidig:
        opslag.instellingen_bijwerken(stijl=nieuw)
    st.caption("Bij Automatisch past de assistent zich aan jou aan: aan je toon, hoe lang jouw berichten zijn en hoe "
               "je werkt. Wat hij leert, zie je bij Wat de assistent over je weet.")


def onderdelen_uit() -> list[str]:
    inst = opslag.instellingen()
    uit = inst.get("onderdelen_uit", inst.get("tabbladen_uit", []))
    # Oudere instellingen bewaarden de namen met een emoji ervoor ("🏪 Marktplaats").
    uit = [re.sub(r"^[^\w]+", "", o) for o in uit]
    return ["Leren" if o == "Leren en schrijven" else o for o in uit]


def voorpagina_instellingen() -> None:
    """Wat er op de voorpagina staat en wat er in het menu staat."""
    huidig = voorpagina()
    st.markdown("**Op de voorpagina**")
    nieuw = {k: st.toggle(label, value=huidig[k], key=f"vp_{k}") for k, label in VOORPAGINA.items()}
    if nieuw != huidig:
        opslag.instellingen_bijwerken(voorpagina=nieuw)
    uit = onderdelen_uit()
    st.markdown("**In het menu**")
    nieuw_uit = [o for o, label in ONDERDELEN.items() if not st.toggle(label, value=o not in uit, key=f"onderdeel_{o}")]
    if sorted(nieuw_uit) != sorted(uit):
        opslag.instellingen_bijwerken(onderdelen_uit=nieuw_uit)
        st.rerun()
    st.caption("Zet uit wat je niet gebruikt; de assistent kan het via het gesprek nog steeds voor je doen.")
    st.markdown("**Bij de assistent**")
    aan = opslag.instellingen().get("voorbeeldvragen", True)
    if st.toggle("Voorbeeldvragen tonen", value=aan, key="vp_voorbeeldvragen") != aan:
        opslag.instellingen_bijwerken(voorbeeldvragen=not aan)
        st.rerun()


# Wat een nieuwe gebruiker standaard aan heeft staan; de rest zet je zelf aan (bij het aanmelden of later).
STANDAARD_AAN = ["Mail", "Budget", "Boodschappen", "Documenten"]


@st.dialog("Welkom! Wat wil je gebruiken?")
def welkom_voorkeuren() -> None:
    """Na het aanmelden: kies wat je gebruikt, dan blijft de app rustig. Later aan te passen in Instellingen."""
    # Een dialoog draait apart van de rest van de app; zonder dit weet hij niet wie er is ingelogd.
    opslag.gebruik_account(st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))
    st.caption("Vandaag, Agenda, Taken en de assistent heb je altijd.")
    gekozen = st.pills("Onderdelen", list(ONDERDELEN), selection_mode="multi", default=STANDAARD_AAN,
                       label_visibility="collapsed", key="welkom_onderdelen")
    voorbeelden = st.toggle("Voorbeeldvragen bij de assistent", value=True, key="welkom_voorbeelden")
    if st.button("Klaar", type="primary", width="stretch"):
        opslag.instellingen_bijwerken(onderdelen_uit=[o for o in ONDERDELEN if o not in (gekozen or [])],
                                      voorbeeldvragen=voorbeelden)
        st.rerun()
    st.caption("Alles is later aan of uit te zetten bij Instellingen › Weergave.")


def avatar_instellingen() -> None:
    """Naam en uiterlijk van de assistent."""
    a = mijn_avatar()
    nieuw = dict(a)
    kol1, kol2 = st.columns([1, 3], vertical_alignment="center")
    kol1.image(avatar.plaatje(a), width=88)
    nieuw["naam"] = kol2.text_input("Naam van je assistent", value=a["naam"], max_chars=20).strip() or avatar.STANDAARD["naam"]
    st.caption("Kies een uiterlijk")
    stijlen = list(avatar.STIJLEN)
    for rij in (stijlen[:4], stijlen[4:]):
        for kolom, stijl in zip(st.columns(4), rij):
            kolom.image(avatar.plaatje(a | {"stijl": stijl, "foto": ""}, 96), width=56,
                        caption=avatar.STIJLEN[stijl])
    stijl = st.pills("Uiterlijk", stijlen, default=a["stijl"], format_func=avatar.STIJLEN.get, key="av_stijl",
                     label_visibility="collapsed") or a["stijl"]
    kleur = st.pills("Achtergrond", list(avatar.KLEUREN), default=a["kleur"], format_func=avatar.KLEUREN.get,
                     key="av_kleur") or a["kleur"]
    if (stijl, kleur) != (a["stijl"], a["kleur"]):
        nieuw |= {"stijl": stijl, "kleur": kleur, "foto": ""}
    kol1, kol2 = st.columns(2)
    if kol1.button("Ander gezicht", width="stretch"):
        nieuw |= {"code": avatar.nieuwe_code(), "foto": ""}
    if a["foto"] and kol2.button("Eigen foto weghalen", width="stretch"):
        nieuw["foto"] = ""
    foto = st.file_uploader("Of gebruik een eigen foto of tekening", type=["jpg", "jpeg", "png", "webp"])
    if foto and st.session_state.get("av_foto") != foto.file_id:
        try:
            nieuw["foto"] = avatar.foto_verkleinen(foto.getvalue())
            st.session_state.av_foto = foto.file_id
        except Exception:
            st.error("Deze foto kon niet worden gelezen. Probeer een JPG of PNG.")
    if nieuw != a:
        opslag.instellingen_bijwerken(avatar=nieuw)
        st.rerun()
    st.caption("De plaatjes komen van DiceBear; daarvoor gaat alleen een willekeurige code mee, niet je naam.")


def thuisadres_instellen() -> None:
    inst = opslag.instellingen()
    with st.form("thuisadres", border=False):
        kol1, kol2 = st.columns([4, 1], vertical_alignment="bottom")
        adres = kol1.text_input("Thuisadres", value=inst.get("thuisadres", ""), label_visibility="collapsed",
                                placeholder="Straat, huisnummer, plaats")
        if kol2.form_submit_button("Opslaan") and adres.strip():
            try:
                reizen.coordinaten(adres.strip())
            except reizen.AdresNietGevonden:
                st.error("Dit adres is niet gevonden. Controleer straat, huisnummer en plaats.")
            except Exception:
                opslag.instellingen_bijwerken(thuisadres=adres.strip())
                st.warning("Opgeslagen, maar het adres kon nu niet worden gecontroleerd.")
            else:
                opslag.instellingen_bijwerken(thuisadres=adres.strip())
                st.rerun()
    st.caption("Gebruikt voor reistijden, het weer en uitjes in de buurt.")


def contacten_beheren() -> None:
    for c in sorted(opslag.contacten_zoeken(), key=lambda c: c["naam"].lower()):
        regel = f"**{c['naam']}**"
        if c.get("telefoon"):
            regel += f" · [{c['telefoon']}](tel:{c['telefoon'].replace(' ', '')})"
        if c.get("email"):
            regel += f" · {c['email']}"
        if c.get("adres"):
            regel += f"  \n:material/location_on: {c['adres']}"
        st.markdown(regel)
    with st.form("nieuw_contact", clear_on_submit=True):
        st.caption("Nieuw contact")
        naam = st.text_input("Naam")
        kol1, kol2 = st.columns(2)
        telefoon = kol1.text_input("Telefoon")
        email = kol2.text_input("E-mail")
        adres_c = st.text_input("Adres")
        if st.form_submit_button("Opslaan") and naam.strip():
            opslag.contact_opslaan(naam.strip(), telefoon.strip(), email.strip(), adres_c.strip())
            st.rerun()


INSTELLING_GROEPEN = {
    "Assistent": (":material/smart_toy:", "Naam, stem en wat hij mag"),
    "Weergave": (":material/palette:", "Voorpagina, onderdelen, kleuren"),
    "Koppelingen": (":material/link:", "Agenda, mail, Siri, Woning, Strava"),
    "Account": (":material/person:", "Profiel, beveiliging, privacy"),
}


def instellingen_tabblad() -> None:
    """Rustig zoals bij Google: eerst tegels voor de onderdelen en de instellingen, pas na een keuze de details."""
    def kies(naam: str | None) -> None:
        st.session_state.inst_groep = naam

    groep = st.session_state.get("inst_groep")
    if groep in INSTELLING_GROEPEN:
        with st.container(horizontal=True, vertical_alignment="center"):
            st.button("Terug", icon=":material/arrow_back:", type="tertiary", on_click=kies, args=(None,))
            st.markdown(f"**{groep}**")
        {"Assistent": instellingen_assistent, "Weergave": instellingen_weergave,
         "Koppelingen": instellingen_koppelingen, "Account": instellingen_account}[groep]()
        return
    gebruiker = samen_scherm.ik()
    st.markdown(f'<div style="display:flex;gap:14px;align-items:center;margin-bottom:12px">'
                f'<img src="{avatar.adres(mijn_avatar())}" width="48" height="48" style="border-radius:50%">'
                f'<div><b>{html.escape(gebruiker.get("weergavenaam") or "Mijn instellingen")}</b><br>'
                f'<span style="opacity:.6">{html.escape(gebruiker.get("email") or "")}</span></div></div>',
                unsafe_allow_html=True)
    onderdelen_tegels()
    st.markdown("**Voorkeuren**")
    with st.container(horizontal=True, gap="small"):
        for i, (naam, (icoon, uitleg)) in enumerate(INSTELLING_GROEPEN.items()):
            with st.container(border=True, width=168):
                st.button(naam, key=f"inst_{i}", icon=icoon, on_click=kies, args=(naam,), type="tertiary")
                st.caption(uitleg)


def instellingen_assistent() -> None:
    with st.expander(f"Naam en uiterlijk ({mijn_avatar()['naam']})"):
        avatar_instellingen()
    with st.expander("Hoe de assistent praat"):
        stijl_instellingen()
    with st.expander("Stem"):
        stem_instellingen()
    with st.expander("Namens jou reageren" + ("" if {opslag.namens(k) for k in ("mail", "berichten")} == {"vragen"}
                                                 else " (aan)")):
        namens_instellingen()
    with st.expander(f"Wat de assistent over je weet ({len(opslag.geheugen())})"):
        geheugen_instellingen()
    with st.expander("Anthropic-sleutel (het brein van de assistent)"):
        if sleutel := sleutel_formulier("Nieuwe sleutel opslaan"):
            opslag.instellingen_bijwerken(anthropic_sleutel=sleutel)
            st.success("Opgeslagen.")


def instellingen_weergave() -> None:
    inst = opslag.instellingen()
    with st.expander("Voorpagina en menu"):
        voorpagina_instellingen()
    with st.expander("Thuisadres" + ("" if inst.get("thuisadres") else " (nog invullen)"),
                     expanded=not inst.get("thuisadres")):
        thuisadres_instellen()
    with st.expander("Kleuren in de agenda"):
        kleuren_instellingen()
    with st.expander(f"Contacten ({len(opslag.contacten_zoeken())})"):
        contacten_beheren()


def agendas_instellen() -> None:
    """Je eigen agenda's (Apple, Google, Outlook) koppelen, alleen om te lezen."""
    st.caption("Je afspraken uit je eigen agenda verschijnen in Vandaag en Agenda, en de assistent plant eromheen. "
               "De app leest alleen mee: wijzigen doe je in je eigen agenda.")
    gekoppeld = agendas.gekoppeld()
    if gekoppeld:
        fouten = agendas.fouten()
        for k in gekoppeld:
            with st.container(border=True):
                kop = f'<span style="color:{k["kleur"]}">●</span> **{html.escape(k["naam"])}**'
                if k["soort"] == "apple":
                    kop += f'  \n:gray[{html.escape(k["gebruiker"])}]'
                st.markdown(kop, unsafe_allow_html=True)
                if fout := fouten.get(k["id"]):
                    st.warning(fout)
                for naam in k.get("agendas", []):
                    aan = st.toggle(naam, value=naam not in k.get("uit", []), key=f"agz_{k['id']}_{naam}")
                    if aan != (naam not in k.get("uit", [])):
                        agendas.zichtbaar(k["id"], naam, aan)
                        st.rerun()
                if st.button("Ontkoppelen", key=f"agontkoppel_{k['id']}", icon=":material/link_off:"):
                    agendas.ontkoppelen(k["id"])
                    st.rerun()
        if st.button("Nu vernieuwen", icon=":material/refresh:", help="Normaal elke 5 minuten vanzelf."):
            agendas.vernieuwen()
            st.rerun()
        st.write("")

    keuze = st.segmented_control("Agenda toevoegen", ["Apple", "Google", "Outlook", "Andere"], key="agenda_soort")
    if keuze == "Apple":
        st.markdown("1. Maak bij Apple een **app-specifiek wachtwoord** aan: log in, kies *Inloggen en beveiliging* "
                    "› *App-specifieke wachtwoorden* en noem het Assistent.")
        st.link_button("Open je Apple-account", "https://account.apple.com", icon=":material/open_in_new:")
        st.markdown("2. Vul hieronder je Apple ID en dat wachtwoord in.")
        m = mail.instellingen()
        icloud_mail = m.get("imap") == mail.AANBIEDERS["iCloud"]["imap"] and m.get("wachtwoord")
        with st.form("agenda_apple", border=False):
            gebruiker = st.text_input("Apple ID (e-mailadres)", value=m.get("adres", "") if icloud_mail else "")
            wachtwoord = st.text_input("App-specifiek wachtwoord", type="password", placeholder="xxxx-xxxx-xxxx-xxxx")
            if icloud_mail:
                st.caption("Leeg laten: dan gebruikt de app hetzelfde wachtwoord als voor je iCloud-mail.")
            if st.form_submit_button("Koppelen", type="primary"):
                with st.spinner("Verbinden met iCloud..."):
                    try:
                        k = agendas.koppel_apple(gebruiker, wachtwoord or (m["wachtwoord"] if icloud_mail else ""))
                    except agendas.Fout as fout:
                        st.error(str(fout))
                    else:
                        st.session_state.pop("agenda_soort", None)
                        st.toast(f"Gekoppeld: {len(k['agendas'])} agenda's gevonden.", icon="✅")
                        st.rerun()
        return
    if keuze in ("Google", "Outlook", "Andere"):
        if keuze == "Google":
            st.markdown("1. Open Google Agenda in Safari (op iPad of iPhone: kies *Desktopwebsite*).\n"
                        "2. Ga naar *Instellingen* › klik links op je agenda › *Agenda integreren*.\n"
                        "3. Kopieer het **Geheim adres in iCal-indeling** en plak het hieronder.")
            st.link_button("Open Google Agenda", "https://calendar.google.com/calendar/r/settings",
                           icon=":material/open_in_new:")
        elif keuze == "Outlook":
            st.markdown("1. Open Outlook op het web.\n"
                        "2. Ga naar *Instellingen* › *Agenda* › *Gedeelde agenda's* › *Een agenda publiceren*.\n"
                        "3. Kies je agenda en *Kan alle details bekijken*, tik op *Publiceren* en kopieer de "
                        "**ICS-link**.")
            st.link_button("Open Outlook", "https://outlook.live.com/calendar/0/options/calendar/SharedCalendars",
                           icon=":material/open_in_new:")
        else:
            st.markdown("Plak de agendalink (iCal of ICS, begint met https:// of webcal://), bijvoorbeeld een "
                        "rooster van school, werk of je sportclub.")
        st.caption("Deze link is geheim: deel hem met niemand anders.")
        with st.form("agenda_link", border=False):
            naam = st.text_input("Naam", value={"Google": "Google-agenda", "Outlook": "Outlook-agenda"}.get(keuze, ""),
                                 placeholder="Bijvoorbeeld Rooster")
            url = st.text_input("Agendalink", placeholder="https://...")
            if st.form_submit_button("Koppelen", type="primary"):
                with st.spinner("Agenda ophalen..."):
                    try:
                        agendas.koppel_link(naam, url)
                    except agendas.Fout as fout:
                        st.error(str(fout))
                    else:
                        st.session_state.pop("agenda_soort", None)
                        st.toast("Agenda gekoppeld.", icon="✅")
                        st.rerun()


def instellingen_koppelingen() -> None:
    aantal = len(agendas.gekoppeld())
    with st.expander("Agenda's (Apple, Google, Outlook)" + (f" ({aantal} gekoppeld)" if aantal else ""),
                     expanded=not aantal and not mail.gekoppeld()):
        agendas_instellen()
    with st.expander("Mail" + (" (gekoppeld)" if mail.gekoppeld() else "")):
        mail_instellen()
    if "Budget" not in onderdelen_uit() and samen.beschikbaar():
        with st.expander("Bank"):
            geld_scherm.bank_instellen("instellingen")
    with st.expander("Siri en Apple Woning" + (" (ingesteld)" if woning.scenes() else "")):
        siri_en_woning()
    strava_instellingen()
    with st.expander("Events (Ticketmaster)" + (" (gekoppeld)" if events.sleutel() else "")):
        events_instellen()
    with st.expander("Zelftest"):
        if st.button("Start zelftest"):
            zelftest()


def instellingen_account() -> None:
    samen_scherm.account_instellingen()
    if st.button("Uitloggen"):
        opslag.uitloggen()
        opslag.apparaat_vergeten(st.session_state.get("apparaat_token", ""))
        st.session_state.clear()
        st.session_state.apparaat_wis = True
        st.session_state.apparaat_geprobeerd = True
        st.rerun()


def dagplanning_vandaag(datum: str) -> dict:
    # De cache vernieuwt zodra de afspraken of het thuisadres veranderen.
    sleutel = json.dumps([opslag.afspraken_tussen(datum, datum), opslag.instellingen().get("thuisadres", ""),
                          opslag.contacten_zoeken()], sort_keys=True)
    return _dagplanning_met_sleutel(datum, sleutel)


@st.cache_data(ttl=600, show_spinner="Reistijden berekenen...")
def _dagplanning_met_sleutel(datum: str, sleutel: str) -> dict:
    return planning.dagplanning(datum)


def zelftest() -> None:
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
    if not anthropic_sleutel():
        st.write("➖ Claude: nog geen sleutel ingesteld")
        return
    client = anthropic.Anthropic(api_key=anthropic_sleutel())
    with st.spinner("Claude controleren..."):
        try:
            tekst = agent.antwoord(client, [{"role": "user", "content": "Zelftest: gebruik geen hulpmiddelen en antwoord alleen met OK."}])
            st.write(f"✅ Claude antwoordt: {spraak.zonder_labels(tekst)[:100]}")
        except anthropic.APIError as fout:
            st.write(f"❌ Claude: {foutmelding(fout)}")


foutmelding = slim.foutmelding


# --- Boodschappen ---------------------------------------------------------

@st.cache_data(ttl=6 * 60 * 60, show_spinner="Prijzen vergelijken...")
def _vergelijken(lijst: tuple[str, ...]) -> list[dict]:
    return boodschappen.vergelijken(list(lijst))


def euro(bedrag: float) -> str:
    return f"€ {bedrag:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def boodschappen_tabblad() -> None:
    """Boodschappenlijst om af te vinken, met de goedkoopste supermarkt in de buurt."""
    with st.form("nieuwe_boodschap", clear_on_submit=True, border=False):
        kol1, kol2 = st.columns([5, 1], vertical_alignment="bottom")
        invoer = kol1.text_input("Toevoegen", placeholder="Bijv. 1 liter halfvolle melk, 6 eieren (komma's mag)",
                                 label_visibility="collapsed")
        if kol2.form_submit_button("➕") and invoer.strip():
            opslag.boodschap_toevoegen([d for d in re.split(r",|\n", invoer) if d.strip()])
            st.rerun()

    lijst = opslag.boodschappen()
    if not lijst:
        st.caption("Je lijst is leeg. Typ hierboven wat je nodig hebt, of vraag de assistent: "
                   "\"Zet de ingrediënten voor lasagne voor 4 personen op mijn lijst\".")
        if st.button("Laat de assistent een weekmenu met boodschappenlijst maken"):
            vraag_assistent("Maak een eenvoudig weekmenu voor 5 avonden en zet alle ingrediënten op mijn boodschappenlijst.")
        return

    for b in sorted(lijst, key=lambda b: b["gekocht"]):
        kol1, kol2 = st.columns([8, 1], vertical_alignment="center")
        gekocht = kol1.checkbox(f"~~{b['tekst']}~~" if b["gekocht"] else b["tekst"], value=b["gekocht"], key=f"bs_{b['id']}")
        if gekocht != b["gekocht"]:
            opslag.boodschap_bijwerken(b["id"], gekocht=gekocht)
            st.rerun()
        if kol2.button("✕", key=f"bs_weg_{b['id']}", help="Van de lijst halen"):
            opslag.boodschap_bijwerken(b["id"], gekocht=True)
            opslag.boodschappen_opruimen()
            st.rerun()
    if any(b["gekocht"] for b in lijst) and st.button("Afgevinkte weghalen"):
        opslag.boodschappen_opruimen()
        st.rerun()

    nog_nodig = tuple(b["tekst"] for b in lijst if not b["gekocht"])
    if not nog_nodig:
        return
    st.divider()
    st.markdown("**Waar is het het goedkoopst?**")
    try:
        winkels = _vergelijken(nog_nodig)
    except Exception:
        st.caption("De prijzen konden niet worden geladen. Probeer het later opnieuw.")
        return
    try:
        buurt = boodschappen.winkels_in_de_buurt()
    except Exception:
        buurt = {}
    max_km = st.select_slider("Hoe ver wil je gaan?", options=[1, 2, 3, 5], value=3, format_func=lambda k: f"{k} km",
                              key="max_km") if buurt else None
    dichtbij = [w for w in winkels if w["code"] in buurt and buurt[w["code"]]["afstand_km"] <= max_km] if buurt else []
    if dichtbij:
        beste = dichtbij[0]
        duurste = max(w["totaal"] for w in dichtbij)
        vestiging = buurt[beste["code"]]
        st.success(f"**{beste['naam']}** is het goedkoopst in de buurt: **{euro(beste['totaal'])}**"
                   + (f", {euro(duurste - beste['totaal'])} minder dan de duurste" if duurste > beste["totaal"] else "") + ".  \n"
                   f"{vestiging['naam']}, {vestiging['adres'] or 'adres onbekend'} ({vestiging['afstand_km']} km)"
                   + (f"  \n:material/schedule: {vestiging['openingstijden']}" if vestiging["openingstijden"] else ""))
        route = urlencode({"daddr": f"{vestiging['lat']},{vestiging['lon']}", "q": vestiging["naam"]})
        st.link_button("Route", f"https://maps.apple.com/?{route}")
    elif buurt:
        st.caption(f"Geen bekende supermarkt binnen {max_km} km.")
    else:
        st.caption("Vul je thuisadres in bij Instellingen om de dichtstbijzijnde winkels te zien.")

    for w in winkels:
        afstand = f" · {buurt[w['code']]['afstand_km']} km" if w["code"] in buurt else ""
        compleet = "" if w["gevonden"] == len(nog_nodig) else f" · {w['gevonden']} van {len(nog_nodig)} gevonden"
        with st.expander(f"{w['naam']} · {euro(w['totaal'])}{afstand}{compleet}"):
            for r in w["regels"]:
                if r["product"]:
                    naam = f"[{r['product']['naam']}]({r['product']['link']})" if r["product"]["link"] else r["product"]["naam"]
                    st.markdown(f"{r['zoekterm']}: {naam} {r['product']['hoeveelheid']} · **{euro(r['product']['prijs'])}**")
                else:
                    st.markdown(f"{r['zoekterm']}: _niet gevonden, geschat {euro(r['schatting'])}_")
    st.caption("Prijzen van de webwinkels via Checkjebon.nl; aanbiedingen in de winkel kunnen afwijken. "
               "Klopt een product niet? Maak het specifieker, bijvoorbeeld \"ongezouten roomboter\" in plaats van \"boter\".")


# --- Assistent ------------------------------------------------------------

BEZIG = {
    "marktplaats_zoeken": "Marktplaatsen doorzoeken...", "boeken": "Boeken...", "delen_met": "Delen...",
    "web_search": "Zoeken op internet...", "web_fetch": "Pagina lezen...", "plaats_zoeken": "Plekken zoeken...",
    "dagplanning": "Reistijden berekenen...", "reistijd_berekenen": "Reistijd berekenen...",
    "prijzen_vergelijken": "Prijzen vergelijken...", "weer_bekijken": "Weer opzoeken...",
    "afspraak_toevoegen": "In je agenda zetten...", "events_zoeken": "Events zoeken...",
    "uitjes_zoeken": "Uitjes zoeken...", "boodschappen_toevoegen": "Op je lijst zetten...",
    "document_maken": "Document maken...", "document_lezen": "Document lezen...",
    "document_aanvullen": "Document aanvullen...", "documenten_zoeken": "Documenten zoeken...",
    "mails_bekijken": "Mails bekijken...", "mail_lezen": "Mail lezen...",
    "mail_concept_maken": "Antwoord klaarzetten...", "mail_versturen": "Versturen...",
    "bronnen_zoeken": "Wetenschappelijke bronnen zoeken...", "bron_controleren": "Bron controleren...",
    "bron_opslaan": "Bron opslaan...", "oefening_vastleggen": "Score vastleggen...",
}
# Korte knop -> de vraag die de assistent krijgt.
SUGGESTIES = {"Mijn dag": "Wat staat er vandaag op de planning?", "Mail": "Welke mails vragen actie?",
              "Weekmenu": "Stel een gezond weekmenu samen en zet de boodschappen op mijn lijst",
              "Weekend": "Wat is er dit weekend te doen bij mij in de buurt?"}


def vraag_assistent(vraag: str, label: str | None = None) -> None:
    """Stelt een vraag namens een knop en gaat naar het gesprek met de assistent.

    Met `label` ziet de gebruiker een korte tekst in de chat in plaats van de hele vraag.
    """
    st.session_state.vooraf_vraag = vraag
    st.session_state.vooraf_label = label
    ga_naar("assistent")


def gesprek() -> None:
    """Het gesprek met de assistent; antwoorden verschijnen woord voor woord."""
    st.session_state.setdefault("chat", [])
    # Twee lijsten: wat de gebruiker ziet, en de volledige geschiedenis voor Claude.
    st.session_state.setdefault("berichten", [])
    stemkeuze = stem()
    laatste = next((t for r, t in reversed(st.session_state.chat) if r == "assistant"), "")
    voorlezen = st.session_state.get("voorlezen_id", "")
    if melding := st.session_state.pop("stem_melding", None):
        st.caption(f"{melding}")
    if not st.session_state.chat:
        st.html('<p style="text-align:center;font-size:1.4rem;margin:12vh 0 1rem">Waarmee kan ik helpen?</p>')
        if opslag.instellingen().get("voorbeeldvragen", True):
            with st.container(horizontal=True, horizontal_alignment="center", gap="small"):
                for i, (kort_, vraag_) in enumerate(SUGGESTIES.items()):
                    if st.button(kort_, key=f"suggestie_{i}"):
                        st.session_state.vooraf_vraag = vraag_
    gezicht = avatar.plaatje(mijn_avatar())
    for rol, tekst in st.session_state.chat:
        st.chat_message(rol, avatar=gezicht if rol == "assistant" else None).markdown(tekst)
    if st.session_state.chat and st.session_state.chat[-1][0] == "assistant":
        spraak.knop(stemkeuze, laatste, voorlezen, automatisch=bool(voorlezen),
                    gevoel=st.session_state.get("laatste_gevoel", "neutraal"),
                    geluid=st.session_state.get("voorlezen_geluid"))
        woning.knoppen(st.session_state.get("woning_onder", []), "gesprek")
        feedback_vragen_antwoord()

    vraag = st.session_state.pop("vooraf_vraag", None)
    if not vraag:
        if st.session_state.chat and st.button("Nieuw gesprek"):
            st.session_state.chat = []
            st.session_state.berichten = []
            st.rerun()
        return
    ingesproken = st.session_state.pop("ingesproken", False)
    st.session_state.woning_onder = []
    zichtbaar = st.session_state.pop("vooraf_label", None) or vraag
    st.chat_message("user").markdown(zichtbaar)
    st.session_state.chat.append(("user", zichtbaar))
    sleutel = anthropic_sleutel()
    with st.chat_message("assistant", avatar=gezicht):
        if not sleutel:
            tekst = "Er is nog geen Anthropic-sleutel ingesteld. Dat doe je bij Instellingen."
        else:
            status, vak, delen = st.empty(), st.empty(), []
            status.caption("Even denken...")

            def bij_tekst(stukje: str) -> None:
                status.empty()
                delen.append(stukje)
                vak.markdown(spraak.zonder_labels("".join(delen)) + " ▌")

            def bij_hulpmiddel(naam: str) -> None:
                if delen:
                    delen.append("\n\n")
                status.caption(BEZIG.get(naam, "Even bezig..."))

            lengte_voor = len(st.session_state.berichten)
            st.session_state.berichten.append({"role": "user", "content": vraag})
            try:
                tekst = agent.antwoord(anthropic.Anthropic(api_key=sleutel), st.session_state.berichten,
                                       bij_tekst, bij_hulpmiddel, spraak=ingesproken)
            except anthropic.APIError as fout:
                # Gesprek terugzetten zodat een half afgemaakte beurt niet blijft hangen.
                del st.session_state.berichten[lengte_voor:]
                tekst = foutmelding(fout)
            status.empty()
            vak.empty()
            st.session_state.woning_onder = agent.woning_knoppen_ophalen()
        ruw = tekst
        gevoel = spraak.gevoel_van("".join(delen) or ruw) if sleutel else "neutraal"
        tekst = spraak.zonder_labels(tekst) or "Klaar."
        st.markdown(tekst)
    st.session_state.chat.append(("assistant", tekst))
    st.session_state.laatste_vraag = zichtbaar
    st.session_state.laatste_gevoel = gevoel
    st.session_state.voorlezen_geluid = None
    # Voorlezen gebeurt na de rerun door de spraakknop, één keer per antwoord.
    if ingesproken or stemkeuze["voorlezen"]:
        st.session_state.voorlezen_id = f"antwoord-{len(st.session_state.chat)}"
        if sleutel and stemkeuze.get("natuurlijk") and (stem_sleutel := opslag.instellingen().get("elevenlabs_sleutel")):
            with st.spinner("Stem maken..."):
                try:
                    st.session_state.voorlezen_geluid = spraak.natuurlijk_voorlezen(ruw, gevoel, stemkeuze, stem_sleutel)
                except spraak.StemFout as fout:
                    st.session_state.stem_melding = str(fout)
                except Exception:
                    st.session_state.stem_melding = "De natuurlijke stem is even niet bereikbaar; ik gebruik de stem van je apparaat."
    st.rerun()


def feedback_vragen_antwoord() -> None:
    """👍/👎 onder het laatste antwoord. De assistent leert hiervan (zie agent.context)."""
    nummer = len(st.session_state.chat)
    sleutel = f"oordeel_{nummer}"

    def bewaren() -> None:
        # Een callback draait vóór de rest van het script: eerst het account van deze sessie instellen.
        opslag.gebruik_account(st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))
        oordeel = st.session_state.get(sleutel)
        if oordeel is not None:
            opslag.feedback_geven(bool(oordeel), st.session_state.get("laatste_vraag", ""),
                                  st.session_state.chat[-1][1], antwoord_id=f"antwoord-{nummer}")

    oordeel = st.feedback("thumbs", key=sleutel, on_change=bewaren)
    if oordeel == 0 and not st.session_state.get(f"opmerking_klaar_{nummer}"):
        with st.form(f"opmerking_{nummer}", border=False):
            opmerking = st.text_input("Wat kan beter? Dan onthoud ik het.", placeholder="Bijv. korter, minder vragen, "
                                      "geen emoji, eerst de prijs")
            if st.form_submit_button("Doorgeven") and opmerking.strip():
                opslag.feedback_geven(False, st.session_state.get("laatste_vraag", ""), st.session_state.chat[-1][1],
                                      opmerking.strip(), antwoord_id=f"antwoord-{nummer}")
                st.session_state[f"opmerking_klaar_{nummer}"] = True
                st.toast("Dank je, dat onthoud ik.", icon="🧠")
                st.rerun()


def terug_van_stripe() -> None:
    """Na betalen of aanmelden bij Stripe komt de gebruiker terug met ?betaald=... of ?stripe=..."""
    for sleutel in ("betaald", "stripe"):
        if sleutel in st.query_params:
            st.session_state[f"terug_{sleutel}"] = st.query_params[sleutel]
            del st.query_params[sleutel]
    # Terug van de bank (Enable Banking): ?code=...&state=... (of ?error=... als je annuleerde).
    if "state" in st.query_params and ("code" in st.query_params or "error" in st.query_params):
        st.session_state.terug_bank = (st.query_params.get("code", ""), st.query_params["state"])
        for sleutel in ("code", "state", "error", "error_description"):
            st.query_params.pop(sleutel, None)
    if not st.session_state.get("wachtwoord"):
        return
    if terug_bank := st.session_state.pop("terug_bank", None):
        st.session_state.ga_naar = "budget"
        if not terug_bank[0]:
            st.toast("Koppelen met je bank afgebroken.", icon=":material/info:")
        else:
            try:
                with st.spinner("Je bank koppelen..."):
                    k = bank.afmaken(*terug_bank)
            except bank.Fout as fout:
                st.toast(str(fout), icon=":material/error:")
            else:
                st.toast(f"{k['bank']} gekoppeld: {k['opgehaald']['nieuw']} regels opgehaald.", icon=":material/check:")
    betaald = st.session_state.pop("terug_betaald", None)
    stripe_terug = st.session_state.pop("terug_stripe", None)
    if betaald or stripe_terug:
        st.session_state.ga_naar = "bestellingen" if betaald else "verkopen"
    if betaald and betaald != "0":
        st.toast("Betaling gelukt. Het geld staat veilig tot je bevestigt dat alles goed is ontvangen.", icon="💳")
    elif betaald == "0":
        st.toast("Betaling afgebroken. Je kunt het opnieuw proberen.", icon="ℹ️")
    if stripe_terug == "klaar":
        try:
            klaar = samen.verkoper_status()
        except samen.Fout:
            klaar = False
        st.toast("Je kunt nu betalingen via de app ontvangen." if klaar
                 else "Stripe is nog bezig met je aanmelding.", icon="✅" if klaar else "ℹ️")


def kooplijst() -> None:
    werk_scherm.lijstje("kooplijst")


def wenslijst() -> None:
    werk_scherm.lijstje("wenslijst")


# Hoe de onderdelen in Instellingen gegroepeerd staan; gevuld door paginas().
GROEPEN: dict[str, list[str]] = {}


def paginas() -> list:
    """Alle pagina's. Bovenaan staan er maar vier (zie kopbalk); de rest staat als tegels in Instellingen."""
    PAGINA.clear()
    GROEPEN.clear()
    uit = onderdelen_uit()
    online = samen.beschikbaar()
    nieuw = samen_scherm.nieuw_kort() if online else {}

    def pagina(functie, titel: str, icoon: str, url: str, aantal: int = 0, **extra) -> st.Page:
        PAGINA[url] = st.Page(functie, title=titel + (f" ({aantal})" if aantal else ""), icon=icoon, url_path=url,
                              **extra)
        return PAGINA[url]

    def groep(naam: str, *items) -> None:
        if urls := [i for i in items if i]:
            GROEPEN[naam] = urls

    pagina(vandaag_overzicht, "Vandaag", ":material/today:", "vandaag", default=True)
    pagina(agenda_tabblad, "Agenda", ":material/calendar_month:", "agenda")
    pagina(gesprek, mijn_avatar()["naam"], ":material/chat_bubble:", "assistent")
    pagina(instellingen_tabblad, "Instellingen", ":material/settings:", "instellingen")

    def als(aan: bool, *args, **kwargs) -> str | None:
        return pagina(*args, **kwargs).url_path if aan else None

    groep("Kopen en verkopen",
          als(online and "Marktplaats" not in uit, samen_scherm.markt_zoeken, "Marktplaats", ":material/search:", "zoeken"),
          als(online and "Marktplaats" not in uit, samen_scherm.winkelstraat, "Winkels", ":material/storefront:", "winkels"),
          als(online and "Marktplaats" not in uit, samen_scherm.aanbieden, "Verkopen", ":material/sell:", "verkopen"),
          als(online and "Marktplaats" not in uit, samen_scherm.markt_bestellingen, "Bestellingen", ":material/receipt_long:",
              "bestellingen", nieuw.get("bestellingen", 0)),
          als(online and "Marktplaats" not in uit, samen_scherm.berichten, "Berichten", ":material/forum:", "berichten",
              nieuw.get("berichten", 0)),
          als(online and "Marktplaats" not in uit and ik().get("niveau") in ("verkoper", "ondernemer"),
              samen_scherm.mijn_webshop, "Mijn webshop", ":material/inventory_2:", "webshop"),
          als(online and "Marktplaats" not in uit and ik().get("niveau") in ("verkoper", "ondernemer"),
              samen_scherm.verkoopoverzicht, "Verkoopoverzicht", ":material/bar_chart:", "verkoopoverzicht"))
    groep("Leren en werk",
          als(online and "Documenten" not in uit, documenten_scherm.pagina, "Documenten", ":material/description:",
              "documenten"),
          als("Leren" not in uit, leren_tabblad, "Leren", ":material/school:", "leren"),
          als("Mail" not in uit, mail_tabblad, "Mail", ":material/mail:", "mail"),
          als(online and "Samen" not in uit, samen_scherm.samen_tabblad, "Samen", ":material/group:", "samen",
              nieuw.get("gedeeld", 0)),
          als(online and "VR-ruimtes" not in uit, ruimte_scherm.pagina, "VR-ruimtes", ":material/view_in_ar:", "ruimtes"))
    groep("Geld",
          als(online and "Budget" not in uit, geld_scherm.budget_pagina, "Budget", ":material/account_balance_wallet:",
              "budget"),
          als("Beleggen" not in uit, geld_scherm.beleggen_pagina, "Beleggen", ":material/trending_up:", "beleggen"))
    groep("Thuis en handig",
          als("Boodschappen" not in uit, boodschappen_tabblad, "Boodschappen", ":material/shopping_cart:", "boodschappen"),
          als("Lijstjes" not in uit, kooplijst, "Kooplijst", ":material/shopping_bag:", "kooplijst"),
          als("Lijstjes" not in uit, wenslijst, "Wenslijst", ":material/favorite:", "wenslijst"),
          als("DIY" not in uit, werk_scherm.diy, "DIY en hobby", ":material/handyman:", "diy"),
          als("Hulpmiddelen" not in uit, werk_scherm.hulpmiddelen, "Hulpmiddelen", ":material/build:", "hulpmiddelen"),
          als("Scannen" not in uit, werk_scherm.scannen, "Foto scannen", ":material/photo_camera:", "scannen"))
    st.session_state._nieuw_totaal = sum(nieuw.get(k, 0) for k in ("bestellingen", "berichten", "gedeeld"))
    return list(PAGINA.values())


def kopbalk() -> None:
    """Vier vaste plekken bovenaan; alle andere onderdelen staan als tegels in Instellingen."""
    totaal = st.session_state.get("_nieuw_totaal", 0)
    # Iets compacter, zodat de vier knoppen ook op een telefoon op één regel passen.
    st.html("<style>.st-key-kopbalk{gap:2px}.st-key-kopbalk a{padding-left:6px;padding-right:6px}</style>")
    with st.container(horizontal=True, gap="small", key="kopbalk"):
        for url, label in (("vandaag", "Vandaag"), ("agenda", "Agenda"), ("assistent", mijn_avatar()["naam"]),
                           ("instellingen", f"Instellingen ({totaal})" if totaal else "Instellingen")):
            st.page_link(PAGINA[url], label=label, width="content")


def onderdelen_tegels() -> None:
    """Alle onderdelen als tegels, per groep (zoals het appmenu van Google)."""
    for naam, urls in GROEPEN.items():
        st.markdown(f"**{naam}**")
        # Tegels die meeschuiven: twee naast elkaar op een telefoon, meer op een iPad.
        with st.container(horizontal=True, gap="small"):
            for url in urls:
                with st.container(border=True, width=168):
                    st.page_link(PAGINA[url], width="stretch")


def ruimte_bezoek(ruimte_id: int) -> None:
    """Een openbare VR-ruimte via ?ruimte=nummer, ook zonder account."""
    ruimte_scherm.bekijken(ruimte_id, ingelogd=False)
    st.divider()
    st.markdown("**Zelf een ruimte maken? Log in of maak gratis een account**")
    wachtwoord_ok()


def webshop_bezoek(adres: str) -> None:
    """Een winkel via ?winkel=adres. Bekijken mag iedereen; om te bestellen log je in of maak je een account."""
    samen_scherm.winkel_pagina(adres, False)
    st.divider()
    st.markdown("**Inloggen of gratis een account maken om te bestellen**")
    wachtwoord_ok()


def main() -> None:
    if not opslag.online():
        st.caption("Lokale testmodus: gegevens staan in data/gegevens.json.")
    # Siri (app Opdrachten) opent de app met ?zeg=wat je zei. Dat bewaren we tot je ingelogd bent.
    if zin := st.query_params.get("zeg", "").strip():
        st.session_state.siri_zeg = zin[:500]
        del st.query_params["zeg"]
    if "ochtend" in st.query_params:
        st.session_state.ochtend_gevraagd = True
        st.session_state.pop("ochtend_weg", None)
        del st.query_params["ochtend"]
    if (nummer := st.query_params.get("ruimte", "")).isdigit() and opslag.online():
        if not st.session_state.get("wachtwoord"):
            ruimte_bezoek(int(nummer))
            return
        del st.query_params["ruimte"]
        st.session_state.open_ruimte = int(nummer)
        st.session_state.ga_naar = "ruimtes"
    if (adres := st.query_params.get("winkel")) and opslag.online():
        if not st.session_state.get("wachtwoord"):
            webshop_bezoek(adres)
            return
        # Ingelogd: de winkel opent gewoon in de app, bij 🏬 Winkels.
        del st.query_params["winkel"]
        st.session_state.open_winkel = adres
        st.session_state.ga_naar = "winkels"
    if (code := st.query_params.get("bezoek")) and opslag.online():
        if not st.session_state.get("wachtwoord"):
            st.title("Bedankt voor je bezoek!")
            st.markdown("Log in of maak gratis een account. Dan bevestig je je bezoek en kun je een review schrijven.")
            wachtwoord_ok()
            return
        del st.query_params["bezoek"]
        try:
            bezoek = samen.bezoek_bevestigen(code)
        except samen.Fout as fout:
            st.session_state.bezoek_melding = ("fout", str(fout))
        else:
            st.session_state.bezoek_melding = ("ok", f"Bezoek aan {bezoek['winkel']} bevestigd. Je kunt nu een "
                                                     "review schrijven, onderaan de winkelpagina.")
            st.session_state.open_winkel = bezoek["adres"]
            st.session_state.ga_naar = "winkels"
    if not st.session_state.get("wachtwoord"):
        st.title("Mijn assistent")
    terug_van_stripe()
    if not wachtwoord_ok():
        return
    if sleutel := st.session_state.pop("apparaat_bewaar", None):
        onthouden.bewaren(sleutel)
    # Gekoppelde bank: elke paar uur nieuwe regels ophalen (op de achtergrond).
    if "Budget" not in onderdelen_uit():
        try:
            bank.vanzelf()
        except Exception:
            pass
    # Elke paar uur vanzelf je mail nakijken op taken en afspraken (op de achtergrond, de app wacht er niet op).
    if "Mail" not in onderdelen_uit():
        try:
            mailtaken.achtergrond(anthropic_sleutel())
        except Exception:
            pass
    if zin := st.session_state.pop("siri_zeg", None):
        if snel_uitgave(zin):
            pass
        elif snelinvoer.lijkt_invoer(zin):
            snel_toevoegen(zin)
        else:
            st.session_state.vooraf_vraag = zin
            st.session_state.ga_naar = "assistent"
    terug_van_stripe()
    nu_open = st.navigation(paginas(), position="hidden")
    if nu_open.url_path != "instellingen":
        # Wie later via de kopbalk naar Instellingen gaat, begint weer bij de tegels.
        st.session_state.pop("inst_groep", None)
    kopbalk()
    if mislukt := st.session_state.pop("mislukt_melding", 0):
        st.warning(f"Sinds je vorige keer is {mislukt} keer geprobeerd in te loggen met een fout wachtwoord of code. "
                   "Was jij dat niet? Kies een nieuw wachtwoord en zet tweestapsverificatie aan bij "
                   "Instellingen › Account › Beveiliging.", icon="⚠️")
    if st.session_state.pop("welkom", False):
        welkom_voorkeuren()

    # Het invoerveld onderaan: "morgen 9u tandarts" komt meteen in de agenda (ook zonder Claude),
    # al het andere gaat naar het gesprek met de assistent.
    # De microfoon zit in het invoerveld (naast het pijltje); wat je zegt, gaat dezelfde weg als wat je typt.
    with st.container(key="microfoon_houder"):
        gezegd = spraak.microfoon(stem())
    st.html("<style>.st-key-microfoon_houder{display:none}</style>")
    if gezegd:
        if snel_uitgave(gezegd):
            pass
        elif snelinvoer.lijkt_invoer(gezegd):
            snel_toevoegen(gezegd)
        else:
            st.session_state.vooraf_vraag = gezegd
            st.session_state.ingesproken = True
            st.session_state.ga_naar = "assistent"
    if vraag := st.chat_input(f"Vraag {avatar.aanspreken(mijn_avatar())} iets..."):
        if snel_uitgave(vraag):
            pass
        elif snelinvoer.lijkt_invoer(vraag):
            snel_toevoegen(vraag)
        else:
            st.session_state.vooraf_vraag = vraag
            st.session_state.ga_naar = "assistent"
    doel = st.session_state.pop("ga_naar", None)
    if doel in PAGINA and nu_open.url_path != doel:
        st.switch_page(PAGINA[doel])

    snel_melding()
    if melding := st.session_state.pop("bezoek_melding", None):
        (st.success if melding[0] == "ok" else st.error)(melding[1], icon="⭐" if melding[0] == "ok" else None)
    strava_terugkomst()
    strava_bijwerken()
    nu_open.run()


try:
    main()
except opslag.GeenToegang:
    st.session_state.pop("wachtwoord", None)
    st.session_state.pop("ik", None)
    st.error("Geen toegang tot je gegevens. Ververs de pagina en log opnieuw in.")
except opslag.httpx.HTTPError:
    st.error("De database is even niet bereikbaar. Ververs de pagina over een minuut.")
