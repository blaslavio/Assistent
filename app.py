"""Webinterface van de assistent. Starten met: streamlit run app.py"""

import json
import math
import os
import time
from datetime import date, datetime, timedelta
from urllib.parse import quote, urlencode, urlparse

import anthropic
import pydeck as pdk
import streamlit as st

import activiteiten
import agent
import events
import media
import opslag
import planning
import reizen
import strava
import tijd
import weer

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
    begin = regel["start"][11:16] if "T" in regel["start"] else "hele dag"
    tekst = f"**{begin}** {regel['titel']}"
    if regel.get("sport"):
        tekst = f"{tijd.sport_icoon(regel['sport'])} " + tekst
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


KNOP = {"vertrokken": "🚗 Ik vertrek nu", "aangekomen": "📍 Ik ben er", "weg": "👋 Ik ga weg", "terug": "🏠 Ik ben terug"}
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


def tijdsbesteding_overzicht(vandaag: date) -> None:
    """Per afspraak van vandaag: blauw reistijd (heen en terug), groen op locatie, rood uitloop."""
    dag = tijd.tijdsbesteding(vandaag.isoformat(), vandaag.isoformat())
    week = tijd.tijdsbesteding((vandaag - timedelta(days=6)).isoformat(), vandaag.isoformat())
    if not week["afspraken"]:
        return
    st.markdown("**Tijdsbesteding**")
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


def sport_overzicht(nu: datetime, toon_week: bool = True) -> None:
    """Resultaat invullen na een sportafspraak, en wat je deze week gesport hebt."""
    vandaag = nu.date().isoformat()
    week = tijd.sportoverzicht((nu.date() - timedelta(days=6)).isoformat(), vandaag)
    klaar = [a for a in opslag.afspraken_tussen(vandaag, vandaag)
             if a.get("sport") and not a.get("sport_resultaat")
             and ("weg" in a.get("tijden", {}) or (a.get("einde") or a["start"]) <= nu.isoformat(timespec="minutes"))]
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
    with st.expander("🏅 Strava (sport en gezondheid)"):
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


def weer_regel() -> None:
    """Het weer van nu en vandaag op het thuisadres."""
    thuis = opslag.instellingen().get("thuisadres", "")
    try:
        data = weer.voorspelling(thuis)
    except Exception:
        st.caption("Het weer kon niet worden geladen.")
        return
    nu = data["current"]
    icoon, tekst = weer.omschrijving(nu["weather_code"])
    dag = data["daily"]
    st.markdown(f"### {icoon} {round(nu['temperature_2m'])}° &nbsp;<small>{tekst} in {data['plaats']}</small>",
                unsafe_allow_html=True)
    st.caption(f"Vandaag {round(dag['temperature_2m_min'][0])}° tot {round(dag['temperature_2m_max'][0])}°, "
               f"{dag['precipitation_probability_max'][0]}% kans op regen, wind {round(nu['wind_speed_10m'])} km/u"
               + ("" if thuis else ". Vertel de assistent je thuisadres voor het weer bij jou."))


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
    with st.expander(f"📎 Herinneringen ({len(bestaande)})" if bestaande else "📎 Foto's, geluid of notitie toevoegen"):
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
            if st.button("🗑️ Weghalen", key=f"weg_{m['id']}"):
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


def agenda_overzicht() -> None:
    """Afspraken van een gekozen dag, met herinneringen."""
    dag = st.date_input("Dag", value=date.today(), format="DD-MM-YYYY")
    afspraken = opslag.afspraken_tussen(dag.isoformat(), dag.isoformat())
    if not afspraken:
        st.caption("Geen afspraken op deze dag.")
        return
    contacten = {c["id"]: c for c in opslag.contacten_zoeken()}
    for a in afspraken:
        regel = {**a}
        if contact := contacten.get(a.get("contact_id")):
            regel["contact"] = contact
        with st.container(border=True):
            st.markdown(afspraak_tekst(regel))
            if a.get("herinnering"):
                st.caption(a["herinnering"])
            herinneringen(a)


MAATSTAF_TEKST = {"keer_per_week": "Aantal keer per week", "minuten_per_week": "Minuten per week",
                  "km_per_week": "Kilometers per week", "langste_km": "Afstand in één keer (km)",
                  "totaal_km": "Kilometers bij elkaar"}
SPORTEN = ["", "hardlopen", "fitness", "fietsen", "zwemmen", "wandelen", "voetbal", "tennis", "padel", "yoga"]


def sport_tabblad(nu: datetime) -> None:
    """Sportdoelen met voortgang, en wat je de afgelopen week deed."""
    st.markdown("**Mijn doelen**")
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

    with st.expander("➕ Nieuw doel"):
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
        regels = [f"**{e['naam']}**", f"📅 {wanneer}" + (f", {e['tijd']}" if e["tijd"] else "")]
        if e["locatie"]:
            regels.append(f"📍 {e['locatie']}")
        if e["prijs"]:
            regels.append(f"💶 {e['prijs']}")
        st.markdown("  \n".join(regels))
        links, rechts = st.columns(2)
        if e["tickets"]:
            links.link_button("🎟️ Tickets kopen", e["tickets"], type="primary", width="stretch")
        start = f"{e['datum']}T{e['tijd']}" if e["tijd"] else e["datum"]
        if (e["naam"], start) in in_agenda:
            rechts.button("✅ In je agenda", key=f"ev_{e['tickets']}", disabled=True, width="stretch")
        elif rechts.button("📅 In agenda zetten", key=f"ev_{e['tickets']}", width="stretch"):
            opslag.afspraak_toevoegen(e["naam"], start, locatie=e["locatie"], notitie=f"Tickets: {e['tickets']}")
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
    punten += [{"plek": [e["lon"], e["lat"]], "naam": f"🎟️ {e['naam']}", "label": e["naam"], "info": f"{e['datum']} {e['tijd']}, {e['locatie']}",
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
    st.markdown("### 🎉 Activiteiten en events in de buurt")
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
    if st.button("🔎 Laat de assistent meer zoeken", help="De assistent zoekt op internet bij lokale zalen, "
                 "Eventbrite, Paylogic, gemeenten en sites van organisatoren."):
        wens = f" Mijn voorkeuren: {', '.join(voorkeuren)}." if voorkeuren else ""
        st.session_state.vooraf_vraag = (
            "Zoek activiteiten en events in de buurt van mijn thuisadres in de komende twee weken in alle openbare "
            "bronnen: uitagenda's van de gemeente en regio, lokale zalen, theaters, clubs, festivals, markten, "
            "Eventbrite, Paylogic en sites van organisatoren." + wens + " Geef per event de datum, plek, prijs en de "
            "directe link naar de ticketpagina, en vraag of ik er een in mijn agenda wil.")
    if not events.sleutel():
        events_instellen()
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


def vandaag_overzicht() -> None:
    """Het overzicht van vandaag bovenaan de voorpagina. Werkt ook zonder Claude."""
    nu = datetime.now()
    st.subheader(f"{DAGEN[nu.weekday()].capitalize()} {nu.day} {MAANDEN[nu.month - 1]}")
    weer_regel()

    try:
        plan = dagplanning_vandaag(nu.date().isoformat())
    except opslag.GeenToegang:
        raise
    except Exception:
        plan = {"afspraken": [{**a, "waarschuwing": "Reistijd kon niet worden berekend."}
                                  for a in opslag.afspraken_tussen(nu.date().isoformat(), nu.date().isoformat())]}
    # Afspraken die nog komen, plus een afspraak waarvan de tijdregistratie nog loopt.
    nog_te_gaan = [r for r in plan["afspraken"]
                   if "T" not in r["start"] or r["start"][11:16] >= nu.strftime("%H:%M")
                   or (r.get("tijden") and tijd.volgend_moment(r))]
    if nog_te_gaan:
        eerste, rest = nog_te_gaan[0], nog_te_gaan[1:]
        with st.container(border=True):
            st.caption("Eerstvolgende afspraak")
            st.markdown(afspraak_tekst(eerste))
            weer_bij_afspraak(eerste)
            if eerste.get("waarschuwing"):
                st.warning(eerste["waarschuwing"])
            tijd_knop(eerste)
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

    tijdsbesteding_overzicht(nu.date())
    sport_overzicht(nu, toon_week=False)

    if herhalingen := opslag.herhalingen_vandaag():
        onderwerpen = sorted({h["onderwerp"] for h in herhalingen})
        st.info(f"📚 {len(herhalingen)} stap(pen) om vandaag te herhalen: {', '.join(onderwerpen)}.")
    events_overzicht()
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

        strava_instellingen()

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

    strava_terugkomst()
    strava_bijwerken()
    vandaag, agenda, sport = st.tabs(["☀️ Vandaag", "📅 Agenda", "🏃 Sport"], key="tabblad", on_change="rerun")
    if vandaag.open:
        with vandaag:
            vandaag_overzicht()
    if agenda.open:
        with agenda:
            agenda_overzicht()
    if sport.open:
        with sport:
            sport_tabblad(datetime.now())
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

    if vraag := st.chat_input("Waarmee kan ik helpen?") or st.session_state.pop("vooraf_vraag", None):
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
