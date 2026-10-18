"""Wetenschappelijke bronnen zoeken en controleren.

OpenAlex (meer dan 250 miljoen wetenschappelijke publicaties) en Crossref (de
officiële registratie van DOI's) zijn gratis en hebben geen sleutel nodig. Zo
noemt de assistent alleen bronnen die echt bestaan.
"""

import os

import httpx

OPENALEX_URL = os.environ.get("OPENALEX_URL", "https://api.openalex.org")
CROSSREF_URL = os.environ.get("CROSSREF_URL", "https://api.crossref.org")
# Met een contactadres krijg je de snellere "polite pool" van beide diensten.
CONTACT = {"User-Agent": "MijnAssistent/1.0 (mailto:assistent@example.org)"}


def _samenvatting(omgekeerd: dict | None, max_woorden: int = 120) -> str:
    """OpenAlex geeft de samenvatting als woord -> posities; zet die terug in volgorde."""
    if not omgekeerd:
        return ""
    woorden = sorted((p, w) for w, posities in omgekeerd.items() for p in posities)
    tekst = " ".join(w for _, w in woorden[:max_woorden])
    return tekst + (" ..." if len(woorden) > max_woorden else "")


def _doi(waarde: str | None) -> str:
    return (waarde or "").lower().removeprefix("https://doi.org/").removeprefix("doi:").strip()


def zoeken(zoekterm: str, vanaf_jaar: int = 0, aantal: int = 8, alleen_overzichten: bool = False) -> list[dict]:
    """Zoek publicaties, de meest relevante eerst."""
    filters = ["type:article|review|book|book-chapter"]
    if vanaf_jaar:
        filters.append(f"from_publication_year:{vanaf_jaar}")
    if alleen_overzichten:
        filters.append("type:review")
    r = httpx.get(f"{OPENALEX_URL}/works", headers=CONTACT, timeout=30, params={
        "search": zoekterm, "filter": ",".join(filters), "per-page": max(1, min(aantal, 15)),
        "select": "doi,display_name,publication_year,authorships,primary_location,cited_by_count,"
                  "open_access,abstract_inverted_index,type",
    })
    r.raise_for_status()
    resultaten = []
    for w in r.json().get("results", []):
        bron = (w.get("primary_location") or {}).get("source") or {}
        resultaten.append({
            "titel": w.get("display_name") or "",
            "auteurs": [a["author"]["display_name"] for a in w.get("authorships", [])[:6] if a.get("author")],
            "jaar": w.get("publication_year"),
            "tijdschrift": bron.get("display_name") or "",
            "soort": w.get("type") or "",
            "doi": _doi(w.get("doi")),
            "keer_geciteerd": w.get("cited_by_count", 0),
            "gratis_te_lezen": (w.get("open_access") or {}).get("oa_url") or "",
            "samenvatting": _samenvatting(w.get("abstract_inverted_index")),
        })
    return resultaten


def controleren(doi: str) -> dict | None:
    """Gegevens van een publicatie bij Crossref, of None als de DOI niet bestaat."""
    doi = _doi(doi)
    if not doi:
        return None
    r = httpx.get(f"{CROSSREF_URL}/works/{doi}", headers=CONTACT, timeout=30)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    m = r.json()["message"]
    delen = (m.get("issued") or m.get("published") or {}).get("date-parts") or [[None]]
    return {
        "titel": (m.get("title") or [""])[0],
        "auteurs": [f"{a.get('family', '')}, {a.get('given', '')}".strip(", ") for a in m.get("author", [])],
        "jaar": delen[0][0],
        "tijdschrift": (m.get("container-title") or [""])[0],
        "jaargang": m.get("volume", ""),
        "nummer": m.get("issue", ""),
        "paginas": m.get("page", ""),
        "doi": _doi(m.get("DOI")),
    }


def _initialen(voornamen: str) -> str:
    return " ".join(f"{d[0]}." for d in voornamen.replace("-", " ").split() if d)


def _apa_auteur(naam: str) -> str:
    """'Jansen, Piet' of 'Piet Jansen' -> 'Jansen, P.'"""
    if "," in naam:
        achternaam, voornamen = (d.strip() for d in naam.split(",", 1))
    else:
        delen = naam.split()
        achternaam, voornamen = (delen[-1], " ".join(delen[:-1])) if len(delen) > 1 else (naam, "")
    return f"{achternaam}, {_initialen(voornamen)}".strip(", ")


def apa(bron: dict) -> str:
    """Bronvermelding in APA-stijl (7e editie)."""
    auteurs = [_apa_auteur(a) for a in bron.get("auteurs", []) if a]
    if len(auteurs) > 20:
        auteurs = auteurs[:19] + ["...", auteurs[-1]]
    if len(auteurs) > 1:
        namen = ", ".join(auteurs[:-1]) + ", & " + auteurs[-1]
    else:
        namen = auteurs[0] if auteurs else ""
    tekst = f"{namen} ({bron.get('jaar') or 'z.d.'}). {bron.get('titel', '').rstrip('.')}."
    if bron.get("tijdschrift"):
        tekst += f" *{bron['tijdschrift']}*"
        if bron.get("jaargang"):
            tekst += f", *{bron['jaargang']}*"
            if bron.get("nummer"):
                tekst += f"({bron['nummer']})"
        if bron.get("paginas"):
            tekst += f", {bron['paginas']}"
        tekst += "."
    if bron.get("doi"):
        tekst += f" https://doi.org/{bron['doi']}"
    elif bron.get("url"):
        tekst += f" {bron['url']}"
    return tekst.strip()
