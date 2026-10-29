"""De nieuwe app (web/) op het adres van deze app: /?nieuw=1.

De nieuwe app staat ook op GitHub Pages, maar zo werkt hij zonder tweede adres. We zetten de gebouwde app
(nieuwe_app/app.js en app.css, gemaakt met `npm run build` in web/) als één pagina in een venster dat het hele
scherm vult. Dat venster hoort bij dit adres, zodat inloggen en gegevens net zo werken als op GitHub Pages.
"""

from pathlib import Path

import streamlit as st

MAP = Path(__file__).parent / "nieuwe_app"

JS = """
export default function (component) {
  const { data } = component;
  if (!data || !data.html || window.__nieuweApp) return;
  // Op een iPhone zoomt Safari in als je in een klein invulveld tikt, en dan verschuift het scherm. Dat zetten we uit.
  let kijk = document.querySelector('meta[name="viewport"]');
  if (!kijk) { kijk = document.createElement("meta"); kijk.name = "viewport"; document.head.appendChild(kijk); }
  kijk.content = "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover";
  const venster = document.createElement("iframe");
  venster.title = "Assistent";
  venster.setAttribute("allow", "microphone; camera; autoplay; clipboard-read; clipboard-write; fullscreen; geolocation; web-share");
  venster.style.cssText = "position:fixed;inset:0;width:100vw;height:100dvh;border:0;z-index:2147483000;"
    + "background:" + (matchMedia("(prefers-color-scheme: dark)").matches ? "#0b0b0e" : "#ffffff");
  venster.srcdoc = data.html.replace("__OUDE_APP__", JSON.stringify(location.origin + "/"));
  document.body.appendChild(venster);
  window.__nieuweApp = venster;
  // Het scherm staat vast: de pagina eronder scrollt nooit mee, ook niet als het toetsenbord opent. Het venster
  // volgt precies het zichtbare deel, zodat het invoerveld vlak boven het toetsenbord staat.
  document.documentElement.style.overflow = "hidden";
  document.documentElement.style.overscrollBehavior = "none";
  document.body.style.cssText += ";position:fixed;inset:0;overflow:hidden;overscroll-behavior:none";
  const vv = window.visualViewport;
  const pas = () => {
    venster.style.height = Math.round(vv ? vv.height : window.innerHeight) + "px";
    venster.style.top = Math.round(vv ? vv.offsetTop : 0) + "px";
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  };
  if (vv) { vv.addEventListener("resize", pas); vv.addEventListener("scroll", pas); }
  window.addEventListener("scroll", pas, { passive: true });
  pas();
}
"""

_onderdeel = st.components.v2.component("nieuweapp", html="<span></span>", js=JS)


@st.cache_data(show_spinner=False)
def _pagina(versie: float) -> str:  # versie (mtime) telt mee in de cache: nieuwe build, nieuwe pagina
    js = (MAP / "app.js").read_text(encoding="utf-8").replace("</script", "<\\/script")
    css = (MAP / "app.css").read_text(encoding="utf-8").replace("</style", "<\\/style")
    return f"""<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<title>Assistent</title>
<script>window.OUDE_APP = __OUDE_APP__;</script>
<style>{css}</style>
<script type="module">{js}</script>
</head>
<body>
<div id="root"></div>
</body>
</html>"""


def beschikbaar() -> bool:
    return (MAP / "app.js").exists() and (MAP / "app.css").exists()


def toon() -> None:
    """Vult het scherm met de nieuwe app. Verder niets op deze pagina."""
    if not beschikbaar():
        st.error("De nieuwe app is nog niet klaar. Probeer het later nog eens.")
        return
    st.markdown("<style>header, footer, [data-testid='stToolbar'] {display:none !important}</style>",
                unsafe_allow_html=True)
    _onderdeel(key="nieuwe_app", data={"html": _pagina((MAP / "app.js").stat().st_mtime)})
