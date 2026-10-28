"""Tijdgebonden conceptacties: gehele centen, UTC-vervaldatum en accountinterne verwijzingen."""
import tekstcontrole

from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
import re

_OPDRACHT = re.compile(r"^(?:maak|creëer)\s+(?:een\s+)?(?:actie)?link\b(?:\s+voor\b)?\s*(.*)$", re.I)


class Fout(ValueError):
    pass


def nu() -> datetime:
    return datetime.now(timezone.utc)


def prijs_cent(waarde: str) -> int:
    tekst = str(waarde).strip()
    if not re.fullmatch(r"\d{1,7}(?:[.,]\d{1,2})?", tekst):
        raise Fout("Geef een prijs op met maximaal twee decimalen, zonder duizendtalscheiding.")
    try:
        centen = int(Decimal(tekst.replace(",", ".")) * 100)
    except (InvalidOperation, ValueError):
        raise Fout("Deze prijs kan niet worden verwerkt.") from None
    if not 0 <= centen <= 100_000_000:
        raise Fout("Gebruik een prijs tussen € 0 en € 1.000.000.")
    return centen


def euro(centen: int) -> str:
    return f"€ {centen // 100},{centen % 100:02d}"


def valideer(voorstel: dict) -> dict:
    if not isinstance(voorstel, dict):
        raise Fout("Geef geldige conceptgegevens op.")
    titel = voorstel.get("titel", "")
    if not isinstance(titel, str) or not 1 <= len(titel.strip()) <= 160 or not tekstcontrole.veilig(titel):
        raise Fout("Geef een titel van 1 tot 160 tekens op.")
    prijs, uren = voorstel.get("prijs_cent"), voorstel.get("uren")
    if type(prijs) is not int or not 0 <= prijs <= 100_000_000:
        raise Fout("Vul een geldige prijs in, ook bij een gratis actie.")
    if type(uren) is not int or not 1 <= uren <= 168:
        raise Fout("Gebruik een geldigheid van 1 tot 168 uur (zeven dagen).")
    return {"titel": titel.strip(), "prijs_cent": prijs, "uren": uren}


def herkent(tekst: str) -> bool:
    return isinstance(tekst, str) and bool(_OPDRACHT.match(tekst.strip()))


def voorstel(tekst: str) -> dict | None:
    opdracht = _OPDRACHT.match(tekst.strip().rstrip(".!"))
    if not opdracht:
        return None
    if len(tekst) > 500:
        raise Fout("Gebruik een opdracht van maximaal 500 tekens.")
    inhoud = opdracht[1].strip()
    duur = list(re.finditer(r"(?:(?:geldig(?:\s+voor)?|voor)\s+(\d+)\s*(uur|uren|dagen|dag)\b|(\d+)\s*(uur|uren|dagen|dag)\s+geldig\b)", inhoud, re.I))
    if (re.search(r"\bgeldig\b", inhoud, re.I) or re.search(r"\bvoor\s+-\d+\s*(?:uur|uren|dag|dagen)\b", inhoud, re.I)) and not duur:
        raise Fout("Geef de geldigheid op als een heel aantal uren of dagen, bijvoorbeeld ‘geldig voor 24 uur’.")
    if len(duur) > 1:
        raise Fout("Geef één geldigheidsduur op; pas een eventuele sessieduur aan in de titel.")
    uren = 24
    if duur:
        m = duur[0]
        uren = int(m[1] or m[3]) * (24 if (m[2] or m[4]).lower().startswith("dag") else 1)
        inhoud = inhoud[:m.start()] + " " + inhoud[m.end():]
    prijzen = list(re.finditer(r"(?:€\s*([+-]?\d[\d.,]*)(?![\w.,])|(?<![\w.,])([+-]?\d[\d.,]*)\s*euro\b)", inhoud, re.I))
    if "€" in inhoud and not prijzen:
        raise Fout("De prijs kan niet worden gelezen. Gebruik bijvoorbeeld € 45,00.")
    if len(prijzen) > 1:
        raise Fout("Geef één prijs op voor deze actie.")
    centen = None
    if prijzen:
        m = prijzen[0]
        centen = prijs_cent(m[1] or m[2])
        links = re.sub(r"\b(?:van|voor)\s*$", "", inhoud[:m.start()], flags=re.I)
        inhoud = links + " " + inhoud[m.end():]
    if not 1 <= uren <= 168:
        raise Fout("Gebruik een geldigheid van 1 tot 168 uur.")
    titel = re.sub(r"\s+", " ", inhoud).strip(" ,.;:-")
    return {"titel": titel, "prijs_cent": centen, "uren": uren}


def maak(voorstel: dict, code: str, moment: datetime | None = None) -> dict:
    r = valideer(voorstel)
    verwijzing(code)
    moment = nu() if moment is None else moment
    if not isinstance(moment, datetime) or moment.tzinfo is None:
        raise Fout("Gebruik een tijdstip met tijdzone.")
    moment = moment.astimezone(timezone.utc)
    return {"code": code, "titel": r["titel"], "prijs_cent": r["prijs_cent"], "concept": True,
            "aangemaakt": moment.astimezone(timezone.utc).isoformat(),
            "vervalt": (moment + timedelta(hours=r["uren"])).astimezone(timezone.utc).isoformat(), "ingetrokken": False}


def status(link: dict, moment: datetime | None = None) -> str:
    if not isinstance(link, dict):
        raise Fout("Geef geldige conceptgegevens op.")
    if link.get("ingetrokken"):
        return "ingetrokken"
    try:
        einde = datetime.fromisoformat(link["vervalt"])
        if einde.tzinfo is None:
            raise ValueError
        return "verlopen" if (moment or nu()) >= einde else "actief concept"
    except (KeyError, TypeError, ValueError):
        raise Fout("Deze conceptlink heeft een ongeldige vervaldatum.") from None


def verwijzing(code: str) -> str:
    if not isinstance(code, str) or not re.fullmatch(r"[A-Za-z0-9_-]{32}", code):
        raise Fout("Ongeldige conceptcode.")
    return f"?actie={code}"
