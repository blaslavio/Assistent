"""Azure integration readiness checks: no network calls and no secret exposure."""
from dataclasses import dataclass
from typing import Mapping
from urllib.parse import urlparse


@dataclass(frozen=True)
class AzureReadiness:
    endpoint_valid: bool
    deployment_configured: bool
    authentication_configured: bool
    monitoring_configured: bool
    issues: tuple[str, ...]

    @property
    def ready_for_live_probe(self) -> bool:
        return self.endpoint_valid and self.deployment_configured and self.authentication_configured


def inspect_azure_config(config: Mapping[str, str]) -> AzureReadiness:
    endpoint = (config.get("AZURE_OPENAI_ENDPOINT") or "").strip()
    parsed = urlparse(endpoint)
    valid = (
        parsed.scheme == "https"
        and bool(parsed.hostname)
        and (parsed.hostname.endswith(".openai.azure.com") or parsed.hostname.endswith(".services.ai.azure.com"))
        and parsed.username is None and parsed.password is None
        and parsed.port in (None, 443)
        and parsed.path.rstrip("/") in ("", "/openai/v1")
        and not parsed.query and not parsed.fragment
    )
    deployment = bool((config.get("AZURE_OPENAI_DEPLOYMENT") or "").strip())
    key = bool((config.get("AZURE_OPENAI_API_KEY") or "").strip())
    identity = (config.get("AZURE_AUTH_MODE") or "").strip().lower() == "entra"
    monitoring = bool((config.get("APPLICATIONINSIGHTS_CONNECTION_STRING") or "").strip())
    issues = []
    if not valid:
        issues.append("Configureer een geldig Azure OpenAI HTTPS-endpoint.")
    if not deployment:
        issues.append("Stel AZURE_OPENAI_DEPLOYMENT in op de echte modeldeployment.")
    if not (key or identity):
        issues.append("Configureer een server-side API-key of AZURE_AUTH_MODE=entra.")
    if not monitoring:
        issues.append("Application Insights is nog niet geconfigureerd.")
    return AzureReadiness(valid, deployment, key or identity, monitoring, tuple(issues))
