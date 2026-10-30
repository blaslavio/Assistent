"""Azure OpenAI Responses adapter for the existing app's server-side AI router.

This module never executes user actions. Keep credentials server-side and call
it only from authenticated backend routes. Import dependencies lazily.
"""
import os
from urllib.parse import urlparse


def _base_url(endpoint: str) -> str:
    parsed = urlparse(endpoint.strip())
    if (parsed.scheme != "https" or not parsed.hostname
            or not parsed.hostname.endswith(".openai.azure.com")
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.port not in (None, 443)
            or parsed.path.rstrip("/") not in ("", "/openai/v1")):
        raise ValueError("Invalid Azure OpenAI endpoint")
    return f"https://{parsed.hostname}/openai/v1/"


def make_client(config=None):
    config = os.environ if config is None else config
    from openai import OpenAI

    base_url = _base_url(config.get("AZURE_OPENAI_ENDPOINT", ""))
    mode = config.get("AZURE_AUTH_MODE", "key").lower()
    if mode == "entra":
        from azure.identity import DefaultAzureCredential, get_bearer_token_provider
        credential = get_bearer_token_provider(
            DefaultAzureCredential(), "https://ai.azure.com/.default"
        )
    elif mode == "key":
        credential = config.get("AZURE_OPENAI_API_KEY", "").strip()
        if not credential:
            raise RuntimeError("Azure API key is not configured")
    else:
        raise ValueError("Unknown Azure authentication mode")
    return OpenAI(base_url=base_url, api_key=credential, timeout=20.0, max_retries=0)


def generate_text(prompt: str, *, client=None, config=None) -> str:
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 16000:
        raise ValueError("Prompt must be 1-16000 characters")
    config = os.environ if config is None else config
    deployment = config.get("AZURE_OPENAI_DEPLOYMENT", "").strip()
    if not deployment:
        raise RuntimeError("Azure model deployment is not configured")
    api = client if client is not None else make_client(config)
    result = api.responses.create(model=deployment, input=prompt, store=False)
    answer = getattr(result, "output_text", "")
    if not isinstance(answer, str) or not answer.strip():
        raise RuntimeError("Azure model returned no text")
    return answer
