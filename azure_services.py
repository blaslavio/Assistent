"""Azure clients. Credentials stay on the server; configuration is not proof of connectivity."""
from dataclasses import dataclass, field
import io
import os
import re
import wave
from urllib.parse import urlsplit
from xml.sax.saxutils import escape

import httpx

OPENAI_ENDPOINT = "https://blaslavio-7458-resource.openai.azure.com/openai/v1/"
OPENAI_DEPLOYMENT = "gpt-5-mini"


class AzureError(Exception):
    """Safe user-facing error; never include response bodies or credentials."""


@dataclass(frozen=True)
class OpenAIConfig:
    base_url: str
    deployment: str
    api_key: str = field(repr=False)


@dataclass(frozen=True)
class SpeechConfig:
    region: str
    api_key: str = field(repr=False)


def openai_config(settings=None):
    settings = os.environ if settings is None else settings
    key = settings.get("AZURE_OPENAI_API_KEY", "").strip()
    if not key:
        return None
    endpoint = settings.get("AZURE_OPENAI_BASE_URL", OPENAI_ENDPOINT).strip().rstrip("/")
    model = settings.get("AZURE_OPENAI_DEPLOYMENT", OPENAI_DEPLOYMENT).strip()
    try:
        url = urlsplit(endpoint)
        port = url.port
    except ValueError:
        raise AzureError("Controleer het Azure OpenAI-adres en de deploymentnaam.") from None
    if (url.scheme != "https" or not url.hostname or url.username or url.password
            or port not in (None, 443) or url.query or url.fragment
            or not url.hostname.endswith((".openai.azure.com", ".services.ai.azure.com"))
            or url.path != "/openai/v1" or not re.fullmatch(r"[\w.-]{1,128}", model)):
        raise AzureError("Controleer het Azure OpenAI-adres en de deploymentnaam.")
    return OpenAIConfig(endpoint + "/", model, key)


def speech_config(settings=None):
    settings = os.environ if settings is None else settings
    key = settings.get("AZURE_SPEECH_KEY", "").strip()
    region = settings.get("AZURE_SPEECH_REGION", "").strip()
    if not key or not region:
        return None
    if not re.fullmatch(r"[a-z][a-z0-9]{2,39}", region):
        raise AzureError("Controleer de Azure Speech-regio.")
    return SpeechConfig(region, key)


def request(method, url, *, key, **kwargs):
    try:
        response = httpx.request(method, url, headers={"api-key": key, **kwargs.pop("headers", {})},
                                 timeout=kwargs.pop("timeout", 30), follow_redirects=False, **kwargs)
    except httpx.HTTPError:
        raise AzureError("Azure is niet bereikbaar. Probeer het later opnieuw.") from None
    if response.status_code in (401, 403):
        raise AzureError("Azure weigert toegang. Controleer de serversleutel en bevoegdheden.")
    if response.status_code == 429:
        raise AzureError("De Azure-gebruikslimiet is bereikt. Probeer het later opnieuw.")
    if not 200 <= response.status_code < 300:
        raise AzureError(f"Azure-verzoek mislukt (HTTP {response.status_code}). Controleer de configuratie.")
    return response


def speech_audio(text, *, language="nl-NL", gender="Vrouw", speed=1.0):
    config = speech_config()
    if not config:
        raise AzureError("Azure Speech is nog niet geconfigureerd op de server.")
    voices = {("nl-NL", "Vrouw"): "nl-NL-ColetteNeural", ("nl-NL", "Man"): "nl-NL-MaartenNeural",
              ("nl-BE", "Vrouw"): "nl-BE-DenaNeural", ("nl-BE", "Man"): "nl-BE-ArnaudNeural"}
    voice = voices.get((language, gender))
    if not voice or not isinstance(text, str) or not text.strip() or len(text) > 2500:
        raise AzureError("Kies een Nederlandse of Vlaamse stem en maximaal 2500 tekens.")
    rate = round((max(0.8, min(1.3, float(speed))) - 1) * 100)
    ssml = (f'<speak version="1.0" xml:lang="{language}"><voice name="{voice}">'
            f'<prosody rate="{rate:+d}%">{escape(text)}</prosody></voice></speak>')
    return request("POST", f"https://{config.region}.tts.speech.microsoft.com/cognitiveservices/v1",
                   key=config.api_key, headers={"Ocp-Apim-Subscription-Key": config.api_key,
                   "Content-Type": "application/ssml+xml", "User-Agent": "Assistent",
                   "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3"},
                   content=ssml.encode("utf-8")).content


def transcribe(audio, *, language="nl-NL"):
    config = speech_config()
    if not config:
        raise AzureError("Azure Speech is nog niet geconfigureerd op de server.")
    if language not in ("nl-NL", "nl-BE") or not isinstance(audio, bytes) or len(audio) > 2_000_000:
        raise AzureError("Gebruik een Nederlandse WAV-opname van maximaal 60 seconden.")
    try:
        with wave.open(io.BytesIO(audio), "rb") as wav:
            if (wav.getnchannels() != 1 or wav.getsampwidth() != 2 or wav.getframerate() != 16000
                    or wav.getcomptype() != "NONE" or not 0 < wav.getnframes() <= 960000):
                raise ValueError
    except (wave.Error, EOFError, ValueError):
        raise AzureError("De opname moet PCM WAV, mono, 16 kHz en maximaal 60 seconden zijn.") from None
    response = request("POST", f"https://{config.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1",
                       key=config.api_key, headers={"Ocp-Apim-Subscription-Key": config.api_key,
                       "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000"},
                       params={"language": language, "format": "simple"}, content=audio)
    try:
        result = response.json()
        if result.get("RecognitionStatus") == "Success" and result.get("DisplayText"):
            return result["DisplayText"]
    except (ValueError, AttributeError):
        pass
    raise AzureError("Geen spraak herkend. Neem opnieuw een korte zin op.")


def test_openai():
    config = openai_config()
    if not config:
        raise AzureError("Azure OpenAI is nog niet geconfigureerd op de server.")
    response = request("POST", config.base_url + "chat/completions", key=config.api_key,
                       json={"model": config.deployment, "messages": [{"role": "user", "content": "Antwoord met OK."}],
                             "max_completion_tokens": 512}, timeout=60)
    try:
        if response.json()["choices"][0]["message"].get("content"):
            return "Azure OpenAI heeft een modelantwoord teruggegeven."
    except (ValueError, KeyError, IndexError, TypeError):
        pass
    raise AzureError("Azure reageerde, maar gaf geen tekst terug. Controleer de deployment.")
