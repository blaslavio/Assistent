"""Lokale bestandsverwerking. Geen gedeelde caches, upload naar derden of fictieve links."""

import csv
from decimal import Decimal, InvalidOperation, localcontext
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unicodedata

MAX_BYTES = 10_000_000
MAX_CSV_BYTES = 2_000_000
MAX_UITVOER = 30_000_000
MAX_RIJEN = 50_000
VOORBEELD_RIJEN = 200


class Fout(ValueError):
    """Verwerking niet geslaagd; er wordt geen resultaat aangeboden."""


def veilige_naam(naam: str) -> str:
    naam = unicodedata.normalize("NFKC", str(naam)).replace("\\", "/").rsplit("/", 1)[-1]
    naam = "".join(c for c in naam if not unicodedata.category(c).startswith("C"))
    naam = naam.strip(" .")[:120]
    return naam or "bestand"


def _controle(inhoud: bytes, limiet: int = MAX_BYTES) -> None:
    if not isinstance(inhoud, bytes):
        raise Fout("Het bestand kon niet worden gelezen.")
    if len(inhoud) > limiet:
        raise Fout(f"Gebruik een bestand van maximaal {limiet // 1_000_000} MB.")


def comprimeer(naam: str, inhoud: bytes) -> dict:
    _controle(inhoud)
    data = gzip.compress(inhoud, compresslevel=6, mtime=0)
    return {"soort": "gzip", "naam": veilige_naam(naam) + ".gz", "data": data,
            "mime": "application/gzip", "origineel": len(inhoud), "grootte": len(data),
            "besparing": (1 - len(data) / len(inhoud)) * 100 if inhoud else 0,
            "sha256": hashlib.sha256(inhoud).hexdigest()}


def video_beschikbaar() -> bool:
    return bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))


def _programma(opdracht: list[str], timeout: int) -> bytes:
    try:
        return subprocess.run(opdracht, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, check=True, timeout=timeout).stdout
    except subprocess.TimeoutExpired:
        raise Fout("De videoverwerking duurde te lang. Gebruik een kortere of kleinere video.") from None
    except (subprocess.CalledProcessError, OSError):
        raise Fout("De video kon niet worden verwerkt. Gebruik een geldig MP4- of MOV-bestand.") from None


def _probe(pad: Path) -> dict:
    data = _programma([shutil.which("ffprobe") or "ffprobe", "-v", "error", "-max_alloc", "134217728", "-f", "mov",
                       "-protocol_whitelist", "file", "-enable_drefs", "0", "-use_absolute_path", "0",
                       "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_name,duration:format=duration",
                       "-of", "json", str(pad)], 15)
    try:
        antwoord = json.loads(data)
        video = antwoord["streams"][0]
        bronduur = video.get("duration")
        duur = float(antwoord["format"]["duration"] if bronduur in (None, "", "N/A") else bronduur)
        if not math.isfinite(duur) or not 0 < duur <= 3600 or not 2 <= video["width"] <= 4096 or not 2 <= video["height"] <= 4096:
            raise ValueError
        if video["width"] * video["height"] > 4096 * 2160:
            raise ValueError
        return {**video, "duur": duur}
    except (ValueError, KeyError, TypeError, IndexError):
        raise Fout("Gebruik een leesbare video van maximaal één uur en maximaal 4K-resolutie.") from None


def knip_video(naam: str, inhoud: bytes, start: float = 0, duur: float = 10) -> dict:
    _controle(inhoud)
    naam = veilige_naam(naam)
    if Path(naam).suffix.lower() not in {".mp4", ".mov"}:
        raise Fout("Kies een MP4- of MOV-video.")
    if not video_beschikbaar():
        raise Fout("Video knippen vereist FFmpeg en FFprobe op de server.")
    if type(start) not in {int, float} or type(duur) not in {int, float} or not math.isfinite(start) or not math.isfinite(duur) or start < 0 or not 0.1 <= duur <= 60:
        raise Fout("Kies een geldige begintijd en een fragmentduur van 0,1 tot 60 seconden.")
    with tempfile.TemporaryDirectory(prefix="assistent-video-") as mapje:
        bron, uitvoer = Path(mapje) / "bron.mp4", Path(mapje) / "fragment.mp4"
        bron.write_bytes(inhoud)
        informatie = _probe(bron)
        if start >= informatie["duur"]:
            raise Fout("De begintijd ligt buiten de video.")
        verwacht = min(duur, informatie["duur"] - start)
        if verwacht < 0.1:
            raise Fout("Er blijft te weinig video over vanaf deze begintijd.")
        _programma([shutil.which("ffmpeg") or "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                    "-max_alloc", "134217728", "-threads", "2", "-ss", str(start), "-f", "mov",
                    "-protocol_whitelist", "file", "-enable_drefs", "0", "-use_absolute_path", "0", "-i", str(bron),
                    "-t", str(verwacht), "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn",
                    "-map_metadata", "-1", "-map_chapters", "-1", "-filter_threads", "1",
                    "-vf", "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30,setsar=1",
                    "-c:v", "libx264", "-threads", "2", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-fs", str(MAX_UITVOER + 1), str(uitvoer)], 90)
        if not uitvoer.is_file() or not 0 < uitvoer.stat().st_size <= MAX_UITVOER:
            raise Fout("Het videofragment is leeg of te groot. Gebruik een korter fragment.")
        controle = _probe(uitvoer)
        if controle["codec_name"] != "h264" or abs(controle["duur"] - verwacht) > 0.25:
            raise Fout("Het videofragment is onvolledig. Kies een ander fragment.")
        data = uitvoer.read_bytes()
    return {"soort": "video", "naam": Path(naam).stem + "-fragment.mp4", "mime": "video/mp4", "data": data,
            "start": start, "duur": controle["duur"], "grootte": len(data)}


def getal(waarde: str) -> Decimal | None:
    waarde = waarde.strip()
    if len(waarde) > 100 or not re.fullmatch(r"[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d{1,3})?", waarde):
        return None
    try:
        nummer = Decimal(waarde.replace(",", "."))
        return nummer if nummer.is_finite() and abs(nummer.adjusted()) <= 100 else None
    except InvalidOperation:
        return None


def analyseer_csv(naam: str, inhoud: bytes) -> dict:
    _controle(inhoud, MAX_CSV_BYTES)
    if Path(veilige_naam(naam)).suffix.lower() != ".csv":
        raise Fout("Kies een CSV-bestand.")
    try:
        tekst = inhoud.decode("utf-8-sig")
        if "\x00" in tekst:
            raise ValueError
        try:
            dialect = csv.Sniffer().sniff(tekst[:8192], delimiters=",;\t")
            scheiding = dialect.delimiter
        except csv.Error:
            scheiding = ";" if ";" in tekst.partition("\n")[0] else ","
        lezer = csv.reader(io.StringIO(tekst, newline=""), delimiter=scheiding, strict=True)
        koppen = [k.strip() for k in next(lezer)]
        if not 1 <= len(koppen) <= 100 or len(set(koppen)) != len(koppen) or any(not k or len(k) > 200 for k in koppen):
            raise Fout("Gebruik 1 tot 100 unieke, niet-lege kolomnamen van maximaal 200 tekens.")
        stats = [{"kolom": k, "getallen": 0, "leeg": 0, "overig": 0, "som": Decimal(0), "minimum": None, "maximum": None} for k in koppen]
        voorbeeld, grafiek, aantal = [], {k: [] for k in koppen}, 0
        for rij in lezer:
            if not rij or not any(c.strip() for c in rij):
                continue
            aantal += 1
            if aantal > MAX_RIJEN:
                raise Fout("Gebruik maximaal 50.000 gegevensrijen.")
            if len(rij) != len(koppen) or any(len(c) > 4096 for c in rij):
                raise Fout(f"Rij {aantal + 1} heeft een afwijkend aantal velden of een te lange cel.")
            if aantal <= VOORBEELD_RIJEN:
                voorbeeld.append(dict(zip(koppen, rij)))
            for index, waarde in enumerate(rij):
                s, nummer = stats[index], getal(waarde)
                if not waarde.strip():
                    s["leeg"] += 1
                elif nummer is None:
                    s["overig"] += 1
                else:
                    s["getallen"] += 1
                    with localcontext() as context:
                        context.prec = 320  # begrensde invoer, ook sommen met grote/kleine waarden exact
                        s["som"] += nummer
                    s["minimum"] = nummer if s["minimum"] is None else min(nummer, s["minimum"])
                    s["maximum"] = nummer if s["maximum"] is None else max(nummer, s["maximum"])
                if aantal <= VOORBEELD_RIJEN:
                    grafiek[koppen[index]].append(float(nummer) if nummer is not None else None)
        for s in stats:
            s["gemiddelde"] = str(s["som"] / s["getallen"]) if s["getallen"] else None
            for veld in ("som", "minimum", "maximum"):
                s[veld] = str(s[veld]) if s[veld] is not None else None
        rapport = {"bestand": veilige_naam(naam), "rijen": aantal, "kolommen": koppen, "statistieken": stats}
        return {"soort": "csv", "naam": Path(veilige_naam(naam)).stem + "-analyse.json", "mime": "application/json",
                "data": json.dumps(rapport, ensure_ascii=False, indent=2).encode(), **rapport, "voorbeeld": voorbeeld,
                "grafiek": {s["kolom"]: grafiek[s["kolom"]] for s in stats if s["getallen"] and not s["overig"]}}
    except Fout:
        raise
    except (UnicodeError, csv.Error, StopIteration, ValueError):
        raise Fout("Het bestand is geen leesbare CSV. Gebruik UTF-8 en komma, puntkomma of tab als scheidingsteken.") from None
