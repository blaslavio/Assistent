"""Schermen voor samen: delen, projecten, de marktplaats, je account en beheer."""

import base64
import time
from datetime import date, datetime, timedelta
from urllib.parse import quote

import streamlit as st

import opslag
import samen
import teksten


def ik() -> dict:
    return st.session_state.get("ik") or {}


def _fout(functie, *args, **kwargs):
    """Voert een actie uit en toont een nette melding als het niet lukt. Geeft het resultaat of None."""
    try:
        return functie(*args, **kwargs)
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
        naam = kol1.text_input("Gebruikersnaam", placeholder="bijvoorbeeld blaslavio")
        weergave = kol2.text_input("Je naam zoals anderen hem zien", placeholder="bijvoorbeeld Blaslavio")
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
    keuzes = ["📥 Voor jou", "📁 Projecten", "📤 Delen"]
    if st.session_state.get("samen_deel") not in keuzes:
        st.session_state.samen_deel = keuzes[0] if gedeeld else keuzes[1]
    keuze = st.segmented_control("Samen", keuzes, key="samen_deel", label_visibility="collapsed")
    if keuze == "📥 Voor jou":
        voor_jou(gedeeld)
    elif keuze == "📤 Delen":
        iets_delen()
    else:
        projecten()


def _gedeeld_tekst(item: dict) -> str:
    inhoud = item["inhoud"]
    if item["soort"] == "afspraak":
        start = inhoud.get("start", "")
        wanneer = f"{start[8:10]}-{start[5:7]} {start[11:16]}".strip() if start else ""
        return f"**{inhoud.get('titel', '')}** · {wanneer}" + (f" · 📍 {inhoud['locatie']}" if inhoud.get("locatie") else "")
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
            if kol1.button("✅ Overnemen", key=f"neem_{item['id']}", type="primary", width="stretch"):
                plek = samen.gedeeld_aannemen(item)
                _vergeet_nieuw()
                st.toast(f"Staat nu in {plek}.", icon="✅")
                st.rerun()
            if kol2.button("✖️ Nee, bedankt", key=f"weiger_{item['id']}", width="stretch"):
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
        if st.form_submit_button("📤 Delen", type="primary"):
            if not inhoud:
                st.error("Kies eerst wat je wilt delen.")
            elif not aan.strip():
                st.error("Vul de gebruikersnaam in van wie het moet krijgen.")
            elif ontvanger := _fout(samen.delen, aan, soort, inhoud):
                st.success(f"Gedeeld met {ontvanger}. Die ziet het bij Samen › Voor jou.")


def projecten() -> None:
    lijst = samen.projecten()
    with st.popover("➕ Nieuw project", width="stretch" if not lijst else "content"):
        with st.form("nieuw_project", clear_on_submit=True, border=False):
            titel = st.text_input("Naam van het project", placeholder="Bijv. verhuizing, scriptiegroep, teamuitje")
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
    namen = {p["id"]: f"📁 {p['naam']}" + (f" · {p['open']} open" if p["open"] else "") for p in lijst}
    gekozen = st.selectbox("Project", ids, format_func=namen.get, key="project_keuze", label_visibility="collapsed")
    project_kaart(next(p for p in lijst if p["id"] == gekozen))


def project_kaart(project: dict) -> None:
    leden = project.get("leden") or []
    if project["omschrijving"]:
        st.caption(project["omschrijving"])
    st.caption("👥 " + ", ".join(lid["weergavenaam"] for lid in leden))
    items = samen.items(project["id"])
    for item in items:
        kol1, kol2 = st.columns([8, 1], vertical_alignment="center")
        extra = " · ".join(x for x in [item["datum"][:16].replace("T", " "),
                                       f"👤 {item['toegewezen_aan']}" if item["toegewezen_aan"] else ""] if x)
        if item["soort"] in ("taak", "afspraak"):
            label = f"{'📅 ' if item['soort'] == 'afspraak' else ''}{item['titel']}" + (f"  \n:gray[{extra}]" if extra else "")
            klaar = kol1.checkbox(f"~~{item['titel']}~~" if item["klaar"] else label, value=item["klaar"],
                                  key=f"pi_{item['id']}")
            if klaar != item["klaar"]:
                samen.item_bijwerken(item["id"], klaar=klaar)
                st.rerun()
        elif item["soort"] == "link":
            kol1.markdown(f"🔗 [{item['titel']}]({item['inhoud']})" if item["inhoud"].startswith("http")
                          else f"🔗 {item['titel']} {item['inhoud']}")
        else:
            kol1.markdown(f"📝 **{item['titel']}**  \n{item['inhoud']}")
        if item["soort"] != "link" and item["inhoud"] and item["soort"] != "notitie":
            kol1.caption(item["inhoud"])
        if kol2.button("✕", key=f"pi_weg_{item['id']}", help="Weghalen"):
            samen.item_bijwerken(item["id"], verwijderd=True)
            st.rerun()
    if not items:
        st.caption("Nog leeg. Zet hieronder de eerste taak of notitie erin.")

    with st.form(f"item_{project['id']}", clear_on_submit=True):
        soort = st.pills("Soort", list(samen.SOORTEN_ITEM), default="taak", format_func=samen.SOORTEN_ITEM.get) or "taak"
        titel = st.text_input("Titel", placeholder="Bijv. dozen regelen")
        inhoud = st.text_input("Toelichting of link (optioneel)")
        kol1, kol2 = st.columns(2)
        datum = kol1.date_input("Datum (optioneel)", value=None, format="DD-MM-YYYY")
        namen = [lid["naam"] for lid in leden if lid.get("naam")]
        wie = kol2.selectbox("Wie doet het", ["", *namen], format_func=lambda n: f"@{n}" if n else "Iedereen")
        if st.form_submit_button("➕ Toevoegen") and titel.strip():
            if _fout(samen.item_toevoegen, project["id"], soort, titel.strip(), inhoud.strip(),
                     datum.isoformat() if datum else "", wie) is not None:
                st.rerun()

    with st.expander("👥 Iemand toevoegen of het project verlaten"):
        with st.form(f"lid_{project['id']}", clear_on_submit=True, border=False):
            kol1, kol2 = st.columns([3, 1], vertical_alignment="bottom")
            naam = kol1.text_input("Gebruikersnaam", placeholder="@gebruikersnaam")
            if kol2.form_submit_button("Toevoegen") and naam.strip():
                if lid := _fout(samen.lid_toevoegen, project["id"], naam):
                    st.toast(f"{lid} doet nu mee.", icon="👥")
                    st.rerun()
        if st.button("🚪 Project verlaten", key=f"verlaat_{project['id']}"):
            samen.project_verlaten(project["id"])
            st.session_state.pop("project_keuze", None)
            st.rerun()


# --- Marktplaats ------------------------------------------------------------------

def veilig_handelen() -> None:
    with st.expander("🛡️ Veilig kopen, verkopen en boeken"):
        st.markdown(samen.VEILIG)
        st.caption("De koop of boeking sluit je met de ander af. Zie de voorwaarden bij Instellingen › Account.")


def markt_zoeken() -> None:
    """Pagina 🔎 Zoeken: onze eigen marktplaats, met verwijzingen naar andere marktplaatsen."""
    zoeken()
    veilig_handelen()


def markt_bestellingen() -> None:
    """Pagina 🧾 Bestellingen: wat je koopt en verkoopt, en je geboekte tijden."""
    bestellingen()
    if samen.mijn_boekingen():
        st.markdown("**📅 Boekingen**")
        boekingen()
    veilig_handelen()


def zoeken() -> None:
    with st.form("markt_zoeken", border=False):
        kol1, kol2 = st.columns([4, 1], vertical_alignment="bottom")
        zoekterm = kol1.text_input("Zoeken", placeholder="Bijv. fiets, bijles wiskunde, personal trainer Utrecht",
                                   label_visibility="collapsed", value=st.session_state.get("markt_zoekterm", ""))
        kol2.form_submit_button("🔎", width="stretch")
    st.session_state.markt_zoekterm = zoekterm
    soort = st.pills("Soort", list(samen.SOORTEN_AANBOD), format_func=samen.SOORTEN_AANBOD.get,
                     label_visibility="collapsed", key="markt_soort") or ""
    resultaten = samen.aanbod_zoeken(zoekterm, soort)
    if not resultaten:
        st.caption("Nog niets gevonden op onze marktplaats." + (" Kijk hieronder ook bij de andere marktplaatsen."
                                                               if zoekterm else " Wees de eerste: kies Kopen en verkopen › Verkopen."))
    for aanbod in resultaten:
        aanbod_kaart(aanbod)
    with st.expander("🌐 Ook kijken op andere marktplaatsen", expanded=bool(zoekterm) and not resultaten):
        for m in samen.externe_links(zoekterm):
            st.markdown(f"[{m['naam']}]({m['link']}) · :gray[{m['voor']}]")
        st.caption("Dit zijn gewone links; je gaat naar de website van die marktplaats.")


def aanbod_kaart(aanbod: dict) -> None:
    with st.container(border=True):
        st.markdown(f"**{aanbod['titel']}**  \n{samen.SOORTEN_AANBOD[aanbod['soort']]} · **{samen.prijs_tekst(aanbod)}**"
                    + (f" · 📍 {aanbod['plaats']}" if aanbod["plaats"] else ""))
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
        with kolommen[0].popover("🛒 Kopen" if aanbod["soort"] == "product" else "🛒 Bestellen", width="stretch"):
            bestel_formulier(aanbod)
        if aanbod["soort"] in ("training", "les", "dienst") and aanbod["vrije_tijden"]:
            with kolommen[1].popover(f"📅 Tijd kiezen ({aanbod['vrije_tijden']})", width="stretch"):
                tijden_boeken(aanbod)
        kolommen = st.columns(2)
        with kolommen[0].popover("💬 Bericht", width="stretch"):
            with st.form(f"vraag_{aanbod['id']}", clear_on_submit=True, border=False):
                tekst = st.text_area("Je bericht", placeholder="Is dit nog beschikbaar?", height=80)
                if st.form_submit_button("Versturen", type="primary") and tekst.strip():
                    if _fout(samen.bericht_sturen, aanbod["id"], tekst.strip()) is not None:
                        st.success("Verstuurd. Het antwoord zie je bij 💬 Berichten.")
        with kolommen[1].popover("🚩 Melden", width="stretch"):
            with st.form(f"meld_{aanbod['id']}", clear_on_submit=True, border=False):
                reden = st.text_area("Wat klopt er niet?", height=80)
                if st.form_submit_button("Melden") and reden.strip():
                    samen.melden(aanbod["id"], reden.strip())
                    st.success("Bedankt, de beheerder kijkt ernaar.")


def bestel_formulier(aanbod: dict) -> None:
    wijzen = aanbod.get("betaalwijzen") or ["tikkie"]
    with st.form(f"bestel_{aanbod['id']}", border=False):
        betaal = st.radio("Hoe wil je betalen?", wijzen, format_func=samen.BETAALWIJZEN.get)
        levering = st.radio("Hoe krijg je het?", aanbod.get("levering") or ["ophalen"], format_func=samen.LEVERING.get)
        bericht = st.text_input("Bericht aan de verkoper (optioneel)", placeholder="Bijv. wanneer kan ik het ophalen?")
        if "app" in wijzen:
            st.caption(f"💳 Via de app: {samen.prijs_tekst(aanbod)} plus kopersbescherming. Je geld gaat pas naar de "
                       "verkoper als jij bevestigt dat alles goed is ontvangen.")
        if st.form_submit_button("Bestelling versturen", type="primary"):
            if _fout(samen.bestellen, aanbod["id"], betaal, levering, bericht.strip()) is not None:
                _vergeet_nieuw()
                st.success("Verstuurd. De verkoper moet je bestelling eerst accepteren; je ziet het bij 🧾 Bestellingen.")


def tijden_boeken(aanbod: dict) -> None:
    tijden = [t for t in samen.tijden(aanbod["id"]) if t["vrij"]]
    if not tijden:
        st.caption("Er zijn geen vrije tijden meer.")
        return
    opmerking = st.text_input("Opmerking (optioneel)", key=f"opm_{aanbod['id']}",
                              placeholder="Bijv. eerste keer, graag rustig opbouwen")
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
        st.markdown("**💳 Betalingen via de app ontvangen**")
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
            st.link_button("➡️ Ga naar Stripe", url, width="stretch")


def aanbieden() -> None:
    status = _fout(samen.betalen_status) or {}
    verkoper_aanmelden(status)
    wijzen = [w for w in samen.BETAALWIJZEN if w != "app" or status.get("ik_kan_ontvangen")]
    with st.expander("➕ Iets nieuws aanbieden", expanded=not st.session_state.get("markt_heeft_aanbod")):
        with st.form("aanbod_nieuw", clear_on_submit=True, border=False):
            soort = st.pills("Wat bied je aan?", list(samen.SOORTEN_AANBOD), default="product",
                             format_func=samen.SOORTEN_AANBOD.get) or "product"
            titel = st.text_input("Titel", placeholder="Bijv. Racefiets maat 56, of Personal training in het park")
            omschrijving = st.text_area("Omschrijving", height=100,
                                        placeholder="Staat, wat je krijgt, voor wie het geschikt is, hoe lang een les duurt.")
            kol1, kol2 = st.columns(2)
            prijs = kol1.number_input("Prijs in euro (leeg = in overleg)", min_value=0.0, value=None, step=5.0)
            per = kol2.selectbox("Per", ["", "per stuk", "per uur", "per les", "per maand", "per persoon"],
                                 format_func=lambda p: p or "Totaal")
            plaats = st.text_input("Plaats", placeholder="Bijv. Rotterdam, of Online")
            contact = st.text_input("Contact (optioneel, iedereen ziet dit)",
                                    placeholder="Laat leeg om alleen via berichten in de app contact te hebben")
            betaal = st.pills("Hoe kan de koper betalen?", wijzen, selection_mode="multi",
                              default=["app"] if "app" in wijzen else ["tikkie", "contant"],
                              format_func=samen.BETAALWIJZEN.get)
            levering = st.pills("Hoe komt het bij de koper?", list(samen.LEVERING), selection_mode="multi",
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
    with st.popover("➕ Tijden toevoegen"):
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
    lijst = samen.mijn_bestellingen()
    if not lijst:
        st.caption("Nog geen bestellingen. Bij 🔎 Zoeken tik je op 🛒 Kopen of 🛒 Bestellen.")
        return
    for b in lijst:
        bestelling_kaart(b)


def bestelling_kaart(b: dict) -> None:
    koper = b["rol"] == "koper"
    app = b["betaalwijze"] == "app"
    with st.container(border=True):
        bedrag = samen.euro(b["bedrag"]) + (f" + {samen.euro(b['kosten'])} kopersbescherming" if app and koper else "")
        st.markdown(f"**{b['titel']}** · {bedrag}  \n{samen.STATUS[b['status']]} · "
                    f"{'van' if koper else 'voor'} **{b['ander']}** · {samen.BETAALWIJZEN[b['betaalwijze']]} · "
                    f"{samen.LEVERING[b['levering']]}")
        if v := samen.vertrouwen_tekst(b.get("vertrouwen_ander")):
            st.caption(v)
        if app and b["status"] in ("betaald", "geleverd"):
            st.caption("🛡️ Het geld staat veilig bij Stripe en gaat naar de verkoper zodra de koper bevestigt dat alles "
                       "goed is ontvangen.")
        knoppen = []
        if koper:
            if b["status"] == "geaccepteerd" and app:
                knoppen.append(("💳 Betalen", "betalen"))
            if b["status"] in ("aangevraagd", "geaccepteerd"):
                knoppen.append(("Annuleren", "annuleren"))
            if b["status"] in ("betaald", "geleverd"):
                knoppen.append(("✅ Alles goed ontvangen", "ontvangen"))
        else:
            if b["status"] == "aangevraagd":
                knoppen += [("👍 Accepteren", "accepteren"), ("Weigeren", "weigeren")]
            if b["status"] == "geaccepteerd" and not app:
                knoppen.append(("💶 Betaling ontvangen", "betaling_ontvangen"))
            if b["status"] == "geaccepteerd" and app:
                st.caption("Wacht op de betaling van de koper via de app.")
            if b["status"] == "betaald" or (b["status"] == "geaccepteerd" and b["betaalwijze"] == "contant"):
                knoppen.append(("📦 Verzonden of overhandigd", "geleverd"))
        kolommen = st.columns(max(len(knoppen), 1))
        for kolom, (label, actie) in zip(kolommen, knoppen):
            if kolom.button(label, key=f"best_{actie}_{b['id']}", width="stretch",
                            type="primary" if actie in ("betalen", "accepteren", "ontvangen") else "secondary"):
                if actie == "betalen":
                    if url := _fout(samen.afrekenen, b["id"]):
                        st.session_state[f"betaallink_{b['id']}"] = url
                elif actie == "ontvangen":
                    if _fout(samen.ontvangen_bevestigen, b) is not None:
                        _vergeet_nieuw()
                        st.rerun()
                elif _fout(samen.bestelling_stap, b["id"], actie) is not None:
                    _vergeet_nieuw()
                    st.rerun()
        if url := st.session_state.get(f"betaallink_{b['id']}"):
            st.link_button("➡️ Naar de betaalpagina (iDEAL, Apple Pay, kaart)", url, type="primary", width="stretch")
        if koper and b["status"] in ("betaald", "geleverd"):
            with st.popover("⚠️ Probleem melden"):
                with st.form(f"probleem_{b['id']}", border=False):
                    reden = st.text_area("Wat is er mis?", placeholder="Bijv. niet ontvangen, kapot, niet zoals beschreven")
                    if st.form_submit_button("Melden") and reden.strip():
                        if _fout(samen.bestelling_stap, b["id"], "probleem", reden.strip()) is not None:
                            st.success("Gemeld. Het geld blijft vastgehouden tot de beheerder heeft besloten.")
        if b["status"] == "afgerond" and not b["beoordeeld"]:
            with st.popover("⭐ Beoordelen"):
                with st.form(f"beoordeel_{b['id']}", border=False):
                    sterren = st.feedback("stars")
                    tekst = st.text_input("Korte toelichting (optioneel)")
                    if st.form_submit_button("Opslaan") and sterren is not None:
                        if _fout(samen.beoordelen, b["id"], sterren + 1, tekst.strip()) is not None:
                            st.rerun()


def boekingen() -> None:
    lijst = samen.mijn_boekingen()
    if not lijst:
        st.caption("Je hebt geen boekingen. Zoek een privétraining, les of dienst bij 🔎 Zoeken.")
        return
    in_agenda = {(a["titel"], a["start"]) for a in opslag.afspraken_tussen(date.today().isoformat(), "9999-12-31")}
    for b in lijst:
        with st.container(border=True):
            rol = "Je hebt geboekt bij" if b["rol"] == "klant" else "Geboekt door"
            st.markdown(f"**{b['titel']}** · {samen.tijd_tekst(b['start'])} · {b['minuten']} min  \n{rol} **{b['met']}**"
                        + (f" · 📍 {b['plaats']}" if b["plaats"] else "") + (f"  \n:gray[{b['opmerking']}]" if b["opmerking"] else ""))
            kol1, kol2 = st.columns(2)
            start = datetime.fromisoformat(b["start"]).astimezone().strftime("%Y-%m-%dT%H:%M")
            if (b["titel"], start) not in in_agenda and kol1.button("📅 In mijn agenda", key=f"ag_{b['id']}", width="stretch"):
                samen.in_agenda_zetten(b)
                st.rerun()
            if kol2.button("Annuleren", key=f"ann_{b['id']}", width="stretch"):
                samen.boeking_annuleren(b["id"])
                st.toast("Geannuleerd. Laat de ander even weten waarom via 💬 Berichten.", icon="ℹ️")
                st.rerun()


def berichten() -> None:
    gesprekken = samen.gesprekken()
    if not gesprekken:
        st.caption("Nog geen berichten. Stuur een bericht vanuit een aanbod bij 🔎 Zoeken.")
        return
    sleutels = [(g["aanbod_id"], g["ander_id"]) for g in gesprekken]
    namen = {(g["aanbod_id"], g["ander_id"]): f"{g['ander']} · {g['titel']}" + (f" · {g['ongelezen']} nieuw" if g["ongelezen"] else "")
             for g in gesprekken}
    if opslag.namens("berichten") != "vragen" and any(g["ongelezen"] for g in gesprekken):
        if st.button("🤖 Laat de assistent nieuwe berichten beantwoorden", width="stretch"):
            st.session_state.vooraf_vraag = ("Bekijk mijn nieuwe berichten op de marktplaats. Beantwoord namens mij wat "
                                             "je mag beantwoorden en vertel kort wat je hebt gedaan en wat ik zelf moet beslissen.")
            st.session_state.vooraf_label = "🤖 Nieuwe berichten beantwoorden"
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


# --- Account en beheer ---------------------------------------------------------------

def account_instellingen() -> None:
    """Profiel, voorwaarden, gegevens downloaden en account verwijderen."""
    gebruiker = ik()
    if samen.beschikbaar() and not gebruiker.get("email"):
        st.warning("Vul je mailadres in bij 🙂 Mijn account. Zonder mailadres kun je niet kopen of verkopen.")
    with st.expander("🙂 Mijn account" + (f" (@{gebruiker['naam']})" if gebruiker.get("naam") else "")):
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
        niveau = gebruiker.get("niveau") or "particulier"
        with st.expander(f"Accounttype: {samen.NIVEAUS[niveau][0]}"):
            accounttype(gebruiker)
        with st.expander("🔐 Beveiliging"):
            beveiliging()
    with st.expander("📄 Voorwaarden en privacy"):
        st.markdown(teksten.voorwaarden())
        st.divider()
        st.markdown(teksten.privacy())
    with st.expander("⬇️ Mijn gegevens downloaden"):
        st.caption("Alles wat je in de app hebt gezet, als bestand. Wachtwoorden en sleutels zitten er niet in.")
        st.download_button("Download mijn gegevens", opslag.export(), file_name="mijn-gegevens.json",
                           mime="application/json")
    if samen.beschikbaar() and not gebruiker.get("beheerder"):
        with st.expander("🗑️ Account verwijderen"):
            st.warning("Al je gegevens worden gewist en je aanbod gaat offline. Dit kan niet ongedaan worden gemaakt.")
            zeker = st.checkbox("Ja, ik weet het zeker")
            if st.button("Account definitief verwijderen", disabled=not zeker):
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
                                          placeholder="Bijv. 14 dagen bedenktijd, retour op kosten van de koper")
        st.caption("Je bedrijfsnaam en KvK-nummer staan bij je aanbod en op je facturen. Kopers hebben bij online "
                   "kopen van een bedrijf 14 dagen bedenktijd; zorg dat je je daaraan houdt.")
    if st.button("Opslaan", key="niveau_opslaan", type="primary") and (keuze != huidig or bedrijf):
        if _fout(samen.niveau_instellen, keuze, bedrijf) is not None:
            st.session_state.ik = opslag.inloggen(st.session_state.get("naam", ""), st.session_state.wachtwoord)
            _vergeet_nieuw()
            st.toast(f"Je bent nu {samen.NIVEAUS[keuze][0]}.", icon="✅")
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
        st.caption("Nog niets verkocht. Zet iets online bij 🏷️ Verkopen.")
    if not ondernemer:
        st.caption("Ben je een bedrijf of zzp'er? Kies Ondernemer bij Instellingen › Account voor facturen en een "
                   "klantenoverzicht.")
        return
    bedrijf = ik().get("bedrijf") or {}
    with st.expander(f"👥 Klanten ({len(o['klanten'])})"):
        for k in o["klanten"]:
            st.markdown(f"**{k['naam']}** · {k['aantal']}× · {samen.euro(k['totaal'])} · laatst "
                        f"{datetime.fromisoformat(k['laatst']).astimezone():%d-%m-%Y}")
        if not o["klanten"]:
            st.caption("Nog geen klanten.")
    with st.expander(f"🧾 Facturen ({len(o['facturen'])})"):
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
    st.markdown("**Tweestapsverificatie** " + ("✅ staat aan" if b["twee_stap"] else "· staat uit"))
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

    st.markdown("**Inloggen met Face ID**")
    st.caption("Laat Safari je wachtwoord bewaren in Wachtwoorden (iCloud-sleutelhanger) als het daarom vraagt. "
               "Daarna tik je bij inloggen op je wachtwoord en bevestig je met Face ID. Zet je de code ook in "
               "Wachtwoorden, dan vult je iPhone of iPad die ook in.")

    st.markdown("**Ingelogd op**")
    for sessie in b["sessies"]:
        laatst = datetime.fromisoformat(sessie["laatst"]).astimezone().strftime("%d-%m %H:%M")
        st.markdown(f"{'📍 ' if sessie['deze'] else ''}{sessie['apparaat'] or 'onbekend'} · laatst {laatst}"
                    + (" · :green[dit apparaat]" if sessie["deze"] else ""))
    if len(b["sessies"]) > 1 and st.button("Op alle andere apparaten uitloggen"):
        opslag.overal_uitloggen()
        st.toast("Andere apparaten zijn uitgelogd.", icon="🔐")
        st.rerun()
    if b["inlogs"]:
        with st.expander("Recente inlogpogingen"):
            for i in b["inlogs"]:
                tijd = datetime.fromisoformat(i["tijd"]).astimezone().strftime("%d-%m %H:%M")
                reden = {"wachtwoord": "fout wachtwoord", "code": "foute code"}.get(i["reden"], "")
                st.markdown(f"{'✅' if i['gelukt'] else '❌'} {tijd} · {i['apparaat'] or 'onbekend'}"
                            + (f" · :red[{reden}]" if reden else ""))
            st.caption("Zie je iets wat jij niet was? Kies een nieuw wachtwoord bij 🙂 Mijn account; andere "
                       "apparaten worden dan uitgelogd.")


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
        if st.button("🔐 Tweestapsverificatie aanzetten", type="primary"):
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
    st.link_button("📲 Toevoegen aan Wachtwoorden (op deze iPhone of iPad)", uri, width="stretch")
    st.caption("Of scan de QR-code met een ander apparaat, bijvoorbeeld met de camera of Google Authenticator:")
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
    with st.expander("💳 Betalen via de app (Stripe)" + (" ✅" if status.get("aan") else " (nog instellen)")):
        if status.get("aan"):
            st.caption(("🧪 Testmodus: er wordt nog niet echt betaald. " if status.get("testmodus") else "")
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
            st.markdown(f"⚠️ **{g['titel']}** · {samen.euro(g['bedrag'])} · {samen.BETAALWIJZEN[g['betaalwijze']]}  \n"
                        f"Koper {g['koper']}, verkoper {g['verkoper']}: {g['reden']}")
            for m in (g.get("berichten") or [])[-6:]:
                st.caption(f"{m['van']}: {m['tekst']}")
            kol1, kol2 = st.columns(2)
            if kol1.button("↩️ Geld terug naar koper", key=f"gk_{g['id']}", width="stretch"):
                if _fout(samen.geschil_besluiten, g, "koper") is not None:
                    st.rerun()
            if kol2.button("✅ Uitbetalen aan verkoper", key=f"gv_{g['id']}", width="stretch"):
                if _fout(samen.geschil_besluiten, g, "verkoper") is not None:
                    st.rerun()


def beheer() -> None:
    betalen_instellen()
    gegevens = samen.beheer()
    meldingen = gegevens.get("meldingen", [])
    with st.expander(f"🛡️ Beheer ({len(meldingen)} meldingen)" if meldingen else "🛡️ Beheer"):
        geschillen_afhandelen()
        st.caption(f"{gegevens.get('gebruikers', 0)} gebruikers · {gegevens.get('aanbod', 0)} keer aanbod online")
        if not meldingen:
            st.caption("Geen open meldingen.")
        for m in meldingen:
            a = m["aanbod"]
            with st.container(border=True):
                st.markdown(f"🚩 **{a['titel']}** van {a['aanbieder']}  \nGemeld door {m['door']}: {m['reden']}")
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
