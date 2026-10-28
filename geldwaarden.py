"""Bedragen exact naar gehele centen; geen onleesbare bedragen als nul boeken."""
from decimal import Context, Decimal, InvalidOperation, ROUND_HALF_UP, localcontext
import math
import re

MAX_CENT = 2_147_483_647


def centen(waarde, *, negatief=True) -> int:
    if isinstance(waarde, bool) or not isinstance(waarde, (str, int, float, Decimal)):
        raise ValueError("Vul een geldig bedrag in.")
    if isinstance(waarde, float) and not math.isfinite(waarde):
        raise ValueError("Een bedrag moet eindig zijn.")
    if isinstance(waarde, str):
        s = waarde.strip()
        if len(s) > 80:
            raise ValueError("Het bedrag is te lang.")
        s = re.sub(r"^([+-]?)\s*€\s*", r"\1", s)
        if "," in s:
            if not re.fullmatch(r"[+-]?(?:[0-9]+|[0-9]{1,3}(?:\.[0-9]{3})+),[0-9]{1,6}", s):
                raise ValueError("Gebruik bijvoorbeeld 12,50 of 1.234,56.")
            s = s.replace(".", "").replace(",", ".")
        elif not re.fullmatch(r"[+-]?[0-9]+(?:\.[0-9]{1,6})?", s):
            raise ValueError("Vul een geldig bedrag in; lege of onleesbare invoer is geen nul.")
    else:
        s = str(waarde)
    try:
        d = Decimal(s)
        if not d.is_finite() or (not negatief and d < 0):
            raise ValueError("Gebruik een eindig, niet-negatief bedrag.")
        if d.copy_abs() > Decimal("21474836.47"):
            raise ValueError("Het bedrag is groter dan ondersteund.")
        with localcontext(Context(prec=max(40, len(d.as_tuple().digits) + 2), rounding=ROUND_HALF_UP)):
            bedrag = int((d * 100).quantize(Decimal(1), rounding=ROUND_HALF_UP))
    except (InvalidOperation, OverflowError):
        raise ValueError("Dit bedrag kan niet veilig worden verwerkt.") from None
    if abs(bedrag) > MAX_CENT:
        raise ValueError("Het bedrag is groter dan ondersteund.")
    return bedrag


def opmaak(cent: int) -> str:
    if type(cent) is not int:
        raise ValueError("Gebruik gehele centen.")
    return ("- " if cent < 0 else "") + "€ " + f"{abs(cent) // 100:,}".replace(",", ".") + f",{abs(cent) % 100:02d}"
