"""Doorzoekbare bronnen bij werk, met tekstlabels en expliciete opslag."""
import hashlib
import json
import uuid
import streamlit as st
import opslag
import werkbronnen


def _account() -> None:
    account = (st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))
    if st.session_state.get("_wb_account") != account:
        for sleutel in list(st.session_state):
            if sleutel.startswith("wb_"):
                del st.session_state[sleutel]
        st.session_state._wb_account = account


def voor_doel(soort, record_id):
    import werkcontext
    _account()
    werkcontext.verwijzing(soort, record_id)
    if soort not in {"taak", "afspraak"}:
        raise ValueError("Kies een taak of afspraak als brondoel.")
    if st.session_state.get("wb_pending"):
        raise ValueError("Rond eerst de eerdere bronopslag af.")
    st.session_state.wb_doel = (soort, record_id)
    st.session_state.pop("wb_doel_verdwenen", None)
    st.session_state.wb_nieuw_open = True
    st.session_state.wb_form_ronde = st.session_state.get("wb_form_ronde", 0) + 1


def _kies_doel(opties, label, key):
    vlag = key + "_verdwenen"
    oud = st.session_state.get(key)
    if oud is not None and oud not in opties:
        st.session_state[key] = None
        st.session_state[vlag] = True
    if st.session_state.get(vlag):
        st.warning("Het eerder gekozen werk is verwijderd. Kies zelf een nieuw doel; er is niets omgekoppeld.")
    waarde = st.selectbox(label, list(opties),
        format_func=lambda k: k[0] + ": " + opties.get(k, "Verwijderd werk") if isinstance(k, tuple) else "Kies werk",
        index=None if st.session_state.get(vlag) else 0, placeholder="Kies een taak of afspraak", key=key)
    if waarde is not None:
        st.session_state.pop(vlag, None)
    return waarde


def _fout(fout) -> None:
    if isinstance(fout, opslag.GeenToegang):
        raise fout
    st.error(str(fout) if isinstance(fout, ValueError) else "De bewerking is niet bevestigd. Controleer je verbinding en probeer dezelfde opdracht opnieuw.")


def doelen(gegevens: dict) -> dict:
    return {(soort, r["id"]): r["titel"] for soort, key in (("taak", "taken"), ("afspraak", "afspraken")) for r in gegevens[key]}


def csv_koppelen(resultaat: dict) -> None:
    _account()
    if not st.checkbox("Koppel deze analyse aan een taak of afspraak", key="wb_csv_actief"):
        return
    g = opslag.laden(vers=True)
    opties = doelen(g)
    if not opties:
        st.info("Voeg eerst een taak of afspraak toe om een analysesamenvatting te koppelen.")
        return
    meting = {k: resultaat[k] for k in ("bestand", "rijen", "kolommen")}
    meting["statistieken"] = resultaat["statistieken"][:10]
    tekst = json.dumps(meting, ensure_ascii=False, indent=2)
    if len(tekst) > 4800:
        tekst = f"Bestand: {resultaat['bestand']}\nGegevensrijen: {resultaat['rijen']}\nKolommen: {len(resultaat['kolommen'])}\nDownload het volledige rapport bij Bestandsgereedschap voor de statistieken."
    with st.expander("Koppel analysesamenvatting aan werk"):
        st.caption("Bewaart alleen deze samenvatting, maximaal de eerste tien kolomstatistieken. Het CSV-bestand en voorbeeldrijen worden niet opgeslagen.")
        st.text(tekst)
        doel = _kies_doel(opties, "Taak of afspraak voor deze analyse", "wb_csv_doel")
        identiteit = hashlib.sha256((tekst + repr(doel)).encode()).hexdigest()
        opdracht = st.session_state.setdefault("wb_csv_id_" + identiteit, uuid.uuid4().hex)
        if st.button("Bewaar deze analysesamenvatting", key="wb_csv_save", disabled=doel is None):
            try:
                opslag.werkbron_opslaan(opdracht, *doel, {"soort": "notitie", "titel": ("CSV-analyse: " + resultaat["bestand"])[:160], "tekst": tekst})
            except (ValueError, opslag.OpslagConflict, opslag.OpslagNietIngericht, OSError, opslag.httpx.HTTPError) as fout:
                _fout(fout)
            else:
                st.success("Analysesamenvatting gekoppeld. Bekijk haar bij Bronnen bij werk.")


def pagina() -> None:
    import documenten
    import bestanden
    _account()
    st.subheader("Bronnen bij werk")
    st.caption("Koppel notities, analyses, webverwijzingen en eigen clouddocumenten aan taken of afspraken. Een koppeling deelt niets met anderen.")
    g = opslag.laden(vers=True)
    opties = doelen(g)
    if pending := st.session_state.get("wb_pending"):
        st.info("Opslag is nog niet bevestigd. Opnieuw proberen gebruikt dezelfde inhoud.")
        if st.button("Bronopslag opnieuw proberen", key="wb_retry"):
            _opslaan(pending)
    elif opties:
        with st.expander("Bron toevoegen", expanded=bool(st.session_state.get("wb_nieuw_open")) or not g.get("werkbronnen")):
            doel = _kies_doel(opties, "Koppel aan", "wb_doel")
            soort = st.selectbox("Brontype", list(werkbronnen.SOORTEN), format_func=werkbronnen.SOORTEN.get, key="wb_soort")
            cloud = None
            if soort in {"document", "bestand"}:
                zoek = st.text_input("Zoek in mijn documenten of bestanden", max_chars=100, key="wb_cloud_zoek")
                if st.button("Zoek eigen bronnen", key="wb_cloud_find"):
                    try:
                        st.session_state.wb_cloud = {"soort": soort, "items": werkbronnen.cloud_zoeken(soort, zoek)}
                    except (ValueError, documenten.Fout, bestanden.Fout, OSError, opslag.httpx.HTTPError) as fout:
                        _fout(fout)
                lijst = st.session_state.get("wb_cloud", {})
                items = lijst.get("items", []) if lijst.get("soort") == soort else []
                if items:
                    cloud = st.selectbox("Kies de gevonden bron", items, format_func=lambda r: r["titel"], key="wb_cloud_keuze_" + soort)
                else:
                    st.info("Zoek eerst een toegankelijke bron binnen je eigen account. Er worden maximaal 100 resultaten getoond.")
            with st.form("wb_form_" + soort + "_" + str(st.session_state.get("wb_form_ronde", 0))):
                titel = st.text_input("Titel van de koppeling", max_chars=160, value=cloud["titel"][:160] if cloud else "")
                bron = {"soort": soort, "titel": titel}
                if soort == "notitie":
                    bron["tekst"] = st.text_area("Notitie of samenvatting", max_chars=5000, height=150)
                elif soort == "url":
                    bron["url"] = st.text_input("Volledige HTTPS-link", max_chars=2000)
                    st.caption("De app haalt deze website niet op. Open alleen een verwijzing die je vertrouwt.")
                elif cloud:
                    bron["bron_id"] = cloud["id"]
                bewaren = st.form_submit_button("Bron koppelen", disabled=doel is None or (soort in {"document", "bestand"} and cloud is None))
            if bewaren:
                try:
                    waarde = werkbronnen.valideer(bron)
                except ValueError as fout:
                    st.error(str(fout))
                else:
                    pending = {"id": uuid.uuid4().hex, "doel": doel, "bron": waarde}
                    st.session_state.wb_pending = pending
                    _opslaan(pending)
    else:
        st.info("Maak eerst een taak of afspraak om een bron te koppelen.")
    st.subheader("Gekoppelde bronnen")
    zoek = st.text_input("Zoek op bron of taak/afspraak", max_chars=160, key="wb_zoek").casefold().strip()
    filter_soort = st.selectbox("Toon bronnen voor", ["alle", "taak", "afspraak"], key="wb_filter")
    regels = [b for b in werkbronnen.overzicht(g) if (filter_soort == "alle" or b["doel_soort"] == filter_soort)
              and zoek in (b["titel"] + " " + b["doel_titel"]).casefold()]
    st.caption(f"{len(regels)} bronnen gevonden")
    pagina_nr = st.number_input("Pagina met bronnen", min_value=1, max_value=max(1, (len(regels) + 24) // 25), step=1, key="wb_page")
    for b in regels[(pagina_nr - 1) * 25:pagina_nr * 25]:
        with st.container(border=True):
            st.text(b["titel"])
            st.caption(b["doel_soort"] + ": " + b["doel_titel"])
            if b["doel_ontbreekt"]:
                st.warning("Het gekoppelde werk is verwijderd. De bron blijft bewaard totdat je de koppeling zelf verwijdert.")
            if b["soort"] == "notitie":
                st.text(b["tekst"])
            elif b["soort"] == "url":
                st.link_button("Open webverwijzing", werkbronnen.valideer(b)["url"])
            elif st.button("Controleer toegang en open bron", key="wb_open_" + b["id"]):
                try:
                    geopend = werkbronnen.cloud_openen(b)
                except (ValueError, documenten.Fout, bestanden.Fout, OSError, opslag.httpx.HTTPError) as fout:
                    _fout(fout)
                else:
                    if "url" in geopend:
                        st.link_button("Download mijn bestand", geopend["url"])
                        st.caption("Deze downloadverwijzing verloopt na vijf minuten.")
                    else:
                        st.text(geopend["titel"])
                        st.text(geopend["tekst"])
            if st.button("Bekijk bijbehorend werk", key="wb_context_" + b["id"]):
                import werkcontext_scherm
                werkcontext_scherm.openen("bron", b["id"])
            with st.expander("Koppeling verwijderen"):
                akkoord = st.checkbox("Verwijder alleen deze koppeling", key="wb_del_ok_" + b["id"])
                if st.button("Verwijder koppeling", disabled=not akkoord, key="wb_del_" + b["id"]):
                    try:
                        opslag.werkbron_verwijderen(b["id"], g["werkbronnen"][b["id"]])
                    except (ValueError, opslag.OpslagConflict, opslag.OpslagNietIngericht, OSError, opslag.httpx.HTTPError) as fout:
                        _fout(fout)
                    else:
                        st.rerun()
    if st.button("Ververs bronnenoverzicht", key="wb_refresh"):
        st.rerun()


def _opslaan(pending: dict) -> None:
    import documenten
    import bestanden
    try:
        opslag.werkbron_opslaan(pending["id"], *pending["doel"], pending["bron"])
    except (ValueError, documenten.Fout, bestanden.Fout) as fout:
        st.session_state.pop("wb_pending", None)
        _fout(fout)
    except (opslag.OpslagConflict, opslag.OpslagNietIngericht, OSError, opslag.httpx.HTTPError) as fout:
        _fout(fout)
    else:
        st.session_state.pop("wb_pending", None)
        st.session_state.pop("wb_nieuw_open", None)
        st.session_state.wb_form_ronde = st.session_state.get("wb_form_ronde", 0) + 1
        st.rerun()
