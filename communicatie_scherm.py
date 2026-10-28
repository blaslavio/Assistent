"""Privécommunicatiecentrum met expliciete opslag en optionele schrijfhulp."""
import json
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo
import anthropic
import streamlit as st
import communicatie
import opslag


def bewaak_account():
    account = (st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))
    if st.session_state.get("_cm_account") != account:
        for key in list(st.session_state):
            if key.startswith("cm_"):
                del st.session_state[key]
        st.session_state._cm_account = account


def ontvang_opdracht(waarde):
    bewaak_account()
    if not isinstance(waarde, str):
        return False
    kort = waarde.strip().casefold()
    delen = {"communicatie": "Concepten", "communicatieprivacy": "Privacy en profiel",
             "privacyinstellingen": "Privacy en profiel", "profielinstellingen": "Privacy en profiel"}
    if kort in delen:
        st.session_state.cm_deel = delen[kort]
    elif kort.startswith("schrijf bericht:"):
        if st.session_state.get("cm_pending"):
            raise ValueError("Rond eerst de eerdere communicatieopslag af.")
        invoer = communicatie.tekst(waarde.split(":", 1)[1], 5000, True, True)
        st.session_state.cm_tekst = invoer
        st.session_state.cm_deel = "Concepten"
    else:
        return False
    st.session_state.ga_naar = "communicatie"
    return True


def _opslaan(pending):
    try:
        resultaat = communicatie.wijzigen(**pending)
    except opslag.GeenToegang:
        raise
    except opslag.OpslagConflict:
        st.warning("De gegevens zijn intussen gewijzigd. Annuleer deze poging en controleer de actuele inhoud.")
    except (ValueError, OSError, opslag.httpx.HTTPError, opslag.OpslagNietIngericht) as fout:
        st.error(str(fout) if isinstance(fout, ValueError) else "Opslag is nog niet bevestigd. Probeer dezelfde opdracht opnieuw.")
    else:
        st.session_state.pop("cm_pending", None)
        st.session_state.pop("cm_basis", None)
        st.session_state.cm_melding = f"Opgeslagen: {resultaat['actie']} · {resultaat['aantal']} concepten verwerkt."
        st.rerun()


def _bewaar(actie, inhoud, r):
    pending = {"opdracht": uuid.uuid4().hex, "actie": actie, "inhoud": inhoud,
               "verwacht": communicatie.vingerafdruk(r)}
    st.session_state.cm_pending = pending
    _opslaan(pending)


def _herladen():
    for key in list(st.session_state):
        if key.startswith("cm_"):
            del st.session_state[key]


def pagina():
    bewaak_account()
    st.subheader("Communicatie")
    st.caption("Privéconcepten en schrijfhulp van je assistent. Dit onderdeel verstuurt geen berichten en wijzigt je openbare profiel niet.")
    if melding := st.session_state.pop("cm_melding", None):
        st.success(melding)
    try:
        r = communicatie.lezen()
    except ValueError:
        st.error("De communicatiegegevens zijn onleesbaar. Er is niets gewijzigd. Laat de opgeslagen structuur controleren.")
        return
    if pending := st.session_state.get("cm_pending"):
        st.warning("Een opslagpoging staat nog open. Opnieuw proberen gebruikt dezelfde inhoud; sluiten draait een mogelijke eerdere opslag niet terug.")
        if st.button("Dezelfde opslag opnieuw proberen", key="cm_retry"):
            _opslaan(pending)
        if st.button("Poging sluiten en actuele gegevens bekijken", key="cm_close"):
            st.session_state.pop("cm_pending", None)
            st.rerun()
        return
    basis = communicatie.vingerafdruk(r)
    if st.session_state.setdefault("cm_basis", basis) != basis:
        st.warning("Communicatie is in een andere sessie gewijzigd. Laad de actuele gegevens voordat je doorgaat. Niet-bewaarde formuliertekst en AI-resultaten worden dan gewist.")
        st.button("Laad actuele communicatiegegevens", key="cm_reload", on_click=_herladen)
        return
    deel = st.radio("Onderdeel", ["Concepten", "Privacy en profiel", "Mijn gegevens"], horizontal=True, key="cm_deel")
    if deel == "Privacy en profiel":
        _instellingen(r)
    elif deel == "Mijn gegevens":
        _gegevens(r)
    else:
        _concepten(r)


def _instellingen(r):
    p = r["voorkeuren"]
    st.caption("Deze voorkeuren gelden voor dit communicatiecentrum. Bestaande chat-, mail- en openbare profielinstellingen blijven afzonderlijk beschikbaar bij Instellingen.")
    with st.form("cm_instellingen"):
        naam = st.text_input("Privéaanspreeknaam", value=p["aanspreeknaam"], max_chars=80, key="cm_naam")
        handtekening = st.text_area("Ondertekening voor eigen concepten", value=p["ondertekening"], max_chars=500, key="cm_sign")
        toon = st.selectbox("Schrijfstijl", communicatie.TONEN, index=communicatie.TONEN.index(p["toon"]), key="cm_toon")
        aanspreken = st.selectbox("Aanspreekvorm", ["je", "u"], index=["je", "u"].index(p["aanspreken"]), key="cm_aanspreken")
        ai = st.checkbox("Externe AI-schrijfhulp toestaan voor gecontroleerde tekst", value=p["ai_hulp"], key="cm_ai")
        maskeren = st.checkbox("E-mailadressen en nummerpatronen maskeren in het AI-voorbeeld", value=p["maskeren"], key="cm_maskeren")
        dagen = st.selectbox("Opruimgrens in dagen", [7, 30, 90], index=[7, 30, 90].index(p["bewaar_dagen"]), key="cm_dagen")
        st.caption("Opruimen gebeurt alleen na jouw opdracht bij Mijn gegevens. Maskering herkent niet alle persoonsgegevens; controleer altijd het voorbeeld.")
        if st.form_submit_button("Communicatievoorkeuren opslaan"):
            try:
                inhoud = communicatie.voorkeuren({"aanspreeknaam": naam, "ondertekening": handtekening, "toon": toon,
                    "aanspreken": aanspreken, "ai_hulp": ai, "maskeren": maskeren, "bewaar_dagen": dagen})
            except ValueError as fout:
                st.error(str(fout))
            else:
                st.session_state.pop("cm_ai_voorbeeld", None)
                st.session_state.pop("cm_ai_resultaat", None)
                st.session_state.pop("cm_ai_uitvoer", None)
                _bewaar("instellingen", inhoud, r)


def _concepten(r):
    p = r["voorkeuren"]
    if p["aanspreeknaam"]:
        st.write("Privéwerkruimte van " + p["aanspreeknaam"])
    st.caption("Tip voor het assistentgesprek: ‘communicatie’, ‘communicatieprivacy’ of ‘schrijf bericht: jouw tekst’.")
    with st.form("cm_concept"):
        kanaal = st.selectbox("Kanaal", communicatie.KANALEN, key="cm_kanaal")
        ontvanger = st.text_input("Ontvanger (optioneel, alleen een privélabel)", max_chars=200, key="cm_ontvanger")
        onderwerp = st.text_input("Onderwerp", max_chars=160, key="cm_onderwerp")
        inhoud = st.text_area("Berichttekst", max_chars=5000, key="cm_tekst")
        ondertekenen = st.checkbox("Mijn ondertekening toevoegen", disabled=not p["ondertekening"], key="cm_sign_toevoegen")
        opslaan = st.form_submit_button("Bewaar als privéconcept")
        hulp = st.form_submit_button("Maak gecontroleerd AI-voorbeeld", disabled=not p["ai_hulp"])
    if opslaan or hulp:
        try:
            waarde = communicatie.concept({"kanaal": kanaal, "ontvanger": ontvanger, "onderwerp": onderwerp,
                "tekst": inhoud + ("\n\n" + p["ondertekening"] if ondertekenen else "")})
            if hulp:
                st.session_state.cm_ai_voorbeeld = communicatie.ai_voorbeeld(inhoud, p)
                st.session_state.pop("cm_ai_toestemming", None)
                st.session_state.pop("cm_ai_resultaat", None)
                st.session_state.pop("cm_ai_uitvoer", None)
            else:
                _bewaar("bewaren", waarde, r)
        except ValueError as fout:
            st.error(str(fout))
    _schrijfhulp(r)
    st.markdown("**Bewaarde concepten**")
    if not r["concepten"]:
        st.info("Er zijn nog geen bewaarde concepten.")
    for key, item in reversed(list(r["concepten"].items())):
        with st.expander(item.get("onderwerp") or "Bericht zonder onderwerp"):
            st.write(item["kanaal"] + " · " + (item["ontvanger"] or "Geen ontvanger"))
            st.text(item["tekst"])
            tijd = datetime.fromisoformat(item["aangemaakt"]).astimezone(ZoneInfo("Europe/Amsterdam"))
            st.caption("Bewaard: " + tijd.strftime("%d-%m-%Y %H:%M") + " · Nederlandse tijd")
            st.download_button("Download berichttekst", item["tekst"], file_name="berichtconcept.txt", key="cm_download_" + key)
            if st.checkbox("Dit concept verwijderen", key="cm_del_ok_" + key):
                if st.button("Bevestig verwijderen", key="cm_del_" + key):
                    _bewaar("verwijderen", key, r)


def _schrijfhulp(r):
    voorbeeld = st.session_state.get("cm_ai_voorbeeld")
    if resultaat := st.session_state.get("cm_ai_resultaat"):
        st.text_area("Voorstel van de assistent — controleer feiten en toon", value=resultaat, height=200, key="cm_ai_uitvoer", disabled=True)
        st.download_button("Download herschreven concept", resultaat, file_name="herschreven-concept.txt")
        st.caption("Dit voorstel is niet opgeslagen of verstuurd. Kopieer het naar Berichttekst als je het als privéconcept wilt bewaren.")
    if not voorbeeld or not r["voorkeuren"]["ai_hulp"]:
        return
    st.markdown("**Controleer wat de externe AI ontvangt**")
    st.text(voorbeeld["tekst"])
    st.caption(f"Schrijfstijl: {voorbeeld['toon']} · {voorbeeld['aanspreken']}. Alleen deze tekst en stijl worden aangeboden, zonder ontvanger, profiel, geheugen of gesprekshistorie. De bestaande AI-provider verwerkt de tekst.")
    akkoord = st.checkbox("Ik heb deze tekst gecontroleerd en wil deze één keer laten herschrijven", key="cm_ai_toestemming")
    if st.button("Laat assistent dit concept herschrijven", disabled=not akkoord, key="cm_ai_start"):
        import toegang
        # Lees toestemming/voorkeuren opnieuw vlak vóór enige externe aanvraag.
        actueel = communicatie.lezen()["voorkeuren"]
        if not actueel["ai_hulp"] or actueel != r["voorkeuren"]:
            st.warning("De privacyvoorkeuren zijn gewijzigd. Maak een nieuw voorbeeld.")
            return
        try:
            sleutel = toegang.sleutel()
            if not sleutel:
                st.warning("Stel eerst de assistent in bij Instellingen › Assistent.")
                return
            st.session_state.cm_ai_resultaat = communicatie.herschrijven(toegang.claude(sleutel), voorbeeld)
        except (anthropic.APIError, toegang.Fout, ValueError, opslag.httpx.HTTPError):
            st.error("Herschrijven is niet gelukt. Je concept is niet gewijzigd. Een nieuwe poging kan opnieuw AI-verbruik kosten.")
        else:
            st.session_state.pop("cm_ai_voorbeeld", None)
            st.rerun()


def _gegevens(r):
    st.caption("Deze export bevat je privéconcepten en communicatievoorkeuren. Bewaar hem zorgvuldig. Andere accountgegevens en sleutels worden niet toegevoegd.")
    st.download_button("Download mijn communicatiegegevens", json.dumps(communicatie.exporteer(r), ensure_ascii=False, indent=2),
                       file_name="communicatie.json", mime="application/json")
    st.write(f"{len(r['concepten'])} bewaarde concepten · opruimgrens {r['voorkeuren']['bewaar_dagen']} dagen.")
    if st.checkbox("Verwijder concepten ouder dan mijn opruimgrens", key="cm_cleanup_ok"):
        if st.button("Bevestig oude concepten opruimen", key="cm_cleanup"):
            _bewaar("opruimen", None, r)
