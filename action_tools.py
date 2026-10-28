"""Pure helpers voor actievoorstellen en verliesvrije bestandscompressie."""
from dataclasses import dataclass
from decimal import Decimal
import gzip
import re
from pathlib import PurePath

@dataclass(frozen=True)
class OfferDraft:
    title: str
    price: Decimal | None
    hours: int | None

def parse_offer(text: str) -> OfferDraft | None:
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 2000:
        return None
    if not re.search(r"\b(?:maak|genereer)\s+(?:een\s+)?(?:actie[- ]?link|link)\b", text, re.I):
        return None
    prices = re.findall(r"(?:€\s*(\d+(?:[.,]\d{1,2})?)(?![\d.,])|(?<![\d.,])(\d+(?:[.,]\d{1,2})?)\s*euro\b)", text, re.I)
    durations = re.findall(r"(?<![\d.,])(\d+)\s*(uur|uren|dag|dagen)\b", text, re.I)
    if len(prices) > 1 or len(durations) > 1:
        raise ValueError("Gebruik één prijs en één geldigheidsduur per voorstel.")
    price = Decimal(next(x for x in prices[0] if x).replace(",", ".")) if prices else None
    hours = int(durations[0][0]) * (24 if durations[0][1].lower().startswith("dag") else 1) if durations else None
    if hours is not None and hours <= 0:
        raise ValueError("De geldigheidsduur moet positief zijn.")
    title = re.sub(r"^\s*(?:maak|genereer)\s+(?:een\s+)?(?:actie[- ]?link|link)\s*(?:voor\s+)?", "", text, flags=re.I).strip()
    return OfferDraft(title, price, hours)

def compress_file(name: str, data: bytes) -> tuple[str, bytes, str]:
    if not isinstance(data, bytes) or not data:
        raise ValueError("Kies een bestand met inhoud.")
    safe_name = PurePath(name.replace("\\", "/")).name or "bestand"
    compressed = gzip.compress(data, mtime=0)
    if len(compressed) >= len(data):
        return safe_name, data, "Compressie levert geen ruimtewinst op; download het oorspronkelijke bestand."
    return safe_name + ".gz", compressed, "Bestand verliesvrij gecomprimeerd. Compressie is geen versleuteling."
