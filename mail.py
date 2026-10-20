"""Mail lezen en versturen via IMAP en SMTP.

Werkt met elke mailbox die IMAP ondersteunt, met een app-specifiek wachtwoord
(iCloud, Gmail, Yahoo, KPN, Ziggo en meer). Gegevens staan, net als de
Anthropic-sleutel, achter het wachtwoord van de app.
"""

import email
import imaplib
import re
import smtplib
from email.header import decode_header, make_header
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, parseaddr, parsedate_to_datetime
from html import unescape

import opslag

# Instellingen per aanbieder: IMAP-server, SMTP-server en -poort, en waar je een app-wachtwoord maakt.
AANBIEDERS = {
    "iCloud": {"imap": "imap.mail.me.com", "smtp": "smtp.mail.me.com", "smtp_poort": 587,
               "hulp": "https://account.apple.com", "uitleg": "Log in, kies Inloggen en beveiliging > "
               "App-specifieke wachtwoorden en maak er een aan."},
    "Gmail": {"imap": "imap.gmail.com", "smtp": "smtp.gmail.com", "smtp_poort": 465,
              "hulp": "https://myaccount.google.com/apppasswords", "uitleg": "Tweestapsverificatie moet aan staan. "
              "Maak een app-wachtwoord aan met de naam Assistent."},
    "Yahoo": {"imap": "imap.mail.yahoo.com", "smtp": "smtp.mail.yahoo.com", "smtp_poort": 465,
              "hulp": "https://login.yahoo.com/account/security", "uitleg": "Kies App-wachtwoord genereren."},
    "KPN": {"imap": "imap.kpnmail.nl", "smtp": "smtp.kpnmail.nl", "smtp_poort": 587,
            "hulp": "https://www.kpn.com/service/e-mail", "uitleg": "Gebruik je KPN-mailadres en wachtwoord."},
    "Ziggo": {"imap": "imap.ziggo.nl", "smtp": "smtp.ziggo.nl", "smtp_poort": 587,
              "hulp": "https://www.ziggo.nl/klantenservice/e-mail", "uitleg": "Gebruik je Ziggo-mailadres en wachtwoord."},
    "Anders": {"imap": "", "smtp": "", "smtp_poort": 587, "hulp": "", "uitleg": "Vul de servers van je aanbieder in."},
}


class GeenMail(Exception):
    """Er is nog geen mailbox gekoppeld."""


def instellingen() -> dict:
    return opslag.instellingen().get("mail", {})


def gekoppeld() -> bool:
    m = instellingen()
    return bool(m.get("adres") and m.get("wachtwoord") and m.get("imap"))


def _tekst(waarde: str | None) -> str:
    if not waarde:
        return ""
    try:
        return str(make_header(decode_header(waarde)))
    except Exception:
        return waarde


def _imap(m: dict | None = None) -> imaplib.IMAP4_SSL:
    m = m or instellingen()
    if not (m.get("adres") and m.get("wachtwoord") and m.get("imap")):
        raise GeenMail()
    verbinding = imaplib.IMAP4_SSL(m["imap"], int(m.get("imap_poort") or 993), timeout=30)
    verbinding.login(m.get("gebruiker") or m["adres"], m["wachtwoord"])
    return verbinding


def testen(m: dict) -> None:
    """Probeert in te loggen; geeft een foutmelding (Exception) als het niet lukt."""
    verbinding = _imap(m)
    verbinding.logout()


def _kop(bericht: email.message.Message, uid: str, gelezen: bool) -> dict:
    naam, adres = parseaddr(_tekst(bericht.get("From")))
    try:
        datum = parsedate_to_datetime(bericht.get("Date")).astimezone().strftime("%Y-%m-%d %H:%M")
    except Exception:
        datum = ""
    return {"uid": uid, "van": naam or adres, "van_adres": adres, "onderwerp": _tekst(bericht.get("Subject")) or "(geen onderwerp)",
            "datum": datum, "gelezen": gelezen}


def lijst(aantal: int = 15, alleen_ongelezen: bool = False, zoekterm: str = "") -> list[dict]:
    """De nieuwste mails in de inbox (alleen de kopregels, dus snel). Nieuwste eerst."""
    verbinding = _imap()
    try:
        verbinding.select("INBOX", readonly=True)
        if zoekterm:
            verbinding.literal = zoekterm.encode("utf-8")
            _, data = verbinding.uid("SEARCH", "CHARSET", "UTF-8", "TEXT")
        else:
            _, data = verbinding.uid("SEARCH", None, "UNSEEN" if alleen_ongelezen else "ALL")
        uids = (data[0] or b"").split()[-aantal:]
        if not uids:
            return []
        _, antwoord = verbinding.uid("FETCH", b",".join(uids),
                                     "(FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])")
        mails = []
        for deel in antwoord:
            if not isinstance(deel, tuple):
                continue
            info = deel[0].decode(errors="replace")
            uid = re.search(r"UID (\d+)", info)
            if not uid:
                continue
            mails.append(_kop(email.message_from_bytes(deel[1]), uid.group(1), "\\Seen" in info))
        return sorted(mails, key=lambda m: int(m["uid"]), reverse=True)
    finally:
        verbinding.logout()


def _platte_tekst(bericht: email.message.Message) -> str:
    """De tekst van een mail; HTML wordt omgezet naar gewone tekst."""
    platte, html = "", ""
    for deel in bericht.walk() if bericht.is_multipart() else [bericht]:
        if deel.get_content_maintype() == "multipart" or deel.get_filename():
            continue
        try:
            inhoud = deel.get_payload(decode=True).decode(deel.get_content_charset() or "utf-8", errors="replace")
        except Exception:
            continue
        if deel.get_content_type() == "text/plain" and not platte:
            platte = inhoud
        elif deel.get_content_type() == "text/html" and not html:
            html = inhoud
    if platte.strip():
        return platte.strip()
    html = re.sub(r"(?is)<(script|style).*?</\1>", "", html)
    html = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>", "\n", html)
    return re.sub(r"\n\s*\n+", "\n\n", unescape(re.sub(r"<[^>]+>", "", html))).strip()


def lezen(uid: str, max_tekens: int = 15000) -> dict:
    """Een hele mail, zonder hem als gelezen te markeren."""
    verbinding = _imap()
    try:
        verbinding.select("INBOX", readonly=True)
        _, antwoord = verbinding.uid("FETCH", str(uid), "(FLAGS BODY.PEEK[])")
        deel = next((d for d in antwoord if isinstance(d, tuple)), None)
        if not deel:
            raise KeyError(uid)
        bericht = email.message_from_bytes(deel[1])
        tekst = _platte_tekst(bericht)
        return {
            **_kop(bericht, str(uid), "\\Seen" in deel[0].decode(errors="replace")),
            "aan": _tekst(bericht.get("To")),
            "cc": _tekst(bericht.get("Cc")),
            "message_id": bericht.get("Message-ID", ""),
            "references": bericht.get("References", ""),
            "bijlagen": [_tekst(d.get_filename()) for d in bericht.walk() if d.get_filename()],
            "tekst": tekst[:max_tekens] + ("\n[...]" if len(tekst) > max_tekens else ""),
        }
    finally:
        verbinding.logout()


def lezen_veel(uids: list[str], max_tekens: int = 2500) -> list[dict]:
    """Meerdere mails in één verbinding (sneller), elk ingekort. Markeert niets als gelezen."""
    if not uids:
        return []
    verbinding = _imap()
    try:
        verbinding.select("INBOX", readonly=True)
        _, antwoord = verbinding.uid("FETCH", ",".join(str(u) for u in uids), "(FLAGS BODY.PEEK[])")
        mails = []
        for deel in antwoord:
            if not isinstance(deel, tuple):
                continue
            info = deel[0].decode(errors="replace")
            uid = re.search(r"UID (\d+)", info)
            if not uid:
                continue
            bericht = email.message_from_bytes(deel[1])
            tekst = re.sub(r"\n\s*\n+", "\n", _platte_tekst(bericht))
            mails.append({**_kop(bericht, uid.group(1), "\\Seen" in info),
                          "nieuwsbrief": bool(bericht.get("List-Unsubscribe")),
                          "tekst": tekst[:max_tekens] + (" [...]" if len(tekst) > max_tekens else "")})
        return sorted(mails, key=lambda m: int(m["uid"]), reverse=True)
    finally:
        verbinding.logout()


def versturen(aan: str, onderwerp: str, tekst: str, in_antwoord_op: str = "", references: str = "") -> None:
    m = instellingen()
    if not gekoppeld():
        raise GeenMail()
    bericht = EmailMessage()
    bericht["From"] = formataddr((m.get("naam", ""), m["adres"]))
    bericht["To"] = aan
    bericht["Subject"] = onderwerp
    bericht["Message-ID"] = make_msgid(domain=m["adres"].split("@")[-1])
    if in_antwoord_op:
        bericht["In-Reply-To"] = in_antwoord_op
        bericht["References"] = f"{references} {in_antwoord_op}".strip()
    bericht.set_content(tekst)
    poort = int(m.get("smtp_poort") or 587)
    if poort == 465:
        server = smtplib.SMTP_SSL(m["smtp"], poort, timeout=30)
    else:
        server = smtplib.SMTP(m["smtp"], poort, timeout=30)
        server.starttls()
    try:
        server.login(m.get("gebruiker") or m["adres"], m["wachtwoord"])
        server.send_message(bericht)
    finally:
        server.quit()
