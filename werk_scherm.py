"""Schermen voor werken en leren: oefentoetsen, hulpmiddelen, kooplijst en wenslijst, DIY en foto's scannen."""

import ast
import operator
import random
from datetime import date

import anthropic
import streamlit as st

import opslag
import slim
import zoekveld


# --- Algemeen ---------------------------------------------------------------------------

def vraag_assistent(vraag: str, label: str | None = None) -> None:
    st.session_state.vooraf_vraag = vraag
    st.session_state.vooraf_label = label
    st.session_state.ga_naar = "assistent"
    st.rerun(scope="app")


def met_claude(bezig: str, functie, *args, **kwargs):
    """Voert een klus van Claude uit met een wachtmelding. Geeft het resultaat, of None met een nette fout."""
    sleutel = opslag.instellingen().get("anthropic_sleutel", "")
    if not sleutel:
        st.warning("Hiervoor is de assistent nodig. Zet je Anthropic-sleutel bij Instellingen › Assistent.")
        return None
    try:
        with st.spinner(bezig):
            return functie(anthropic.Anthropic(api_key=sleutel), *args, **kwargs)
    except anthropic.APIError as fout:
        st.error(slim.foutmelding(fout))
    except slim.Mislukt as fout:
        st.error(str(fout))
    return None


def euro(bedrag: float | None) -> str:
    if bedrag is None:
        return "prijs onbekend"
    return f"€ {bedrag:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


# --- Leren: oefentoets en flitskaarten -------------------------------------------------

def score_per_stap(uitslagen: list[tuple[int, bool]]) -> dict[int, int]:
    """Van (stap, goed) naar een score 0-5 per stap."""
    per_stap: dict[int, list[bool]] = {}
    for stap, goed in uitslagen:
        per_stap.setdefault(stap, []).append(goed)
    return {stap: round(5 * sum(g) / len(g)) for stap, g in per_stap.items()}


def oefenknoppen(doel: dict) -> None:
    """De manieren om te oefenen bij een leerdoel."""
    kol1, kol2 = st.columns(2)
    with kol1.popover("Oefentoets", width="stretch"):
        aantal = st.segmented_control("Aantal vragen", [5, 10, 15], default=10, key=f"toets_aantal_{doel['id']}")
        if st.button("Start de toets", key=f"toets_start_{doel['id']}", type="primary"):
            if vragen := met_claude("Toets maken...", slim.oefentoets, doel["onderwerp"], doel["stappen"], aantal or 10):
                st.session_state.oefenen = {"soort": "toets", "doel": doel["id"], "vragen": vragen}
                st.rerun()
    if kol2.button("Flitskaarten", key=f"kaarten_{doel['id']}", width="stretch"):
        if kaarten := met_claude("Kaarten maken...", slim.flitskaarten, doel["onderwerp"], doel["stappen"]):
            random.shuffle(kaarten)
            st.session_state.oefenen = {"soort": "kaarten", "doel": doel["id"], "kaarten": kaarten, "nr": 0,
                                        "om": False, "uitslag": []}
            st.rerun()
    kol3, kol4 = st.columns(2)
    if kol3.button("Mondeling overhoren", key=f"overhoor_{doel['id']}", width="stretch",
                   help="De assistent stelt vragen; je kunt ook praten met 🎤"):
        vraag_assistent(f"Overhoor me over {doel['onderwerp']} (leerdoel {doel['id']}). Stel één vraag tegelijk en "
                        "begin bij wat ik het minst goed beheers. Leg de score per stap vast.")
    if kol4.button("Volgende stap uitleggen", key=f"uitleg_{doel['id']}", width="stretch"):
        vraag_assistent(f"Leg de volgende stap van mijn leerdoel {doel['onderwerp']} (leerdoel {doel['id']}) uit "
                        "en stel daarna controlevragen.")
    if toetsen := doel.get("toetsen"):
        laatste = toetsen[-1]
        st.caption(f"Laatst geoefend op {laatste['datum']}: {laatste['goed']} van {laatste['totaal']} goed"
                   + (f" · {len(toetsen)} keer geoefend" if len(toetsen) > 1 else ""))


def oefenen_bezig() -> bool:
    """Toont een lopende toets of flitskaarten. True als er geoefend wordt (dan blijft de rest weg)."""
    o = st.session_state.get("oefenen")
    if not o:
        return False
    doel = next((d for d in opslag.leerdoelen() if d["id"] == o["doel"]), None)
    if not doel:
        st.session_state.pop("oefenen")
        return False
    kol1, kol2 = st.columns([4, 1], vertical_alignment="center")
    kol1.markdown(f"**{'Oefentoets' if o['soort'] == 'toets' else 'Flitskaarten'}: {doel['onderwerp']}**")
    if kol2.button("Stoppen", width="stretch"):
        st.session_state.pop("oefenen")
        st.rerun()
    (toets if o["soort"] == "toets" else kaarten)(o, doel)
    return True


def _afronden(o: dict, doel: dict, uitslagen: list[tuple[int, bool]]) -> None:
    stappen = {s["nummer"] for s in doel["stappen"]}
    for stap, score in score_per_stap(uitslagen).items():
        if stap in stappen:
            opslag.oefening_vastleggen(doel["id"], stap, score)
    opslag.toets_vastleggen(doel["id"], o["soort"], sum(g for _, g in uitslagen), len(uitslagen))
    o["klaar"] = True


def toets(o: dict, doel: dict) -> None:
    vragen = o["vragen"]
    if not o.get("klaar"):
        with st.form("toets"):
            keuzes = []
            for i, v in enumerate(vragen):
                keuzes.append(st.radio(f"**{i + 1}.** {v['vraag']}", range(len(v["opties"])), index=None,
                                       format_func=lambda k, v=v: v["opties"][k], key=f"toetsvraag_{i}"))
            if st.form_submit_button("Nakijken", type="primary"):
                if None in keuzes:
                    st.warning("Beantwoord eerst alle vragen.")
                else:
                    o["keuzes"] = keuzes
                    _afronden(o, doel, [(v["stap"], k == v["juist"]) for v, k in zip(vragen, keuzes)])
                    st.rerun()
        return
    goed = sum(k == v["juist"] for v, k in zip(vragen, o["keuzes"]))
    st.progress(goed / len(vragen), text=f"{goed} van {len(vragen)} goed")
    st.markdown("Uitstekend!" if goed == len(vragen) else "Goed bezig!" if goed >= 0.7 * len(vragen)
                else "Dit oefen je binnenkort nog een keer; de app plant het in.")
    for i, (v, k) in enumerate(zip(vragen, o["keuzes"])):
        juist = k == v["juist"]
        st.markdown(f"{'✅' if juist else '❌'} **{i + 1}.** {v['vraag']}  \n"
                    + ("" if juist else f"Jouw antwoord: {v['opties'][k]}  \nGoed: **{v['opties'][v['juist']]}**  \n")
                    + f":gray[{v['uitleg']}]")
    voortgang_na(doel["id"])


def kaarten(o: dict, doel: dict) -> None:
    lijst, nr = o["kaarten"], o["nr"]
    if o.get("klaar"):
        goed = sum(g for _, g in o["uitslag"])
        st.progress(goed / len(lijst), text=f"{goed} van {len(lijst)} wist je")
        voortgang_na(doel["id"])
        return
    st.progress(nr / len(lijst), text=f"Kaart {nr + 1} van {len(lijst)}")
    kaart = lijst[nr]
    with st.container(border=True):
        st.markdown(f"### {kaart['voorkant']}")
        if o["om"]:
            st.markdown(kaart["achterkant"])
    if not o["om"]:
        if st.button("Omdraaien", type="primary", width="stretch"):
            o["om"] = True
            st.rerun()
        return
    kol1, kol2 = st.columns(2)
    for kolom, label, goed in ((kol1, "Wist ik", True), (kol2, "Nog niet", False)):
        if kolom.button(label, width="stretch", key=f"kaart_{goed}"):
            o["uitslag"].append((kaart["stap"], goed))
            o["nr"], o["om"] = nr + 1, False
            if o["nr"] >= len(lijst):
                _afronden(o, doel, o["uitslag"])
            st.rerun()


def voortgang_na(doel_id: int) -> None:
    doel = next(d for d in opslag.leerdoelen() if d["id"] == doel_id)
    st.progress(opslag.voortgang(doel) / 100, text=f"{doel['onderwerp']}: nu {opslag.voortgang(doel)}% beheerst")
    if st.button("Klaar", type="primary"):
        st.session_state.pop("oefenen")
        st.rerun()


def totaal_voortgang(doelen: list[dict]) -> None:
    if len(doelen) < 2:
        return
    gemiddeld = round(sum(opslag.voortgang(d) for d in doelen) / len(doelen))
    st.progress(gemiddeld / 100, text=f"Alles samen: {gemiddeld}% beheerst in {len(doelen)} leerdoelen")


# --- Hulpmiddelen: notities, focustimer, rekenhulp ------------------------------------

def notities() -> None:
    with st.expander("Nieuwe notitie", expanded=not opslag.lijst("notities")):
        with st.form("nieuwe_notitie", clear_on_submit=True, border=False):
            titel = st.text_input("Titel", placeholder="Bijv. Ideeën presentatie")
            tekst = st.text_area("Notitie", height=150)
            if st.form_submit_button("Bewaren", type="primary") and (titel.strip() or tekst.strip()):
                opslag.lijst_toevoegen("notities", titel=titel.strip() or tekst.strip()[:40], tekst=tekst.strip())
                st.rerun()
    notities = opslag.lijst("notities")
    zoek = zoekveld.zoekveld("notities_zoek", "Zoeken in notities", [
        zoekveld.suggestie(n["titel"], icoon="📝", zoek=n["tekst"][:300]) for n in reversed(notities)], kop="Notities")
    for n in reversed(notities):
        if zoek and zoek.lower() not in (n["titel"] + n["tekst"]).lower():
            continue
        with st.expander(f"{n['titel']}"):
            tekst = st.text_area("Tekst", value=n["tekst"], height=200, key=f"notitie_{n['id']}",
                                 label_visibility="collapsed")
            kol1, kol2, kol3 = st.columns(3)
            if kol1.button("Bewaren", key=f"not_bew_{n['id']}", width="stretch") and tekst != n["tekst"]:
                opslag.lijst_bijwerken("notities", n["id"], tekst=tekst)
                st.toast("Bewaard.", icon="📝")
            if kol2.button("Hulp", key=f"not_hulp_{n['id']}", width="stretch",
                           help="Laat de assistent samenvatten, ordenen of er taken uit halen"):
                vraag_assistent(f"Hier is mijn notitie '{n['titel']}':\n\n{tekst}\n\nVat hem kort samen, orden hem en "
                                "stel voor welke taken of afspraken ik eruit kan halen.", f"Help met '{n['titel']}'")
            if kol3.button("Weg", key=f"not_weg_{n['id']}", width="stretch"):
                opslag.lijst_weg("notities", n["id"])
                st.rerun()


TIMER_HTML = """
<div style="font-family:system-ui,sans-serif;text-align:center;color:#31333f">
  <div id="fase" style="font-size:15px;opacity:.7">Focus</div>
  <div id="klok" style="font-size:56px;font-variant-numeric:tabular-nums;font-weight:600">{minuten}:00</div>
  <div style="display:flex;gap:8px;justify-content:center">
    <button id="start" style="font-size:17px;padding:8px 20px;border-radius:8px;border:0;background:#ff4b4b;color:#fff">Start</button>
    <button id="reset" style="font-size:17px;padding:8px 16px;border-radius:8px;border:1px solid #ccc;background:#fff">Opnieuw</button>
  </div>
</div>
<script>
const focus = {minuten} * 60, pauze = {pauze} * 60;
let over = focus, fase = "Focus", loopt = null, eind = 0;
const klok = document.getElementById("klok"), knop = document.getElementById("start");
function toon() {{ const m = Math.floor(over / 60), s = over % 60; klok.textContent = m + ":" + String(s).padStart(2, "0");
  document.getElementById("fase").textContent = fase; }}
function piep() {{ try {{ const c = new AudioContext(), o = c.createOscillator(); o.frequency.value = 880; o.connect(c.destination);
  o.start(); o.stop(c.currentTime + 0.6); }} catch (e) {{}} if (navigator.vibrate) navigator.vibrate([300, 150, 300]); }}
function tik() {{ over = Math.max(0, Math.round((eind - Date.now()) / 1000)); toon();
  if (over === 0) {{ piep(); fase = fase === "Focus" ? "Pauze" : "Focus"; over = fase === "Focus" ? focus : pauze;
    eind = Date.now() + over * 1000; }} }}
knop.onclick = () => {{ if (loopt) {{ clearInterval(loopt); loopt = null; knop.textContent = "Verder"; }}
  else {{ eind = Date.now() + over * 1000; loopt = setInterval(tik, 500); knop.textContent = "Pauze"; }} }};
document.getElementById("reset").onclick = () => {{ clearInterval(loopt); loopt = null; fase = "Focus"; over = focus;
  knop.textContent = "Start"; toon(); }};
toon();
</script>
"""


def focustimer() -> None:
    kol1, kol2 = st.columns(2)
    minuten = kol1.segmented_control("Focus (minuten)", [25, 45, 60], default=25, key="timer_focus") or 25
    pauze = kol2.segmented_control("Pauze (minuten)", [5, 10, 15], default=5, key="timer_pauze") or 5
    st.iframe(TIMER_HTML.format(minuten=minuten, pauze=pauze), height=170)
    st.caption("Werk geconcentreerd tot de piep, neem dan pauze. Leg je telefoon weg en zet meldingen even uit. "
               "Laat deze pagina open staan.")


_REKENEN = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
            ast.Pow: operator.pow, ast.Mod: operator.mod, ast.USub: operator.neg, ast.UAdd: operator.pos}


def uitrekenen(som: str) -> float:
    """Rekent een som veilig uit (alleen getallen, + - * / ^ % en haakjes). Komma mag als decimaalteken."""
    som = som.replace("×", "*").replace("x", "*").replace(":", "/").replace("÷", "/").replace("^", "**")
    som = som.replace(",", ".")

    def waarde(knoop):
        if isinstance(knoop, ast.Constant) and isinstance(knoop.value, (int, float)):
            return knoop.value
        if isinstance(knoop, ast.BinOp) and type(knoop.op) in _REKENEN:
            links, rechts = waarde(knoop.left), waarde(knoop.right)
            if isinstance(knoop.op, ast.Pow) and abs(rechts) > 100:
                raise ValueError("te groot")
            return _REKENEN[type(knoop.op)](links, rechts)
        if isinstance(knoop, ast.UnaryOp) and type(knoop.op) in _REKENEN:
            return _REKENEN[type(knoop.op)](waarde(knoop.operand))
        raise ValueError("ongeldige som")

    return waarde(ast.parse(som, mode="eval").body)


def getal(x: float) -> str:
    tekst = f"{x:,.4f}".rstrip("0").rstrip(".")
    return tekst.replace(",", "X").replace(".", ",").replace("X", ".")


def rekenhulp() -> None:
    som = st.text_input("Som", placeholder="Bijv. (12,50 + 7,95) x 3", key="som")
    if som.strip():
        try:
            st.markdown(f"### = {getal(uitrekenen(som))}")
        except (ValueError, SyntaxError, ZeroDivisionError, OverflowError):
            st.caption("Deze som snap ik niet. Gebruik getallen, + - x : en haakjes.")
    st.markdown("**Snel uitrekenen**")
    soort = st.segmented_control("Soort", ["Btw", "Korting", "Procent"], default="Btw", key="reken_soort",
                                 label_visibility="collapsed") or "Btw"
    kol1, kol2 = st.columns(2)
    if soort == "Btw":
        bedrag = kol1.number_input("Bedrag", min_value=0.0, value=100.0, step=10.0, key="btw_bedrag")
        tarief = kol2.segmented_control("Tarief", [21, 9], default=21, key="btw_tarief") or 21
        st.markdown(f"Zonder btw → met btw: **{euro(bedrag * (1 + tarief / 100))}** "
                    f"(btw {euro(bedrag * tarief / 100)})  \n"
                    f"Met btw → zonder btw: **{euro(bedrag / (1 + tarief / 100))}** "
                    f"(btw {euro(bedrag - bedrag / (1 + tarief / 100))})")
    elif soort == "Korting":
        prijs = kol1.number_input("Prijs", min_value=0.0, value=50.0, step=5.0, key="korting_prijs")
        procent = kol2.number_input("Korting (%)", min_value=0.0, max_value=100.0, value=25.0, step=5.0)
        st.markdown(f"Je betaalt **{euro(prijs * (1 - procent / 100))}** en bespaart {euro(prijs * procent / 100)}.")
    else:
        deel = kol1.number_input("Deel", value=15.0, key="procent_deel")
        geheel = kol2.number_input("Van het geheel", value=60.0, key="procent_geheel")
        if geheel:
            st.markdown(f"{getal(deel)} is **{getal(100 * deel / geheel)}%** van {getal(geheel)}.")


# --- Kooplijst en wenslijst ------------------------------------------------------------

LIJSTNAAM = {"kooplijst": "Kooplijst", "wenslijst": "Wenslijst"}


def lijstje(naam: str) -> None:
    """Kooplijst of wenslijst, met prijzen vergelijken (goedkoopste eerst)."""
    ander = "wenslijst" if naam == "kooplijst" else "kooplijst"
    with st.form(f"nieuw_{naam}", clear_on_submit=True, border=False):
        rij = st.container(horizontal=True, vertical_alignment="bottom", gap="small")
        product = rij.text_input("Product", placeholder="Bijv. koptelefoon", label_visibility="collapsed")
        prijs = rij.number_input("Prijs", min_value=0.0, value=None, step=5.0, placeholder="Prijs", width=110,
                                 label_visibility="collapsed")
        if rij.form_submit_button("", icon=":material/add:") and product.strip():
            opslag.lijst_toevoegen(naam, naam_product=product.strip(), prijs=prijs, winkel="", link="", gekocht=False)
            st.rerun()
    items = opslag.lijst(naam)
    if not items:
        st.caption("Nog leeg.")
        return
    open_items = [i for i in items if not i.get("gekocht")]
    if bekend := [i["prijs"] for i in open_items if i.get("prijs")]:
        st.caption(f"{len(open_items)} op de lijst · samen ongeveer {euro(sum(bekend))}"
                   + ("" if len(bekend) == len(open_items) else f" ({len(open_items) - len(bekend)} zonder prijs)"))
    for item in sorted(items, key=lambda i: bool(i.get("gekocht"))):
        lijst_item(naam, ander, item)


def lijst_item(naam: str, ander: str, item: dict) -> None:
    with st.container(border=True):
        titel = f"~~{item['naam_product']}~~" if item.get("gekocht") else f"**{item['naam_product']}**"
        details = [euro(item["prijs"])] if item.get("prijs") else []
        if item.get("winkel"):
            details.append(f"[{item['winkel']}]({item['link']})" if item.get("link") else item["winkel"])
        if item.get("bron"):
            details.append(f":gray[{item['bron']}]")
        st.markdown(titel + ("  \n" + " · ".join(details) if details else ""))
        kol1, kol2, kol3, kol4 = st.columns(4)
        if kol1.button("Vergelijk", key=f"verg_{item['id']}", width="stretch", help="Zoek de goedkoopste winkel"):
            if opties := met_claude("Prijzen zoeken op internet...", slim.vergelijken, item["naam_product"]):
                opslag.lijst_bijwerken(naam, item["id"], opties=opties)
                st.rerun()
        if naam == "kooplijst":
            gekocht = kol2.button("Terug" if item.get("gekocht") else "Gekocht", key=f"gek_{item['id']}",
                                  width="stretch")
            if gekocht:
                opslag.lijst_bijwerken(naam, item["id"], gekocht=not item.get("gekocht"))
                st.rerun()
        if kol3.button("→ " + LIJSTNAAM[ander], key=f"verpl_{item['id']}", width="stretch"):
            opslag.verplaatsen(naam, ander, item["id"])
            st.rerun()
        if kol4.button("✕", key=f"lweg_{item['id']}", width="stretch", help="Weghalen"):
            opslag.lijst_weg(naam, item["id"])
            st.rerun()
        if opties := item.get("opties"):
            with st.expander(f"{len(opties)} prijzen gevonden, goedkoopste {euro(opties[0]['prijs'])}"):
                for nr, o in enumerate(opties):
                    totaal = o["prijs"] + (o["verzendkosten"] or 0)
                    verzend = ("" if o["verzendkosten"] is None else
                               " · gratis verzending" if not o["verzendkosten"] else f" · + {euro(o['verzendkosten'])} verzending")
                    kol_a, kol_b = st.columns([5, 1], vertical_alignment="center")
                    kol_a.markdown(f"{'🏆 ' if nr == 0 else ''}**{euro(totaal)}** · [{o['winkel']}]({o['link']}){verzend}  \n"
                                   f":gray[{o['product']}{' · ' + o['opmerking'] if o['opmerking'] else ''}]")
                    if kol_b.button("Kies", key=f"kies_{item['id']}_{nr}"):
                        opslag.lijst_bijwerken(naam, item["id"], prijs=totaal, winkel=o["winkel"], link=o["link"])
                        st.rerun()
                st.caption("Gevonden met zoeken op internet; controleer prijs en voorraad op de site zelf.")


def op_lijst(naam: str, product: str, prijs: float | None = None, bron: str = "") -> None:
    opslag.lijst_toevoegen(naam, naam_product=product, prijs=prijs, winkel="", link="", gekocht=False, bron=bron)
    st.toast(f"Op je {naam} gezet: {product}", icon="⭐" if naam == "wenslijst" else "🛍️")


# --- DIY en hobby ----------------------------------------------------------------------

IDEEEN = ["Vogelhuisje bouwen", "Kaarsen maken", "Moestuinbak van steigerhout", "Leren haken", "Fietsband plakken",
          "Kast schilderen", "Fotolijst maken", "Kruidentuin op de vensterbank"]


def diy() -> None:
    with st.expander("Nieuw project", expanded=not opslag.lijst("diy")):
        idee = st.pills("Ideeën", IDEEEN, key="diy_idee", label_visibility="collapsed")
        with st.form("diy_nieuw", border=False):
            project = st.text_input("Wat wil je maken of doen?", value=idee or "",
                                    placeholder="Bijv. een plank ophangen, macramé plantenhanger, laminaat leggen")
            kol1, kol2 = st.columns(2)
            niveau = kol1.selectbox("Ervaring", ["beginner", "een beetje ervaring", "gevorderd"])
            budget = kol2.number_input("Budget in euro (optioneel)", min_value=0.0, value=None, step=10.0)
            if st.form_submit_button("Maak een plan", type="primary") and project.strip():
                if plan := met_claude("Plan maken...", slim.diy_plan, project.strip(), niveau, budget):
                    opslag.lijst_toevoegen("diy", project=project.strip(), plan=plan, gedaan=[])
                    st.rerun()
    projecten = opslag.lijst("diy")
    if not projecten:
        st.caption("Kies een idee of typ zelf wat je wilt maken. Je krijgt de stappen, wat je nodig hebt, waar je het "
                   "koopt en wat het ongeveer kost.")
    for p in reversed(projecten):
        diy_project(p)


def diy_project(p: dict) -> None:
    plan = p["plan"]
    materialen = plan["materialen"]
    kosten = sum(m["prijs"] for m in materialen if m["prijs"])
    gedaan = set(p.get("gedaan", []))
    with st.container(border=True):
        st.markdown(f"**🔨 {plan['titel']}**  \n{plan['moeilijkheid']} · {plan['tijd']} · materiaal ongeveer "
                    f"**{euro(kosten)}**")
        st.progress(len(gedaan) / max(len(plan["stappen"]), 1), text=f"{len(gedaan)} van {len(plan['stappen'])} stappen")
        with st.expander("Wat heb je nodig"):
            for nr, m in enumerate(materialen):
                kol1, kol2, kol3 = st.columns([5, 1, 1], vertical_alignment="center")
                links = " · ".join(f"[{w}]({u})" for w, u in slim.winkel_links(m["zoekterm"], m["winkel"]))
                kol1.markdown(f"{m['naam']} · {m['hoeveelheid']} · ~{euro(m['prijs'])}  \n:gray[Kopen bij:] {links}")
                if kol2.button("🛍️", key=f"diy_k_{p['id']}_{nr}", help="Op je kooplijst"):
                    op_lijst("kooplijst", m["naam"], m["prijs"], f"voor {plan['titel']}")
                if kol3.button("⭐", key=f"diy_w_{p['id']}_{nr}", help="Op je wenslijst"):
                    op_lijst("wenslijst", m["naam"], m["prijs"], f"voor {plan['titel']}")
            if st.button("Alles op mijn kooplijst", key=f"diy_alles_{p['id']}"):
                for m in materialen:
                    opslag.lijst_toevoegen("kooplijst", naam_product=m["naam"], prijs=m["prijs"], winkel="", link="",
                                           gekocht=False, bron=f"voor {plan['titel']}")
                st.toast(f"{len(materialen)} dingen op je kooplijst gezet.", icon="🛍️")
            if plan["gereedschap"]:
                st.caption("Gereedschap: " + ", ".join(plan["gereedschap"]))
            st.caption("Prijzen zijn een schatting; tik op Vergelijk bij je kooplijst voor actuele prijzen.")
        with st.expander("Stappen"):
            if plan.get("uitleg"):
                st.markdown(plan["uitleg"])
            for nr, stap in enumerate(plan["stappen"]):
                klaar = st.checkbox(f"{nr + 1}. {stap}", value=nr in gedaan, key=f"diy_s_{p['id']}_{nr}")
                if klaar != (nr in gedaan):
                    opslag.lijst_bijwerken("diy", p["id"], gedaan=sorted(gedaan ^ {nr}))
                    st.rerun()
        if plan["veiligheid"]:
            with st.expander("Veiligheid"):
                for tip in plan["veiligheid"]:
                    st.markdown(f"- {tip}")
        kol1, kol2 = st.columns(2)
        if kol1.button("Vraag over dit project", key=f"diy_v_{p['id']}", width="stretch"):
            vraag_assistent(f"Ik ben bezig met het DIY-project '{plan['titel']}'. Ik heb {len(gedaan)} van de "
                            f"{len(plan['stappen'])} stappen gedaan. Help me verder: wat is de volgende stap en waar "
                            "moet ik op letten?", f"Help met {plan['titel']}")
        if kol2.button("Project weghalen", key=f"diy_weg_{p['id']}", width="stretch"):
            opslag.lijst_weg("diy", p["id"])
            st.rerun()


# --- Foto scannen ----------------------------------------------------------------------

def scannen() -> None:
    st.caption("Maak of kies een foto van een product, poster, brief, uitnodiging of bord. De assistent herkent "
               "producten, leest de tekst en zet afspraken, taken of producten met één tik op de goede plek.")
    camera = st.toggle("Camera gebruiken", key="scan_camera")
    foto = (st.camera_input("Maak een foto", label_visibility="collapsed") if camera else
            st.file_uploader("Kies of maak een foto", type=["jpg", "jpeg", "png", "webp", "heic"]))
    wens = st.text_input("Wat wil je weten? (optioneel)", placeholder="Bijv. wat kost dit elders, of zet dit in mijn agenda")
    if foto and st.button("Bekijk de foto", type="primary", width="stretch"):
        data = foto.getvalue()
        if uitslag := met_claude("Foto bekijken...", slim.foto_lezen, data, date.today().isoformat(), wens.strip()):
            st.session_state.scan = uitslag
    if uitslag := st.session_state.get("scan"):
        scan_uitslag(uitslag)
    st.caption("Gezichten worden niet herkend: de assistent zegt nooit wie iemand is. Zo blijft ieders privacy "
               "beschermd. De foto wordt niet bewaard.")


def scan_uitslag(u: dict) -> None:
    st.markdown(f"**{u['beschrijving']}**")
    if u["informatie"]:
        st.markdown(u["informatie"])
    for nr, a in enumerate(u["afspraken"]):
        with st.container(border=True):
            wanneer = f"{a['datum']} {a['begin']}{'-' + a['einde'] if a['einde'] else ''}".strip()
            st.markdown(f"**{a['titel']}** · {wanneer}" + (f" · :material/location_on: {a['locatie']}" if a["locatie"] else ""))
            if st.button("In mijn agenda", key=f"scan_ag_{nr}"):
                try:
                    date.fromisoformat(a["datum"])
                except ValueError:
                    st.error("De datum is niet duidelijk. Zet het zelf in de agenda.")
                else:
                    start = f"{a['datum']}T{a['begin']}" if a["begin"] else a["datum"]
                    einde = f"{a['datum']}T{a['einde']}" if a["begin"] and a["einde"] else None
                    opslag.afspraak_toevoegen(a["titel"], start, einde, locatie=a["locatie"], notitie="Van een foto")
                    st.toast(f"In je agenda: {a['titel']}", icon="📅")
    for nr, taak in enumerate(u["taken"]):
        kol1, kol2 = st.columns([5, 1], vertical_alignment="center")
        kol1.markdown(f"{taak}")
        if kol2.button("➕", key=f"scan_taak_{nr}", help="Als taak toevoegen"):
            opslag.taak_toevoegen(taak)
            st.toast("Taak toegevoegd.", icon="✅")
    for nr, p in enumerate(u["producten"]):
        naam = f"{p['merk']} {p['naam']}".strip() if p["merk"] and p["merk"].lower() not in p["naam"].lower() else p["naam"]
        with st.container(border=True):
            st.markdown(f"**{naam}**" + (f" · op de foto {euro(p['prijs_op_foto'])}" if p["prijs_op_foto"] else ""))
            kol1, kol2, kol3 = st.columns(3)
            if kol1.button("Vergelijk", key=f"scan_verg_{nr}", width="stretch"):
                if opties := met_claude("Prijzen zoeken op internet...", slim.vergelijken, p["zoekterm"]):
                    st.session_state[f"scan_opties_{nr}"] = opties
            if kol2.button("Kooplijst", key=f"scan_k_{nr}", width="stretch"):
                op_lijst("kooplijst", naam, p["prijs_op_foto"], "van een foto")
            if kol3.button("Wenslijst", key=f"scan_w_{nr}", width="stretch"):
                op_lijst("wenslijst", naam, p["prijs_op_foto"], "van een foto")
            for i, o in enumerate(st.session_state.get(f"scan_opties_{nr}", [])):
                totaal = o["prijs"] + (o["verzendkosten"] or 0)
                st.markdown(f"{'🏆 ' if i == 0 else ''}**{euro(totaal)}** · [{o['winkel']}]({o['link']})"
                            f" · :gray[{o['product']}]")
    if u["tekst"]:
        with st.expander("Tekst op de foto"):
            st.code(u["tekst"], language=None, wrap_lines=True)
            if st.button("Bewaar als notitie"):
                opslag.lijst_toevoegen("notities", titel=u["beschrijving"][:40], tekst=u["tekst"])
                st.toast("Bewaard bij Hulpmiddelen › Notities.", icon="📝")
