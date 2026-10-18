"""Webinterface van de assistent. Starten met: streamlit run app.py"""

import html
import importlib
import json
import math
import re
import os
import time
from datetime import date, datetime, timedelta
from urllib.parse import quote, urlencode, urlparse

import anthropic
import pydeck as pdk
import streamlit as st

import activiteiten
import agent
import boodschappen
import events
import ics
import media
import opslag
import planning
import reizen
import strava
import tijd
import weer

# Na een update haalt Streamlit alleen app.py opnieuw op. Eigen modules die op schijf veranderd zijn,
# laden we hier opnieuw, anders draait de nieuwe app.py met oude modules.
for _module in (opslag, reizen, weer, tijd, planning, ics, media, events, activiteiten, boodschappen, strava, agent):
    _gewijzigd = os.path.getmtime(_module.__file__)
    if _gewijzigd > getattr(_module, "_geladen_om", 0):
        importlib.reload(_module)
        _module._geladen_om = _gewijzigd

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
    tekst = f"{tijd.icoon(regel)} **{begin}** {regel['titel']}"
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


def contact_opties() -> dict[int, str]:
    return {c["id"]: c["naam"] for c in sorted(opslag.contacten_zoeken(), key=lambda c: c["naam"].lower())}


def afspraak_formulier(sleutel: str, afspraak: dict | None = None) -> None:
    """Formulier voor een nieuwe afspraak, of om een bestaande te wijzigen."""
    a = afspraak or {}
    start = datetime.fromisoformat(a["start"]) if "T" in a.get("start", "T") and a.get("start") else None
    einde = datetime.fromisoformat(a["einde"]) if a.get("einde") and "T" in a["einde"] else None
    contacten = contact_opties()
    with st.form(sleutel, clear_on_submit=not afspraak, border=False):
        titel = st.text_input("Wat", value=a.get("titel", ""), placeholder="Bijvoorbeeld: samen hardlopen met Sam")
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
        namen = {0: "Geen", -1: "➕ Nieuw contact", **contacten}
        contact_id = meer.selectbox("Met wie", opties, index=opties.index(a.get("contact_id") or 0)
                                  if (a.get("contact_id") or 0) in opties else 0, format_func=namen.get)
        nieuw_naam = meer.text_input("Naam nieuw contact", placeholder="Alleen bij ➕ Nieuw contact")
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
        st.markdown(afspraak_tekst(regel))
        if afspraak.get("notitie"):
            st.caption(afspraak["notitie"])
        if afspraak.get("herinnering"):
            st.caption(f"📝 {afspraak['herinnering']}")
        k1, k2, k3 = st.columns(3)
        k1.download_button("📲 Naar agenda", ics.bestand([{**afspraak, **regel}]), file_name=f"afspraak-{afspraak['id']}.ics",
                           mime="text/calendar", key=f"ics_{afspraak['id']}", width="stretch",
                           help="Zet de afspraak in Apple Agenda, met een melding als je moet vertrekken.")
        with k2.popover("✏️ Wijzigen", width="stretch"):
            afspraak_formulier(f"wijzig_{afspraak['id']}", afspraak)
        with k3.popover("🗑️ Weg", width="stretch"):
            st.write("Deze afspraak verwijderen?")
            if st.button("Ja, verwijderen", key=f"verwijder_{afspraak['id']}", type="primary"):
                opslag.afspraak_verwijderen(afspraak["id"])
                st.rerun()
        herinneringen(afspraak)


def agenda_tabblad() -> None:
    """Dag- of weekoverzicht, nieuwe afspraken en exporteren naar Apple Agenda."""
    with st.expander("➕ Nieuw in de agenda", expanded=False):
        afspraak_formulier("nieuwe_afspraak")

    kol1, kol2 = st.columns([1, 1])
    weergave = kol1.segmented_control("Weergave", ["Dag", "Week"], default="Week", key="agenda_weergave",
                                      label_visibility="collapsed") or "Week"
    vanaf = kol2.date_input("Vanaf", value=date.today(), format="DD-MM-YYYY", label_visibility="collapsed")
    dagen = [vanaf + timedelta(days=i) for i in range(7 if weergave == "Week" else 1)]
    alle = {a["id"]: a for a in opslag.afspraken_tussen(dagen[0].isoformat(), dagen[-1].isoformat())}
    if not alle:
        st.caption("Niets gepland in deze periode. Voeg iets toe met ➕ hierboven, of vraag het de assistent.")
    agenda_lijst(dagen, alle)

    # Extra's staan dicht, zodat de agenda rustig blijft.
    st.divider()
    with st.expander("💡 Ideeën: activiteiten en events in de buurt"):
        events_overzicht()
    with st.expander("🎯 Sportdoelen en sportweek"):
        sport_tabblad(datetime.now())
    with st.expander("⏱️ Tijdsbesteding"):
        if not tijdsbesteding_overzicht(date.today()):
            st.caption("Nog niets vastgelegd. Gebruik op ☀️ Vandaag de knoppen \"Ik vertrek nu\" en \"Ik ben er\".")


def agenda_lijst(dagen: list[date], alle: dict) -> None:
    if not alle:
        return

    export = []
    for dag in dagen:
        regels = [r for r in dagplanning_veilig(dag.isoformat()) if r.get("id") in alle]
        if not regels:
            continue
        st.markdown(f"#### {DAGEN[dag.weekday()].capitalize()} {dag.day} {MAANDEN[dag.month - 1]}")
        for regel in regels:
            afspraak_kaart(regel, alle[regel["id"]])
            export.append({**alle[regel["id"]], **regel})
    if len(export) > 1:
        st.download_button(f"📲 Alle {len(export)} afspraken naar je agenda", ics.bestand(export),
                           file_name="afspraken.ics", mime="text/calendar", width="stretch")
    st.caption("Tip: met 📲 komt een afspraak in Apple Agenda, met een melding op het moment dat je moet vertrekken.")


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
        vraag_assistent(
            "Zoek activiteiten en events in de buurt van mijn thuisadres in de komende twee weken in alle openbare "
            "bronnen: uitagenda's van de gemeente en regio, lokale zalen, theaters, clubs, festivals, markten, "
            "Eventbrite, Paylogic en sites van organisatoren." + wens + " Geef per event de datum, plek, prijs en de "
            "directe link naar de ticketpagina, en vraag of ik er een in mijn agenda wil.")
    if not events.sleutel():
        st.caption("Stel events één keer in bij ⚙️ Instellingen (gratis sleutel van Ticketmaster).")
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
    """Rustige voorpagina: datum en weer, het dagschema, taken en wat aandacht vraagt. Werkt ook zonder Claude."""
    nu = datetime.now()
    st.subheader(f"{DAGEN[nu.weekday()].capitalize()} {nu.day} {MAANDEN[nu.month - 1]}")
    weer_regel()
    dagschema()
    taken_blok()
    sport_overzicht(nu, toon_week=False)
    if herhalingen := opslag.herhalingen_vandaag():
        onderwerpen = sorted({h["onderwerp"] for h in herhalingen})
        st.caption(f"📚 Vandaag herhalen: {', '.join(onderwerpen)} (bij 📚 Leren).")
    if not opslag.instellingen().get("thuisadres"):
        st.caption("Tip: vul je thuisadres in bij ⚙️ Instellingen, dan zie je hoe laat je moet vertrekken.")


def schema_html(regels: list[dict], nu: datetime) -> str:
    """Tijdschema van de dag: voorbij is grijs, wat nu bezig is staat vet, met een rode lijn op het huidige moment."""
    klok = nu.strftime("%H:%M")
    rijen, lijn_gezet = [], False

    def rij(tijdstip: str, tekst: str, stijl: str = "") -> str:
        return (f'<div style="display:flex;gap:12px;padding:5px 0;{stijl}">'
                f'<div style="width:46px;flex-shrink:0;font-variant-numeric:tabular-nums">{tijdstip}</div>'
                f'<div>{tekst}</div></div>')

    for r in regels:
        if "T" not in r["start"]:
            rijen.append(rij("hele dag", f"{tijd.icoon(r)} {html.escape(r['titel'])}"))
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
                rijen.append(rij(moment, f'<span style="color:{BLAUW}">🚗 vertrekken naar {html.escape(r["titel"])}</span>', grijs))
            else:
                bezig = begin <= klok < eind if eind else False
                tekst = f"{tijd.icoon(r)} {html.escape(r['titel'])}"
                if eind:
                    tekst += f' <span style="opacity:.6">tot {eind}</span>'
                if bezig:
                    tekst = f"<b>{tekst}</b> · nu bezig"
                rijen.append(rij(moment, tekst, grijs))
    if not lijn_gezet:
        rijen.append(f'<div style="border-top:2px solid {ROOD};margin:4px 0;font-size:12px;color:{ROOD}">nu {klok}</div>')
    return "".join(rijen)


@st.fragment(run_every=60)
def dagschema() -> None:
    """Het schema van vandaag. Werkt elke minuut vanzelf bij zolang de app open staat."""
    nu = datetime.now()
    regels = dagplanning_veilig(nu.date().isoformat())
    if not regels:
        st.caption("Niets gepland vandaag. Zet iets in 📅 Agenda of vraag het de assistent.")
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
                with st.expander("🗺️ Route, navigeren en delen"):
                    kaart(eerste)
                    route_knoppen(eerste)
    for regel in nog_te_gaan[1:]:
        if regel.get("waarschuwing"):
            st.warning(regel["waarschuwing"])
    st.download_button("🔔 Meldingen voor vandaag in je iPhone-agenda", ics.bestand(regels),
                       file_name=f"vandaag-{nu.date().isoformat()}.ics", mime="text/calendar", type="tertiary",
                       help="Dan krijg je ook een melding op je vertrektijd als deze app dicht is.")


def taken_blok() -> None:
    """Open taken om af te vinken, met een veld om snel een taak toe te voegen."""
    st.markdown("**Taken**")
    taken = opslag.open_taken()
    vandaag = date.today().isoformat()
    for t in taken[:7]:
        label = t["titel"]
        if t["deadline"]:
            label += " 🔴 (te laat)" if t["deadline"] < vandaag else " 🟠 (vandaag)" if t["deadline"] == vandaag else f" (vóór {t['deadline']})"
        if st.checkbox(label, key=f"taak_{t['id']}"):
            opslag.taak_afronden(t["id"])
            st.toast(f"Goed gedaan: {t['titel']}", icon="🎉")
            st.rerun()
    if len(taken) > 7:
        with st.expander(f"Nog {len(taken) - 7} taken"):
            for t in taken[7:]:
                if st.checkbox(t["titel"] + (f" (vóór {t['deadline']})" if t["deadline"] else ""), key=f"taak_{t['id']}"):
                    opslag.taak_afronden(t["id"])
                    st.rerun()
    with st.form("nieuwe_taak", clear_on_submit=True, border=False):
        kol1, kol2, kol3 = st.columns([3, 2, 1], vertical_alignment="bottom")
        titel = kol1.text_input("Nieuwe taak", placeholder="Nieuwe taak", label_visibility="collapsed")
        deadline = kol2.date_input("Deadline", value=None, format="DD-MM-YYYY", label_visibility="collapsed")
        if kol3.form_submit_button("➕") and titel.strip():
            opslag.taak_toevoegen(titel.strip(), deadline.isoformat() if deadline else None)
            st.rerun()


def leren_tabblad() -> None:
    """Leerdoelen met voortgang, herhalingen van vandaag en een nieuw leerdoel starten."""
    herhalingen = opslag.herhalingen_vandaag()
    if herhalingen:
        st.markdown(f"**Vandaag herhalen ({len(herhalingen)})**")
        for h in herhalingen:
            with st.container(border=True):
                st.markdown(f"**{h['onderwerp']}**: stap {h['nummer']}, {h['titel']}")
                score = st.select_slider("Hoe goed ken je dit?", options=list(range(6)), value=3, key=f"score_{h['leerdoel_id']}_{h['nummer']}",
                                         format_func=lambda x: ["😶 0", "😣 1", "😕 2", "🙂 3", "😀 4", "🤩 5"][x])
                if st.button("Opslaan", key=f"oefen_{h['leerdoel_id']}_{h['nummer']}"):
                    opslag.oefening_vastleggen(h["leerdoel_id"], h["nummer"], score)
                    st.rerun()
        if st.button("💬 Oefen met de assistent", help="De assistent legt uit en stelt controlevragen."):
            vraag_assistent("Laten we oefenen met mijn herhalingen van vandaag.")

    st.markdown("**Mijn leerdoelen**")
    doelen = opslag.leerdoelen()
    if not doelen:
        st.caption("Nog geen leerdoelen. Start er hieronder een.")
    for d in doelen:
        with st.container(border=True):
            st.markdown(f"📘 **{d['onderwerp']}**")
            st.progress(opslag.voortgang(d) / 100, text=f"{opslag.voortgang(d)}% beheerst")
            with st.expander("Stappen"):
                for stap in d["stappen"]:
                    score = "" if stap["score"] is None else f" · score {stap['score']}/5"
                    volgende = f" · herhalen op {stap['herhalen_op']}" if stap["herhalen_op"] else " · nog niet geoefend"
                    st.markdown(f"{stap['nummer']}. {stap['titel']}{score}{volgende}")

    with st.expander("➕ Nieuw leerdoel"):
        with st.form("nieuw_leerdoel", border=False):
            onderwerp = st.text_input("Wat wil je leren?", placeholder="Bijvoorbeeld: Spaans voor op vakantie")
            stappen = st.text_area("Stappen (één per regel)", placeholder="Laat leeg, dan maakt de assistent een leerplan")
            if st.form_submit_button("Starten") and onderwerp.strip():
                lijst = [r.strip() for r in stappen.splitlines() if r.strip()]
                if lijst:
                    opslag.leerdoel_starten(onderwerp.strip(), lijst)
                    st.rerun()
                else:
                    vraag_assistent(f"Maak een leerplan voor: {onderwerp.strip()}")


def instellingen_tabblad() -> None:
    """Alles wat je één keer instelt: thuisadres, contacten, koppelingen en sleutels."""
    inst = opslag.instellingen()
    st.markdown("**🏠 Thuisadres**")
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

    with st.expander(f"👤 Contacten ({len(opslag.contacten_zoeken())})"):
        for c in sorted(opslag.contacten_zoeken(), key=lambda c: c["naam"].lower()):
            regel = f"**{c['naam']}**"
            if c.get("telefoon"):
                regel += f" · [{c['telefoon']}](tel:{c['telefoon'].replace(' ', '')})"
            if c.get("email"):
                regel += f" · {c['email']}"
            if c.get("adres"):
                regel += f"  \n📍 {c['adres']}"
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

    strava_instellingen()
    with st.expander("🎟️ Events (Ticketmaster)" + (" ✅" if events.sleutel() else "")):
        events_instellen()
    with st.expander("🔑 Anthropic-sleutel (voor de chat)"):
        if sleutel := sleutel_formulier("Nieuwe sleutel opslaan"):
            opslag.instellingen_bijwerken(anthropic_sleutel=sleutel)
            st.success("Opgeslagen.")
    with st.expander("🩺 Zelftest"):
        if st.button("Start zelftest"):
            zelftest()
    if st.button("🔒 Uitloggen"):
        st.session_state.clear()
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
            st.write(f"✅ Claude antwoordt: {tekst[:100]}")
        except anthropic.APIError as fout:
            st.write(f"❌ Claude: {foutmelding(fout)}")


def foutmelding(fout: anthropic.APIError) -> str:
    if isinstance(fout, anthropic.AuthenticationError):
        return "De Anthropic-sleutel klopt niet. Vervang hem bij ⚙️ Instellingen."
    if isinstance(fout, anthropic.RateLimitError):
        return "Het is even te druk. Probeer het over een minuut opnieuw."
    if isinstance(fout, anthropic.APIConnectionError):
        return "Geen verbinding met Claude. Controleer je internet."
    if isinstance(fout, anthropic.APIStatusError):
        melding = str(fout.body.get("error", {}).get("message", "")) if isinstance(fout.body, dict) else ""
        if "credit balance" in melding.lower():
            return ("Je tegoed bij Anthropic is op of nog niet actief. Voeg tegoed toe onder Billing op "
                    "console.anthropic.com. De rest van de app werkt gewoon.")
        return f"Er ging iets mis bij Claude (code {fout.status_code}): {melding or fout.message}"
    return "Er ging iets mis bij Claude."


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
        if st.button("💬 Laat de assistent een weekmenu met boodschappenlijst maken"):
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
    if any(b["gekocht"] for b in lijst) and st.button("🧹 Afgevinkte weghalen"):
        opslag.boodschappen_opruimen()
        st.rerun()

    nog_nodig = tuple(b["tekst"] for b in lijst if not b["gekocht"])
    if not nog_nodig:
        return
    st.divider()
    st.markdown("**💶 Waar is het het goedkoopst?**")
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
                   f"📍 {vestiging['naam']}, {vestiging['adres'] or 'adres onbekend'} ({vestiging['afstand_km']} km)"
                   + (f"  \n🕒 {vestiging['openingstijden']}" if vestiging["openingstijden"] else ""))
        route = urlencode({"daddr": f"{vestiging['lat']},{vestiging['lon']}", "q": vestiging["naam"]})
        st.link_button("🧭 Route", f"https://maps.apple.com/?{route}")
    elif buurt:
        st.caption(f"Geen bekende supermarkt binnen {max_km} km.")
    else:
        st.caption("Vul je thuisadres in bij ⚙️ Instellingen om de dichtstbijzijnde winkels te zien.")

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

TABBLADEN = ["☀️ Vandaag", "📅 Agenda", "💬 Assistent", "🛒 Boodschappen", "📚 Leren", "⚙️ Instellingen"]
BEZIG = {
    "web_search": "🔎 Zoeken op internet...", "web_fetch": "📄 Pagina lezen...", "plaats_zoeken": "📍 Plekken zoeken...",
    "dagplanning": "🗺️ Reistijden berekenen...", "reistijd_berekenen": "🗺️ Reistijd berekenen...",
    "prijzen_vergelijken": "💶 Prijzen vergelijken...", "weer_bekijken": "☀️ Weer opzoeken...",
    "afspraak_toevoegen": "📅 In je agenda zetten...", "events_zoeken": "🎉 Events zoeken...",
    "uitjes_zoeken": "🎉 Uitjes zoeken...", "boodschappen_toevoegen": "🛒 Op je lijst zetten...",
}
SUGGESTIES = ["Wat staat er vandaag op de planning?", "Wat is er dit weekend te doen bij mij in de buurt?",
              "Maak een boodschappenlijst voor 3 snelle avondmaaltijden", "Help me een schema om 5 km te leren hardlopen"]


def vraag_assistent(vraag: str) -> None:
    """Stelt een vraag namens een knop en gaat naar het tabblad van de assistent."""
    st.session_state.vooraf_vraag = vraag
    st.session_state.naar_assistent = True
    st.rerun()


def assistent_tabblad() -> None:
    """Het gesprek met de assistent; antwoorden verschijnen woord voor woord."""
    st.session_state.setdefault("chat", [])
    # Twee lijsten: wat de gebruiker ziet, en de volledige geschiedenis voor Claude.
    st.session_state.setdefault("berichten", [])
    if not st.session_state.chat:
        st.caption("Typ of spreek je vraag in (🎤 op je toetsenbord). Of kies:")
        for i, suggestie in enumerate(SUGGESTIES):
            if st.button(suggestie, key=f"suggestie_{i}"):
                st.session_state.vooraf_vraag = suggestie
    for rol, tekst in st.session_state.chat:
        st.chat_message(rol).markdown(tekst)

    vraag = st.session_state.pop("vooraf_vraag", None)
    if not vraag:
        if st.session_state.chat and st.button("🧹 Nieuw gesprek"):
            st.session_state.chat = []
            st.session_state.berichten = []
            st.rerun()
        return
    st.chat_message("user").markdown(vraag)
    st.session_state.chat.append(("user", vraag))
    sleutel = anthropic_sleutel()
    with st.chat_message("assistant"):
        if not sleutel:
            tekst = "Er is nog geen Anthropic-sleutel ingesteld. Dat doe je bij ⚙️ Instellingen."
        else:
            status, vak, delen = st.empty(), st.empty(), []
            status.caption("Even denken...")

            def bij_tekst(stukje: str) -> None:
                status.empty()
                delen.append(stukje)
                vak.markdown("".join(delen) + " ▌")

            def bij_hulpmiddel(naam: str) -> None:
                if delen:
                    delen.append("\n\n")
                status.caption(BEZIG.get(naam, "⚙️ Even bezig..."))

            lengte_voor = len(st.session_state.berichten)
            st.session_state.berichten.append({"role": "user", "content": vraag})
            try:
                tekst = agent.antwoord(anthropic.Anthropic(api_key=sleutel), st.session_state.berichten,
                                       bij_tekst, bij_hulpmiddel)
            except anthropic.APIError as fout:
                # Gesprek terugzetten zodat een half afgemaakte beurt niet blijft hangen.
                del st.session_state.berichten[lengte_voor:]
                tekst = foutmelding(fout)
            status.empty()
            vak.empty()
        st.markdown(tekst)
    st.session_state.chat.append(("assistant", tekst))
    st.rerun()


def main() -> None:
    if not opslag.online():
        st.caption("Lokale testmodus: gegevens staan in data/gegevens.json.")
    if not st.session_state.get("wachtwoord"):
        st.title("Mijn assistent")
    if not wachtwoord_ok():
        return

    # Een vraag uit het invoerveld onderaan gaat altijd naar het tabblad van de assistent.
    if vraag := st.chat_input("Vraag de assistent..."):
        st.session_state.vooraf_vraag = vraag
        st.session_state.naar_assistent = True
    if st.session_state.pop("naar_assistent", False):
        st.session_state.tabblad = "💬 Assistent"

    strava_terugkomst()
    strava_bijwerken()
    tabs = st.tabs(TABBLADEN, key="tabblad", on_change="rerun")
    inhoud = [vandaag_overzicht, agenda_tabblad, assistent_tabblad, boodschappen_tabblad, leren_tabblad,
              instellingen_tabblad]
    for tab, toon in zip(tabs, inhoud):
        if tab.open:
            with tab:
                toon()


try:
    main()
except opslag.GeenToegang:
    st.session_state.pop("wachtwoord", None)
    st.error("Geen toegang tot je gegevens. Ververs de pagina en log opnieuw in.")
except opslag.httpx.HTTPError:
    st.error("De database is even niet bereikbaar. Ververs de pagina over een minuut.")
