"""Korte videofragmenten maken zonder bestanden tussen gebruikers te delen."""
from pathlib import Path
import subprocess
import tempfile

MAX_UPLOAD = 50 * 1024 * 1024
MAX_OUTPUT = 60 * 1024 * 1024


def trim_video(data: bytes, seconds: int = 10, *, executable: str | None = None) -> bytes:
    if not isinstance(data, bytes) or not data or len(data) > MAX_UPLOAD:
        raise ValueError("Kies een video van maximaal 50 MB.")
    if not isinstance(seconds, int) or isinstance(seconds, bool) or not 1 <= seconds <= 30:
        raise ValueError("Kies een duur van 1 tot 30 seconden.")
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
            process = subprocess.run(
                [executable, "-nostdin", "-v", "error", "-i", str(source),
                 "-t", str(seconds), "-map", "0:v:0", "-map", "0:a:0?",
                 "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac",
                 "-movflags", "+faststart", "-y", str(output)],
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL, timeout=120, check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise RuntimeError("De video kon niet binnen de beschikbare tijd worden verwerkt.") from exc
        if process.returncode != 0 or not output.is_file():
            raise ValueError("De video kon niet worden gelezen of verwerkt.")
        if output.stat().st_size > MAX_OUTPUT:
            raise ValueError("Het resultaat is te groot om te tonen.")
        return output.read_bytes()
