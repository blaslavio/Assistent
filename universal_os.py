"""Opdrachten in hetzelfde gesprek en invoerveld als de bestaande assistent."""

import uuid
from datetime import date, datetime

import streamlit as st

import agendacontrole
import actielinks_scherm
import dagplan_scherm
import intenties
import communicatie_scherm
import opslag


def bewaak_account() -> None:
    communicatie_scherm.bewaak_account()
    account = (st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))
    if st.session_state.get("_os_account") != account:
        if "_os_account" in st.session_state:
            st.session_state.chat = []
            st.session_state.berichten = []
            st.session_state.pop("vooraf_vraag", None)
        nieuw_gesprek()
        st.session_state._os_account = account


def nieuw_gesprek() -> None:
    for sleutel in ("planvoorstel", "_os_voorstel", "_os_vervolg", "_os_laatst", "_os_fout", "_os_undo_melding", "_os_lokale_laatste", "_os_dagplan", "_os_dagfout", "_al_voorstel", "_al_resultaat", "_al_fout", "al_open"):
        st.session_state.pop(sleutel, None)


def _chat(rol: str, tekst: str) -> None:
    st.session_state.setdefault("chat", []).append((rol, tekst))
    st.session_state.voorlezen_id = ""
    st.session_state._os_lokale_laatste = True


def ontvang(tekst: str) -> bool:
    """True: lokaal afgehandeld; False: geef deze vraag aan de bestaande AI-assistent."""
    bewaak_account()
    if any(st.session_state.get(k) for k in ("_os_voorstel", "_os_dagplan", "_al_voorstel")):
        st.session_state._os_fout = "Bevestig of annuleer eerst je openstaande voorstel."
        return True
    try:
        if communicatie_scherm.ontvang_opdracht(tekst):
            return True
        resultaat = intenties.routeer(tekst, st.session_state.get("_os_vervolg"))
    except ValueError as fout:
        st.session_state._os_fout = str(fout)
        return True
    if resultaat["soort"] == "assistent":
        st.session_state.pop("_os_vervolg", None)
        return False
    if resultaat["soort"] in {"dagplan", "herplan"}:
        try:
            plan = opslag.herplanvoorstel(uitloop=resultaat["uitloop"]) if resultaat["soort"] == "herplan" else opslag.dagvoorstel()
        except opslag.GeenToegang:
            raise
        except (ValueError, OSError, opslag.httpx.HTTPError) as fout:
            st.session_state._os_fout = str(fout) if isinstance(fout, ValueError) else "Een dagvoorstel maken is niet gelukt. Probeer opnieuw."
            return True
    opslag.intentie_bericht("user", tekst)
    _chat("user", tekst)
    if resultaat["soort"] == "actielink":
        st.session_state.pop("_os_vervolg", None)
        st.session_state.pop("_al_resultaat", None)
        st.session_state._al_voorstel = {"id": uuid.uuid4().hex, "gegevens": resultaat["gegevens"]}
    elif resultaat["soort"] in {"dagplan", "herplan"}:
        st.session_state.pop("_os_vervolg", None)
        st.session_state._os_dagplan = {"id": uuid.uuid4().hex, "gegevens": plan}
    elif resultaat["soort"] == "voorstel":
        st.session_state.pop("_os_vervolg", None)
        st.session_state._os_voorstel = {"id": uuid.uuid4().hex, "gegevens": resultaat["gegevens"]}
    else:
        if resultaat["soort"] == "vervolg":
            st.session_state._os_vervolg = resultaat["context"]
        else:
            st.session_state.pop("_os_vervolg", None)
        opslag.intentie_bericht("assistant", resultaat["tekst"])
        _chat("assistant", resultaat["tekst"])
    return True


def _beschikbaarheid(wachtend: dict, voorstel: dict, vast: bool) -> None:
    st.caption("Controle van de appagenda. Gekoppelde agenda’s zijn niet gecontroleerd.")
    try:
        controle = opslag.intentie_agendacontrole(voorstel, wachtend["id"])
    except opslag.GeenToegang:
        raise
    except (ValueError, OSError, opslag.httpx.HTTPError) as fout:
        st.warning(str(fout) if isinstance(fout, agendacontrole.ControleOnvolledig)
                   else "De appagenda kon niet worden gecontroleerd. Probeer het opnieuw vóór het opslaan.")
        return
    if controle.get("al_verwerkt"):
        st.caption("Deze opdracht is al verwerkt. Bevestig om de bestaande uitkomst op te halen.")
        return
    if not controle["conflicten"]:
        st.caption("Geen overlap gevonden in de appagenda. Bij bevestigen wordt opnieuw gecontroleerd.")
        return
    st.warning("Er staat al een afspraak op dit tijdstip. Kies een andere tijd.")
    for conflict in controle["conflicten"]:
        begin, einde = datetime.fromisoformat(conflict["start"]), datetime.fromisoformat(conflict["einde"])
        st.write(f"{conflict['titel']} · {intenties.datum_tekst(begin.date())} {begin:%H:%M} – "
                 f"{intenties.datum_tekst(einde.date())} {einde:%H:%M}")
    if controle.get("melding"):
        st.caption(controle["melding"])
    if not controle["alternatieven"]:
        st.caption("Geen passend vrij moment gevonden binnen je planningsuren in de zeven dagen vanaf dit voorstel. Pas de tijden zelf aan.")
    for alternatief in controle["alternatieven"]:
        begin, einde = datetime.fromisoformat(alternatief["start"]), datetime.fromisoformat(alternatief["einde"])
        if st.button(f"Kies {intenties.datum_tekst(begin.date())} {begin:%H:%M}–{einde:%H:%M}",
                     key=f"os_alternatief_{wachtend['id']}_{alternatief['start']}_{alternatief['einde']}", disabled=vast):
            wachtend["gegevens"] = alternatief
            wachtend["bewerking"] = wachtend.get("bewerking", 0) + 1
            st.rerun()


def paneel() -> None:
    """Toon vervolgvragen, bewerkbaar voorstel en ongedaan maken zonder extra invoerveld."""
    bewaak_account()
    if melding := st.session_state.pop("_os_undo_melding", None):
        (st.success if melding["status"] == "ongedaan" else st.warning)(melding["tekst"])
    if laatst := st.session_state.get("_os_laatst"):
        if not laatst["ontvangst"].get("ongedaan") and st.button("Ongedaan maken", key="os_ongedaan"):
            try:
                resultaat = opslag.intentie_ongedaan(laatst["opdracht_id"])
            except opslag.GeenToegang:
                raise
            except (opslag.OpslagConflict, opslag.OpslagNietIngericht, OSError, opslag.httpx.HTTPError, ValueError):
                st.error("Terugdraaien is nog niet bevestigd. Probeer dezelfde knop opnieuw.")
            else:
                st.session_state.pop("_os_laatst", None)
                st.session_state._os_undo_melding = resultaat
                if resultaat["status"] == "ongedaan":
                    _chat("assistant", resultaat["tekst"])
                st.rerun()
    if st.session_state.get("_os_vervolg"):
        st.caption("Beantwoord de vervolgvraag in hetzelfde invoerveld onderaan.")
        if st.button("Opdracht annuleren", key="os_vervolg_annuleer"):
            ontvang("annuleren")
            st.rerun()
    if fout := st.session_state.pop("_os_fout", None):
        st.error(fout)
    dagplan_scherm.paneel(_chat)
    actielinks_scherm.voorstel_paneel(_chat)
    actielinks_scherm.resultaat_paneel()
    if wachtend := st.session_state.get("_os_voorstel"):
        r = wachtend.get("ingediend") or wachtend["gegevens"]
        vast = "ingediend" in wachtend
        opdracht_id = wachtend["id"]
        sleutel = f"{opdracht_id}_{wachtend.get('bewerking', 0)}"
        controleer = False
        if r["wat"] == "afspraak":
            _beschikbaarheid(wachtend, r, vast)
        with st.form("os_form_" + sleutel):
            st.write("Controleer en bewerk je voorstel")
            titel = st.text_input("Titel", value=r["titel"], max_chars=160, key="os_titel_" + sleutel, disabled=vast)
            gewijzigd = dict(r, titel=titel)
            if r["wat"] == "afspraak":
                begin, einde = datetime.fromisoformat(r["start"]), datetime.fromisoformat(r["einde"])
                st.caption(intenties.datum_tekst(begin.date()) + f" om {begin:%H:%M} · Nederlandse tijd")
                dag = st.date_input("Begindatum", value=begin.date(), format="DD/MM/YYYY", key="os_dag_" + sleutel, disabled=vast)
                tijd = st.time_input("Begintijd", value=begin.time(), step=60, key="os_tijd_" + sleutel, disabled=vast)
                einddag = st.date_input("Einddatum", value=einde.date(), format="DD/MM/YYYY", key="os_einddag_" + sleutel, disabled=vast)
                eindtijd = st.time_input("Eindtijd", value=einde.time(), step=60, key="os_eindtijd_" + sleutel, disabled=vast)
                locatie = st.text_input("Locatie", value=r.get("locatie", ""), max_chars=500, key="os_locatie_" + sleutel, disabled=vast)
                gewijzigd.update(start=datetime.combine(dag, tijd).isoformat(timespec="minutes") if dag and tijd else None,
                                  einde=datetime.combine(einddag, eindtijd).isoformat(timespec="minutes") if einddag and eindtijd else None,
                                  locatie=locatie)
                controleer = st.form_submit_button("Beschikbaarheid controleren", key="os_controleer", disabled=vast)
            else:
                deadline = st.date_input("Deadline (optioneel)", value=date.fromisoformat(r["deadline"]) if r.get("deadline") else None,
                                         format="DD/MM/YYYY", key="os_deadline_" + sleutel, disabled=vast)
                minuten = st.number_input("Duur in minuten (optioneel)", min_value=1, max_value=1440, value=r.get("minuten"),
                                          step=1, key="os_minuten_" + sleutel, disabled=vast)
                gewijzigd.update(deadline=deadline.isoformat() if deadline else None, minuten=minuten)
            if vast:
                st.caption("Bij opnieuw proberen blijft dezelfde opdracht behouden. Controleer bij twijfel ook je agenda of takenlijst.")
            ja, nee = st.columns(2)
            bevestig = ja.form_submit_button("Opnieuw proberen" if vast else "Bevestigen", key="os_bevestig", type="primary")
            annuleer = nee.form_submit_button("Sluiten" if vast else "Annuleren", key="os_annuleer")
        if annuleer:
            st.session_state.pop("_os_voorstel", None)
            st.rerun()
        if bevestig or controleer:
            try:
                gevalideerd = intenties.valideer(r if vast else gewijzigd)
            except ValueError as fout:
                st.error(str(fout))
            else:
                if controleer:
                    wachtend["gegevens"] = gevalideerd
                    wachtend["bewerking"] = wachtend.get("bewerking", 0) + 1
                    st.rerun()
                # Bewaar exact deze inhoud vóór de aanvraag: een verloren antwoord
                # mag geen nieuwe opdracht of gewijzigde retry opleveren.
                wachtend["ingediend"] = gevalideerd
                try:
                    ontvangst = opslag.intentie_bevestigen(opdracht_id, gevalideerd)
                except opslag.GeenToegang:
                    raise
                except (agendacontrole.Overlap, agendacontrole.ControleOnvolledig) as fout:
                    # Behoud de opdracht-ID, ook na een eerdere onzekere poging.
                    wachtend.pop("ingediend", None)
                    wachtend["gegevens"] = gevalideerd
                    wachtend["bewerking"] = wachtend.get("bewerking", 0) + 1
                    st.session_state._os_fout = str(fout)
                    st.rerun()
                except opslag.OpslagNietIngericht:
                    st.session_state._os_fout = "De database-update ontbreekt. Laat de beheerder sql/veilige_opslag.sql uitvoeren."
                    st.rerun()
                except (opslag.OpslagConflict, OSError, opslag.httpx.HTTPError, ValueError):
                    st.session_state._os_fout = "Opslaan is nog niet bevestigd. Probeer dezelfde opdracht opnieuw; er wordt geen tweede item toegevoegd."
                    st.rerun()
                else:
                    st.session_state._os_laatst = {"opdracht_id": opdracht_id, "ontvangst": ontvangst}
                    _chat("assistant", ontvangst["tekst"])
                    st.session_state.pop("_os_voorstel", None)
                    st.rerun()


def pagina() -> None:
    """Zelfstandige lokale testweergave; de app gebruikt paneel() in het assistentgesprek."""
    bewaak_account()
    for rol, tekst in st.session_state.get("chat", []):
        st.chat_message(rol).markdown(tekst)
    paneel()
    if invoer := st.chat_input("Vraag iets of geef een opdracht…", disabled=any(st.session_state.get(k) for k in ("_os_voorstel", "_os_dagplan", "_al_voorstel"))):
        if not ontvang(invoer):
            st.session_state.vooraf_vraag = invoer
        st.rerun()
