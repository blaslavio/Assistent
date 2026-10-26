"""Run the app checks in Azure Cloud Shell without exposing credentials or changing user data."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import httpx

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--live-azure", action="store_true", help="Test the existing deployment with Azure CLI sign-in")
    parser.add_argument("--live-app", action="store_true", help="Check the public production health endpoint")
    args = parser.parse_args()
    checks = []

    def run(name, command, *, env=None, timeout=120):
        try:
            result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True, timeout=timeout)
            ok = result.returncode == 0
            output = (result.stdout + result.stderr)[-1800:]
        except (OSError, subprocess.TimeoutExpired):
            ok, output = False, "Command unavailable or timed out."
        checks.append({"check": name, "status": "passed" if ok else "failed", "details": output})
        print(f"{name}: {'PASSED' if ok else 'FAILED'}", flush=True)

    run("Regression and privacy tests", [sys.executable, "-m", "pytest", "-q"])
    run("Payment, community and learning tests", [sys.executable, "-m", "unittest", "-q",
        "regression_tests", "community_safety_tests", "assistant_learning_tests", "assistant_privacy_tests"])
    run("Python compilation", [sys.executable, "-c",
        "import pathlib,py_compile; files=[p for p in pathlib.Path('.').rglob('*.py') "
        "if not any(x in {'.git','.venv','venv','__pycache__'} for x in p.parts)]; "
        "[py_compile.compile(str(p),doraise=True) for p in files]; print(len(files),'Python files compiled')"])
    run("App startup and login screen", [sys.executable, "-c",
        "from streamlit.testing.v1 import AppTest; a=AppTest.from_file('app.py',default_timeout=45).run(); "
        "assert not a.exception, [e.message for e in a.exception]; "
        "assert len(a.title)>0; print('App starts and renders login without authenticated user data')"],
        env={**os.environ, "ASSISTENT_LOKAAL": "1"}, timeout=60)

    if args.live_app:
        try:
            # A health response does not prove authenticated user workflows or deployment revision.
            response = httpx.get("https://eisreyyrtvlgtjpqiyhpm2.streamlit.app/_stcore/health",
                                 timeout=20, follow_redirects=True)
            healthy = response.status_code == 200 and response.content.strip() == b"ok"
        except httpx.HTTPError:
            healthy = False
        checks.append({"check": "Production HTTP health", "status": "passed" if healthy else "failed",
                       "details": "Unauthenticated health endpoint only; no private account actions tested."})

    if args.live_azure:
        if not shutil.which("az"):
            checks.append({"check": "Azure OpenAI live", "status": "blocked", "details": "Azure CLI is not available."})
        else:
            body = json.dumps({"model": "gpt-5-mini", "messages": [{"role": "user", "content": "Antwoord alleen met OK."}],
                               "max_completion_tokens": 2048})
            run("Azure OpenAI live", ["az", "rest", "--method", "post", "--url",
                "https://blaslavio-7458-resource.openai.azure.com/openai/v1/chat/completions",
                "--resource", "https://cognitiveservices.azure.com", "--headers", "Content-Type=application/json",
                "--body", body, "--query", "choices[0].message.content", "-o", "tsv"])
            if checks[-1]["status"] == "passed" and checks[-1]["details"].strip() != "OK":
                checks[-1]["status"] = "failed"

    checks.append({"check": "Production Search and Speech", "status": "not_verified",
                   "details": "Require configured services, server credentials and an authenticated app test. No private documents or recordings were transmitted."})
    report = {"revision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
              "checks": checks}
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return int(any(c["status"] in ("failed", "blocked") for c in checks))


if __name__ == "__main__":
    sys.exit(main())
