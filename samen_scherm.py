"""Schermen voor samen: delen, projecten, de marktplaats, je account en beheer."""

import base64
import html
import re
import secrets
import time
from datetime import date, datetime, timedelta
from urllib.parse import quote

import streamlit as st

import bestanden
import toegang
import opslag
import plannen_scherm
import ruimte
import kort
import samen
import teksten
import winkelen
import winkelkaart
import zoekveld


def ik() -> dict:
    return st.session_state.get("ik") or {}


def _fout(functie, *args, **kwargs):
    """Voert een actie uit en toont een nette melding als het niet lukt.

    Geeft het resultaat (True als de actie niets teruggeeft), of None als het niet lukte."""
    st.session_state.pop("_markt_resultaat", None)  # na een actie opnieuw zoeken (voorraad, prijs)
    try:
        resultaat = functie(*args, **kwargs)
        return True if resultaat is None else resultaat
    except samen.Fout as fout:
        st.error(str(fout))
    return None


def nieuw_kort() -> dict:
    """Wat er nieuw is (gedeeld, berichten), hooguit elke twee minuten opgehaald."""
    if not samen.beschikbaar():
        return {}
    bewaard = st.session_state.get("_samen_nieuw")
    if not bewaard or time.time() - bewaard[0] > 120:
        try:
            bewaard = (time.time(), samen.nieuw())
        except opslag.GeenToegang:
            raise
        except Exception:
            bewaard = (time.time(), {})
        st.session_state._samen_nieuw = bewaard
    return bewaard[1]


def _vergeet_nieuw() -> None:
    st.session_state.pop("_samen_nieuw", None)


def gebruikersnaam_kiezen() -> None:
    """Voor de eigenaar, die de app als eerste instelde en nog geen gebruikersnaam heeft."""
    st.info("Kies eerst een gebruikersnaam. Daarmee kunnen anderen dingen met je delen en je aan een project toevoegen.")
    with st.form("naam_kiezen", border=False):
        kol1, kol2 = st.columns(2)
        naam = kol1.text_input("Gebruikersnaam", placeholder="Bijv. sanne")
        weergave = kol2.text_input("Je naam zoals anderen hem zien", placeholder="Bijv. Sanne")
        if st.form_submit_button("Opslaan") and naam.strip():
            if fout := opslag.profiel_bijwerken(nieuwe_naam=naam.strip().lower().lstrip("@"),
                                                weergavenaam=weergave.strip() or None):
                st.error(fout)
            else:
                st.session_state.ik = opslag.inloggen(st.session_state.get("naam", ""), st.session_state.wachtwoord)
                st.rerun()


# --- Samen -----------------------------------------------------------------------

def samen_tabblad() -> None:
    """Delen met anderen en samen aan projecten werken."""
    if not ik().get("naam"):
        gebruikersnaam_kiezen()
    else:
        st.caption(f"Jouw gebruikersnaam is **@{ik()['naam']}**. Geef die aan wie iets met je wil delen.")
    gedeeld = samen.gedeeld_met_mij()
    keuzes = ["Voor jou", "Projecten", "Delen"]
    if st.session_state.get("samen_deel") not in keuzes:
        st.session_state.samen_deel = keuzes[0] if gedeeld else keuzes[1]
    keuze = st.segmented_control("Samen", keuzes, key="samen_deel", label_visibility="collapsed")
    if keuze == "Voor jou":
        voor_jou(gedeeld)
    elif keuze == "Delen":
        iets_delen()
    else:
        projecten()


def _gedeeld_tekst(item: dict) -> str:
    inhoud = item["inhoud"]
    if item["soort"] == "afspraak":
        start = inhoud.get("start", "")
        wanneer = f"{start[8:10]}-{start[5:7]} {start[11:16]}".strip() if start else ""
        return f"**{inhoud.get('titel', '')}** · {wanneer}" + (f" · :material/location_on: {inhoud['locatie']}" if inhoud.get("locatie") else "")
    if item["soort"] == "boodschappen":
        return ", ".join(inhoud.get("items", []))
    if item["soort"] == "taak":
        return f"**{inhoud.get('titel', '')}**" + (f" · voor {inhoud['deadline']}" if inhoud.get("deadline") else "")
    return inhoud.get("tekst") or inhoud.get("titel", "")


def voor_jou(gedeeld: list[dict]) -> None:
    if not gedeeld:
        st.caption("Niemand heeft iets nieuws met je gedeeld.")
        return
    for item in gedeeld:
        with st.container(border=True):
            st.markdown(f"{samen.SOORTEN_DELEN[item['soort']]} van **{item['van']}**  \n{_gedeeld_tekst(item)}")
            kol1, kol2 = st.columns(2)
            if kol1.button("Overnemen", key=f"neem_{item['id']}", type="primary", width="stretch"):
                plek = samen.gedeeld_aannemen(item)
                _vergeet_nieuw()
                st.toast(f"Staat nu in {plek}.", icon="✅")
                st.rerun()
            if kol2.button("Nee, bedankt", key=f"weiger_{item['id']}", width="stretch"):
                samen.gedeeld_afwijzen(item["id"])
                _vergeet_nieuw()
                st.rerun()


def iets_delen() -> None:
    soort = st.segmented_control("Wat wil je delen?", list(samen.SOORTEN_DELEN), default="afspraak",
                                 format_func=samen.SOORTEN_DELEN.get, key="deel_soort") or "afspraak"
    vandaag = date.today()
    with st.form("delen", clear_on_submit=True):
        inhoud = None
        if soort == "afspraak":
            afspraken = opslag.afspraken_tussen(vandaag.isoformat(), (vandaag + timedelta(days=90)).isoformat())
            if not afspraken:
                st.caption("Je hebt de komende drie maanden geen afspraken.")
            keuze = st.selectbox("Welke afspraak", afspraken, format_func=lambda a: f"{a['start'][8:10]}-{a['start'][5:7]} "
                                 f"{a['start'][11:16]} {a['titel']}", index=None, placeholder="Kies een afspraak")
            if keuze:
                inhoud = {k: keuze.get(k) for k in ("titel", "start", "einde", "locatie", "notitie", "soort", "sport")
                          if keuze.get(k)}
        elif soort == "taak":
            keuze = st.selectbox("Welke taak", opslag.open_taken(), format_func=lambda t: t["titel"], index=None,
                                 placeholder="Kies een taak")
            if keuze:
                inhoud = {"titel": keuze["titel"], "deadline": keuze.get("deadline")}
        elif soort == "boodschappen":
            nodig = [b["tekst"] for b in opslag.boodschappen() if not b["gekocht"]]
            st.caption(", ".join(nodig) if nodig else "Je boodschappenlijst is leeg.")
            inhoud = {"items": nodig} if nodig else None
        else:
            tekst = st.text_area("Notitie", height=100)
            inhoud = {"tekst": tekst.strip()} if tekst.strip() else None
        aan = st.text_input("Met wie (gebruikersnaam)", placeholder="@gebruikersnaam")
        if st.form_submit_button("Delen", type="primary"):
            if not inhoud:
                st.error("Kies eerst wat je wilt delen.")
            elif not aan.strip():
                st.error("Vul de gebruikersnaam in van wie het moet krijgen.")
            elif ontvanger := _fout(samen.delen, aan, soort, inhoud):
                st.success(f"Gedeeld met {ontvanger}. Die ziet het bij Samen › Voor jou.")


def projecten() -> None:
    lijst = samen.projecten()
    with st.popover("Nieuw project", width="stretch" if not lijst else "content"):
        with st.form("nieuw_project", clear_on_submit=True, border=False):
            titel = st.text_input("Naam van het project", placeholder="Bijv. verhuizing")
            omschrijving = st.text_area("Waar gaat het over? (optioneel)", height=68)
            if st.form_submit_button("Maken", type="primary") and titel.strip():
                if nieuw := _fout(samen.project_maken, titel.strip(), omschrijving.strip()):
                    st.session_state.project_keuze = nieuw
                    st.rerun()
    if not lijst:
        st.caption("Werk samen aan een verhuizing, een groepsopdracht, een training of een feest. Iedereen in het "
                   "project ziet dezelfde taken, notities en afspraken.")
        return
    ids = [p["id"] for p in lijst]
    if st.session_state.get("project_keuze") not in ids:
        st.session_state.project_keuze = ids[0]
    namen = {p["id"]: f"{p['naam']}" + (f" · {p['open']} open" if p["open"] else "") for p in lijst}
    gekozen = st.selectbox("Project", ids, format_func=namen.get, key="project_keuze", label_visibility="collapsed")
    project_kaart(next(p for p in lijst if p["id"] == gekozen))


def project_kaart(project: dict) -> None:
    leden = project.get("leden") or []
    if project["omschrijving"]:
        st.caption(project["omschrijving"])
    st.caption("Leden: " + ", ".join(lid["weergavenaam"] for lid in leden))
    items = samen.items(project["id"])
    for item in items:
        kol1, kol2 = st.columns([8, 1], vertical_alignment="center")
        extra = " · ".join(x for x in [item["datum"][:16].replace("T", " "),
                                       f"{item['toegewezen_aan']}" if item["toegewezen_aan"] else ""] if x)
        if item["soort"] in ("taak", "afspraak"):
            label = f"{'📅 ' if item['soort'] == 'afspraak' else ''}{item['titel']}" + (f"  \n:gray[{extra}]" if extra else "")
            klaar = kol1.checkbox(f"~~{item['titel']}~~" if item["klaar"] else label, value=item["klaar"],
                                  key=f"pi_{item['id']}")
            if klaar != item["klaar"]:
                samen.item_bijwerken(item["id"], klaar=klaar)
                st.rerun()
        elif item["soort"] == "link":
            kol1.markdown(f"[{item['titel']}]({item['inhoud']})" if item["inhoud"].startswith("http")
                          else f"{item['titel']} {item['inhoud']}")
        else:
            kol1.markdown(f"**{item['titel']}**  \n{item['inhoud']}")
        if item["soort"] != "link" and item["inhoud"] and item["soort"] != "notitie":
            kol1.caption(item["inhoud"])
        if kol2.button("✕", key=f"pi_weg_{item['id']}", help="Weghalen"):
            samen.item_bijwerken(item["id"], verwijderd=True)
            st.rerun()
    if not items:
        st.caption("Nog leeg. Zet hieronder de eerste taak of notitie erin.")

    soort = st.pills("Soort", list(samen.SOORTEN_ITEM), default="taak", format_func=samen.SOORTEN_ITEM.get,
                     key=f"item_soort_{project['id']}") or "taak"
    voorbeeld = {"taak": "Bijv. dozen regelen", "notitie": "Bijv. sleutel ligt bij de buren",
                 "afspraak": "Bijv. verhuizing zaterdag 9 uur", "link": "Bijv. het huurcontract"}
    with st.form(f"item_{project['id']}", clear_on_submit=True):
        titel = st.text_input("Titel", placeholder=voorbeeld.get(soort, ""))
        inhoud = st.text_input("Toelichting of link (optioneel)")
        kol1, kol2 = st.columns(2)
        datum = kol1.date_input("Datum (optioneel)", value=None, format="DD-MM-YYYY")
        namen = [lid["naam"] for lid in leden if lid.get("naam")]
        wie = kol2.selectbox("Wie doet het", ["", *namen], format_func=lambda n: f"@{n}" if n else "Iedereen")
        if st.form_submit_button("Toevoegen") and titel.strip():
            if _fout(samen.item_toevoegen, project["id"], soort, titel.strip(), inhoud.strip(),
                     datum.isoformat() if datum else "", wie) is not None:
                st.rerun()

    with st.expander("Iemand toevoegen of het project verlaten"):
        with st.form(f"lid_{project['id']}", clear_on_submit=True, border=False):
            kol1, kol2 = st.columns([3, 1], vertical_alignment="bottom")
            naam = kol1.text_input("Gebruikersnaam", placeholder="@gebruikersnaam")
            if kol2.form_submit_button("Toevoegen") and naam.strip():
                if lid := _fout(samen.lid_toevoegen, project["id"], naam):
                    st.toast(f"{lid} doet nu mee.", icon="👥")
                    st.rerun()
        if st.button("Project verlaten", key=f"verlaat_{project['id']}"):
            samen.project_verlaten(project["id"])
            st.session_state.pop("project_keuze", None)
            st.rerun()


# --- Marktplaats ------------------------------------------------------------------

def veilig_handelen() -> None:
    with st.expander("Veilig kopen, verkopen en boeken"):
        st.markdown(samen.VEILIG)
        st.caption("De koop of boeking sluit je met de ander af. Zie de voorwaarden bij Instellingen › Account.")


def markt_zoeken() -> None:
    """Pagina 🔎 Zoeken: onze eigen marktplaats."""
    zoeken()
    veilig_handelen()


def markt_bestellingen() -> None:
    """Pagina 🧾 Bestellingen: wat je koopt en verkoopt, en je geboekte tijden."""
    bestellingen()
    if samen.mijn_boekingen():
        st.markdown("**Boekingen**")
        boekingen()
    veilig_handelen()


def _markt_suggesties() -> list[dict]:
    """Titels van wat er nu te koop of te huur is, plus de soorten (een minuut bewaard)."""
    bewaard = st.session_state.get("_markt_suggesties")
    if bewaard and time.time() - bewaard[0] < 60:
        return bewaard[1]
    try:
        alles = samen.aanbod_zoeken("", "")
    except Exception:
        alles = []
    lijst = [zoekveld.suggestie(a["titel"], " · ".join(filter(None, [samen.SOORTEN_AANBOD.get(a.get("soort"), ""),
                                                                      a.get("plaats", "")])),
                                zoek=a.get("omschrijving", "")[:200]) for a in alles[:200]]
    st.session_state._markt_suggesties = (time.time(), lijst)
    return lijst


@st.fragment
def zoeken() -> None:
    zoekveld.context()
    zoekterm = zoekveld.zoekveld("markt_zoek", "Bijv. fiets, bijles wiskunde, personal trainer Utrecht",
                                 _markt_suggesties())
    soort = st.pills("Soort", list(samen.SOORTEN_AANBOD), format_func=samen.SOORTEN_AANBOD.get,
                     label_visibility="collapsed", key="markt_soort") or ""
    # Kort onthouden: elke klik op een kaart laat de pagina opnieuw lopen, dan hoeft er niet opnieuw gezocht te worden.
    sleutel = (zoekterm.strip().lower(), soort)
    eerder = st.session_state.get("_markt_resultaat")
    if eerder and eerder[0] == sleutel and time.time() - eerder[1] < 30:
        resultaten = eerder[2]
    else:
        resultaten = samen.aanbod_zoeken(zoekterm, soort)
        if not eerder or eerder[0] != sleutel:
            st.session_state.markt_aantal = 20
        st.session_state._markt_resultaat = (sleutel, time.time(), resultaten)
    aantal = st.session_state.get("markt_aantal", 20)
    # Afgesproken prijzen (geaccepteerde biedingen), één keer per pagina opgehaald.
    st.session_state._afgesproken = {b["aanbod_id"]: b["tegenbod"] or b["bedrag"] for b in samen.mijn_biedingen()
                                     if b["ik_ben"] == "koper" and b["status"] == "geaccepteerd" and not b["verlopen"]}
    if not resultaten:
        st.caption("Niets gevonden." if zoekterm else "Nog niets te koop. Wees de eerste: kies Verkopen.")
    for aanbod in resultaten[:aantal]:
        aanbod_kaart(aanbod)
    if len(resultaten) > aantal:
        if st.button("Meer laten zien", key="markt_meer"):
            st.session_state.markt_aantal = aantal + 20
            st.rerun()


def aanbod_kaart(aanbod: dict) -> None:
    with st.container(border=True):
        st.markdown(f"**{aanbod['titel']}**  \n{samen.SOORTEN_AANBOD[aanbod['soort']]} · **{samen.prijs_tekst(aanbod)}**"
                    + (f" · :material/location_on: {aanbod['plaats']}" if aanbod["plaats"] else ""))
        st.caption(f"{aanbod['aanbieder']} · {samen.vertrouwen_tekst(aanbod.get('vertrouwen'))}  \n"
                   + " · ".join(samen.BETAALWIJZEN[b] for b in aanbod.get("betaalwijzen", []))
                   + "  \n" + " · ".join(samen.LEVERING[l] for l in aanbod.get("levering", [])))
        if bedrijf := samen.zakelijk(aanbod.get("vertrouwen")):
            st.caption("Je koopt bij een bedrijf. Koop je online of op afstand, dan heb je 14 dagen bedenktijd."
                       + (f" Retour: {bedrijf['retour']}" if bedrijf.get("retour") else ""))
        if aanbod["omschrijving"]:
            st.caption(aanbod["omschrijving"][:400] + ("..." if len(aanbod["omschrijving"]) > 400 else ""))
        if aanbod["contact"]:
            st.caption(f"Contact: {aanbod['contact']}")
        if aanbod["van_mij"]:
            st.caption("Dit is jouw aanbod.")
            return
        kolommen = st.columns(2)
        if aanbod.get("winkel"):
            if kolommen[0].button("Naar de winkel", key=f"winkel_{aanbod['id']}", width="stretch", type="primary"):
                naar_winkel(aanbod["winkel"])
        else:
            with kolommen[0].popover("Kopen" if aanbod["soort"] == "product" else "Bestellen", width="stretch"):
                bestel_formulier(aanbod)
        if aanbod["soort"] in ("training", "les", "dienst") and aanbod["vrije_tijden"]:
            with kolommen[1].popover(f"Tijd kiezen ({aanbod['vrije_tijden']})", width="stretch"):
                tijden_boeken(aanbod)
        elif aanbod["soort"] == "product" and (aanbod.get("prijs") or 0) > 0 and not aanbod.get("winkel"):
            with kolommen[1].popover("Bod doen", width="stretch"):
                bod_formulier(aanbod)
        kolommen = st.columns(2)
        with kolommen[0].popover("Bericht", width="stretch"):
            with st.form(f"vraag_{aanbod['id']}", clear_on_submit=True, border=False):
                tekst = st.text_area("Je bericht", placeholder="Is dit nog beschikbaar?", height=80)
                if st.form_submit_button("Versturen", type="primary") and tekst.strip():
                    if _fout(samen.bericht_sturen, aanbod["id"], tekst.strip()) is not None:
                        st.success("Verstuurd. Het antwoord zie je bij Berichten.")
        with kolommen[1].popover("Melden", width="stretch"):
            with st.form(f"meld_{aanbod['id']}", clear_on_submit=True, border=False):
                reden = st.text_area("Wat klopt er niet?", height=80)
                if st.form_submit_button("Melden") and reden.strip():
                    samen.melden(aanbod["id"], reden.strip())
                    st.success("Bedankt, de beheerder kijkt ernaar.")


def bod_formulier(aanbod: dict) -> None:
    prijs = float(aanbod["prijs"])
    with st.form(f"bod_{aanbod['id']}", border=False):
        bedrag = st.number_input("Jouw bod in euro", min_value=round(prijs / 2, 2), max_value=round(prijs - 0.01, 2),
                                 value=float(round(max(prijs / 2, min(prijs - 0.01, prijs * 0.85)))), step=1.0, format="%.2f")
        bericht = st.text_input("Bericht (optioneel)", placeholder="Bijv. morgen ophalen")
        st.caption("De verkoper accepteert, wijst af of doet een tegenbod. Is het akkoord, dan bestel je binnen "
                   "48 uur voor die prijs.")
        if st.form_submit_button("Bod versturen", type="primary"):
            if _fout(samen.bod_doen, aanbod["id"], bedrag, bericht.strip()) is not None:
                _vergeet_nieuw()
                st.success("Je bod is verstuurd. Het antwoord zie je bij Bestellingen en Berichten.")


def biedingen() -> None:
    """Lopende biedingen: wie aan de beurt is, kan hier meteen antwoorden."""
    lijst = samen.mijn_biedingen()
    if not lijst:
        return
    st.markdown("**Biedingen**")
    for b in lijst:
        with st.container(border=True):
            euro = lambda x: samen.prijs_tekst({"prijs": x})  # noqa: E731
            wie = f"van {b['koper']}" if b["ik_ben"] == "verkoper" else f"aan {b['verkoper']}"
            regel = f"**{b['titel']}** · bod {euro(b['bedrag'])} {wie} · vraagprijs {euro(b['vraagprijs'])}"
            if b["tegenbod"]:
                regel += f" · tegenbod {euro(b['tegenbod'])}"
            status = {"open": "wacht op de verkoper", "tegenbod": "tegenbod, wacht op de koper",
                      "geaccepteerd": "akkoord" + (", maar verlopen" if b["verlopen"] else ""),
                      "afgewezen": "afgewezen", "ingetrokken": "ingetrokken", "gebruikt": "besteld"}[b["status"]]
            st.markdown(f"{regel}  \n:gray[{status}]")
            if b["status"] == "geaccepteerd" and b["ik_ben"] == "koper" and not b["verlopen"]:
                st.caption(f"Bestel vóór {b['geldig_tot'][:16].replace('T', ' om ')} via Zoeken: je betaalt dan "
                           f"{euro(b['tegenbod'] or b['bedrag'])}.")
            if not b["aan_de_beurt"] and not (b["ik_ben"] == "koper" and b["status"] == "open"):
                continue
            kol = st.columns(3)
            if b["ik_ben"] == "koper" and b["status"] == "open":
                if kol[0].button("Intrekken", key=f"bod_in_{b['id']}", width="stretch"):
                    if _fout(samen.bod_antwoorden, b["id"], "intrekken"):
                        st.rerun()
                continue
            if kol[0].button("Akkoord", key=f"bod_ok_{b['id']}", width="stretch", type="primary"):
                if _fout(samen.bod_antwoorden, b["id"], "accepteren"):
                    _vergeet_nieuw()
                    st.rerun()
            if kol[1].button("Nee", key=f"bod_nee_{b['id']}", width="stretch"):
                if _fout(samen.bod_antwoorden, b["id"], "afwijzen"):
                    _vergeet_nieuw()
                    st.rerun()
            if b["ik_ben"] == "verkoper":
                with kol[2].popover("Tegenbod", width="stretch"):
                    with st.form(f"tegenbod_{b['id']}", border=False):
                        bedrag = st.number_input("Tegenbod in euro", min_value=float(b["bedrag"]) + 0.01,
                                                 max_value=float(b["vraagprijs"]) - 0.01,
                                                 value=float(round((float(b["bedrag"]) + float(b["vraagprijs"])) / 2)),
                                                 step=1.0, format="%.2f")
                        if st.form_submit_button("Versturen", type="primary"):
                            if _fout(samen.bod_antwoorden, b["id"], "tegenbod", bedrag):
                                st.rerun()


def bestel_formulier(aanbod: dict) -> None:
    wijzen = aanbod.get("betaalwijzen") or ["tikkie"]
    if (afgesproken := st.session_state.get("_afgesproken", {}).get(aanbod["id"])) is not None:
        st.success(f"Jullie zijn het eens over {samen.prijs_tekst({'prijs': afgesproken})}. Die prijs betaal je.")
    with st.form(f"bestel_{aanbod['id']}", border=False):
        betaal = st.radio("Hoe wil je betalen?", wijzen, format_func=samen.BETAALWIJZEN.get)
        levering = st.radio("Hoe krijg je het?", aanbod.get("levering") or ["ophalen"], format_func=samen.LEVERING.get)
        bericht = st.text_input("Bericht aan de verkoper (optioneel)", placeholder="Je vraag")
        if "app" in wijzen:
            st.caption(f"Via de app: {samen.prijs_tekst(aanbod)} plus kopersbescherming. Je geld gaat pas naar de "
                       "verkoper als jij bevestigt dat alles goed is ontvangen.")
        if st.form_submit_button("Bestelling versturen", type="primary"):
            if _fout(samen.bestellen, aanbod["id"], betaal, levering, bericht.strip()) is not None:
                _vergeet_nieuw()
                st.success("Verstuurd. De verkoper moet je bestelling eerst accepteren; je ziet het bij Bestellingen.")


def tijden_boeken(aanbod: dict) -> None:
    tijden = [t for t in samen.tijden(aanbod["id"]) if t["vrij"]]
    if not tijden:
        st.caption("Er zijn geen vrije tijden meer.")
        return
    opmerking = st.text_input("Opmerking (optioneel)", key=f"opm_{aanbod['id']}",
                              placeholder="Bijv. eerste keer")
    for t in tijden[:20]:
        if st.button(f"{samen.tijd_tekst(t['start'])} · {t['minuten']} min", key=f"boek_{t['id']}", width="stretch"):
            if boeking := _fout(samen.boeken, t["id"], opmerking.strip()):
                st.success(f"Geboekt: {boeking['titel']}, {samen.tijd_tekst(boeking['start'])}. Het staat in je agenda. "
                           f"Betalen regel je met {boeking['aanbieder']}.")


def verkoper_aanmelden(status: dict) -> None:
    """Aanmelden bij Stripe om betalingen via de app te ontvangen."""
    if not status.get("aan") or status.get("ik_kan_ontvangen"):
        return
    with st.container(border=True):
        st.markdown("**Betalingen via de app ontvangen**")
        st.caption("Meld je eenmalig aan bij Stripe, onze betaaldienst. Stripe controleert je identiteit en vraagt je "
                   "rekeningnummer. Daarna krijg je ✅ geverifieerd bij je aanbod, en kopers betalen veilig via de app.")
        kol1, kol2 = st.columns(2)
        if kol1.button("Aanmelden bij Stripe" if not status.get("ik_ben_aangemeld") else "Aanmelding afmaken",
                       type="primary", width="stretch"):
            if url := _fout(samen.verkoper_aanmelden):
                st.session_state.stripe_link = url
        if status.get("ik_ben_aangemeld") and kol2.button("Ik ben klaar, controleer", width="stretch"):
            if _fout(samen.verkoper_status):
                st.rerun()
            else:
                st.info("Stripe is nog bezig met controleren, of er ontbreekt nog iets. Maak de aanmelding af.")
        if url := st.session_state.get("stripe_link"):
            st.link_button("Ga naar Stripe", url, width="stretch")


def aanbieden() -> None:
    status = _fout(samen.betalen_status) or {}
    verkoper_aanmelden(status)
    wijzen = [w for w in samen.BETAALWIJZEN if w != "app" or status.get("ik_kan_ontvangen")]
    open_ = st.session_state.pop("aanbod_open", False) or not st.session_state.get("markt_heeft_aanbod")
    with st.expander("Iets nieuws aanbieden", expanded=open_):
        # Vanaf de voorpagina kan de soort al gekozen zijn (bijvoorbeeld Dienst aanbieden).
        standaard = {} if "aanbod_soort" in st.session_state else {"default": "product"}
        soort = st.pills("Wat bied je aan?", list(samen.SOORTEN_AANBOD), key="aanbod_soort",
                         format_func=samen.SOORTEN_AANBOD.get, **standaard) or "product"
        voorbeeld = {
            "product": ("Bijv. Racefiets maat 56", "Staat, merk, maat en wat erbij zit."),
            "dienst": ("Bijv. Tuin onderhouden", "Wat je doet, waar, en hoe lang het ongeveer duurt."),
            "training": ("Bijv. Personal training in het park", "Voor wie, hoe lang een sessie duurt en wat je meeneemt."),
            "les": ("Bijv. Bijles wiskunde havo", "Niveau, vak, hoe lang een les duurt en of het online kan.")}
        titel_vb, omschrijving_vb = voorbeeld.get(soort, voorbeeld["product"])
        with st.form("aanbod_nieuw", clear_on_submit=True, border=False):
            titel = st.text_input("Titel", placeholder=titel_vb)
            omschrijving = st.text_area("Omschrijving", height=100, placeholder=omschrijving_vb)
            kol1, kol2 = st.columns(2)
            prijs = kol1.number_input("Prijs in euro (leeg = in overleg)", min_value=0.0, value=None, step=5.0)
            per = kol2.selectbox("Per", ["", "per stuk", "per uur", "per les", "per maand", "per persoon"],
                                 format_func=lambda p: p or "Totaal")
            plaats = st.text_input("Plaats", placeholder="Bijv. Rotterdam")
            contact = st.text_input("Contact (optioneel, iedereen ziet dit)",
                                    placeholder="Optioneel")
            betaal = st.pills("Hoe kan de koper betalen?", wijzen, selection_mode="multi",
                              default=["app"] if "app" in wijzen else ["tikkie", "contant"],
                              format_func=samen.BETAALWIJZEN.get)
            levering = st.pills("Hoe komt het bij de koper?", [l for l in samen.LEVERING if l != "bezorgen"],
                                selection_mode="multi",
                                default=["ophalen"], format_func=samen.LEVERING.get)
            if soort in ("training", "les"):
                st.caption("Na het plaatsen zet je hieronder bij Mijn aanbod de tijden waarop mensen kunnen boeken.")
            if st.form_submit_button("Plaatsen", type="primary"):
                if not titel.strip():
                    st.error("Vul een titel in.")
                elif _fout(samen.aanbod_plaatsen, soort, titel.strip(), omschrijving.strip(), prijs, per, plaats.strip(),
                           contact.strip(), betaal, levering) is not None:
                    st.toast("Je aanbod staat online.", icon="🏪")
                    st.rerun()
    mijn = samen.mijn_aanbod()
    st.session_state.markt_heeft_aanbod = bool(mijn)
    if mijn:
        online = sum(a["actief"] for a in mijn)
        st.markdown(f"**Mijn aanbod** · :gray[{online} van {ik().get('max_aanbod') or 10} online]")
    for aanbod in mijn:
        with st.container(border=True):
            st.markdown(f"**{aanbod['titel']}** · {samen.prijs_tekst(aanbod)}")
            actief = st.toggle("Zichtbaar op de marktplaats", value=aanbod["actief"], key=f"actief_{aanbod['id']}")
            if actief != aanbod["actief"]:
                samen.aanbod_actief(aanbod["id"], actief)
                st.rerun()
            if aanbod["soort"] in ("training", "les", "dienst"):
                tijden_beheren(aanbod)


def tijden_beheren(aanbod: dict) -> None:
    tijden = samen.tijden(aanbod["id"])
    for t in tijden:
        kol1, kol2 = st.columns([6, 1], vertical_alignment="center")
        wie = f"geboekt door **{t['klant']}**" + (f" · {t['opmerking']}" if t.get("opmerking") else "") if not t["vrij"] else "vrij"
        kol1.markdown(f"{samen.tijd_tekst(t['start'])} · {t['minuten']} min · {wie}")
        if kol2.button("✕", key=f"slot_weg_{t['id']}", help="Deze tijd laten vervallen"):
            samen.boeking_annuleren(t["id"])
            st.rerun()
    with st.popover("Tijden toevoegen"):
        with st.form(f"tijd_{aanbod['id']}", clear_on_submit=True, border=False):
            kol1, kol2 = st.columns(2)
            dag = kol1.date_input("Datum", value=date.today() + timedelta(days=1), min_value=date.today(),
                                  format="DD-MM-YYYY")
            begin = kol2.time_input("Begin", value=datetime.now().replace(hour=9, minute=0).time(), step=900)
            kol3, kol4 = st.columns(2)
            minuten = kol3.number_input("Minuten per keer", min_value=15, max_value=480, value=60, step=15)
            aantal = kol4.number_input("Hoeveel achter elkaar", min_value=1, max_value=12, value=1)
            herhaal = st.checkbox("Ook de komende 3 weken op dezelfde dag")
            if st.form_submit_button("Toevoegen", type="primary"):
                start = datetime.combine(dag, begin)
                gelukt = 0
                for week in range(4 if herhaal else 1):
                    for i in range(int(aantal)):
                        moment = start + timedelta(weeks=week, minutes=i * int(minuten))
                        if _fout(samen.tijd_toevoegen, aanbod["id"], moment, int(minuten)) is not None:
                            gelukt += 1
                if gelukt:
                    st.toast(f"{gelukt} tijd(en) toegevoegd.", icon="📅")
                    st.rerun()


def bestellingen() -> None:
    biedingen()
    lijst = samen.mijn_bestellingen()
    if not lijst:
        st.caption("Nog geen bestellingen.")
        return
    for b in lijst:
        bestelling_kaart(b)


def bestelling_kaart(b: dict) -> None:
    koper = b["rol"] == "koper"
    app = b["betaalwijze"] == "app"
    with st.container(border=True):
        bedrag = samen.euro(b["bedrag"]) + (f" + {samen.euro(b['kosten'])} kopersbescherming"
                                             if app and koper and b.get("kosten") else "")
        if b.get("webshop"):
            bedrag = "" + bedrag + (f" (incl. {samen.euro(b['verzendkosten'])} verzenden)" if b.get("verzendkosten") else "")
        st.markdown(f"**{b['titel']}** · {bedrag}  \n{samen.STATUS[b['status']]} · "
                    f"{'van' if koper else 'voor'} **{b['ander']}** · {samen.BETAALWIJZEN[b['betaalwijze']]} · "
                    f"{samen.LEVERING[b['levering']]}")
        if v := samen.vertrouwen_tekst(b.get("vertrouwen_ander")):
            st.caption(v)
        verzenden_regel(b)
        bezorg_regel(b)
        if b.get("webshop") and not koper and b.get("commissie") is not None:
            st.caption(f"Webshopcommissie {samen.euro(b['commissie'])}, je ontvangt "
                       f"{samen.euro(b['bedrag'] - b['commissie'])}.")
        if app and b["status"] in ("betaald", "geleverd"):
            st.caption("Het geld staat veilig bij Stripe en gaat naar de verkoper zodra de koper bevestigt dat alles "
                       "goed is ontvangen.")
        knoppen = []
        if koper:
            if b["status"] == "geaccepteerd" and app:
                knoppen.append(("Betalen", "betalen"))
            if b["status"] in ("aangevraagd", "geaccepteerd"):
                knoppen.append(("Annuleren", "annuleren"))
            if b["status"] in ("betaald", "geleverd"):
                knoppen.append(("Alles goed ontvangen", "ontvangen"))
        else:
            if b["status"] == "aangevraagd":
                knoppen += [("Accepteren", "accepteren"), ("Weigeren", "weigeren")]
            if b["status"] == "geaccepteerd" and not app:
                knoppen.append(("Betaling ontvangen", "betaling_ontvangen"))
            if b["status"] == "geaccepteerd" and app:
                st.caption("Wacht op de betaling van de koper via de app.")
            if (b["status"] == "betaald" or (b["status"] == "geaccepteerd" and b["betaalwijze"] == "contant")) \
                    and b["levering"] not in ("verzenden", "bezorgen"):
                knoppen.append(("Overhandigd", "geleverd"))
            if b["levering"] == "bezorgen" and b["status"] == "betaald":
                stap = {"": ("Klaarmaken", "bereiden"), "bereiden": ("Onderweg", "onderweg"),
                        "onderweg": ("Bezorgd", "bezorgd")}[b.get("bezorg_stap") or ""]
                knoppen.append((stap[0], "bezorg_" + stap[1]))
        kolommen = st.columns(max(len(knoppen), 1))
        for kolom, (label, actie) in zip(kolommen, knoppen):
            if kolom.button(label, key=f"best_{actie}_{b['id']}", width="stretch",
                            type="primary" if actie in ("betalen", "accepteren", "ontvangen") else "secondary"):
                if actie == "betalen":
                    if url := _fout(samen.afrekenen, b["id"]):
                        st.session_state[f"betaallink_{b['id']}"] = url
                elif actie.startswith("bezorg_"):
                    if _fout(samen.bezorging_bijwerken, b["id"], actie[7:]) is not None:
                        _vergeet_nieuw()
                        st.rerun()
                elif actie == "ontvangen":
                    if _fout(samen.ontvangen_bevestigen, b) is not None:
                        _vergeet_nieuw()
                        st.rerun()
                elif _fout(samen.bestelling_stap, b["id"], actie) is not None:
                    _vergeet_nieuw()
                    st.rerun()
        if b["levering"] == "verzenden":
            verzenden_knop(b, koper)
        if url := st.session_state.get(f"betaallink_{b['id']}"):
            st.link_button("Naar de betaalpagina (iDEAL, Apple Pay, kaart)", url, type="primary", width="stretch")
        if koper and b["status"] in ("betaald", "geleverd"):
            with st.popover("Probleem melden"):
                with st.form(f"probleem_{b['id']}", border=False):
                    reden = st.text_area("Wat is er mis?", placeholder="Bijv. niet ontvangen")
                    if st.form_submit_button("Melden") and reden.strip():
                        if _fout(samen.bestelling_stap, b["id"], "probleem", reden.strip()) is not None:
                            st.success("Gemeld. Het geld blijft vastgehouden tot de beheerder heeft besloten.")
        if koper and b["status"] == "afgerond" and not b["beoordeeld"]:
            # Reviews maken de winkelstraat eerlijk; daarom staat dit open en niet achter een knop.
            with st.form(f"beoordeel_{b['id']}", border=False):
                st.markdown(f"**Hoe was je aankoop bij {b['ander']}?**")
                sterren_ = st.feedback("stars")
                tekst = st.text_input("Toelichting (optioneel)", placeholder="Alleen de verkoper leest dit")
                if st.form_submit_button("Beoordeling geven", type="primary"):
                    if sterren_ is None:
                        st.error("Kies eerst het aantal sterren.")
                    elif _fout(samen.beoordelen, b["id"], sterren_ + 1, tekst.strip()) is not None:
                        _vergeet_nieuw()
                        st.toast("Bedankt voor je beoordeling.")
                        st.rerun()


def bezorg_regel(b: dict) -> None:
    """Wat er in de bestelling zit en, bij bezorgen, waar het heen gaat en hoe ver het is."""
    if len(b.get("regels") or []) > 1:
        st.caption(" · ".join(f"{r['aantal']}× {r['titel']}" for r in b["regels"]))
    if b["levering"] != "bezorgen":
        return
    delen = [b.get("bezorg_adres") or ""]
    if b["status"] == "betaald":
        delen.append(samen.BEZORG_STAP.get(b.get("bezorg_stap") or "", ""))
        if b.get("bezorgen_van") and b.get("bezorgen_tot"):
            delen.append(f"verwacht {_moment(b['bezorgen_van'], b['bezorgen_tot'])}")
    st.caption(" · ".join(filter(None, delen)))


def _moment(van: str, tot: str) -> str:
    v, t = datetime.fromisoformat(van).astimezone(), datetime.fromisoformat(tot).astimezone()
    return f"{samen.tijd_tekst(van)}-{t.strftime('%H:%M')}" if v.date() == t.date() else samen.tijd_tekst(van)


def verzenden_regel(b: dict) -> None:
    """Track en trace en het verwachte bezorgmoment, met een knop om het pakket te volgen."""
    if b["levering"] != "verzenden" or not (b.get("track_code") or b.get("bezorgen_van")):
        return
    delen = [samen.VERVOERDERS.get(b.get("vervoerder") or "", ""), b.get("track_code") or ""]
    if b.get("bezorgen_van"):
        delen.append(f"verwacht {_moment(b['bezorgen_van'], b['bezorgen_tot'])}")
    with st.container(horizontal=True, vertical_alignment="center"):
        st.caption(" · ".join(filter(None, delen)))
        if link := samen.volg_link(b):
            st.link_button("Volgen", link, icon=":material/local_shipping:", type="tertiary")


def verzenden_knop(b: dict, koper: bool) -> None:
    """Verkoper: verzenden met track en trace. Koper: het bezorgmoment invullen zodra de vervoerder het noemt."""
    if b["status"] not in ("betaald", "geleverd") and (koper or b["status"] != "geaccepteerd"
                                                       or b["betaalwijze"] != "contant"):
        return
    titel = ("Bezorgmoment" if koper else "Verzenden" if b["status"] != "geleverd" else "Verzending aanpassen")
    with st.popover(titel, icon=":material/local_shipping:", width="stretch"):
        with st.form(f"verzend_{b['id']}", border=False):
            vervoerder, code = "", ""
            if not koper:
                vervoerders = list(samen.VERVOERDERS)
                vervoerder = st.selectbox("Vervoerder", vervoerders, format_func=samen.VERVOERDERS.get,
                                          index=vervoerders.index(b["vervoerder"]) if b.get("vervoerder") in vervoerders else 0)
                code = st.text_input("Track-en-tracecode", value=b.get("track_code") or "", max_chars=300,
                                     placeholder="Of de link")
            bekend = st.toggle("Bezorgmoment bekend", value=koper or bool(b.get("bezorgen_van")))
            oud = datetime.fromisoformat(b["bezorgen_van"]).astimezone() if b.get("bezorgen_van") else None
            oud_tot = datetime.fromisoformat(b["bezorgen_tot"]).astimezone() if b.get("bezorgen_tot") else None
            dag = st.date_input("Dag", value=oud.date() if oud else date.today() + timedelta(days=1),
                                min_value=date.today() - timedelta(days=1), format="DD-MM-YYYY")
            k1, k2 = st.columns(2)
            van = k1.time_input("Van", value=oud.time() if oud else datetime.strptime("09:00", "%H:%M").time(), step=900)
            tot = k2.time_input("Tot", value=oud_tot.time() if oud_tot else datetime.strptime("17:00", "%H:%M").time(),
                                step=900)
            if st.form_submit_button("Opslaan" if koper or b["status"] == "geleverd" else "Verzonden", type="primary"):
                begin, einde = (datetime.combine(dag, van), datetime.combine(dag, tot)) if bekend else (None, None)
                if (code.strip() or begin) and _fout(samen.verzending, b["id"], vervoerder, code.strip(), begin,
                                                     einde) is None:
                    return
                if not koper and b["status"] != "geleverd":
                    _fout(samen.bestelling_stap, b["id"], "geleverd")
                _vergeet_nieuw()
                st.rerun()


def boekingen() -> None:
    lijst = samen.mijn_boekingen()
    if not lijst:
        st.caption("Je hebt geen boekingen. Zoek een privétraining, les of dienst bij Zoeken.")
        return
    in_agenda = {(a["titel"], a["start"]) for a in opslag.afspraken_tussen(date.today().isoformat(), "9999-12-31")}
    for b in lijst:
        with st.container(border=True):
            rol = "Je hebt geboekt bij" if b["rol"] == "klant" else "Geboekt door"
            st.markdown(f"**{b['titel']}** · {samen.tijd_tekst(b['start'])} · {b['minuten']} min  \n{rol} **{b['met']}**"
                        + (f" · :material/location_on: {b['plaats']}" if b["plaats"] else "") + (f"  \n:gray[{b['opmerking']}]" if b["opmerking"] else ""))
            kol1, kol2 = st.columns(2)
            start = datetime.fromisoformat(b["start"]).astimezone().strftime("%Y-%m-%dT%H:%M")
            if (b["titel"], start) not in in_agenda and kol1.button("In mijn agenda", key=f"ag_{b['id']}", width="stretch"):
                samen.in_agenda_zetten(b)
                st.rerun()
            if kol2.button("Annuleren", key=f"ann_{b['id']}", width="stretch"):
                samen.boeking_annuleren(b["id"])
                st.toast("Geannuleerd. Laat de ander even weten waarom via 💬 Berichten.", icon="ℹ️")
                st.rerun()


def berichten() -> None:
    gesprekken = samen.gesprekken()
    if not gesprekken:
        st.caption("Nog geen berichten.")
        return
    sleutels = [(g["aanbod_id"], g["ander_id"]) for g in gesprekken]
    namen = {(g["aanbod_id"], g["ander_id"]): f"{g['ander']} · {g['titel']}" + (f" · {g['ongelezen']} nieuw" if g["ongelezen"] else "")
             for g in gesprekken}
    if opslag.namens("berichten") != "vragen" and any(g["ongelezen"] for g in gesprekken):
        if st.button("Laat de assistent nieuwe berichten beantwoorden", width="stretch"):
            st.session_state.vooraf_vraag = ("Bekijk mijn nieuwe berichten op de marktplaats. Beantwoord namens mij wat "
                                             "je mag beantwoorden en vertel kort wat je hebt gedaan en wat ik zelf moet beslissen.")
            st.session_state.vooraf_label = "Nieuwe berichten beantwoorden"
            st.session_state.ga_naar = "assistent"
            st.rerun(scope="app")
    gekozen = st.selectbox("Gesprek", sleutels, format_func=namen.get, label_visibility="collapsed")
    gesprek = gesprekken[sleutels.index(gekozen)]
    for b in gesprek["berichten"][-30:]:
        with st.chat_message("user" if b["van_mij"] else "assistant", avatar="🙂" if b["van_mij"] else "👤"):
            st.markdown(b["tekst"])
            st.caption(datetime.fromisoformat(b["aangemaakt"]).astimezone().strftime("%d-%m %H:%M"))
            if not b["van_mij"] and samen.VERDACHT.search(b["tekst"]):
                st.warning("Let op: betaal nooit via een link, rekeningnummer of telefoonnummer uit een bericht. "
                           "Betaal via de app, dan ben je beschermd.", icon="⚠️")
    if gesprek["ongelezen"]:
        samen.gelezen(gesprek["aanbod_id"], gesprek["ander_id"])
        _vergeet_nieuw()
    with st.form("antwoord", clear_on_submit=True, border=False):
        kol1, kol2 = st.columns([5, 1], vertical_alignment="bottom")
        tekst = kol1.text_input("Antwoord", label_visibility="collapsed", placeholder=f"Bericht aan {gesprek['ander']}")
        if kol2.form_submit_button("➤") and tekst.strip():
            if _fout(samen.bericht_sturen, gesprek["aanbod_id"], tekst.strip(), gesprek["ander_id"]) is not None:
                st.rerun()


# --- Webshop -------------------------------------------------------------------------

def winkel_link(adres: str) -> str:
    """Het vaste adres van een winkel, op basis van het adres van de app zelf."""
    from urllib.parse import urlsplit

    deel = urlsplit(st.context.url or "")
    basis = f"{deel.scheme}://{deel.netloc}" if deel.netloc else samen.betalen_status().get("app_adres", "").rstrip("/")
    return f"{basis}/?winkel={adres}"


def winkel_code(naam: str) -> str:
    """Een vaste code voor de winkel, gemaakt uit de naam (alleen intern, voor de deellink)."""
    import unicodedata

    t = unicodedata.normalize("NFKD", naam).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:24].strip("-")
    return t if len(t) >= 3 else (t + "-winkel").strip("-")


def winkel_opslaan(adres: str, naam: str, *rest) -> bool:
    """Slaat de winkel op. Een nieuwe winkel krijgt vanzelf een code uit de naam; is die bezet, dan met een nummer."""
    if adres:
        return _fout(samen.winkel_instellen, adres, naam, *rest) is not None
    if not naam.strip():
        st.error("Geef je winkel een naam.")
        return False
    basis = winkel_code(naam)
    for poging in [basis] + [f"{basis}-{i}" for i in range(2, 10)] + [f"{basis}-{secrets.token_hex(3)}"]:
        try:
            samen.winkel_instellen(poging, naam, *rest)
            return True
        except samen.Fout as fout:
            if "in gebruik" not in str(fout):
                st.error(str(fout))
                return False
    st.error("Dit lukte niet. Probeer een andere naam.")
    return False


def mijn_webshop(inkopen=None) -> None:
    """Pagina 🏬 Mijn webshop: winkel instellen, producten en voorraad, en delen."""
    m = samen.mijn_winkel()
    if m["niveau"] not in ("verkoper", "ondernemer"):
        st.info("Een eigen webshop kan met accounttype 'Privé, verkoopt vaak' of 'Bedrijf of zzp'. Kies dat gratis bij "
                "Instellingen › Account › Accounttype.")
        return
    w = m["winkel"]
    if w:
        delen = ["Winkel", "Inkopen", "Reserveren", "Marketing", "Reviews"] if inkopen else \
            ["Winkel", "Reserveren", "Marketing", "Reviews"]
        deel = st.segmented_control("Onderdeel", delen, default="Winkel",
                                    key="webshop_deel", label_visibility="collapsed") or "Winkel"
        if deel == "Inkopen":
            inkopen()
            return
        if deel == "Reserveren":
            plannen_scherm.zaak_beheer()
            return
        if deel == "Marketing":
            marketing(w)
            return
        if deel == "Reviews":
            winkel_reviews()
            return
    st.caption(f"Je eigen winkel in de app, die je kunt delen. Klanten betalen veilig via de app en "
               f"betalen niets extra. Per verkoop betaal je {m['commissie_procent']:g}% commissie (minimaal "
               f"{samen.euro(m['commissie_min'])}), inclusief betaalkosten. Geen abonnement.")
    if not m["kan_betalen"]:
        st.warning("Om je winkel te openen, meld je je eerst aan om betalingen via de app te ontvangen "
                   "(Verkopen › 💳).")
    if w and w["open"]:
        st.success("Je winkel is open.")
        kort.deel_blok("winkel", w["adres"], w["naam"], "winkel")
        if st.button("Bekijken", icon=":material/storefront:"):
            naar_winkel(w["adres"])
        v = m["verkopen"]
        c1, c2 = st.columns(2)
        c1.metric("Verkocht via de webshop", f"{v['aantal']}×", samen.euro(v["omzet"]), delta_color="off")
        c2.metric("Commissie betaald", samen.euro(v["commissie"]))

    with st.expander("Winkel instellen" if w else "Winkel aanmaken", expanded=not w):
        w = w or {}
        with st.form("winkel", border=False):
            naam = st.text_input("Naam van je winkel", value=w.get("naam", ""), max_chars=60)
            omschrijving = st.text_area("Over je winkel", value=w.get("omschrijving", ""), height=90)
            kleur = st.color_picker("Kleur", value=w.get("kleur", "#2563eb"))
            k1, k2 = st.columns(2)
            verzend = k1.number_input("Verzendkosten (€)", 0.0, 100.0, float(w.get("verzendkosten") or 0), 0.5)
            gratis = k2.number_input("Gratis verzenden vanaf (€, 0 = nooit)", 0.0, 10000.0,
                                     float(w.get("gratis_vanaf") or 0), 5.0)
            retour = st.text_area("Verzenden en retour", value=w.get("retour", ""), height=70,
                                  placeholder="Bijv. verzending met PostNL")
            open_ = st.toggle("Winkel open", value=bool(w.get("open")))
            if st.form_submit_button("Opslaan", type="primary"):
                if winkel_opslaan(w.get("adres", ""), naam, omschrijving, kleur, verzend, gratis or None, retour,
                                  open_):
                    st.rerun()
    if not w:
        return
    with st.expander("Op de winkelkaart" + (f" ({w['winkeladres']})" if w.get("winkeladres") else "")):
        st.caption("Heb je een echte winkel, werkplaats of praktijk waar klanten mogen komen? Vul het adres in; dan "
                   "staat je winkel met voorrang op de winkelkaart. Alleen online? Laat het leeg. Vul geen woonadres "
                   "in als je daar geen klanten wilt ontvangen: iedereen kan het zien.")
        with st.form("vestiging", border=False):
            plek = st.text_input("Adres van je winkel", value=w.get("winkeladres", ""), max_chars=200,
                                 placeholder="Straat en huisnummer, plaats")
            if st.form_submit_button("Opslaan"):
                if not plek.strip():
                    if _fout(samen.winkel_vestiging, "", None, None) is not None:
                        st.rerun()
                else:
                    try:
                        lat, lon, _ = winkelkaart.plek(plek.strip())
                    except Exception:
                        st.error("Dit adres kan ik niet op de kaart vinden. Controleer straat, huisnummer en plaats.")
                    else:
                        if _fout(samen.winkel_vestiging, plek.strip(), lat, lon) is not None:
                            st.rerun()

    bezorgen_instellen(w, m["niveau"])
    st.markdown("**Producten in je winkel**")
    producten = [p for p in m["producten"] if not p["geblokkeerd"] and (p["actief"] or p["voorraad"] is not None)]
    if not producten:
        st.caption("Nog geen producten.")
    for p in producten:
        with st.container(border=True):
            st.markdown(f"**{p['titel']}** · {samen.euro(p['prijs'])}" + (" · 🏬 in de winkel" if p["in_winkel"] else ""))
            with st.form(f"wp_{p['id']}", border=False):
                k1, k2, k3 = st.columns([2, 2, 1], vertical_alignment="bottom")
                in_winkel = k1.toggle("In de winkel", value=p["in_winkel"])
                voorraad = k2.number_input("Voorraad (leeg = 1 stuk)", 0, 100000, value=p["voorraad"], step=1,
                                           placeholder="1 stuk")
                if k3.form_submit_button("Opslaan"):
                    if _fout(samen.winkel_product, p["id"], in_winkel, voorraad) is not None:
                        st.toast("Opgeslagen.", icon="✅")
                        st.rerun()


def marketing(w: dict) -> None:
    """Hulpmiddelen om klanten te trekken: cijfers, actiebalk, kortingscodes, nieuws voor volgers, bezoekcodes,
    posts laten schrijven en een poster met QR-code."""
    m = _fout(samen.mijn_marketing)
    if m is None:
        return
    link = winkel_link(w["adres"])
    k1, k2, k3 = st.columns(3)
    k1.metric("Bezoeken winkelpagina", m["bezoeken"])
    k2.metric("Volgers", m["volgers"])
    k3.metric("Verkocht (30 dagen)", m["verkopen_30d"]["aantal"], samen.euro(m["verkopen_30d"]["omzet"]),
              delta_color="off")

    with st.expander("Laat de assistent een post of tekst schrijven"):
        st.caption("Voor Instagram, Facebook, je WhatsApp-status, een nieuwsbrief of een flyer. Jij leest het na en "
                   "plaatst het zelf.")
        with st.form("post_schrijven", border=False):
            kanaal = st.pills("Waarvoor?", ["Instagram", "Facebook", "WhatsApp-status", "Nieuwtje voor volgers", "Flyer"],
                              default="Instagram")
            onderwerp = st.text_input("Waar gaat het over?", placeholder="Bijv. 10% korting")
            if st.form_submit_button("Schrijf het", type="primary") and onderwerp.strip():
                st.session_state.marketing_tekst = (kanaal or "Instagram", onderwerp.strip())
        if gevraagd := st.session_state.get("marketing_tekst"):
            post_schrijven(w, link, *gevraagd)

    with st.expander("Actiebalk bovenaan je winkel" + (" (aan)" if m["actie"] else "")):
        with st.form("actie", border=False):
            tekst = st.text_input("Tekst", value=m["actie"], max_chars=140,
                                  placeholder="Bijv. 10% korting")
            tot = st.date_input("Tot en met (leeg = tot je hem weghaalt)", value=date.fromisoformat(m["actie_tot"]) if m["actie_tot"] else None, format="DD-MM-YYYY")
            if st.form_submit_button("Opslaan"):
                if _fout(samen.winkel_actie, tekst.strip(), tot.isoformat() if tot else None) is not None:
                    st.rerun()

    with st.expander(f"Kortingscodes ({sum(c['actief'] for c in m['codes'])} actief)"):
        st.caption("Deel een code in een post, op een flyer of met vaste klanten. De korting gaat van de producten af "
                   "(niet van de verzendkosten); je commissie wordt berekend over wat de klant echt betaalt.")
        for c in m["codes"]:
            k1, k2 = st.columns([4, 1], vertical_alignment="center")
            korting = f"{c['procent']}%" if c["procent"] else samen.euro(c["bedrag"])
            regels = [f"**{c['code']}** · {korting} korting", f"{c['gebruikt']}× gebruikt"]
            if c["minimum"]:
                regels.append(f"vanaf {samen.euro(c['minimum'])}")
            if c["max_gebruik"]:
                regels.append(f"max {c['max_gebruik']}×")
            if c["geldig_tot"]:
                regels.append(f"t/m {c['geldig_tot']}")
            k1.markdown(" · ".join(regels) + ("" if c["actief"] else " · :gray[uit]"))
            if k2.button("Uit" if c["actief"] else "Aan", key=f"code_{c['id']}"):
                if _fout(samen.kortingscode_opslaan, code_id=c["id"], actief=not c["actief"]) is not None:
                    st.rerun()
        with st.form("nieuwe_code", clear_on_submit=True, border=False):
            k1, k2 = st.columns(2)
            code = k1.text_input("Code", max_chars=20, placeholder="WELKOM10")
            soort = k2.radio("Soort korting", ["Procent", "Bedrag"], horizontal=True)
            k1, k2 = st.columns(2)
            waarde = k1.number_input("Korting (% of €)", 1.0, 1000.0, 10.0, 1.0)
            minimum = k2.number_input("Vanaf bestelbedrag (€)", 0.0, 10000.0, 0.0, 5.0)
            k1, k2 = st.columns(2)
            tot = k1.date_input("Geldig t/m (optioneel)", value=None, format="DD-MM-YYYY")
            maximaal = k2.number_input("Hoe vaak te gebruiken (leeg = onbeperkt)", 1, 100000, value=None)
            if st.form_submit_button("Code maken"):
                if _fout(samen.kortingscode_opslaan, code.strip(),
                         int(waarde) if soort == "Procent" else None, waarde if soort == "Bedrag" else None,
                         minimum, tot.isoformat() if tot else None, maximaal) is not None:
                    st.rerun()

    with st.expander(f"Nieuwtje voor je volgers ({m['volgers']})"):
        st.caption("Volgers zien je nieuwtjes in de app bij Winkels. Eén nieuwtje per dag, zodat niemand wordt "
                   "overspoeld.")
        with st.form("nieuwtje", clear_on_submit=True, border=False):
            tekst = st.text_area("Nieuwtje", max_chars=500, height=80,
                                 placeholder="Bijv. nieuwe collectie binnen")
            if st.form_submit_button("Delen met volgers", type="primary") and tekst.strip():
                if _fout(samen.winkel_nieuws_plaatsen, tekst.strip()) is not None:
                    st.toast("Gedeeld met je volgers.", icon="📰")
                    st.rerun()
        for n in m["nieuws"]:
            k1, k2 = st.columns([5, 1], vertical_alignment="center")
            k1.caption(f"{n['datum'][:10]} · {n['tekst']}")
            if k2.button("🗑️", key=f"nieuws_{n['id']}", help="Weghalen"):
                _fout(samen.winkel_nieuws_weg, n["id"])
                st.rerun()

    with st.expander("Bezoekcode voor een review"):
        st.caption("Was er een klant in je winkel of werkplaats? Laat hem deze code scannen; daarna kan hij een review "
                   "schrijven. Elke code werkt één keer en is 14 dagen geldig. Geef de code aan iedere klant, niet "
                   "alleen aan tevreden klanten: zo blijven je reviews geloofwaardig. Bij bestellingen in de app "
                   "kan de klant vanzelf een review geven.")
        st.caption(f"Gemaakt: {m['bezoekcodes']['gemaakt']} · gebruikt: {m['bezoekcodes']['gebruikt']}")
        if st.button("Nieuwe bezoekcode", type="primary"):
            st.session_state.bezoekcode = _fout(samen.bezoekcode_maken)
        if c := st.session_state.get("bezoekcode"):
            bezoek_link = link.split("/?")[0] + f"/?bezoek={c['code']}"
            st.image(_qr(bezoek_link), width=220, caption=f"Code {c['code']}")
            st.code(bezoek_link, language=None)

    with st.expander("Poster voor je etalage of kassa"):
        st.caption("Een A4-poster met een QR-code naar je winkel in de app. Download hem, open hem en print via Delen.")
        st.download_button("Poster downloaden", poster_html(w, link, m["actie"]), file_name=f"poster-{w['adres']}.html",
                           mime="text/html")


def post_schrijven(w: dict, link: str, kanaal: str, onderwerp: str) -> None:
    """Laat Claude een marketingtekst schrijven (met je eigen sleutel of de gratis assistent)."""
    import anthropic

    import slim

    sleutel = toegang.sleutel()
    if not sleutel:
        st.info("De assistent staat nog niet aan. Vul een Anthropic-sleutel in bij Instellingen › Assistent.")
        return
    bewaard = st.session_state.setdefault("marketing_teksten", {})
    sleutel_tekst = f"{kanaal}|{onderwerp}"
    if sleutel_tekst not in bewaard:
        with st.spinner("Even schrijven..."):
            try:
                bewaard[sleutel_tekst] = slim.marketingtekst(toegang.claude(sleutel), w["naam"],
                                                             w["omschrijving"], kanaal, onderwerp, link)
            except slim.Mislukt as fout:
                st.error(str(fout))
                return
            except anthropic.APIError as fout:
                st.error(slim.foutmelding(fout))
                return
    t = bewaard[sleutel_tekst]
    st.markdown(f"**{kanaal}**")
    st.code(t["tekst"], language=None, wrap_lines=True)
    if t.get("hashtags"):
        st.code(" ".join(t["hashtags"]), language=None, wrap_lines=True)
    if t.get("tip"):
        st.caption(f"{t['tip']}")
    k1, k2 = st.columns(2)
    k1.link_button("Via WhatsApp", f"https://wa.me/?text={quote(t['tekst'])}", width="stretch")
    if kanaal == "Nieuwtje voor volgers" and k2.button("Delen met volgers", width="stretch"):
        if _fout(samen.winkel_nieuws_plaatsen, t["tekst"][:500]) is not None:
            st.toast("Gedeeld met je volgers.", icon="📰")
    st.caption("Tik lang op de tekst om te kopiëren, of gebruik het kopieerknopje rechtsboven.")


def poster_html(w: dict, link: str, actie: str) -> str:
    import html as _html

    qr = base64.b64encode(_qr(link)).decode()
    return f"""<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>{_html.escape(w['naam'])}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>@page{{size:A4;margin:0}}body{{margin:0;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111}}
.p{{width:210mm;min-height:297mm;box-sizing:border-box;padding:22mm 18mm;display:flex;flex-direction:column;
align-items:center;text-align:center;border-top:14mm solid {w['kleur']}}}h1{{font-size:44pt;margin:6mm 0 4mm}}
.o{{font-size:16pt;color:#444;max-width:150mm}}.a{{margin-top:8mm;font-size:22pt;font-weight:700;color:{w['kleur']}}}
img{{width:110mm;height:110mm;margin:10mm 0 4mm;image-rendering:pixelated}}.s{{font-size:18pt;font-weight:600}}
.l{{font-size:12pt;color:#666;margin-top:3mm;word-break:break-all}}</style></head><body><div class="p">
<h1>{_html.escape(w['naam'])}</h1><div class="o">{_html.escape(w['omschrijving'][:200])}</div>
{f'<div class="a">{_html.escape(actie)}</div>' if actie else ''}
<img src="data:image/png;base64,{qr}" alt="QR-code"><div class="s">Scan, bestel en betaal veilig in de app</div>
<div class="l">{_html.escape(link)}</div></div></body></html>"""


def winkel_reviews() -> None:
    """De reviews over jouw winkel. Alleen jij leest de tekst; anderen zien de sterren."""
    m = _fout(samen.mijn_marketing)
    if m is None:
        return
    if not m["reviews"]:
        st.caption("Nog geen reviews.")
    gemiddeld = sum(r["sterren"] for r in m["reviews"]) / len(m["reviews"]) if m["reviews"] else None
    if gemiddeld:
        st.markdown(f"{sterren(gemiddeld)} **{gemiddeld:.1f}**".replace(".", ",") + f" uit {len(m['reviews'])} reviews")
    for r in m["reviews"]:
        review_kaart(r)


def bezorgen_instellen(w: dict, niveau: str) -> None:
    """Soort winkel en bezorgen (bijvoorbeeld een restaurant dat eten rondbrengt)."""
    titel = samen.WINKELSOORTEN.get(w.get("soort"), "Winkel") + (" · bezorgt" if w.get("bezorgen") else "")
    with st.expander(f"Soort en bezorgen ({titel})"):
        soorten = [s for s in samen.WINKELSOORTEN if s != "groothandel" or niveau == "ondernemer"
                   or ik().get("id") == 1]
        with st.form("bezorgen", border=False):
            soort = st.segmented_control("Soort", soorten, format_func=samen.WINKELSOORTEN.get,
                                         default=w.get("soort") if w.get("soort") in soorten else "winkel")
            aan = st.toggle("Zelf bezorgen", value=bool(w.get("bezorgen")))
            k1, k2 = st.columns(2)
            km = k1.number_input("Bezorggebied (km)", 0.5, 50.0, float(w.get("bezorg_km") or 5), 0.5)
            kosten = k2.number_input("Bezorgkosten (€)", 0.0, 50.0, float(w.get("bezorgkosten") or 0), 0.5)
            minimum = k1.number_input("Minimale bestelling (€)", 0.0, 1000.0, float(w.get("bezorg_minimum") or 0), 1.0)
            minuten = k2.number_input("Bezorgtijd (min)", 10, 240, int(w.get("bezorg_minuten") or 45), 5)
            tijden = st.toggle("Alleen op vaste tijden", value=bool(w.get("bezorg_van")))
            k3, k4 = st.columns(2)
            van = k3.time_input("Van", value=datetime.strptime(w.get("bezorg_van") or "17:00", "%H:%M").time(), step=900)
            tot = k4.time_input("Tot", value=datetime.strptime(w.get("bezorg_tot") or "21:30", "%H:%M").time(), step=900)
            if st.form_submit_button("Opslaan", type="primary"):
                if _fout(samen.winkel_bezorging, soort or "winkel", aan, km, kosten, minimum, int(minuten),
                         van.strftime("%H:%M") if tijden else None, tot.strftime("%H:%M") if tijden else None) is not None:
                    st.rerun()


def naar_winkel(adres: str) -> None:
    """Opent een winkel in de winkelstraat, binnen de app."""
    st.session_state.open_winkel = adres
    st.session_state.pop("webshop_betalen", None)
    st.session_state.ga_naar = "winkels"
    st.rerun(scope="app")


def winkelstraat() -> None:
    """Pagina 🏬 Winkels: een kaart met alle winkels in de buurt, de winkels uit de app voorop.

    Een winkel uit de app opent hier; je verlaat de app niet.
    """
    if adres := st.session_state.get("open_winkel"):
        if st.button("Alle winkels", icon=":material/arrow_back:", type="tertiary"):
            st.session_state.pop("open_winkel", None)
            st.session_state.pop("webshop_betalen", None)
            st.rerun()
        winkel_pagina(adres, True)
        return
    alle = samen.winkels_zoeken("")
    zoek = zoekveld.zoekveld("winkels_zoek", "Zoek een winkel of product", [
        zoekveld.suggestie(w["naam"], w.get("winkeladres") or "Winkel in de app",
                           zoek=w.get("omschrijving", "")) for w in alle[:200]])
    winkels = sorted(samen.winkels_zoeken(zoek) if zoek else alle, key=lambda w: -samen.score(w.get("vertrouwen")))
    if ik() and (nieuws := (_fout(samen.mijn_winkelnieuws) or {}).get("nieuws")):
        with st.container(border=True):
            st.markdown("**Nieuws van winkels die je volgt**")
            for n in nieuws[:3]:
                k1, k2 = st.columns([4, 1], vertical_alignment="center")
                k1.markdown(f'<span style="color:{n["kleur"]}">●</span> **{n["winkel"]}** · {n["datum"][:10]}  \n'
                            f'{html.escape(n["tekst"])}', unsafe_allow_html=True)
                if k2.button("Bekijk", key=f"nieuws_open_{n['id']}", width="stretch"):
                    st.session_state.open_winkel = n["adres"]
                    st.rerun()
    weergave = st.segmented_control("Weergave", ["Kaart", "Winkels in de app"], default="Kaart",
                                    key="winkels_weergave", label_visibility="collapsed") or "Kaart"
    if weergave == "Kaart":
        winkelkaart_tonen(winkels, zoek)
        return
    if not winkels:
        st.caption("Geen winkels gevonden." if zoek else
                   "Er zijn nog geen winkels. Heb je accounttype 'Privé, verkoopt vaak' of 'Bedrijf of zzp'? Open dan je eigen winkel bij "
                   "Mijn webshop.")
    kolommen = st.columns(2)
    for i, w in enumerate(winkels):
        with kolommen[i % 2].container(border=True):
            st.markdown(f'<div style="border-top:5px solid {w["kleur"]};margin:-4px 0 6px"></div>',
                        unsafe_allow_html=True)
            st.markdown(f"**{w['naam']}**")
            if w["omschrijving"]:
                st.caption(w["omschrijving"][:140] + ("..." if len(w["omschrijving"]) > 140 else ""))
            v = w.get("vertrouwen") or {}
            st.caption(" · ".join(filter(None, [
                f"★ {str(v['sterren']).replace('.', ',')} ({v['beoordelingen']})" if v.get("beoordelingen") else "",
                w["verkoper"], f"{w['producten']} producten", w.get("winkeladres") or "online",
                "zakelijk" if samen.zakelijk(v) else ""])))
            if st.button("Binnenlopen", key=f"open_{w['adres']}", width="stretch"):
                st.session_state.open_winkel = w["adres"]
                st.rerun()


@st.cache_data(ttl=24 * 60 * 60, show_spinner=False)
def _plek(adres: str) -> tuple[float, float, str]:
    return winkelkaart.plek(adres)


@st.cache_data(ttl=6 * 60 * 60, show_spinner=False)
def _osm(lat: float, lon: float, straal: float) -> list[dict]:
    return winkelkaart.osm_winkels(lat, lon, straal)


def _rgb(kleur: str) -> list[int]:
    try:
        return [int(kleur[i:i + 2], 16) for i in (1, 3, 5)]
    except (TypeError, ValueError):
        return [37, 99, 235]


def _km(afstand: float) -> str:
    return f"{round(afstand * 1000, -1):.0f} m" if afstand < 1 else f"{afstand:.1f} km".replace(".", ",")


def winkelkaart_tonen(winkels: list[dict], zoek: str) -> None:
    """Kaart met alle winkels uit OpenStreetMap; winkels met een account bij ons groot, gekleurd en bovenaan."""
    import pydeck as pdk

    k1, k2 = st.columns([3, 2], vertical_alignment="bottom")
    waar = k1.text_input("Waar?", value=opslag.instellingen().get("thuisadres", "") or "Amsterdam centrum",
                         key="winkelkaart_plek", placeholder="Plaats, straat of postcode")
    straal = k2.pills("Straal", [1, 2, 5], default=2, key="winkelkaart_straal", format_func=lambda k: f"{k} km") or 2
    try:
        lat, lon, _ = _plek(waar.strip() or "Amsterdam centrum")
    except Exception:
        st.error("Die plek kan ik niet vinden. Probeer een plaatsnaam of postcode.")
        return
    try:
        with st.spinner("Winkels zoeken..."):
            osm = _osm(round(lat, 4), round(lon, 4), straal)
    except Exception:
        osm = []
        st.caption("De andere winkels kan ik nu even niet ophalen; de winkels uit de app zie je wel.")
    eigen, overig = winkelkaart.samenvoegen(winkels, osm, lat, lon, straal, zoek)

    op_kaart = [w for w in eigen if w.get("lat") is not None]
    lagen = [
        pdk.Layer("ScatterplotLayer", id="andere", pickable=True, get_radius=20, radius_min_pixels=5, radius_max_pixels=8,
                  get_position=["lon", "lat"], get_fill_color=[110, 110, 110, 170],
                  data=[{"naam": w["naam"], "tip": f"{w['soort']} · {_km(w['afstand_km'])}", "lat": w["lat"],
                         "lon": w["lon"]} for w in overig]),
        pdk.Layer("ScatterplotLayer", id="hier", get_radius=25, radius_min_pixels=7, radius_max_pixels=9,
                  get_position=["lon", "lat"],
                  get_fill_color=[30, 136, 229, 230], stroked=True, get_line_color=[255, 255, 255],
                  line_width_min_pixels=3, data=[{"lat": lat, "lon": lon}]),
        pdk.Layer("ScatterplotLayer", id="onze", pickable=True, get_radius=40, radius_min_pixels=11, radius_max_pixels=16,
                  get_position=["lon", "lat"], get_fill_color="kleur", stroked=True, get_line_color=[255, 255, 255],
                  line_width_min_pixels=3,
                  data=[{"naam": "⭐ " + w["naam"], "tip": "In de app · tik om binnen te lopen", "adres": w["adres"],
                         "lat": w["lat"], "lon": w["lon"], "kleur": _rgb(w["kleur"])} for w in op_kaart]),
    ]
    deck = pdk.Deck(layers=lagen, map_style=None, tooltip={"html": "<b>{naam}</b><br/>{tip}"},
                    initial_view_state=pdk.ViewState(latitude=lat, longitude=lon,
                                                     zoom={1: 14.5, 2: 13.5, 5: 12}.get(straal, 13)))
    keuze = st.pydeck_chart(deck, height=420, on_select="rerun", selection_mode="single-object", key="winkelkaart")
    gekozen = ((getattr(keuze, "selection", None) or {}).get("objects") or {}).get("onze") or []
    if gekozen and gekozen[0].get("adres"):
        st.session_state.open_winkel = gekozen[0]["adres"]
        st.rerun()
    st.caption("⭐ Gekleurde stippen: winkels in de app, daar koop je veilig en blijf je in de app. "
               "Grijze stippen: andere winkels (OpenStreetMap).")

    st.markdown(f"**⭐ In de app** ({len(eigen)})")
    if not eigen:
        st.caption("Nog geen winkels in de app hier.")
    for w in eigen[:30]:
        with st.container(border=True):
            k1, k2 = st.columns([3, 1], vertical_alignment="center")
            waar_tekst = (f"{_km(w['afstand_km'])} · {w['winkeladres']}" if w.get("lat") is not None
                          else "Online, bezorgt of laat ophalen")
            k1.markdown(f'<span style="color:{w["kleur"]}">●</span> **{w["naam"]}**', unsafe_allow_html=True)
            k1.caption(f"{waar_tekst} · {w['producten']} producten")
            if k2.button("Binnenlopen", key=f"kaart_open_{w['adres']}", width="stretch", type="primary"):
                st.session_state.open_winkel = w["adres"]
                st.rerun()

    st.markdown(f"**Andere winkels in de buurt** ({len(overig)})")
    if not overig:
        st.caption("Geen andere winkels gevonden binnen deze straal.")
    for w in overig[:40]:
        route = f"https://maps.apple.com/?daddr={w['lat']},{w['lon']}&q={quote(w['naam'])}"
        regel = f"{w['icoon']} **{w['naam']}** · {w['soort']} · {_km(w['afstand_km'])} · [Route]({route})"
        extra = " · ".join(x for x in (w["adres"], w["openingstijden"]) if x)
        st.markdown(regel + (f"  \n:gray[{extra}]" if extra else ""))
    if len(overig) > 40:
        st.caption(f"En nog {len(overig) - 40} winkels. Zoek bovenaan op naam of soort, of kies een kleinere straal.")
    st.caption("Kaartgegevens © OpenStreetMap-bijdragers.")


def winkel_pagina(adres: str, ingelogd: bool) -> None:
    """De winkel zoals klanten hem zien. Bekijken kan iedereen; bestellen met een (gratis) account."""
    try:
        w = samen.winkel_bekijken(adres)
    except samen.Fout as fout:
        st.error(str(fout))
        return
    kleur = w["kleur"]
    st.markdown(f'<div style="border-top:6px solid {kleur};padding-top:6px"></div>', unsafe_allow_html=True)
    st.title(w["naam"])
    if w.get("actie"):
        st.info(w["actie"], icon="📣")
    if w["omschrijving"]:
        st.write(w["omschrijving"])
    st.caption(f"Winkel van {w['verkoper']} · {samen.vertrouwen_tekst(w.get('vertrouwen'))}"
               + (f" · :material/location_on: {w['winkeladres']}" if w.get("winkeladres") else ""))
    # Elke winkelpagina telt één keer per sessie als bezoek (voor de verkoper zijn cijfers).
    geteld = st.session_state.setdefault("winkels_geteld", set())
    if adres not in geteld:
        geteld.add(adres)
        try:
            samen.winkel_bezocht(adres)
        except Exception:
            pass
    reviews = samen.reviews_bekijken(adres)
    if ingelogd and w.get("verkoper_id") != ik().get("id"):
        volgt = adres in (samen.mijn_winkelnieuws().get("volgt") or [])
        if st.button("Je volgt deze winkel" if volgt else "Volgen: nieuws en acties in de app",
                     key=f"volg_{adres}", type="secondary" if volgt else "primary"):
            if _fout(samen.winkel_volgen, adres, not volgt) is not None:
                st.rerun()
    if bedrijf := samen.zakelijk(w.get("vertrouwen")):
        gegevens = " · ".join(x for x in (bedrijf.get("naam"), f"KvK {bedrijf['kvk']}" if bedrijf.get("kvk") else "",
                                          f"btw {bedrijf['btw']}" if bedrijf.get("btw") else "", bedrijf.get("adres")) if x)
        st.caption((gegevens + ". " if gegevens else "") + "Je hebt 14 dagen bedenktijd.")
    else:
        st.caption("Je koopt bij een particuliere verkoper.")
    verzend = (f"Verzenden {samen.euro(w['verzendkosten'])}" if w["verzendkosten"] else "Gratis verzenden") + (
        f", gratis vanaf {samen.euro(w['gratis_vanaf'])}" if w["verzendkosten"] and w.get("gratis_vanaf") else "")
    st.caption(f"{verzend} · Betalen via de app: je geld gaat pas naar de verkoper als jij bevestigt dat alles "
               "goed is ontvangen.")
    if w["retour"]:
        with st.expander("Verzenden en retour"):
            st.write(w["retour"])
    if not w["kan_betalen"]:
        st.warning("Bestellen kan op dit moment even niet. Probeer het later opnieuw.")

    if betalen := st.session_state.get("webshop_betalen"):
        st.success(f"Bestelling geplaatst: {samen.euro(betalen[1])}. Rond je betaling af.")
        st.link_button("Nu betalen (iDEAL, Apple Pay, kaart)", betalen[2], type="primary", width="stretch")

    if not w["producten"]:
        st.caption("Er staat nog niets in deze winkel.")
    kolommen = st.columns(2)
    for i, p in enumerate(w["producten"]):
        with kolommen[i % 2].container(border=True):
            st.markdown(f"**{p['titel']}**  \n{samen.euro(p['prijs'])}")
            if p["omschrijving"]:
                st.caption(p["omschrijving"][:300] + ("..." if len(p["omschrijving"]) > 300 else ""))
            if p["uitverkocht"]:
                st.caption("Uitverkocht")
                continue
            if p["voorraad"] is not None and p["voorraad"] <= 5:
                st.caption(f"Nog {p['voorraad']} op voorraad")
            if not ingelogd:
                st.caption("Log hieronder in om te bestellen.")
                continue
            if not w["kan_betalen"]:
                continue
            if st.button("In mandje", key=f"wp_mand_{p['id']}", width="stretch", icon=":material/add_shopping_cart:"):
                if _fout(winkelen.in_mandje, adres, w["naam"], p) is not None:
                    st.toast(f"{p['titel']} in je mandje")
    if ingelogd and (winkelen.mandje().get(adres) or {}).get("regels"):
        if st.button("Naar je mandje en afrekenen", type="primary", width="stretch", icon=":material/shopping_bag:"):
            st.session_state.winkelen_winkel = adres
            st.session_state.ga_naar = "winkelen"
            st.rerun(scope="app")
    reviews_blok(w, adres, reviews, ingelogd)


def sterren(aantal: float | None) -> str:
    if not aantal:
        return "☆☆☆☆☆"
    heel = int(round(aantal))
    return "★" * heel + "☆" * (5 - heel)


def reviews_blok(w: dict, adres: str, reviews: dict, ingelogd: bool) -> None:
    """Reviews van echte klanten (na een aankoop of een bevestigd bezoek), met reactie van de verkoper."""
    st.markdown(f"**Reviews** · {sterren(reviews.get('sterren'))} "
                + (f"{str(reviews['sterren']).replace('.', ',')} uit {reviews['aantal']}" if reviews.get("aantal")
                   else "nog geen reviews"))
    st.caption("Alleen echte klanten beoordelen. De tekst leest alleen de verkoper.")
    if ingelogd:
        for bezoek in [b for b in (_fout(samen.mijn_bezoeken) or []) if b["adres"] == adres]:
            with st.container(border=True):
                st.markdown("**Hoe was je bezoek?**")
                with st.form(f"review_{bezoek['id']}", border=False):
                    keuze = st.feedback("stars")
                    tekst = st.text_area("Wat ging goed, wat kan beter? (optioneel)", max_chars=500, height=80,
                                         placeholder="Alleen de verkoper leest dit")
                    if st.form_submit_button("Review plaatsen", type="primary"):
                        if keuze is None:
                            st.error("Kies eerst het aantal sterren.")
                        elif _fout(samen.winkel_beoordelen, bezoek["id"], keuze + 1, tekst.strip()) is not None:
                            st.toast("Bedankt voor je review!", icon="⭐")
                            st.rerun()


def review_kaart(r: dict) -> None:
    """Een review voor de verkoper, met melden als iets niet klopt."""
    with st.container(border=True):
        st.markdown(f"{sterren(r['sterren'])} **{r['door']}** · "
                    f"{'aankoop' if r['soort'] == 'aankoop' else 'bezoek'} · {r['datum'][:10]}")
        if r["tekst"]:
            st.write(r["tekst"])
        if r.get("antwoord"):
            st.caption(f"Reactie van de winkel: {r['antwoord']}")
        with st.popover("Melden"):
            with st.form(f"meld_{r['soort']}_{r['id']}", border=False, clear_on_submit=True):
                reden = st.text_area("Wat klopt er niet? (bijvoorbeeld beledigend of niet over deze winkel)")
                if st.form_submit_button("Melden") and reden.strip():
                    if _fout(samen.review_melden, r["soort"], r["id"], reden.strip()) is not None:
                        st.success("Gemeld. De beheerder kijkt ernaar.")


# --- Account en beheer ---------------------------------------------------------------

FOTO_ZICHTBAAR = {"contacten": "Mijn contacten", "iedereen": "Iedereen", "niemand": "Niemand"}


def _foto_klein(bestand) -> str:
    """Vierkant bijsnijden en verkleinen tot 128 bij 128, als jpeg (een paar kB)."""
    import base64
    import io

    from PIL import Image, ImageOps
    beeld = ImageOps.exif_transpose(Image.open(bestand)).convert("RGB")
    beeld = ImageOps.fit(beeld, (128, 128))
    uit = io.BytesIO()
    beeld.save(uit, "JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(uit.getvalue()).decode()


def profielfoto_instellingen(gebruiker: dict) -> None:
    with st.expander("Profielfoto"):
        foto = opslag.profielfoto(gebruiker["id"]) if gebruiker.get("heeft_foto") else None
        if foto:
            st.image(foto, width=96)
        nieuw = st.file_uploader("Foto kiezen", type=["jpg", "jpeg", "png", "webp"], key="profielfoto_kiezen",
                                 label_visibility="collapsed")
        if nieuw is not None and st.session_state.get("profielfoto_klaar") != nieuw.file_id:
            try:
                klein = _foto_klein(nieuw)
            except Exception:
                st.error("Deze foto kan de app niet lezen. Kies een andere.")
            else:
                if fout := opslag.profielfoto_instellen(klein):
                    st.error(fout)
                else:
                    st.session_state.profielfoto_klaar = nieuw.file_id
                    _gebruiker_verversen()
                    st.rerun()
        huidig = gebruiker.get("foto_zichtbaar") or "contacten"
        wie = st.segmented_control("Wie ziet je foto", list(FOTO_ZICHTBAAR), default=huidig, format_func=FOTO_ZICHTBAAR.get,
                                   key="profielfoto_wie")
        if wie and wie != huidig:
            opslag.profielfoto_instellen(None, wie)
            _gebruiker_verversen()
            st.rerun()
        if foto and st.button("Foto weghalen", type="tertiary", icon=":material/delete:"):
            opslag.profielfoto_instellen("")
            _gebruiker_verversen()
            st.rerun()


def telefoon_instellingen(gebruiker: dict) -> None:
    """Inloggen met je nummer en, als je wilt, vindbaar zijn voor mensen die je nummer al hebben."""
    eind = gebruiker.get("telefoon_eind")
    with st.expander("Telefoonnummer" + (f" (eindigt op {eind})" if eind else "")):
        st.caption("Log in met je nummer in plaats van je gebruikersnaam. Je nummer wordt versleuteld bewaard; "
                   "niemand kan het zien, ook wij niet.")
        if eind:
            vindbaar = st.toggle("Mensen die mijn nummer hebben, kunnen mij in de chat vinden",
                                 value=bool(gebruiker.get("telefoon_vindbaar")), key="tel_vindbaar")
            if vindbaar != bool(gebruiker.get("telefoon_vindbaar")):
                opslag.telefoon_instellen("-", vindbaar)
                _gebruiker_verversen()
                st.rerun()
        with st.form("telefoon", clear_on_submit=True, border=False):
            nummer = st.text_input("Nieuw nummer" if eind else "Telefoonnummer", placeholder="06 12345678",
                                   autocomplete="tel")
            vindbaar_nieuw = False if eind else st.checkbox(
                "Mensen die mijn nummer hebben, kunnen mij in de chat vinden")
            if st.form_submit_button("Bewaren") and nummer.strip():
                if fout := opslag.telefoon_instellen(nummer, vindbaar_nieuw or bool(gebruiker.get("telefoon_vindbaar"))):
                    st.error(fout)
                else:
                    _gebruiker_verversen()
                    st.rerun()
        if eind and st.button("Nummer weghalen", type="tertiary", icon=":material/delete:"):
            opslag.telefoon_instellen("", False)
            _gebruiker_verversen()
            st.rerun()


def _gebruiker_verversen() -> None:
    st.session_state.ik = opslag.inloggen(st.session_state.get("naam", ""), st.session_state.wachtwoord) or {}


def account_instellingen() -> None:
    """Profiel, voorwaarden, gegevens downloaden en account verwijderen."""
    gebruiker = ik()
    if samen.beschikbaar() and not gebruiker.get("email"):
        st.warning("Vul je mailadres in bij Mijn account. Zonder mailadres kun je niet kopen of verkopen.")
    with st.expander("Mijn account" + (f" (@{gebruiker['naam']})" if gebruiker.get("naam") else "")):
        if not samen.beschikbaar():
            st.caption("Accounts werken alleen in de online versie.")
        else:
            with st.form("profiel", border=False):
                naam = st.text_input("Gebruikersnaam", value=gebruiker.get("naam") or "")
                weergave = st.text_input("Naam die anderen zien", value=gebruiker.get("weergavenaam") or "")
                email = st.text_input("Mailadres (anderen zien dit niet)", value=gebruiker.get("email") or "",
                                      autocomplete="email")
                nieuw = st.text_input("Nieuw wachtwoord (leeg laten = niet wijzigen)", type="password",
                                      autocomplete="new-password")
                if st.form_submit_button("Opslaan"):
                    nieuwe_naam = naam.strip().lower().lstrip("@")
                    if email.strip().lower() != (gebruiker.get("email") or "") and (fout := opslag.email_instellen(email)):
                        st.error(fout)
                    elif fout := opslag.profiel_bijwerken(nieuwe_naam or None, weergave.strip(), nieuw or None):
                        st.error(fout)
                    else:
                        # De eigenaar mag met een lege naam blijven inloggen; wie met zijn mailadres inlogde ook.
                        if st.session_state.get("naam") and "@" not in st.session_state.naam:
                            st.session_state.naam = nieuwe_naam or st.session_state.naam
                        if nieuw and not opslag.is_sessie(st.session_state.wachtwoord):
                            st.session_state.wachtwoord = nieuw
                        opslag.gebruik_account(st.session_state.get("naam", ""), st.session_state.wachtwoord)
                        st.session_state.ik = opslag.inloggen(st.session_state.get("naam", ""),
                                                              st.session_state.wachtwoord)
                        st.success("Opgeslagen.")
    if samen.beschikbaar():
        profielfoto_instellingen(gebruiker)
        telefoon_instellingen(gebruiker)
    if samen.beschikbaar():
        niveau = gebruiker.get("niveau") or "particulier"
        with st.expander(f"Accounttype: {samen.NIVEAUS[niveau][0]}"):
            accounttype(gebruiker)
    with st.expander("Voorwaarden en privacy"):
        st.markdown(teksten.voorwaarden())
        st.divider()
        st.markdown(teksten.privacy())
    with st.expander("Mijn gegevens downloaden"):
        st.caption("Alles wat je in de app hebt gezet, als bestand. Wachtwoorden en sleutels zitten er niet in.")
        st.download_button("Download mijn gegevens", opslag.export(), file_name="mijn-gegevens.json",
                           mime="application/json")
    if samen.beschikbaar() and not gebruiker.get("beheerder"):
        with st.expander("Account verwijderen"):
            st.warning("Al je gegevens worden gewist en je aanbod gaat offline. Dit kan niet ongedaan worden gemaakt.")
            zeker = st.checkbox("Ja, ik weet het zeker")
            if st.button("Account definitief verwijderen", disabled=not zeker):
                try:
                    if toegang.status(vers=True).get("abonnementen"):
                        toegang.stoppen()  # eerst je opslagabonnement stoppen, zodat er niets meer wordt afgeschreven
                except toegang.Fout as fout:
                    st.error(f"Je abonnement kon niet worden gestopt: {fout}")
                    st.stop()
                try:
                    bestanden.opruimen(alles=True)  # en je bestanden echt uit de opslag
                except toegang.Fout:
                    pass  # wat blijft staan, ruimt de dagelijkse opruimronde niet meer op; daarom eerst hier
                if opslag.account_verwijderen():
                    st.session_state.clear()
                    st.session_state.verwijderd = True
                    st.rerun()
                st.error("Dat lukte niet. Probeer het opnieuw.")
    if gebruiker.get("beheerder") and samen.beschikbaar():
        beheer()


def accounttype(gebruiker: dict) -> None:
    """Particulier, verkoper of ondernemer. Alle basisfuncties zijn voor iedereen hetzelfde."""
    huidig = gebruiker.get("niveau") or "particulier"
    keuze = st.radio("Accounttype", list(samen.NIVEAUS), index=list(samen.NIVEAUS).index(huidig),
                     format_func=lambda n: samen.NIVEAUS[n][0], key="niveau_keuze", horizontal=True,
                     label_visibility="collapsed")
    st.caption(samen.NIVEAUS[keuze][1])
    bedrijf = None
    if keuze == "ondernemer":
        oud = gebruiker.get("bedrijf") or {}
        kol1, kol2 = st.columns(2)
        bedrijf = {
            "naam": kol1.text_input("Bedrijfsnaam", value=oud.get("naam", "")),
            "kvk": kol2.text_input("KvK-nummer", value=oud.get("kvk", ""), max_chars=8),
            "btw": kol1.text_input("Btw-nummer (leeg bij KOR)", value=oud.get("btw") or "", placeholder="NL123456789B01"),
            "website": kol2.text_input("Website (optioneel)", value=oud.get("website", "")),
            "adres": st.text_input("Vestigingsadres", value=oud.get("adres", ""),
                                   help="Kopers hebben recht om te weten waar je bedrijf zit."),
        }
        bedrijf["btw_tarief"] = str(st.segmented_control("Btw-tarief op je facturen", [21, 9, 0],
                                                         default=oud.get("btw_tarief", 21), key="btw_tarief_keuze")
                                    or 21)
        bedrijf["retour"] = st.text_input("Retourvoorwaarden (kort)", value=oud.get("retour", ""),
                                          placeholder="Bijv. 14 dagen bedenktijd")
        st.caption("Je bedrijfsnaam en KvK-nummer staan bij je aanbod en op je facturen. Kopers hebben bij online "
                   "kopen van een bedrijf 14 dagen bedenktijd; zorg dat je je daaraan houdt.")
    if st.button("Opslaan", key="niveau_opslaan", type="primary") and (keuze != huidig or bedrijf):
        if _fout(samen.niveau_instellen, keuze, bedrijf) is not None:
            st.session_state.ik = opslag.inloggen(st.session_state.get("naam", ""), st.session_state.wachtwoord)
            _vergeet_nieuw()
            st.toast(f"Accounttype: {samen.NIVEAUS[keuze][0]}.", icon="✅")
            st.rerun()


def verkoopoverzicht() -> None:
    """Pagina 📊 Verkoopoverzicht voor verkopers en ondernemers."""
    o = samen.verkoop_overzicht()
    ondernemer = ik().get("niveau") == "ondernemer"
    deze_maand = date.today().strftime("%Y-%m")
    nu = next((m for m in o["maanden"] if m["maand"] == deze_maand), {"omzet": 0, "aantal": 0})
    kol1, kol2, kol3 = st.columns(3)
    kol1.metric("Omzet deze maand", samen.euro(nu["omzet"]), f"{nu['aantal']} verkocht", delta_color="off")
    kol2.metric("Open bestellingen", o["open"])
    kol3.metric("Aanbod online", f"{o['actief_aanbod']} / {o['max_aanbod']}")
    if v := samen.vertrouwen_tekst(o["beoordeling"]):
        st.caption(v)
    if o["maanden"]:
        st.markdown("**Omzet per maand**")
        st.bar_chart({m["maand"]: float(m["omzet"]) for m in o["maanden"]}, y_label="€", height=220)
    if o["top"]:
        st.markdown("**Best verkocht**")
        for t in o["top"]:
            st.markdown(f"{t['titel']} · {t['aantal']}× · {samen.euro(t['omzet'])}")
    if not o["maanden"] and not o["open"]:
        st.caption("Nog niets verkocht.")
    if not ondernemer:
        st.caption("Ben je een bedrijf of zzp'er? Kies 'Bedrijf of zzp (KvK)' bij Instellingen › Account voor facturen en een "
                   "klantenoverzicht.")
        return
    bedrijf = ik().get("bedrijf") or {}
    with st.expander(f"Klanten ({len(o['klanten'])})"):
        for k in o["klanten"]:
            st.markdown(f"**{k['naam']}** · {k['aantal']}× · {samen.euro(k['totaal'])} · laatst "
                        f"{datetime.fromisoformat(k['laatst']).astimezone():%d-%m-%Y}")
        if not o["klanten"]:
            st.caption("Nog geen klanten.")
    with st.expander(f"Facturen ({len(o['facturen'])})"):
        for f in o["facturen"]:
            kol1, kol2 = st.columns([4, 1], vertical_alignment="center")
            kol1.markdown(f"{factuurnummer(f)} · {f['titel']} · {samen.euro(f['bedrag'])} · {f['klant']}")
            kol2.download_button("⬇️", factuur_html(f, bedrijf), file_name=f"factuur-{factuurnummer(f)}.html",
                                 mime="text/html", key=f"factuur_{f['id']}", help="Factuur downloaden")
        if not o["facturen"]:
            st.caption("Facturen verschijnen hier zodra een bestelling betaald is.")
        st.caption("Open de factuur en kies Deel › Afdrukken › Bewaar als pdf om hem als pdf te versturen.")


def factuurnummer(f: dict) -> str:
    return f"{f['datum'][:4]}-{f['id']:05d}"


def factuur_html(f: dict, bedrijf: dict) -> str:
    """Eenvoudige factuur als webpagina (af te drukken als pdf)."""
    from html import escape

    tarief = int(bedrijf.get("btw_tarief") or 21)
    kor = not bedrijf.get("btw")
    totaal = float(f["bedrag"])
    excl = totaal if kor else totaal / (1 + tarief / 100)
    btw = 0 if kor else totaal - excl
    datum = datetime.fromisoformat(f["datum"]).astimezone().strftime("%d-%m-%Y")
    regels_btw = ("<tr><td>Btw</td><td>Vrijgesteld (kleineondernemersregeling)</td></tr>" if kor else
                  f"<tr><td>Bedrag excl. btw</td><td>{samen.euro(excl)}</td></tr>"
                  f"<tr><td>Btw {tarief}%</td><td>{samen.euro(btw)}</td></tr>")
    return f"""<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Factuur {factuurnummer(f)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{{font-family:system-ui,sans-serif;max-width:640px;margin:32px auto;padding:0 16px;color:#222}}
h1{{font-size:24px}}table{{width:100%;border-collapse:collapse;margin-top:16px}}td{{padding:6px 0;border-bottom:1px solid #ddd}}
td:last-child{{text-align:right}}.totaal td{{font-weight:700;border-bottom:2px solid #222}}small{{color:#666}}</style></head>
<body><h1>Factuur</h1>
<p><b>{escape(bedrijf.get('naam', ''))}</b><br>{escape(bedrijf.get('adres', ''))}<br>KvK {escape(bedrijf.get('kvk', ''))}
{('<br>Btw ' + escape(bedrijf['btw'])) if bedrijf.get('btw') else ''}</p>
<p>Factuurnummer: <b>{factuurnummer(f)}</b><br>Datum: {datum}<br>Aan: {escape(f['klant'])}</p>
<table><tr><td>{escape(f['titel'])}</td><td>{samen.euro(totaal)}</td></tr>{regels_btw}
<tr class="totaal"><td>Totaal</td><td>{samen.euro(totaal)}</td></tr></table>
<p><small>Betaald via {escape(samen.BETAALWIJZEN.get(f['betaalwijze'], f['betaalwijze']))}. Gemaakt met Mijn assistent.</small></p>
</body></html>"""


def _qr(tekst: str) -> bytes:
    import io

    import qrcode

    uit = io.BytesIO()
    qrcode.make(tekst, box_size=6, border=2).save(uit)
    return uit.getvalue()


def beveiliging() -> None:
    """Tweestapsverificatie, Face ID via Safari, apparaten en recente inlogs."""
    if not opslag.is_sessie(st.session_state.get("wachtwoord", "")):
        st.info("Log één keer uit en weer in om de nieuwe beveiliging te gebruiken.")
        return
    if herstelcodes_tonen():
        return
    b = opslag.beveiliging()
    st.markdown("**Tweestapsverificatie** " + ("staat aan" if b["twee_stap"] else "· staat uit"))
    if not b["twee_stap"]:
        twee_stap_aanzetten()
    else:
        st.caption(f"Bij inloggen vraagt de app je wachtwoord én een code uit je app. "
                   f"Je hebt nog {b['herstelcodes_over']} herstelcodes voor als je telefoon kwijt is.")
        with st.popover("Uitzetten"):
            with st.form("twee_stap_uit", border=False):
                ww = st.text_input("Je wachtwoord", type="password", autocomplete="current-password")
                code = st.text_input("Code uit je app of een herstelcode", autocomplete="one-time-code")
                if st.form_submit_button("Tweestapsverificatie uitzetten"):
                    if fout := opslag.twee_stap_uitzetten(ww, code.strip()).get("fout"):
                        st.error(fout)
                    else:
                        st.rerun()

    face_id()

    st.markdown("**Ingelogd op**")
    for sessie in b["sessies"]:
        laatst = datetime.fromisoformat(sessie["laatst"]).astimezone().strftime("%d-%m %H:%M")
        st.markdown(f"{'📍 ' if sessie['deze'] else ''}{sessie['apparaat'] or 'onbekend'} · laatst {laatst}"
                    + (" · :green[dit apparaat]" if sessie["deze"] else ""))
    apparaten = opslag.mijn_apparaten()
    if (len(b["sessies"]) > 1 or apparaten) and st.button("Op alle andere apparaten uitloggen"):
        opslag.overal_uitloggen()
        if st.session_state.get("apparaat_token"):
            # Dit apparaat blijft onthouden: het krijgt een nieuwe sleutel.
            nieuw = opslag.apparaat_onthouden(st.session_state.get("apparaat_naam", ""))
            st.session_state.apparaat_token = st.session_state.apparaat_bewaar = nieuw
        st.toast("Andere apparaten zijn uitgelogd.", icon="🔐")
        st.rerun()
    if apparaten:
        st.markdown("**Ingelogd blijven op**")
        for a in apparaten:
            laatst = datetime.fromisoformat(a["laatst"]).astimezone().strftime("%d-%m %H:%M")
            kol1, kol2 = st.columns([4, 1], vertical_alignment="center")
            kol1.markdown(f"{a['naam'] or 'onbekend'} · laatst {laatst}")
            if kol2.button("Vergeten", key=f"apparaat_weg_{a['id']}"):
                opslag.apparaat_intrekken(a["id"])
                st.rerun()
        st.caption("Op deze apparaten hoef je niet in te loggen, en kan Siri de app openen. Vergeet je een apparaat, "
                   "dan moet je daar weer inloggen.")
    if b["inlogs"]:
        with st.expander("Recente inlogpogingen"):
            for i in b["inlogs"]:
                tijd = datetime.fromisoformat(i["tijd"]).astimezone().strftime("%d-%m %H:%M")
                reden = {"wachtwoord": "fout wachtwoord", "code": "foute code", "sleutel": "Face ID geweigerd"}.get(i["reden"], "")
                st.markdown(f"{'✅' if i['gelukt'] else '❌'} {tijd} · {i['apparaat'] or 'onbekend'}"
                            + (f" · :red[{reden}]" if reden else ""))
            st.caption("Zie je iets wat jij niet was? Kies een nieuw wachtwoord bij Mijn account; andere "
                       "apparaten worden dan uitgelogd.")


def face_id() -> None:
    """Toegangssleutels: inloggen met Face ID of Touch ID, zonder wachtwoord."""
    import toegangssleutel
    st.markdown("**Inloggen met Face ID**")
    sleutels = toegangssleutel.mijn()
    for s in sleutels:
        laatst = datetime.fromisoformat(s["laatst"]).astimezone().strftime("%d-%m %H:%M") if s.get("laatst") else "nog niet"
        kol1, kol2 = st.columns([4, 1], vertical_alignment="center")
        kol1.markdown(f"{s['naam'] or 'Toegangssleutel'} · gebruikt {laatst}")
        if kol2.button("Weg", key=f"ts_weg_{s['id']}"):
            toegangssleutel.weg(s["id"])
            st.rerun()
    uitkomst = toegangssleutel.instellen(st.session_state.get("apparaat_naam", ""),
                                        label="Nog een toestel" if sleutels else "Face ID instellen")
    if uitkomst == "ok":
        st.toast("Face ID staat aan.", icon=":material/check:")
        st.rerun()
    elif uitkomst:
        st.error(uitkomst)
    if not sleutels:
        st.caption("Veiliger dan een wachtwoord, en werkt alleen in deze app.")


def herstelcodes_tonen() -> bool:
    """Eenmalig, direct na het aanzetten."""
    if codes := st.session_state.get("herstelcodes"):
        st.success("Tweestapsverificatie staat aan.")
        st.markdown("**Bewaar deze herstelcodes** (bijvoorbeeld in Notities of op papier). Elke code werkt één keer, "
                    "voor als je telefoon kwijt is. Je ziet ze maar één keer.")
        st.code("\n".join(codes), language=None)
        st.download_button("Herstelcodes downloaden", "\n".join(codes), file_name="herstelcodes-assistent.txt")
        if st.button("Ik heb ze bewaard", type="primary"):
            st.session_state.pop("herstelcodes")
            st.rerun()
        return True
    return False


def twee_stap_aanzetten() -> None:
    st.caption("Extra slot op je account: naast je wachtwoord is een code van 6 cijfers nodig, die elke 30 seconden "
               "verandert. Zelfs met je wachtwoord komt een hacker er dan niet in.")
    geheim = st.session_state.get("totp_geheim")
    if not geheim:
        if st.button("Tweestapsverificatie aanzetten", type="primary"):
            antwoord = opslag.twee_stap_starten()
            if fout := antwoord.get("fout"):
                st.error(fout)
            else:
                st.session_state.totp_geheim = antwoord["geheim"]
                st.rerun()
        return
    sleutel = base64.b32encode(bytes.fromhex(geheim)).decode().rstrip("=")
    account = ik().get("naam") or ik().get("email") or "eigenaar"
    uri = f"otpauth://totp/Mijn%20assistent:{quote(account)}?secret={sleutel}&issuer=Mijn%20assistent"
    st.markdown("**1.** Voeg de code toe aan je app voor verificatiecodes:")
    st.link_button("Toevoegen aan Wachtwoorden (op deze iPhone of iPad)", uri, width="stretch")
    st.caption("Of scan de QR-code met je authenticator-app:")
    st.image(_qr(uri), width=180)
    st.caption(f"Of typ de sleutel over: `{' '.join(sleutel[i:i + 4] for i in range(0, len(sleutel), 4))}`")
    with st.form("twee_stap_bevestigen", border=False):
        code = st.text_input("**2.** Typ de code van 6 cijfers die je app nu laat zien", autocomplete="one-time-code",
                             max_chars=7)
        if st.form_submit_button("Bevestigen en aanzetten", type="primary") and code.strip():
            antwoord = opslag.twee_stap_bevestigen(code.strip())
            if fout := antwoord.get("fout"):
                st.error(fout)
            else:
                st.session_state.pop("totp_geheim")
                st.session_state.herstelcodes = antwoord["herstelcodes"]
                st.rerun()
    if st.button("Annuleren"):
        st.session_state.pop("totp_geheim")
        st.rerun()


def betalen_instellen() -> None:
    """Stripe koppelen: alleen de eigenaar. De sleutels gaan naar de database, nooit in de code."""
    status = samen.betalen_status()
    with st.expander("Betalen via de app (Stripe)" + (" (aan)" if status.get("aan") else " (nog instellen)")):
        if status.get("aan"):
            st.caption(("Testmodus: er wordt nog niet echt betaald. " if status.get("testmodus") else "")
                       + f"Kopersbescherming: {samen.euro(status['kosten_vast'])} + {status['kosten_procent']:g}% "
                       "per bestelling, betaald door de koper.")
        else:
            st.caption("Volg de stappen die Claude je gaf. Plak hieronder de geheime sleutel en het webhookgeheim uit "
                       "Stripe. Ze worden veilig in de database bewaard.")
        with st.form("stripe", border=False):
            sleutel = st.text_input("Geheime sleutel (sk_...)", type="password",
                                    placeholder="ingesteld" if status.get("sleutel_ingesteld") else "")
            webhook = st.text_input("Webhookgeheim (whsec_...)", type="password",
                                    placeholder="ingesteld" if status.get("webhook_ingesteld") else "")
            adres = st.text_input("Adres van de app", value=status.get("app_adres") or "",
                                  placeholder="https://....streamlit.app")
            if st.form_submit_button("Opslaan"):
                if _fout(samen.platform_instellen, "".join(sleutel.split()), "".join(webhook.split()),
                         adres.strip()) is not None:
                    st.success("Opgeslagen.")


def geschillen_afhandelen() -> None:
    for g in samen.geschillen():
        with st.container(border=True):
            st.markdown(f"**{g['titel']}** · {samen.euro(g['bedrag'])} · {samen.BETAALWIJZEN[g['betaalwijze']]}  \n"
                        f"Koper {g['koper']}, verkoper {g['verkoper']}: {g['reden']}")
            for m in (g.get("berichten") or [])[-6:]:
                st.caption(f"{m['van']}: {m['tekst']}")
            kol1, kol2 = st.columns(2)
            if kol1.button("Geld terug naar koper", key=f"gk_{g['id']}", width="stretch"):
                if _fout(samen.geschil_besluiten, g, "koper") is not None:
                    st.rerun()
            if kol2.button("Uitbetalen aan verkoper", key=f"gv_{g['id']}", width="stretch"):
                if _fout(samen.geschil_besluiten, g, "verkoper") is not None:
                    st.rerun()


def mail_instellen() -> None:
    """Alleen de eigenaar: mail via Brevo, voor herstelcodes. De sleutel gaat naar de database, nooit in de code."""
    import toegangssleutel
    aan = toegangssleutel.mail_ingesteld()
    with st.expander("Mail voor herstelcodes" + (" (aan)" if aan else " (nog instellen)")):
        with st.form("mail_platform", border=False):
            sleutel = st.text_input("API-sleutel van Brevo", type="password", placeholder="ingesteld" if aan else "xkeysib-...")
            afzender = st.text_input("Afzender", placeholder="Bijv. sanne@voorbeeld.nl")
            if st.form_submit_button("Opslaan") and afzender.strip():
                if fout := toegangssleutel.mail_instellen(sleutel.strip(), afzender.strip()).get("fout"):
                    st.error(fout)
                else:
                    st.rerun()


def beheer() -> None:
    betalen_instellen()
    mail_instellen()
    gegevens = samen.beheer()
    meldingen = gegevens.get("meldingen", [])
    with st.expander(f"Beheer ({len(meldingen)} meldingen)" if meldingen else "Beheer"):
        geschillen_afhandelen()
        st.caption(f"{gegevens.get('gebruikers', 0)} gebruikers · {gegevens.get('aanbod', 0)} keer aanbod online")
        if not meldingen:
            st.caption("Geen open meldingen.")
        for m in meldingen:
            a = m["aanbod"]
            with st.container(border=True):
                st.markdown(f"**{a['titel']}** van {a['aanbieder']}  \nGemeld door {m['door']}: {m['reden']}")
                if a["omschrijving"]:
                    st.caption(a["omschrijving"][:300])
                kol1, kol2, kol3 = st.columns(3)
                if kol1.button("Is in orde", key=f"ok_{m['id']}", width="stretch"):
                    samen.melding_afhandelen(m["id"])
                    st.rerun()
                if kol2.button("Offline halen", key=f"off_{m['id']}", width="stretch"):
                    samen.melding_afhandelen(m["id"], aanbod_blokkeren=True)
                    st.rerun()
                if kol3.button("Aanbieder blokkeren", key=f"blok_{m['id']}", width="stretch"):
                    samen.melding_afhandelen(m["id"], aanbod_blokkeren=True, aanbieder_blokkeren=True)
                    st.rerun()
        for m in ruimte.beheer_meldingen():
            with st.container(border=True):
                st.markdown(f"**{m['titel']}** van {m['maker']}" + (" (verborgen)" if m["verborgen"] else "")
                            + f"  \nGemeld: {m['reden']}")
                kol1, kol2, kol3 = st.columns(3)
                if kol1.button("Bekijken", key=f"rk_{m['id']}", width="stretch"):
                    st.session_state.open_ruimte = m["ruimte_id"]
                    st.session_state.ga_naar = "ruimtes"
                    st.rerun(scope="app")
                if kol2.button("Is in orde", key=f"rok_{m['id']}", width="stretch"):
                    ruimte.beheer_afhandelen(m["ruimte_id"], False)
                    st.rerun()
                if kol3.button("Verbergen", key=f"roff_{m['id']}", width="stretch"):
                    ruimte.beheer_afhandelen(m["ruimte_id"], True)
                    st.rerun()
        plannen_scherm.beheer_aanvragen()
        for r in samen.beheer_reviews():
            with st.container(border=True):
                st.markdown(f"Review van {r['door']} over **{r['over']}** ({r['sterren']} sterren)  \n"
                            f"{r['tekst'] or '(geen tekst)'}  \nGemeld: {r['gemeld']}")
                st.caption("Verberg alleen als de review de regels breekt (beledigend, persoonsgegevens, niet over deze "
                           "winkel of nep). Kritiek op zich is toegestaan.")
                kol1, kol2 = st.columns(2)
                if kol1.button("Is in orde", key=f"vok_{r['soort']}_{r['id']}", width="stretch"):
                    samen.beheer_review_afhandelen(r["soort"], r["id"], False)
                    st.rerun()
                if kol2.button("Verbergen", key=f"voff_{r['soort']}_{r['id']}", width="stretch"):
                    samen.beheer_review_afhandelen(r["soort"], r["id"], True)
                    st.rerun()
