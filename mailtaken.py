"""Taken uit je mail: de assistent leest je recente mail en stelt taken voor (betalen, reageren, regelen).

Er komt niets op je takenlijst zonder dat je het aanvinkt. Nagekeken mails worden onthouden (opslag.mail_gezien),
zodat dezelfde mail niet steeds opnieuw wordt voorgesteld. Na toevoegen kunnen de taken meteen in vrije tijd in je
agenda worden ingepland.
"""

from datetime import date, datetime, timedelta

import inplannen
import mail
import opslag
import slim

MAX_MAILS = 25


def nieuwe_mails(dagen: int = 10) -> list[dict]:
    """Recente mails die nog niet op taken zijn nagekeken (kopregels)."""
    grens = (datetime.now() - timedelta(days=dagen)).strftime("%Y-%m-%d")
    gezien = set(opslag.mail_gezien())
    return [m for m in mail.lijst(60) if m["uid"] not in gezien and m["datum"][:10] >= grens][:MAX_MAILS]


def voorstellen(client, dagen: int = 10) -> dict:
    """Leest nieuwe mails en geeft {mails: aantal nagekeken, uids, taken: [...]}. Slaat nog niets op."""
    koppen = nieuwe_mails(dagen)
    if not koppen:
        return {"mails": 0, "uids": [], "taken": []}
    mails = mail.lezen_veel([m["uid"] for m in koppen])
    # Nieuwsbrieven korter, want daar staat zelden een taak in (maar soms wel een rekening).
    for m in mails:
        if m["nieuwsbrief"]:
            m["tekst"] = m["tekst"][:600]
    bestaande = [t["titel"] for t in opslag.open_taken()]
    taken = slim.taken_uit_mail(client, mails, date.today().isoformat(), bestaande)
    per_uid = {m["uid"]: m for m in mails}
    for t in taken:
        m = per_uid[t["uid"]]
        t["bron"] = {"soort": "mail", "uid": m["uid"], "van": m["van"], "onderwerp": m["onderwerp"]}
        if t["deadline"]:
            try:
                date.fromisoformat(t["deadline"])
            except ValueError:
                t["deadline"] = ""
    return {"mails": len(mails), "uids": [m["uid"] for m in mails], "taken": taken}


def toevoegen(gekozen: list[dict], alle_uids: list[str], inplannen_ook: bool = True) -> dict:
    """Zet de gekozen taken op de lijst, onthoudt de nagekeken mails en plant ze desgewenst meteen in."""
    nieuw = [opslag.taak_toevoegen(t["titel"].strip(), t["deadline"] or None, t.get("minuten") or None,
                                   t.get("prioriteit", ""), t.get("waarom", ""), t.get("bron")) for t in gekozen]
    opslag.mail_gezien_bewaren(alle_uids)
    blokken = 0
    if inplannen_ook and nieuw:
        ids = {t["id"] for t in nieuw}
        plan = [r for r in inplannen.voorstel(14) if r["taak_id"] in ids]
        blokken = inplannen.vastleggen(plan)
    return {"taken": len(nieuw), "blokken": blokken}
