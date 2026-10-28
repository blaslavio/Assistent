"""Herken beperkte opdrachten; voer niets uit tijdens het herkennen."""
import tekstcontrole

import re
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import snelinvoer
import actielinks

_OPDRACHT = re.compile(r"^(?:plan|afspraak|overleg|taak|herinner)\b\s*:?[ \t]*(.*)", re.I)
_BETALING = re.compile(r"^(?:betaal\b|boek over\b|maak over\b|(?:stuur|tip)\s+(?:€\s*)?\d+(?:[.,]\d{1,2})?(?:\s*(?:euro\b|naar\b)|\s*$))", re.I)


def routeer(tekst: str, vervolg: dict | None = None, nu: datetime | None = None) -> dict:
    """Kies een opdracht, vervolgvraag of vrije AI-vraag zonder gegevens te wijzigen."""
    tekst = tekst.strip()
    nu = nu or datetime.now(ZoneInfo("Europe/Amsterdam")).replace(tzinfo=None)
    actie = actielinks.voorstel(tekst)
    if actie is not None:
        return {"soort": "actielink", "gegevens": actie}
    if re.fullmatch(r"(?:herplan (?:de rest van vandaag|mijn dag)|(?:deze|die) taak is (?:nog )?niet af)[.!?]?", tekst, re.I):
        return {"soort": "herplan", "uitloop": 0}
    uitloop = re.fullmatch(r"(?:dit |het |de )?(?:overleg|afspraak) loopt (?:een )?(halfuur|half uur|\d+ minuten?) uit[.!]?", tekst, re.I)
    if uitloop:
        waarde = uitloop[1].lower()
        return {"soort": "herplan", "uitloop": 30 if waarde.startswith("half") else int(waarde.split()[0])}
    if re.fullmatch(r"plan mijn dag(?: voor vandaag)?[.!?]?", tekst, re.I):
        return {"soort": "dagplan"}
    if re.match(r"^plan mijn dag\b", tekst, re.I):
        return {"soort": "bericht", "tekst": "Een dagvoorstel kan voorlopig alleen voor vandaag. Typ ‘Plan mijn dag’."}
    if tekst.lower() in {"annuleren", "annuleer", "laat maar", "stop"} and vervolg:
        return {"soort": "bericht", "tekst": "Opdracht geannuleerd. Er is niets opgeslagen."}
    if _BETALING.match(tekst):
        return {"soort": "bericht", "tekst": (
            "Er is geen geld overgemaakt. Gebruik Bestellingen of Budget voor een bestaande "
            "betaalopdracht. Deze chat heeft geen eigen saldo of betaalrekening.")}
    if re.search(r"\b(?:mijn taken|mijn trainingen|dagschema|weekplanning)\b", tekst, re.I):
        return {"soort": "assistent", "tekst": tekst}
    opdracht = _OPDRACHT.match(tekst)
    if "?" in tekst or (not opdracht and not vervolg and not snelinvoer.lijkt_invoer(tekst)):
        return {"soort": "assistent", "tekst": tekst}
    if not 1 <= len(tekst) <= 500:
        raise ValueError("Gebruik een opdracht van 1 tot 500 tekens.")
    # Een expliciete nieuwe opdracht vervangt een onafgemaakte opdracht. Een
    # onderwerp als 'overleg met Jan' mag wel het antwoord op een titelvraag zijn.
    nieuw = not vervolg or (opdracht and not (vervolg.get("mist") == "titel" and tekst.lower().startswith("overleg")))
    if nieuw:
        inhoud = (tekst if tekst.lower().startswith(("overleg", "herinner")) else opdracht[1]) if opdracht else tekst
        r = snelinvoer.lees(inhoud or " ", nu=nu)
        if r.get("herhaal") or (r["wat"] == "afspraak" and not r.get("einde")):
            return {"soort": "bericht", "tekst": "Maak herhalende of hele-dag-afspraken via Agenda; hier is niets opgeslagen."}
        taak = tekst.lower().startswith("taak") or (not opdracht and r["wat"] == "taak")
        if taak and r["tijd_herkend"]:
            return {"soort": "bericht", "tekst": "Gebruik voor een taak een datum zonder begintijd, of begin met ‘Plan’."}
        context = {"wat": "taak" if taak else "afspraak", "titel": r["titel"].strip() if inhoud.strip() and r["titel_herkend"] else "",
                   "datum": r.get("start", "")[:10] if r["datum_herkend"] and r.get("start") else r.get("deadline"),
                   "tijd": r.get("start", "")[11:] if r["tijd_herkend"] else None,
                   "minuten": r.get("minuten"), "locatie": r.get("locatie", ""),
                   "soort_agenda": r.get("soort_agenda", ""), "anker": nu.isoformat()}
        if r.get("einde") and r.get("start"):
            context["duur"] = int((datetime.fromisoformat(r["einde"]) - datetime.fromisoformat(r["start"])).total_seconds() / 60)
    else:
        context = dict(vervolg)
        anker = datetime.fromisoformat(context["anker"])
        if context.get("mist") == "tijd" and re.fullmatch(r"\d{1,2}(?::\d{2})?", tekst):
            tekst = "om " + tekst
        r = snelinvoer.lees(tekst, nu=anker)
        if r.get("herhaal"):
            return {"soort": "vervolg", "context": context, "tekst": "Geef een eenmalige datum en tijd, of typ ‘annuleren’."}
        if r["datum_herkend"]:
            context["datum"] = r["start"][:10] if r.get("start") else r.get("deadline")
        if r["tijd_herkend"]:
            context["tijd"] = r["start"][11:]
            context["duur"] = int((datetime.fromisoformat(r["einde"]) - datetime.fromisoformat(r["start"])).total_seconds() / 60)
        if context.get("mist") == "titel" and r["titel_herkend"]:
            context["titel"] = r["titel"]
        if not r["herkend"] and context.get("mist") != "titel" and re.match(r"^(?:wat|hoe|waar|wie|kun|kan|vertel|leg)\b", tekst, re.I):
            return {"soort": "assistent", "tekst": tekst}
    mist = next((veld for veld in (("titel",) if context["wat"] == "taak" else ("titel", "datum", "tijd"))
                 if not context.get(veld)), None)
    if mist:
        context["mist"] = mist
        vragen = {"titel": "Waar gaat de opdracht over?", "datum": "Op welke datum moet de afspraak zijn?",
                  "tijd": "Hoe laat moet de afspraak beginnen?"}
        return {"soort": "vervolg", "context": context, "tekst": vragen[mist] + " Je kunt ook ‘annuleren’ typen."}
    r = {"wat": context["wat"], "titel": context["titel"], "locatie": context["locatie"],
         "soort_agenda": context["soort_agenda"]}
    if context["wat"] == "afspraak":
        begin = datetime.fromisoformat(context["datum"] + "T" + context["tijd"])
        r.update(start=begin.isoformat(timespec="minutes"),
                 einde=(begin + timedelta(minutes=context.get("duur", 60))).isoformat(timespec="minutes"))
    else:
        r.update(deadline=context.get("datum"), minuten=context.get("minuten"))
    return {"soort": "voorstel", "gegevens": valideer(r)}


def valideer(gegevens: dict) -> dict:
    """Valideer ook bewerkte voorstellen direct vóór het opslaan."""
    if not isinstance(gegevens, dict):
        raise ValueError("Geef geldige voorstelgegevens op.")
    r = dict(gegevens)
    titel = r.get("titel", "")
    if not isinstance(titel, str) or not 1 <= len(titel.strip()) <= 160 or not tekstcontrole.veilig(titel):
        raise ValueError("Geef een titel van 1 tot 160 tekens op.")
    r["titel"] = titel.strip()
    if r.get("wat") == "afspraak":
        tijden = []
        for veld in ("start", "einde"):
            try:
                waarde = datetime.fromisoformat(r[veld])
            except (KeyError, TypeError, ValueError):
                raise ValueError("Geef een geldige begin- en eindtijd op.") from None
            if waarde.tzinfo is not None:
                raise ValueError("Gebruik lokale tijden voor Nederland.")
            waarde = waarde.replace(second=0, microsecond=0)
            # Een tijd in de zomertijdsprong bestaat niet; bij de wintertijd kan
            # dezelfde kloktijd twee keer voorkomen. Laat de gebruiker dan kiezen
            # voor een ondubbelzinnige tijd, passend bij de huidige naïeve opslag.
            opties = {
                waarde.replace(tzinfo=ZoneInfo("Europe/Amsterdam"), fold=fold).astimezone(timezone.utc)
                for fold in (0, 1)
                if waarde.replace(tzinfo=ZoneInfo("Europe/Amsterdam"), fold=fold)
                .astimezone(timezone.utc).astimezone(ZoneInfo("Europe/Amsterdam")).replace(tzinfo=None) == waarde
            }
            if len(opties) != 1:
                raise ValueError("Deze tijd bestaat niet of komt tweemaal voor door de klokwisseling. Kies een andere tijd.")
            tijden.append(waarde)
            r[veld] = waarde.isoformat(timespec="minutes")
        if tijden[1] <= tijden[0]:
            raise ValueError("De eindtijd moet na de begintijd liggen.")
        locatie = r.get("locatie", "")
        if not isinstance(locatie, str) or len(locatie) > 500 or not tekstcontrole.veilig(locatie):
            raise ValueError("Gebruik een locatie van maximaal 500 tekens.")
        r["locatie"] = locatie.strip()
    elif r.get("wat") == "taak":
        if r.get("deadline"):
            try:
                r["deadline"] = date.fromisoformat(r["deadline"]).isoformat()
            except (TypeError, ValueError):
                raise ValueError("Geef een geldige deadline op.") from None
        minuten = r.get("minuten")
        if minuten is not None and (type(minuten) is not int or not 1 <= minuten <= 1440):
            raise ValueError("De taakduur moet tussen 1 en 1440 minuten liggen.")
    else:
        raise ValueError("Kies een afspraak of taak.")
    return r


def datum_tekst(dag: date, vandaag: date | None = None) -> str:
    dagen = ("maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag")
    maanden = ("januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus",
               "september", "oktober", "november", "december")
    vandaag = vandaag or datetime.now(ZoneInfo("Europe/Amsterdam")).date()
    verschil = (dag - vandaag).days
    prefix = "vandaag, " if verschil == 0 else "morgen, " if verschil == 1 else ""
    return f"{prefix}{dagen[dag.weekday()]} {dag.day} {maanden[dag.month - 1]} {dag.year}"


def voorstel(tekst: str, nu: datetime | None = None) -> dict:
    """Herken een eerste opdracht via dezelfde router als vervolgantwoorden."""
    return routeer(tekst, nu=nu)
