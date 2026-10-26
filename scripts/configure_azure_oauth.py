#!/usr/bin/env python3
"""Configure the existing Microsoft Entra app and Supabase Azure OAuth provider.

Required environment variables (never commit them):
  MICROSOFT_GRAPH_TOKEN: delegated Graph access token with Application.ReadWrite.All
  SUPABASE_ACCESS_TOKEN: Supabase Management API personal access token
Run with --apply to change settings. Default is read-only planning.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

PROJECT = "lnjsekmlpjyiwdlzcowa"
CLIENT_ID = "ab861c49-92d7-4bf0-a9bd-ce83ba09e196"
TENANT_ID = "fe1f2eaa-37a9-4358-910b-c68959f9fc08"
CALLBACK = f"https://{PROJECT}.supabase.co/auth/v1/callback"
TENANT_URL = f"https://login.microsoftonline.com/{TENANT_ID}"

def request(method, url, token, data=None):
    body = None if data is None else json.dumps(data).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, method=method,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Do not print credentials or full server responses.
        raise RuntimeError(f"{method} failed: HTTP {error.code} at {url.split('?')[0]}") from None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Perform authorized remote changes")
    args = parser.parse_args()
    print(f"Entra client: {CLIENT_ID}")
    print(f"Tenant: {TENANT_ID}")
    print(f"Supabase callback: {CALLBACK}")
    if not args.apply:
        print("Plan only. No remote changes. Supply credentials via environment and run --apply.")
        return
    graph = os.environ.get("MICROSOFT_GRAPH_TOKEN")
    supabase = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if not graph or not supabase:
        sys.exit("Missing required authorization. No changes performed.")
    graph_url = "https://graph.microsoft.com/v1.0/applications"
    result = request("GET", f"{graph_url}?$filter=appId%20eq%20%27{CLIENT_ID}%27", graph)
    apps = result.get("value", [])
    if len(apps) != 1:
        sys.exit("Existing Entra application not uniquely found. No changes performed.")
    app = apps[0]
    object_id = app["id"]
    redirect_uris = list(app.get("web", {}).get("redirectUris") or [])
    if CALLBACK not in redirect_uris:
        redirect_uris.append(CALLBACK)
        request("PATCH", f"{graph_url}/{object_id}", graph, {"web": {"redirectUris": redirect_uris}})
        print("Microsoft callback registered.")
    else:
        print("Microsoft callback already registered.")
    # Supabase needs the secret value. Microsoft Graph returns it only once.
    secret = request("POST", f"{graph_url}/{object_id}/addPassword", graph,
                     {"passwordCredential": {"displayName": "Supabase OAuth"}}).get("secretText")
    if not secret:
        sys.exit("Microsoft did not return a client secret; provider was not changed.")
    request("PATCH", f"https://api.supabase.com/v1/projects/{PROJECT}/config/auth", supabase, {
        "external_azure_enabled": True,
        "external_azure_client_id": CLIENT_ID,
        "external_azure_secret": secret,
        "external_azure_url": TENANT_URL,
    })
    print("Supabase Azure provider configuration submitted.")
    print("Next: verify provider settings and complete a real sign-in; not yet proof of login.")
    # Secret is deliberately never printed, logged, or written to disk.

if __name__ == "__main__":
    main()
