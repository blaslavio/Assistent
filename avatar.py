"""De assistent als avatar: een naam en een gezicht dat je zelf kiest.

De plaatjes komen van DiceBear (open, zonder account). Daarvoor gaat alleen een willekeurige code mee, niet je naam.
Een eigen foto wordt verkleind en bij je instellingen bewaard.
"""

import base64
import io
import secrets
from urllib.parse import quote

STIJLEN = {
    "avataaars": "Vrolijk", "lorelei": "Getekend", "notionists": "Schets", "adventurer": "Avontuurlijk",
    "personas": "Rustig", "bottts": "Robot", "fun-emoji": "Emoji", "pixel-art": "Pixel",
}
KLEUREN = {"b6e3f4": "Lichtblauw", "c0aede": "Lila", "ffd5dc": "Roze", "ffdfbf": "Perzik", "d1f4d9": "Mint",
           "e5e7eb": "Grijs"}
STANDAARD = {"naam": "Sam", "stijl": "avataaars", "code": "assistent", "kleur": "b6e3f4", "foto": ""}


def instellingen(inst: dict) -> dict:
    return STANDAARD | inst.get("avatar", {})


def nieuwe_code() -> str:
    return secrets.token_hex(4)


def plaatje(a: dict, grootte: int = 128) -> str | bytes:
    """Wat st.image en st.chat_message als avatar kunnen tonen: je eigen foto, of een plaatje van DiceBear."""
    if a.get("foto"):
        return base64.b64decode(a["foto"])
    return (f"https://api.dicebear.com/9.x/{a['stijl']}/png?seed={quote(a['code'])}"
            f"&backgroundColor={a['kleur']}&radius=50&size={grootte}")


def adres(a: dict, grootte: int = 128) -> str:
    """Hetzelfde plaatje als adres voor in HTML; een eigen foto als data-adres."""
    beeld = plaatje(a, grootte)
    return "data:image/jpeg;base64," + a["foto"] if isinstance(beeld, bytes) else beeld


def foto_verkleinen(data: bytes) -> str:
    """Maakt van een geüploade foto een klein vierkant plaatje (base64), zodat het bij de instellingen past."""
    from PIL import Image, ImageOps

    beeld = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    beeld = ImageOps.fit(beeld, (160, 160))
    uit = io.BytesIO()
    beeld.save(uit, "JPEG", quality=80)
    return base64.b64encode(uit.getvalue()).decode()
