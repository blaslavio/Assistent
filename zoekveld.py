"""Een zoekveld dat meteen zoekt terwijl je typt (zonder Enter), met suggesties eronder.

De suggesties komen van het onderdeel zelf: zaken en plekken in de buurt bij Plannen, producten bij de marktplaats,
titels bij documenten. Ze worden in de browser gefilterd, dus ze verschijnen direct bij elke letter. De app krijgt
de zoekterm kort na de laatste toetsaanslag en filtert dan de resultaten eronder.
"""

import streamlit as st

import opslag
import taal

CSS = """
.zv { position: relative; font-family: inherit; }
.zv-rand { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; box-sizing: border-box;
  border: 1px solid var(--st-border-color, rgba(49,51,63,.2)); border-radius: 10px;
  background: var(--st-secondary-background-color, #f0f2f6); }
.zv-rand:focus-within { border-color: var(--st-primary-color, #4f46e5); }
.zv-rand svg { flex: none; opacity: .55; }
.zv input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: inherit; font-size: 16px;
  color: var(--st-text-color, inherit); -webkit-appearance: none; appearance: none; }
.zv input::-webkit-search-cancel-button { display: none; }
.zv-wis { border: 0; background: none; padding: 4px; cursor: pointer; color: inherit; opacity: .5; font-size: 18px;
  line-height: 1; }
.zv-lijst { position: absolute; left: 0; right: 0; top: 44px; z-index: 50; margin: 0; padding: 4px; list-style: none;
  border: 1px solid var(--st-border-color, rgba(49,51,63,.2)); border-radius: 10px;
  background: var(--st-background-color, #fff); box-shadow: 0 6px 24px rgba(0,0,0,.12); max-height: 320px;
  overflow-y: auto; }
.zv-lijst[hidden] { display: none; }
.zv-lijst li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; cursor: pointer;
  color: var(--st-text-color, inherit); }
.zv-lijst li.actief, .zv-lijst li:hover { background: var(--st-secondary-background-color, #f0f2f6); }
.zv-lijst .zv-i { width: 22px; text-align: center; flex: none; }
.zv-lijst .zv-t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zv-lijst small { opacity: .6; white-space: nowrap; }
"""

HTML = """<div class="zv"><div class="zv-rand">
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
 stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
<input type="search" autocomplete="off" autocapitalize="none" enterkeyhint="search">
<button class="zv-wis" type="button" hidden aria-label="Wissen">×</button></div>
<ul class="zv-lijst" hidden></ul></div>"""

JS = """
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const plat = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");

export default function (component) {
  const { data, setStateValue, parentElement } = component;
  const veld = parentElement.querySelector("input");
  const wis = parentElement.querySelector(".zv-wis");
  const lijst = parentElement.querySelector(".zv-lijst");
  let z = parentElement.__zoek;
  if (!z) {
    z = parentElement.__zoek = { wacht: null, gestuurd: null, actief: -1, opties: [] };
    const stuur = () => {
      clearTimeout(z.wacht); z.wacht = null;
      if (veld.value === z.gestuurd) return;
      z.gestuurd = veld.value;
      z.set("q", veld.value);
    };
    z.stuur = stuur;
    const toon = () => {
      const q = plat(veld.value.trim());
      const cijfers = veld.value.replace(/[^0-9]/g, "");
      // Pas suggesties als er iets getypt is; een leeg veld blijft rustig.
      let gevonden = !q ? [] : z.suggesties.filter((s) => plat(s.t + " " + (s.s || "") + " " + (s.z || "")).includes(q)
        || (cijfers.length > 3 && (s.z || "").replace(/[^0-9]/g, "").includes(cijfers)));
      gevonden.sort((a, b) => (plat(b.t).startsWith(q) ? 1 : 0) - (plat(a.t).startsWith(q) ? 1 : 0));
      gevonden = gevonden.slice(0, 7);
      z.opties = gevonden; z.actief = -1;
      lijst.innerHTML = gevonden.length ? gevonden.map((s, i) =>
        `<li data-i="${i}"><span class="zv-i">${esc(s.i || "")}</span><span class="zv-t">${esc(s.t)}</span>`
        + `${s.s ? `<small>${esc(s.s)}</small>` : ""}</li>`).join("") : "";
      lijst.hidden = !gevonden.length || document.activeElement !== veld;
      wis.hidden = !veld.value;
    };
    z.toon = toon;
    const kies = (s) => {
      veld.value = s.v ?? s.t;
      lijst.hidden = true;
      veld.blur();
      stuur();
      wis.hidden = !veld.value;
    };
    veld.addEventListener("input", () => {
      toon();
      clearTimeout(z.wacht);
      z.wacht = setTimeout(stuur, 350);
    });
    veld.addEventListener("focus", toon);
    veld.addEventListener("blur", () => setTimeout(() => { lijst.hidden = true; }, 150));
    veld.addEventListener("keydown", (e) => {
      const items = lijst.querySelectorAll("li[data-i]");
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!items.length) return;
        z.actief = (z.actief + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach((li, i) => li.classList.toggle("actief", i === z.actief));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (z.actief >= 0 && z.opties[z.actief]) kies(z.opties[z.actief]);
        else { lijst.hidden = true; veld.blur(); stuur(); }
      } else if (e.key === "Escape") {
        lijst.hidden = true;
      }
    });
    lijst.addEventListener("pointerdown", (e) => {
      const li = e.target.closest("li[data-i]");
      if (!li) return;
      e.preventDefault();
      kies(z.opties[+li.dataset.i]);
    });
    wis.addEventListener("click", () => { veld.value = ""; stuur(); toon(); veld.focus(); });
    veld.value = data.waarde || "";
    z.gestuurd = veld.value;
  }
  z.set = setStateValue;
  z.suggesties = data.suggesties || [];
  veld.placeholder = data.placeholder || "";
  wis.setAttribute("aria-label", data.wissen || "Wissen");
  if (data.reset && data.reset !== z.reset) {
    z.reset = data.reset;
    veld.value = data.waarde || "";
    z.gestuurd = veld.value;
  }
  if (document.activeElement === veld) z.toon(); else wis.hidden = !veld.value;
}
"""

_zoekveld = st.components.v2.component("zoekveld", html=HTML, css=CSS, js=JS, isolate_styles=False)


def suggestie(tekst: str, onder: str = "", icoon: str = "", waarde: str | None = None, zoek: str = "") -> dict:
    """Een regel onder het zoekveld (de tekst is meestal een naam en wordt niet vertaald). `waarde` komt in het veld als je erop tikt; `zoek` telt mee bij het filteren
    maar wordt niet getoond (bijvoorbeeld een telefoonnummer of een soort keuken)."""
    s = {"t": tekst, "s": taal.t(onder) if onder else "", "i": icoon, "z": zoek}
    if waarde is not None:
        s["v"] = waarde
    return s


def zoekveld(key: str, placeholder: str = "Zoeken", suggesties: list[dict] | None = None,
             waarde: str = "") -> str:
    """Toont het zoekveld en geeft de huidige zoekterm terug (ook zonder Enter).

    Met `waarde` zet je het veld van buitenaf (bijvoorbeeld een zoekopdracht uit de chat); dat gebeurt alleen als die
    waarde verandert, zodat wat iemand aan het typen is niet verspringt.
    """
    resultaat = _zoekveld(key=key, data={
        "placeholder": taal.t(placeholder), "suggesties": (suggesties or [])[:300],
        "waarde": waarde, "reset": waarde or None, "wissen": taal.t("Wissen")}, on_q_change=lambda: None)
    q = getattr(resultaat, "q", None) if resultaat is not None else None
    if q is None:
        q = waarde
    return (q or "").strip()


def context() -> None:
    """Een fragment dat los van de rest opnieuw draait (bij typen), weet nog niet wie er is en welke taal."""
    opslag.gebruik_account(st.session_state.get("naam", ""), st.session_state.get("wachtwoord", ""))
    try:
        code = opslag.instellingen().get("taal") or st.session_state.get("taal")
    except Exception:
        code = st.session_state.get("taal")
    taal.zet(code or taal.uit_browser())


def plek_kiezen(label: str, key: str, waarde: str = "") -> str:
    """Een plek kiezen uit wat je vaker gebruikt (thuis, agenda, contacten), of zelf een nieuwe typen."""
    plekken = opslag.bekende_plekken()
    if waarde and waarde not in plekken:
        plekken.insert(0, waarde)
    thuis = (opslag.instellingen().get("thuisadres") or "").strip()
    return st.selectbox(label, plekken, index=plekken.index(waarde) if waarde else None, key=key,
                        placeholder="Kies een plek of typ een adres", accept_new_options=True,
                        format_func=lambda p: f"Thuis · {p}" if p == thuis else p) or ""
