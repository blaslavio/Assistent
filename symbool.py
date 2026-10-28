"""Symbolen in plaats van emoji's: de rustige lijnicoontjes (Material Symbols) die Streamlit ook gebruikt.

In tekst die Streamlit als markdown toont (knoppen, kopjes, st.markdown) gebruik je md("naam");
in eigen HTML (st.html of markdown met unsafe_allow_html) html("naam").
Namen staan op https://fonts.google.com/icons."""

import html as _html

_STIJL = ("font-family:'Material Symbols Rounded';font-weight:400;font-style:normal;line-height:1;"
          "display:inline-block;vertical-align:-0.2em;white-space:nowrap;letter-spacing:normal;text-transform:none;"
          "font-feature-settings:'liga';-webkit-font-feature-settings:'liga';-webkit-font-smoothing:antialiased")


def md(naam: str) -> str:
    """Voor markdown: ":material/naam:"."""
    return f":material/{naam}:" if naam else ""


def html(naam: str, grootte: str = "1.15em", kleur: str = "") -> str:
    """Voor eigen HTML: een <span> met het symbool."""
    if not naam:
        return ""
    extra = f";color:{kleur}" if kleur else ""
    return (f'<span aria-hidden="true" style="{_STIJL};font-size:{grootte};width:{grootte}{extra}">'
            f'{_html.escape(naam)}</span>')
