#!/usr/bin/env python3
"""Controleer alleen een lokale interfacepreview met een aparte Chromium-sessie.

Vereist een al gestarte preview op 127.0.0.1 en Chromium met CDP. Blokkeert alle
pagina-aanvragen buiten die lokale preview. Start geen externe app of diensten.
"""
import argparse
import asyncio
import base64
from datetime import datetime, timezone
import http.client
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit
import websockets


class CDP:
    def __init__(self, socket, apppoort):
        self.socket = socket
        self.apppoort = apppoort
        self.nummer = 0

    async def stuur(self, methode, params=None):
        self.nummer += 1
        nummer = self.nummer
        await self.socket.send(json.dumps({"id": nummer, "method": methode, "params": params or {}}))
        return nummer

    async def roep(self, methode, params=None):
        nummer = await self.stuur(methode, params)
        while True:
            r = json.loads(await asyncio.wait_for(self.socket.recv(), timeout=20))
            if r.get("method") == "Fetch.requestPaused":
                p = r["params"]
                u = urlsplit(p["request"]["url"])
                lokaal = u.scheme in {"http", "ws"} and u.hostname == "127.0.0.1" and u.port == self.apppoort
                await self.stuur("Fetch.continueRequest" if lokaal else "Fetch.failRequest", {"requestId": p["requestId"], **({} if lokaal else {"errorReason": "BlockedByClient"})})
            if r.get("id") == nummer:
                if "error" in r:
                    raise RuntimeError("Chromium-opdracht mislukt: " + methode)
                return r.get("result", {})

    async def js(self, tekst):
        r = await self.roep("Runtime.evaluate", {"expression": tekst, "returnByValue": True})
        if "exceptionDetails" in r:
            raise RuntimeError("De DOM-controle kon niet worden uitgevoerd.")
        return r.get("result", {}).get("value")

    async def open(self, url, verwacht):
        await self.roep("Page.navigate", {"url": url})
        await self.wacht(verwacht)

    async def wacht(self, verwacht):
        for _ in range(120):
            if await self.js("document.body && document.body.innerText.includes(" + json.dumps(verwacht) + ")"):
                await asyncio.sleep(0.2)
                return
            await asyncio.sleep(0.15)
        raise RuntimeError("De verwachte lokale pagina is niet gerenderd: " + verwacht)


async def controle(args):
    verbinding = http.client.HTTPConnection("127.0.0.1", args.chromium_poort, timeout=5)
    try:
        verbinding.request("GET", "/json/list")
        tabs = json.loads(verbinding.getresponse().read())
    finally:
        verbinding.close()
    tab = next(t for t in tabs if t.get("type") == "page")
    adres = tab["webSocketDebuggerUrl"]
    u = urlsplit(adres)
    if u.hostname != "127.0.0.1" or u.port != args.chromium_poort:
        raise RuntimeError("Gebruik uitsluitend een lokale Chromium-sessie.")
    args.uitvoer.mkdir(parents=True, exist_ok=True)
    root = Path(__file__).resolve().parents[1]
    bronbestanden = ("communicatie.py", "communicatie_scherm.py", "slim.py", "universal_os.py", "app.py", "gereedschappen.py", "gereedschappen_scherm.py", "indeling.py", "tools/interface_lokaal.py", "tools/interface_browser_controle.py", "werkcontext.py", "werkcontext_scherm.py", "werkcontrole_scherm.py", "werkzoeken.py", "werkbronnen.py", "tekstcontrole.py", "opslag.py")
    hashes = {n: hashlib.sha256((root / n).read_bytes()).hexdigest() for n in bronbestanden}
    resultaten = []
    async with websockets.connect(adres, max_size=20_000_000) as ws:
        cdp = CDP(ws, args.app_poort)
        await cdp.roep("Page.enable")
        await cdp.roep("Fetch.enable", {"patterns": [{"urlPattern": "*", "requestStage": "Request"}]})
        for naam, breedte, hoogte, route, verwacht in (
                ("desktop-instellingen", 1440, 1000, "instellingen", "Zoek tools in alle mappen"),
                ("mobiel-instellingen", 390, 844, "instellingen", "Zoek tools in alle mappen"),
                ("mobiel-gereedschappen", 390, 844, "gereedschappen", "Zoek een gereedschap"),
                ("mobiel-werkstroom", 390, 844, "werkzoeken", "Zoek op titel of inhoud"),
                ("mobiel-communicatie", 390, 844, "communicatiecentrum", "Bewaar als privéconcept"),
                ("mobiel-communicatieprivacy", 390, 844, "communicatiecentrum", "Bewaar als privéconcept")):
            await cdp.roep("Emulation.setDeviceMetricsOverride", {"width": breedte, "height": hoogte, "deviceScaleFactor": 1, "mobile": breedte < 600})
            await cdp.open(f"http://127.0.0.1:{args.app_poort}/{route}", verwacht)
            if naam == "mobiel-communicatieprivacy":
                await cdp.js("Array.from(document.querySelectorAll('[data-testid=stRadio] label')).find(e=>e.innerText.includes('Privacy en profiel')).click()")
                await cdp.wacht("Privéaanspreeknaam")
            if naam == "mobiel-werkstroom":
                gevonden = await cdp.js("(() => {const e=document.querySelector('input[aria-label=\"Zoek op titel of inhoud\"]');if(!e)return false;e.focus();return true;})()")
                if not gevonden:
                    raise RuntimeError("Het zoekveld kon niet worden bediend.")
                await cdp.roep("Input.insertText", {"text": "Interfacecontrole"})
                await cdp.roep("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13})
                await cdp.roep("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13})
                await cdp.wacht("Open werkdossier")
                await cdp.js("Array.from(document.querySelectorAll('button')).find(b=>b.innerText.trim()==='Open werkdossier').click()")
                await cdp.wacht("Download werkdossier")
            waarden = await cdp.js('''(() => {
              const links = Array.from(document.querySelectorAll('[class*="st-key-kopbalk"] a')).filter(a=>a.getBoundingClientRect().width>0 && a.getBoundingClientRect().height>0);
              return {pagina_fouten:document.querySelectorAll('[data-testid="stException"]').length,
                horizontale_overloop:document.documentElement.scrollWidth > window.innerWidth + 1,
                kopbalk_links:links.length,
                onbenoemde_links:links.filter(a=>!(a.getAttribute('aria-label')||a.innerText||'').trim()).length,
                kleine_aanraakdoelen:links.filter(a=>a.getBoundingClientRect().height<43).length,
                alle_mappen: ["Kopen en verkopen","Afspreken","Leren en werk","Geld","Zakelijk","Sport en gezondheid","Thuis en handig"].every(n=>document.body.innerText.includes(n))};
            })()''')
            if route == "instellingen" and not waarden["alle_mappen"]:
                waarden["mappen_ontbreken"] = True
            if not waarden["kopbalk_links"]:
                waarden["kopbalk_ontbreekt"] = True
            geslaagd = not any(waarden.get(k) for k in ("pagina_fouten", "horizontale_overloop", "onbenoemde_links", "kleine_aanraakdoelen", "mappen_ontbreken", "kopbalk_ontbreekt"))
            plaatje = await cdp.roep("Page.captureScreenshot", {"format": "png"})
            (args.uitvoer / (naam + ".png")).write_bytes(base64.b64decode(plaatje["data"]))
            resultaten.append({"scenario": naam, "breedte": breedte, "hoogte": hoogte, "geslaagd": geslaagd, **waarden})
    r = {"formaat": "assistent-browsercontrole", "tijd": datetime.now(timezone.utc).isoformat(), "scenarios": resultaten, "bronnen": hashes,
         "broncode_actueel": all(hashlib.sha256((root / n).read_bytes()).hexdigest() == h for n, h in hashes.items()),
         "scope": "Echte navigatiefuncties en lokale tools in een geïsoleerde preview. Geen externe pagina-inhoud, login of schermlezer-audit. Chromium, geen Safari of Android-apparaat."}
    (args.uitvoer / "browsercontrole.json").write_text(json.dumps(r, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(resultaten, ensure_ascii=False))
    return 0 if all(r["geslaagd"] for r in resultaten) else 1


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--app-poort", type=int, default=8511)
    p.add_argument("--chromium-poort", type=int, default=9227)
    p.add_argument("--uitvoer", type=Path, default=Path("controle/interface"))
    args = p.parse_args()
    return asyncio.run(controle(args))


if __name__ == "__main__":
    raise SystemExit(main())
