"""De teksteditor voor documenten (Quill, in de browser): kopjes, vet, lijstjes, afvinklijstjes, links en foto's.

De editor stuurt de tekst kort na elke wijziging naar de app, die hem meteen bewaart. Foto's worden in de browser
eerst verkleind, zodat een document niet onnodig groot wordt. Niet in de herlaadlus van app.py: een onderdeel
mag maar één keer worden aangemeld.
"""

import streamlit as st

QUILL = "https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.js"
QUILL_CSS = "https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css"

CSS = """
.doc-editor { border: 1px solid var(--st-border-color, rgba(128,128,128,.3)); border-radius: 12px; }
.doc-editor .ql-toolbar.ql-snow { border: 0; border-bottom: 1px solid var(--st-border-color, rgba(128,128,128,.3));
  position: sticky; top: 3.75rem; z-index: 5; background: var(--st-background-color, #fff);
  border-radius: 12px 12px 0 0; padding: 6px 8px; }
.doc-editor .ql-container.ql-snow { border: 0; font-family: inherit; font-size: 17px; }
.doc-editor .ql-editor { min-height: 60vh; padding: 20px 22px; line-height: 1.6; color: var(--st-text-color, inherit); }
.doc-editor .ql-editor.ql-blank::before { color: var(--st-text-color, #888); opacity: .45; font-style: normal; }
.doc-editor .ql-editor h1 { font-size: 1.8em; } .doc-editor .ql-editor h2 { font-size: 1.4em; }
.doc-editor .ql-editor img { max-width: 100%; border-radius: 6px; }
.doc-editor .ql-snow .ql-stroke { stroke: var(--st-text-color, #444); }
.doc-editor .ql-snow .ql-fill { fill: var(--st-text-color, #444); }
.doc-editor .ql-snow .ql-picker { color: var(--st-text-color, #444); }
.doc-editor .ql-snow .ql-picker-options { background: var(--st-background-color, #fff); }
.doc-editor .ql-snow.ql-toolbar button:hover .ql-stroke, .doc-editor .ql-snow.ql-toolbar button.ql-active .ql-stroke {
  stroke: var(--st-primary-color, #4f46e5); }
.doc-editor .ql-snow.ql-toolbar button:hover .ql-fill, .doc-editor .ql-snow.ql-toolbar button.ql-active .ql-fill {
  fill: var(--st-primary-color, #4f46e5); }
.doc-editor .ql-snow .ql-tooltip { z-index: 6; }
"""

JS = f"""
const QUILL = "{QUILL}";

function laadQuill() {{
  if (window.Quill) return Promise.resolve(window.Quill);
  if (!window.__quillLaden) {{
    window.__quillLaden = new Promise((klaar, mis) => {{
      const script = document.createElement("script");
      script.src = QUILL; script.onload = () => klaar(window.Quill); script.onerror = mis;
      document.head.appendChild(script);
    }});
  }}
  return window.__quillLaden;
}}

function verkleind(bestand) {{
  return new Promise((klaar) => {{
    const lezer = new FileReader();
    lezer.onload = () => {{
      const beeld = new Image();
      beeld.onload = () => {{
        const schaal = Math.min(1, 1400 / Math.max(beeld.width, beeld.height));
        const doek = document.createElement("canvas");
        doek.width = Math.round(beeld.width * schaal);
        doek.height = Math.round(beeld.height * schaal);
        doek.getContext("2d").drawImage(beeld, 0, 0, doek.width, doek.height);
        klaar(doek.toDataURL("image/jpeg", 0.82));
      }};
      beeld.onerror = () => klaar(null);
      beeld.src = lezer.result;
    }};
    lezer.readAsDataURL(bestand);
  }});
}}

export default function (component) {{
  const {{ data, setStateValue, parentElement }} = component;
  if (!document.getElementById("quill-css")) {{
    const link = document.createElement("link");
    link.id = "quill-css"; link.rel = "stylesheet"; link.href = "{QUILL_CSS}";
    document.head.appendChild(link);
  }}
  let ed = parentElement.__editor;
  if (!ed) {{
    ed = parentElement.__editor = {{ geladen: null, teller: 0, wacht: null }};
    ed.klaar = laadQuill().then((Quill) => {{
      const veld = parentElement.querySelector(".doc-veld");
      const quill = new Quill(veld, {{
        theme: "snow",
        placeholder: "Begin met typen...",
        modules: {{
          toolbar: {{
            container: [[{{ header: [1, 2, 3, false] }}], ["bold", "italic", "underline", "strike"],
                        [{{ list: "ordered" }}, {{ list: "bullet" }}, {{ list: "check" }}], [{{ align: [] }}],
                        ["blockquote", "link", "image"], ["clean"]],
            handlers: {{
              image: () => {{
                const kies = document.createElement("input");
                kies.type = "file"; kies.accept = "image/*";
                kies.onchange = async () => {{
                  if (!kies.files || !kies.files[0]) return;
                  const bron = await verkleind(kies.files[0]);
                  if (!bron) return;
                  const plek = quill.getSelection(true);
                  quill.insertEmbed(plek ? plek.index : quill.getLength(), "image", bron, "user");
                }};
                kies.click();
              }},
            }},
          }},
        }},
      }});
      const stuur = () => {{
        clearTimeout(ed.wacht); ed.wacht = null;
        ed.teller += 1;
        ed.setState("inhoud", {{ delta: quill.getContents(), html: quill.getSemanticHTML(), n: ed.teller,
                                  geladen: ed.geladen }});
      }};
      quill.on("text-change", (_n, _o, bron) => {{
        if (bron !== "user") return;
        clearTimeout(ed.wacht);
        ed.wacht = setTimeout(stuur, 900);
      }});
      const nu = () => {{ if (ed.wacht) stuur(); }};
      quill.root.addEventListener("blur", nu);
      document.addEventListener("visibilitychange", () => {{ if (document.visibilityState === "hidden") nu(); }});
      window.addEventListener("pagehide", nu);
      return quill;
    }});
  }}
  ed.setState = setStateValue;
  ed.klaar.then((quill) => {{
    if (data.laad && data.laad !== ed.geladen && ("inhoud" in data)) {{
      ed.geladen = data.laad;
      clearTimeout(ed.wacht); ed.wacht = null;
      const delta = data.inhoud ? data.inhoud : quill.clipboard.convert({{ html: data.html || "" }});
      quill.setContents(delta, "silent");
      quill.history.clear();
    }}
    quill.enable(!data.alleen_lezen);
  }});
}}
"""

_editor = st.components.v2.component(
    "documenteditor", html='<div class="doc-editor"><div class="doc-veld"></div></div>', css=CSS, js=JS,
    isolate_styles=False)


def editor(key: str, laad: str, inhoud: dict | None = None, html: str = "", stuur_inhoud: bool = True,
           alleen_lezen: bool = False, bij_wijziging=None) -> dict | None:
    """Toont de editor. `laad` verandert alleen als de tekst in de editor vervangen moet worden.

    Geeft de laatste wijziging uit de browser terug: {"delta", "html", "n", "geladen"}, of None.
    Met stuur_inhoud=False gaat de tekst niet opnieuw naar de browser (de editor heeft hem al).
    """
    data = {"laad": laad, "alleen_lezen": alleen_lezen}
    if stuur_inhoud:
        data |= {"inhoud": inhoud, "html": html}
    resultaat = _editor(key=key, data=data, on_inhoud_change=bij_wijziging or (lambda: None))
    return getattr(resultaat, "inhoud", None) if resultaat is not None else None
