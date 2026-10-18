"""Praten met de assistent: inspreken en antwoorden laten voorlezen.

Alles gebeurt in de browser (Safari), dus zonder extra kosten of sleutels:
spraakherkenning via de dicteerfunctie van het apparaat en voorlezen met de
stemmen die op het apparaat staan.
"""

import re

import streamlit as st

# Regio's en de taalcode van de stem.
REGIO = {"Nederland": "nl-NL", "Vlaanderen": "nl-BE"}
GESLACHT = ["Vrouw", "Man"]
STANDAARD = {"regio": "Nederland", "geslacht": "Vrouw", "snelheid": 1.0, "voorlezen": True, "doorpraten": False}

HTML = """
<div class="spraak">
  <button class="praat" type="button">🎤 Praat</button>
  <button class="lees" type="button" title="Voorlezen">🔊</button>
  <button class="stop" type="button" title="Stoppen">⏹️</button>
  <div class="status"></div>
</div>
"""

CSS = """
.spraak { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 4px 0 8px; }
button { font: inherit; border-radius: 999px; border: 1px solid var(--st-border-color, #ccc); padding: 10px 18px;
         background: var(--st-secondary-background-color); color: var(--st-text-color); cursor: pointer; }
button.praat { background: var(--st-primary-color); color: white; border: none; font-weight: 600; flex: 1; min-width: 140px; }
button.praat.aan { background: #e0443e; }
.status { width: 100%; font-size: 14px; opacity: .7; min-height: 1em; }
"""

JS = """
const VROUW = ["claire", "ellen", "fleur", "lotte", "sara", "anna", "colette", "femke", "lisa", "google nederlands"];
const MAN = ["xander", "ari", "maarten", "bart", "frank", "guus", "daan", "ruben"];

function kiesStem(taal, geslacht) {
  const alle = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  const nl = alle.filter(v => v.lang && v.lang.toLowerCase().startsWith("nl"));
  const zelfdeRegio = nl.filter(v => v.lang.replace("_", "-").toLowerCase() === taal.toLowerCase());
  const namen = geslacht === "Man" ? MAN : VROUW;
  const past = l => l.find(v => namen.some(n => v.name.toLowerCase().includes(n)));
  // Verbeterde (premium) stemmen klinken natuurlijker, die gaan voor.
  const beste = l => l.find(v => /premium|enhanced|verbeterd/i.test(v.name) && namen.some(n => v.name.toLowerCase().includes(n)));
  return beste(zelfdeRegio) || past(zelfdeRegio) || beste(nl) || past(nl) || zelfdeRegio[0] || nl[0] || null;
}

export default function (component) {
  const { data, setTriggerValue, parentElement } = component;
  const d = data || {};
  const praat = parentElement.querySelector(".praat");
  const lees = parentElement.querySelector(".lees");
  const stop = parentElement.querySelector(".stop");
  const status = parentElement.querySelector(".status");
  const Herkenning = window.SpeechRecognition || window.webkitSpeechRecognition;
  window.__assistentGesproken = window.__assistentGesproken || new Set();

  if (d.alleen_voorlezen) praat.style.display = "none";

  function spreek(tekst, daarna) {
    if (!window.speechSynthesis || !tekst) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(tekst);
    u.lang = d.taal || "nl-NL";
    u.rate = d.snelheid || 1;
    const stem = kiesStem(u.lang, d.geslacht);
    if (stem) u.voice = stem;
    u.onend = () => { status.textContent = ""; if (daarna) daarna(); };
    status.textContent = "🔊 Aan het voorlezen...";
    speechSynthesis.speak(u);
  }

  let luistert = false;
  let herkenner = null;
  function luister() {
    if (!Herkenning) {
      status.textContent = "Inspreken werkt hier niet. Tik in het tekstvak onderaan op 🎤 van je toetsenbord.";
      return;
    }
    if (window.speechSynthesis) speechSynthesis.cancel();
    herkenner = new Herkenning();
    herkenner.lang = d.taal || "nl-NL";
    herkenner.interimResults = true;
    herkenner.continuous = false;
    let tekst = "";
    herkenner.onresult = e => {
      tekst = Array.from(e.results).map(r => r[0].transcript).join(" ");
      status.textContent = "🎤 " + tekst;
    };
    herkenner.onerror = e => {
      status.textContent = e.error === "not-allowed"
        ? "Geef Safari toegang tot de microfoon (Instellingen > Safari > Microfoon) en zet Dicteren aan."
        : "Ik heb niets gehoord. Tik nog eens op Praat.";
    };
    herkenner.onend = () => {
      luistert = false;
      praat.classList.remove("aan");
      praat.textContent = "🎤 Praat";
      if (tekst.trim()) {
        status.textContent = "✓ " + tekst;
        setTriggerValue("gezegd", tekst.trim());
      }
    };
    luistert = true;
    praat.classList.add("aan");
    praat.textContent = "● Ik luister... (tik om te stoppen)";
    status.textContent = "";
    herkenner.start();
  }

  praat.onclick = () => {
    // Een lege uitspraak tijdens de tik ontgrendelt voorlezen op de iPad.
    if (window.speechSynthesis) speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    if (luistert && herkenner) { herkenner.stop(); return; }
    luister();
  };
  lees.onclick = () => spreek(d.tekst);
  stop.onclick = () => {
    if (window.speechSynthesis) speechSynthesis.cancel();
    if (herkenner) herkenner.abort();
    status.textContent = "";
  };
  lees.disabled = !d.tekst;

  // Nieuw antwoord: één keer automatisch voorlezen, en bij doorpraten daarna weer luisteren.
  if (d.automatisch && d.id && d.tekst && !window.__assistentGesproken.has(d.id)) {
    window.__assistentGesproken.add(d.id);
    const start = () => spreek(d.tekst, d.doorpraten ? luister : null);
    if (window.speechSynthesis && speechSynthesis.getVoices().length === 0) {
      speechSynthesis.onvoiceschanged = () => { speechSynthesis.onvoiceschanged = null; start(); };
      setTimeout(start, 600);
    } else {
      start();
    }
  }

  return () => {
    if (herkenner) herkenner.abort();
  };
}
"""

_component = st.components.v2.component("spraak", html=HTML, css=CSS, js=JS)


def instellingen(opgeslagen: dict | None) -> dict:
    return {**STANDAARD, **(opgeslagen or {})}


def voor_voorlezen(tekst: str) -> str:
    """Markdown omzetten naar gewone zinnen: zonder sterretjes, kopjes, links en emoji-opsommingen."""
    tekst = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", tekst)
    tekst = re.sub(r"https?://\S+", "", tekst)
    tekst = re.sub(r"[*_`#>|]", "", tekst)
    tekst = re.sub(r"^\s*[-•]\s*", "", tekst, flags=re.M)
    tekst = re.sub(r"\s*\n+\s*", ". ", tekst.strip())
    tekst = re.sub(r"([:.!?])\.", r"\1", tekst)
    return re.sub(r"\s+", " ", tekst).strip()


def knop(stem: dict, tekst: str = "", antwoord_id: str = "", automatisch: bool = False, key: str = "spraak",
         alleen_voorlezen: bool = False) -> str | None:
    """Toont de spraakknoppen. Geeft terug wat er is ingesproken, of None."""
    resultaat = _component(
        key=key,
        data={
            "tekst": voor_voorlezen(tekst),
            "id": antwoord_id,
            "automatisch": automatisch,
            "taal": REGIO.get(stem["regio"], "nl-NL"),
            "geslacht": stem["geslacht"],
            "snelheid": stem["snelheid"],
            "doorpraten": stem["doorpraten"],
            "alleen_voorlezen": alleen_voorlezen,
        },
        on_gezegd_change=lambda: None,
    )
    return getattr(resultaat, "gezegd", None) if resultaat is not None else None
