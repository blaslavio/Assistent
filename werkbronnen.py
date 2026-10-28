"""Bronnen bij taken en afspraken; geen tijdelijke download-URLs opslaan."""
import tekstcontrole
from urllib.parse import urlsplit

SOORTEN = {"notitie": "Notitie of resultaat", "url": "Webverwijzing", "document": "Document in mijn account", "bestand": "Cloudbestand in mijn account"}


def doel(gegevens: dict, soort: str, item_id: int) -> dict:
    if not isinstance(soort, str) or soort not in {"taak", "afspraak"} or type(item_id) is not int:
        raise ValueError("Kies een taak of afspraak.")
    r = next((i for i in gegevens["taken" if soort == "taak" else "afspraken"] if i["id"] == item_id), None)
    if r is None:
        raise ValueError("Deze taak of afspraak is verwijderd. Kies een ander doel.")
    return r


def valideer(bron: dict) -> dict:
    if not isinstance(bron, dict):
        raise ValueError("Ongeldige brongegevens.")
    soort = bron.get("soort")
    titel = bron.get("titel", "")
    if not isinstance(soort, str) or soort not in SOORTEN or not isinstance(titel, str) or not 1 <= len(titel.strip()) <= 160 or not tekstcontrole.veilig(titel):
        raise ValueError("Kies een brontype en geef een titel van maximaal 160 tekens.")
    r = {"soort": soort, "titel": titel.strip()}
    if soort == "notitie":
        tekst = bron.get("tekst", "")
        if not isinstance(tekst, str) or not 1 <= len(tekst.strip()) <= 5000 or not tekstcontrole.veilig(tekst, regels=True):
            raise ValueError("Gebruik een notitie van 1 tot 5000 tekens.")
        r["tekst"] = tekst.strip()
    elif soort == "url":
        url = bron.get("url", "")
        if not isinstance(url, str):
            raise ValueError("Gebruik een volledige HTTPS-link.")
        url = url.strip()
        try:
            delen = urlsplit(url)
            geldig = delen.scheme == "https" and delen.hostname and delen.username is None and delen.password is None and delen.port in {None, 443}
        except (ValueError, TypeError):
            geldig = False
        if not geldig or len(url) > 2000 or any(c.isspace() or ord(c) < 32 for c in url) or "\\" in url:
            raise ValueError("Gebruik een volledige HTTPS-link zonder gebruikersnaam of wachtwoord.")
        r["url"] = url
    else:
        i = bron.get("bron_id")
        if type(i) is not int or i < 1:
            raise ValueError("Kies een bestaand document of bestand.")
        r["bron_id"] = i
    return r


def controleer_cloud(bron: dict) -> None:
    import opslag
    if bron["soort"] not in {"document", "bestand"}:
        return
    if not opslag.online():
        raise ValueError("Clouddocumenten en cloudbestanden vereisen een ingelogd online account.")
    if bron["soort"] == "document":
        import documenten
        documenten.lezen(bron["bron_id"])
    else:
        import bestanden
        bestanden.link(bron["bron_id"])  # autorisatie opnieuw controleren; URL wordt niet bewaard


def overzicht(gegevens: dict, soort: str | None = None, item_id: int | None = None) -> list[dict]:
    regels = []
    for sleutel, bron in gegevens.get("werkbronnen", {}).items():
        if soort and (bron["doel_soort"] != soort or bron["doel_id"] != item_id):
            continue
        try:
            item = doel(gegevens, bron["doel_soort"], bron["doel_id"])
            titel, ontbreekt = item["titel"], False
        except ValueError:
            titel, ontbreekt = "Verwijderde taak of afspraak", True
        regels.append({**bron, "id": sleutel, "doel_titel": titel, "doel_ontbreekt": ontbreekt})
    return sorted(regels, key=lambda b: (b["aangemaakt"], b["id"]), reverse=True)


def cloud_zoeken(soort: str, tekst: str) -> list[dict]:
    import opslag
    if not opslag.online():
        raise ValueError("Log online in om je clouddocumenten en bestanden te zoeken.")
    if soort == "document":
        import documenten
        return [{"id": r["id"], "titel": r["titel"]} for r in documenten.lijst(tekst)][:100]
    if soort == "bestand":
        import bestanden
        return [{"id": r["id"], "titel": r["naam"]} for r in bestanden.zoeken(tekst) if r.get("soort") == "bestand"][:100]
    raise ValueError("Kies een document of cloudbestand.")


def cloud_openen(bron: dict) -> dict:
    import opslag
    if not opslag.online():
        raise ValueError("Log online in om deze bron te openen.")
    if bron["soort"] == "document":
        import documenten
        d = documenten.lezen(bron["bron_id"])
        return {"titel": d["titel"], "tekst": d.get("tekst") or documenten.naar_tekst(d.get("html") or "")}
    if bron["soort"] == "bestand":
        import bestanden
        return {"url": bestanden.link(bron["bron_id"])}
    raise ValueError("Dit is geen cloudbron.")
