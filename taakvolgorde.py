"""Expliciete taakafhankelijkheden: gepland werk is nog geen afgerond werk."""


def blokkades(taak: dict, taken: list[dict]) -> list[dict]:
    per_id = {t["id"]: t for t in taken}
    resultaat = []
    ids = taak.get("afhankelijk_van", [])
    if not isinstance(ids, list) or any(type(i) is not int for i in ids):
        return [{"id": None, "titel": "Ongeldige taakafhankelijkheden", "ontbreekt": True}]
    for taak_id in ids:
        bron = per_id.get(taak_id)
        if bron is None or not bron.get("klaar"):
            resultaat.append({"id": taak_id, "titel": bron["titel"] if bron else f"Verwijderde taak #{taak_id}", "ontbreekt": bron is None})
    return resultaat


def valideer(taken: list[dict], taak_id: int, afhankelijk_van: list[int]) -> list[int]:
    per_id = {t["id"]: t for t in taken}
    if type(taak_id) is not int or taak_id < 1 or taak_id not in per_id:
        raise ValueError("Deze taak bestaat niet meer.")
    if (not isinstance(afhankelijk_van, list) or len(afhankelijk_van) > 100
            or any(type(i) is not int or i not in per_id for i in afhankelijk_van)):
        raise ValueError("Kies maximaal 100 bestaande taken als voorwaarde.")
    gekozen = sorted(set(afhankelijk_van))
    bezocht, stapel = set(), list(gekozen)
    while stapel:
        huidig = stapel.pop()
        if huidig == taak_id:
            raise ValueError("Een taak mag niet van zichzelf afhangen, ook niet via andere taken.")
        if huidig in bezocht:
            continue
        bezocht.add(huidig)
        deps = per_id.get(huidig, {}).get("afhankelijk_van", [])
        if not isinstance(deps, list) or any(type(i) is not int for i in deps):
            raise ValueError("Herstel eerst de ongeldige afhankelijkheden van de gekozen taak.")
        stapel.extend(deps)
    return gekozen


def eis_startbaar(taak_id: int, taken: list[dict]) -> None:
    if type(taak_id) is not int or taak_id < 1:
        raise ValueError("Kies een geldig taak-ID.")
    taak = next((t for t in taken if t["id"] == taak_id), None)
    if taak is None or taak.get("klaar"):
        raise ValueError("Deze taak is verwijderd of afgerond. Maak een nieuw voorstel.")
    if blokkades(taak, taken):
        raise ValueError("Rond eerst de voorafgaande taken af. Deze vervolgtaak is nog geblokkeerd.")
