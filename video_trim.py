"""Korte videofragmenten maken zonder bestanden tussen gebruikers te delen."""
from pathlib import Path
import subprocess
import tempfile

MAX_UPLOAD = 50 * 1024 * 1024
MAX_OUTPUT = 60 * 1024 * 1024


def trim_video(data: bytes, start: int = 0, end: int | None = None, *, executable: str | None = None) -> bytes:
    if not isinstance(data, bytes) or not data or len(data) > MAX_UPLOAD:
        raise ValueError("Kies een video van maximaal 50 MB.")
    if isinstance(start, bool) or not isinstance(start, int) or start < 0:
        raise ValueError("Kies een geldig beginpunt.")
    if end is not None and (isinstance(end, bool) or not isinstance(end, int) or end <= start):
        raise ValueError("Het eindpunt moet na het beginpunt liggen.")
    if executable is None:
        try:
            import imageio_ffmpeg
            executable = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception as exc:
            raise RuntimeError("Videobewerking is momenteel niet beschikbaar.") from exc
    with tempfile.TemporaryDirectory(prefix="video_trim_") as directory:
        source = Path(directory) / "source"
        output = Path(directory) / "fragment.mp4"
        source.write_bytes(data)
        try:
            command = [executable, "-nostdin", "-v", "error", "-ss", str(start), "-i", str(source)]
            if end is not None:
                command.extend(["-t", str(end - start)])
            command.extend(["-map", "0:v:0", "-map", "0:a:0?",
                 "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac",
                 "-movflags", "+faststart", "-y", str(output)])
            process = subprocess.run(
                command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL, timeout=900, check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise RuntimeError("De video kon niet binnen de beschikbare tijd worden verwerkt.") from exc
        if process.returncode != 0 or not output.is_file():
            raise ValueError("De video kon niet worden gelezen of verwerkt.")
        if output.stat().st_size <= 1024:
            raise ValueError("Geen video gevonden op het gekozen tijdstip.")
        if output.stat().st_size > MAX_OUTPUT:
            raise ValueError("Het resultaat is te groot om te tonen.")
        return output.read_bytes()
