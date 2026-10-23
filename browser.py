"""De browser in de app: links en websites openen binnen de app, zodat je nergens heen wordt gestuurd.

Hoe het werkt:
- Een klein onderdeel zonder knoppen vangt op elke pagina klikken op links naar andere websites op en stuurt ze hierheen.
  Links naar de app zelf (een winkel, boekingspagina, pot of korte link) openen meteen op de goede plek.
- Een website die het toestaat, staat in een venster in de app. Sites die dat weigeren (veel grote sites doen dat)
  laten we in leesweergave zien: de tekst, afbeeldingen en links, opgehaald door de app. Links daarin blijven ook in
  de app.
- Betalen, inloggen bij je bank of een ander account en apps zoals WhatsApp of Kaarten gaan wel naar buiten: dat moet
  voor je veiligheid bij de bank of dienst zelf gebeuren.
"""

import html
import ipaddress
import json
import re
import socket
import time
from html.parser import HTMLParser
from urllib.parse import parse_qs, quote_plus, unquote, urljoin, urlsplit

import httpx
import streamlit as st

# Deze gaan altijd naar buiten: betalen, inloggen bij een bank of account, en andere apps openen.
BUITEN = ("stripe.com", "wa.me", "whatsapp.com", "maps.apple.com", "apps.apple.com", "play.google.com",
          "tikkie.me", "bunq.me", "enablebanking.com", "tilisy.com", "accounts.google.com", "appleid.apple.com",
          "account.apple.com", "supabase.co", "strava.com", "paypal.com", "paypal.me", "ideal.nl", "github.io",
          "calendar.google.com", "outlook.live.com", "login.microsoftonline.com", "fitbit.com", "polar.com",
          "withings.com", "ouraring.com")
AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
MAX_GROOT = 3_000_000
ZOEKEN = "https://html.duckduckgo.com/html/?q="
# Routes van de app zelf (?winkel=, ?boek= ...): die openen op de goede plek, niet in de browser.
APP_ROUTES = ("winkel", "boek", "boeking", "pot", "k", "prik", "ruimte", "aanvraag", "bezoek")


class Fout(Exception):
    pass


# --- Links opvangen -------------------------------------------------------------------------------------------

JS = """
export default function (component) {
  const { data, setTriggerValue } = component;
  window.__browserBuiten = data.buiten || [];
  window.__browserApp = data.app || "";
  window.__browserGa = (url) => setTriggerValue("ga", JSON.stringify({ url, t: Date.now() }));
  if (window.__browserLuistert) return;
  window.__browserLuistert = true;
  const naarBuiten = (u) => {
    const host = u.hostname.toLowerCase();
    return window.__browserBuiten.some((b) => host === b || host.endsWith("." + b))
      || (host.includes("google.") && u.pathname.startsWith("/maps"));
  };
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
    const pad = e.composedPath ? e.composedPath() : [];
    const a = pad.find((el) => el && el.tagName === "A" && el.href);
    if (!a) return;
    // Wat bewust naar buiten moet (bijv. "Openen in Safari"), staat in een blok met key "buiten".
    if (pad.some((el) => el && el.classList && [...el.classList].some((c) => c.startsWith("st-key-buiten")))) return;
    let u;
    try { u = new URL(a.href, window.location.href); } catch (err) { return; }
    if (u.protocol !== "http:" && u.protocol !== "https:") return;  // mail, bellen, sms, agenda: de telefoon zelf
    const eigen = u.origin === window.location.origin || (window.__browserApp && u.origin === window.__browserApp);
    if (eigen && !u.search) return;  // gewone navigatie binnen de app
    if (!eigen && naarBuiten(u)) return;
    e.preventDefault();
    e.stopPropagation();
    window.__browserGa(u.href);
  }, true);
}
"""

def _vanger(**kwargs):
    # Pas bij gebruik aanmelden: dan hoort het onderdeel altijd bij de draaiende app.
    return st.components.v2.component("browser_vanger", html="<span></span>", js=JS)(**kwargs)


def vanger(app_adres: str = "") -> str | None:
    """Zet het opvangen van links aan (elke run, op elke pagina). Geeft een aangeklikte link, of None."""
    with st.container(key="browser_vanger_houder"):
        r = _vanger(key="browser_vanger", data={"buiten": list(BUITEN), "app": app_adres.rstrip("/")},
                    on_ga_change=lambda: None)
    st.html("<style>.st-key-browser_vanger_houder{display:none}</style>")
    waarde = getattr(r, "ga", None) if r is not None else None
    if not waarde or waarde == st.session_state.get("_browser_laatste"):
        return None
    st.session_state._browser_laatste = waarde
    try:
        return json.loads(waarde)["url"]
    except (ValueError, KeyError, TypeError):
        return None


def naar_buiten(url: str) -> bool:
    deel = urlsplit(url)
    host = (deel.hostname or "").lower()
    return any(host == b or host.endswith("." + b) for b in BUITEN) or ("google." in host and deel.path.startswith("/maps"))


def app_route(url: str, app_adres: str = "") -> dict | None:
    """Een link naar de app zelf → {"route": waarde} (bijv. {"winkel": "bakker"}), of {"pagina": "agenda"}."""
    deel = urlsplit(url)
    eigen = {urlsplit(a).netloc for a in (app_adres, st.context.url or "") if a}
    if deel.netloc and deel.netloc not in eigen:
        return None
    vragen = {k: v[0] for k, v in parse_qs(deel.query).items() if v}
    if route := {k: vragen[k] for k in APP_ROUTES if k in vragen}:
        return route
    pad = deel.path.strip("/").split("/")[-1] if deel.path.strip("/") else ""
    return {"pagina": pad} if pad else None


def openen(url: str, app_adres: str = "") -> None:
    """Opent een link in de app: een plek in de app zelf, of de browser. Zet alleen de toestand; de aanroeper
    zorgt voor de rerun (of de navigatie via ga_naar)."""
    url = (url or "").strip()
    if (route := app_route(url, app_adres)) is not None:
        if pagina := route.pop("pagina", None):
            st.session_state.ga_naar = pagina
            return
        if "winkel" in route:
            st.session_state.open_winkel = route["winkel"]
            st.session_state.ga_naar = "winkels"
            return
        if "ruimte" in route and route["ruimte"].isdigit():
            st.session_state.open_ruimte = int(route["ruimte"])
            st.session_state.ga_naar = "ruimtes"
            return
        for k, v in route.items():
            st.query_params[k] = v
        st.session_state._browser_herladen = True
        return
    if st.session_state.get("browser_url"):
        geschiedenis = st.session_state.setdefault("browser_terug", [])
        geschiedenis.append(st.session_state.browser_url)
        del geschiedenis[:-30]
    st.session_state.browser_url = url
    st.session_state.ga_naar = "browser"


# --- Ophalen --------------------------------------------------------------------------------------------------

def adres_van(invoer: str) -> str:
    """Wat je in de adresbalk typt → een webadres, of een zoekopdracht."""
    t = invoer.strip()
    if re.match(r"^https?://", t, re.I):
        return t
    if " " not in t and re.match(r"^[\w.-]+\.[a-z]{2,}(/.*)?$", t, re.I):
        return "https://" + t
    return ZOEKEN + quote_plus(t)


def _veilig(url: str) -> None:
    """Alleen gewone websites: geen adressen in het eigen netwerk van de server."""
    deel = urlsplit(url)
    if deel.scheme not in ("http", "https") or not deel.hostname:
        raise Fout("Dit adres kan ik niet openen.")
    try:
        adressen = {a[4][0] for a in socket.getaddrinfo(deel.hostname, deel.port or 443, proto=socket.IPPROTO_TCP)}
    except OSError:
        raise Fout("Deze website kan ik niet vinden. Klopt het adres?")
    for a in adressen:
        ip = ipaddress.ip_address(a.split("%")[0])
        if not ip.is_global:
            raise Fout("Dit adres kan ik niet openen.")


_cache: dict[str, tuple[float, dict]] = {}


def ophalen(url: str) -> dict:
    """{'url': eind-adres, 'html': tekst, 'insluiten': mag in een venster} — 10 minuten bewaard."""
    if (c := _cache.get(url)) and time.time() - c[0] < 600:
        return c[1]
    gevraagd = url
    with httpx.Client(timeout=10, headers={"User-Agent": AGENT, "Accept-Language": "nl,en;q=0.8"}) as client:
        for _ in range(6):
            _veilig(url)
            with client.stream("GET", url) as r:
                if r.is_redirect and r.headers.get("location"):
                    url = urljoin(url, r.headers["location"])
                    continue
                if r.status_code >= 400:
                    raise Fout(f"De website geeft een foutmelding ({r.status_code}).")
                soort = r.headers.get("content-type", "")
                if "html" not in soort and "text" not in soort:
                    uit = {"url": url, "html": "", "insluiten": url.startswith("https://"), "soort": soort}
                    break
                stukken, grootte = [], 0
                for stuk in r.iter_bytes():
                    stukken.append(stuk)
                    grootte += len(stuk)
                    if grootte > MAX_GROOT:
                        break
                tekst = b"".join(stukken).decode(r.encoding or "utf-8", errors="replace")
                uit = {"url": url, "html": tekst, "insluiten": url.startswith("https://") and _mag_insluiten(r.headers),
                       "soort": soort}
                break
        else:
            raise Fout("Deze website stuurt je te vaak door.")
    _cache[gevraagd] = _cache[uit["url"]] = (time.time(), uit)
    if len(_cache) > 200:
        for k in sorted(_cache, key=lambda k: _cache[k][0])[:100]:
            _cache.pop(k, None)
    return uit


def _mag_insluiten(kop) -> bool:
    if kop.get("x-frame-options"):
        return False
    csp = kop.get("content-security-policy", "")
    if m := re.search(r"frame-ancestors([^;]*)", csp, re.I):
        return "*" in m.group(1).split()
    return True


# --- Leesweergave ---------------------------------------------------------------------------------------------

class _Lezer(HTMLParser):
    BLOK = {"h1", "h2", "h3", "h4", "p", "li", "blockquote", "pre", "figcaption", "td", "dt", "dd"}
    WEG = {"script", "style", "noscript", "svg", "nav", "footer", "header", "aside", "form", "button", "select",
           "template", "iframe", "dialog"}

    def __init__(self, basis: str):
        super().__init__(convert_charrefs=True)
        self.basis = basis
        self.titel = ""
        self.beschrijving = ""
        self.blokken: list[dict] = []  # {"soort", "delen": [(tekst, link|None)], "hoofd": bool}
        self.weg = 0
        self.hoofd = 0
        self.blok: dict | None = None
        self.link: str | None = None
        self.in_titel = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in self.WEG:
            self.weg += 1
            return
        if tag == "title":
            self.in_titel = True
        if tag == "meta" and (a.get("name") or a.get("property", "")).lower() in ("description", "og:description"):
            self.beschrijving = self.beschrijving or (a.get("content") or "")
        if self.weg:
            return
        if tag in ("main", "article"):
            self.hoofd += 1
        if tag in self.BLOK:
            self._sluit()
            self.blok = {"soort": tag, "delen": [], "hoofd": self.hoofd > 0}
        elif tag == "a" and a.get("href"):
            self.link = urljoin(self.basis, a["href"])
        elif tag == "img" and (bron := a.get("src") or a.get("data-src")):
            bron = urljoin(self.basis, bron)
            if bron.startswith("https://") and not bron.endswith(".svg"):
                self._sluit()
                self.blokken.append({"soort": "img", "src": bron, "alt": a.get("alt", ""), "hoofd": self.hoofd > 0})
        elif tag == "br" and self.blok:
            self.blok["delen"].append(("\n", None))

    def handle_endtag(self, tag):
        if tag in self.WEG:
            self.weg = max(0, self.weg - 1)
            return
        if tag == "title":
            self.in_titel = False
        if self.weg:
            return
        if tag in ("main", "article"):
            self.hoofd = max(0, self.hoofd - 1)
        if tag in self.BLOK:
            self._sluit()
        elif tag == "a":
            self.link = None

    def handle_data(self, data):
        if self.in_titel:
            self.titel += data
            return
        if self.weg:
            return
        if self.blok is None:
            if not data.strip() or not self.link:
                return
            # Losse links (bijv. in een lijst met kaarten) worden een eigen regel.
            self.blok = {"soort": "p", "delen": [], "hoofd": self.hoofd > 0}
        self.blok["delen"].append((data, self.link))

    def _sluit(self):
        if self.blok and "".join(d for d, _ in self.blok["delen"]).strip():
            self.blokken.append(self.blok)
        self.blok = None

    def klaar(self) -> dict:
        self._sluit()
        blokken = self.blokken
        if sum(b["hoofd"] for b in blokken) >= 3:
            blokken = [b for b in blokken if b["hoofd"]]
        return {"titel": " ".join(self.titel.split())[:200], "beschrijving": self.beschrijving[:300],
                "blokken": blokken[:600]}


def lezen(pagina: dict) -> dict:
    lezer = _Lezer(pagina["url"])
    try:
        lezer.feed(pagina["html"])
    except Exception:
        pass
    return lezer.klaar()


def _link(url: str) -> str:
    """Zoeklinks van DuckDuckGo (/l/?uddg=...) worden het echte adres."""
    deel = urlsplit(url)
    if deel.path.startswith("/l/") and (doel := parse_qs(deel.query).get("uddg")):
        return unquote(doel[0])
    return url


def lees_html(inhoud: dict) -> str:
    """Leesweergave als veilige HTML: alles wordt ontsnapt, links worden knoppen die in de app blijven."""
    e = html.escape
    uit = []
    for b in inhoud["blokken"]:
        if b["soort"] == "img":
            uit.append(f'<img src="{e(b["src"])}" alt="{e(b["alt"])}" loading="lazy" referrerpolicy="no-referrer">')
            continue
        tekst = "".join(
            f'<a data-url="{e(_link(link))}" href="#">{e(d)}</a>' if link and link.startswith(("http://", "https://"))
            else e(d).replace("\n", "<br>") for d, link in b["delen"])
        tag = {"td": "p", "dt": "p", "dd": "p", "figcaption": "p"}.get(b["soort"], b["soort"])
        uit.append(f"<{tag}>{tekst}</{tag}>")
    return "\n".join(uit) or "<p>Op deze pagina staat geen tekst die ik kan laten zien.</p>"


LEES_CSS = """
.lezer { font: inherit; font-size: 1rem; line-height: 1.55; color: var(--st-text-color, inherit); max-width: 720px;
  margin: 0 auto; overflow-wrap: anywhere; }
.lezer h1 { font-size: 1.5em; line-height: 1.25; } .lezer h2 { font-size: 1.25em; } .lezer h3 { font-size: 1.1em; }
.lezer img { max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0; display: block; }
.lezer a { color: var(--st-primary-color, #4f46e5); text-decoration: underline; cursor: pointer; }
.lezer li { margin-left: 1.2em; list-style: disc; display: list-item; }
.lezer pre { white-space: pre-wrap; background: rgba(127,127,127,.12); padding: 8px; border-radius: 8px; }
.lezer blockquote { border-left: 3px solid rgba(127,127,127,.4); margin: 0; padding-left: 12px; }
"""

LEES_JS = """
export default function (component) {
  const { data, parentElement, setTriggerValue } = component;
  const vak = parentElement.querySelector(".lezer");
  if (vak.dataset.versie !== data.versie) {
    vak.innerHTML = data.html;
    vak.dataset.versie = data.versie;
  }
  vak.onclick = (e) => {
    const a = e.target.closest("a[data-url]");
    if (!a) return;
    e.preventDefault();
    setTriggerValue("ga", JSON.stringify({ url: a.dataset.url, t: Date.now() }));
  };
}
"""

def _lezer(**kwargs):
    return st.components.v2.component("browser_lezer", html='<div class="lezer"></div>', css=LEES_CSS,
                                      js=LEES_JS)(**kwargs)


def zoekresultaten(pagina: dict) -> list[dict]:
    """Resultaten van DuckDuckGo (html-versie): titel, adres en een stukje tekst."""
    uit = []
    for blok in re.findall(r'<div class="result[^"]*results_links.*?(?=<div class="result[^"]*results_links|\Z)',
                           pagina["html"], re.S):
        a = re.search(r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', blok, re.S)
        if not a:
            continue
        stukje = re.search(r'class="result__snippet"[^>]*>(.*?)</a>', blok, re.S)
        schoon = lambda t: html.unescape(re.sub(r"<[^>]+>", "", t or "")).strip()
        url = _link(urljoin("https://duckduckgo.com", html.unescape(a.group(1))))
        if "duckduckgo.com/y.js" in url:
            continue  # advertentie
        uit.append({"titel": schoon(a.group(2)), "url": url, "tekst": schoon(stukje.group(1) if stukje else "")})
    return uit[:20]


def zoek_html(resultaten: list[dict]) -> str:
    e = html.escape
    if not resultaten:
        return "<p>Niets gevonden.</p>"
    return "\n".join(f'<p><a data-url="{e(r["url"])}" href="#"><b>{e(r["titel"])}</b></a><br>'
                     f'<small>{e(urlsplit(r["url"]).netloc)}</small><br>{e(r["tekst"])}</p>' for r in resultaten)


# --- De pagina ------------------------------------------------------------------------------------------------

def pagina() -> None:
    """Pagina Browser: adresbalk, terug, en de website (in een venster of als leesweergave)."""
    url = st.session_state.get("browser_url", "")
    terug = st.session_state.get("browser_terug", [])
    if st.session_state.get("_browser_getoond") != url:
        # Het adres in de balk volgt de pagina die open staat.
        st.session_state._browser_getoond = url
        st.session_state.browser_invoer = "" if url.startswith(ZOEKEN) else url

    def ga() -> None:
        if invoer := st.session_state.get("browser_invoer", "").strip():
            openen(adres_van(invoer))

    with st.container(horizontal=True, vertical_alignment="center", gap="small"):
        if st.button("", icon=":material/arrow_back:", help="Terug", disabled=not terug, key="browser_terug_knop"):
            st.session_state.browser_url = terug.pop()
            st.rerun()
        st.text_input("Adres", key="browser_invoer", on_change=ga, placeholder="Zoek of typ een webadres",
                      label_visibility="collapsed", width="stretch")
        if url and not url.startswith(ZOEKEN):
            with st.popover("", icon=":material/more_vert:"):
                if st.button("Leesweergave" if not st.session_state.get("browser_lezen") else "Website zelf",
                             icon=":material/chrome_reader_mode:", width="stretch"):
                    st.session_state.browser_lezen = not st.session_state.get("browser_lezen")
                    st.rerun()
                with st.container(key="buiten_safari"):
                    st.link_button("Openen in Safari", url, icon=":material/open_in_new:", width="stretch")
    if not url:
        st.caption("Links die je in de app opent, komen hier. Je blijft gewoon in de app.")
        return
    try:
        with st.spinner("Laden..."):
            p = ophalen(url)
    except Fout as fout:
        st.error(str(fout))
        return
    except httpx.HTTPError:
        st.error("Deze website reageert niet. Probeer het later opnieuw.")
        return
    gekozen = _lees_klik(p, url)
    if gekozen:
        openen(gekozen)
        st.rerun()


def _lees_klik(p: dict, url: str) -> str | None:
    """Toont de pagina. Geeft een aangeklikte link uit de leesweergave terug."""
    if url.startswith(ZOEKEN):
        inhoud_html = zoek_html(zoekresultaten(p))
        st.markdown(f"**Zoeken:** {html.escape(unquote(url[len(ZOEKEN):]).replace('+', ' '))}")
    elif p["insluiten"] and not st.session_state.get("browser_lezen"):
        st.iframe(p["url"], height=720)
        return None
    elif not p["html"]:
        st.info("Dit bestand kan ik hier niet laten zien.")
        with st.container(key="buiten_bestand"):
            st.link_button("Openen", p["url"], icon=":material/open_in_new:")
        return None
    else:
        inhoud = lezen(p)
        if inhoud["titel"]:
            st.subheader(inhoud["titel"])
        st.caption(urlsplit(p["url"]).netloc)
        inhoud_html = lees_html(inhoud)
    r = _lezer(key="browser_lezer", data={"html": inhoud_html, "versie": str(hash(inhoud_html))},
               on_ga_change=lambda: None)
    waarde = getattr(r, "ga", None) if r is not None else None
    if waarde and waarde != st.session_state.get("_lezer_laatste"):
        st.session_state._lezer_laatste = waarde
        try:
            return json.loads(waarde)["url"]
        except (ValueError, KeyError, TypeError):
            return None
    return None
