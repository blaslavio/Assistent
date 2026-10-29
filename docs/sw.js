// Ontvangt pushmeldingen (al versleuteld door de server, ontsleuteld door de browser) en toont ze.
// En de bliksemstart: de app zelf (de pagina's en de bestanden van de app) staat op dit toestel, zodat openen niet
// op het netwerk hoeft te wachten. Je gegevens komen hier nooit in: verzoeken aan de database gaan altijd gewoon door.
const BESTANDEN = "assistent-bestanden-1";
const PAGINAS = "assistent-paginas-1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const naam of await caches.keys()) {
    if (naam.startsWith("assistent-") && naam !== BESTANDEN && naam !== PAGINAS) await caches.delete(naam);
  }
  await self.clients.claim();
})()));

// Bestanden met een vingerafdruk in de naam (app/assets/index-AbC123.js) veranderen nooit: eerst uit de cache.
async function eerstCache(verzoek) {
  const cache = await caches.open(BESTANDEN);
  const bewaard = await cache.match(verzoek);
  if (bewaard) return bewaard;
  const antwoord = await fetch(verzoek);
  if (antwoord.ok) {
    await cache.put(verzoek, antwoord.clone());
    // Oude versies ruimen we op: hooguit 80 bestanden, de oudste gaan eerst.
    const sleutels = await cache.keys();
    for (const oud of sleutels.slice(0, Math.max(0, sleutels.length - 80))) await cache.delete(oud);
  }
  return antwoord;
}

// Pagina's: meteen de bewaarde versie tonen en op de achtergrond de nieuwste ophalen. Is er een nieuwe versie van de
// app, dan ziet de app dat zelf (versie.json) en laadt hij die met ?v=...; dan gaan we wel eerst naar het netwerk.
async function pagina(e) {
  const verzoek = e.request;
  const url = new URL(verzoek.url);
  const sleutel = url.origin + url.pathname;
  const cache = await caches.open(PAGINAS);
  const vers = fetch(verzoek).then(async (antwoord) => {
    if (antwoord.ok && antwoord.type === "basic") await cache.put(sleutel, antwoord.clone());
    return antwoord;
  });
  if (url.searchParams.has("v")) return vers.catch(async () => (await cache.match(sleutel)) || Response.error());
  const bewaard = await cache.match(sleutel);
  if (bewaard) {
    e.waitUntil(vers.catch(() => {}));
    return bewaard;
  }
  return vers;
}

self.addEventListener("fetch", (e) => {
  const verzoek = e.request;
  if (verzoek.method !== "GET") return;
  const url = new URL(verzoek.url);
  if (url.origin === self.location.origin && url.pathname.startsWith(new URL("app/assets/", self.registration.scope).pathname)) {
    e.respondWith(eerstCache(verzoek));
  } else if (verzoek.mode === "navigate" && url.origin === self.location.origin
             && url.pathname.startsWith(new URL(self.registration.scope).pathname)) {
    e.respondWith(pagina(e));
  } else if (url.origin === "https://fonts.gstatic.com") {
    e.respondWith(eerstCache(verzoek));
  }
});

self.addEventListener("push", (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (_) { m = { titel: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(m.titel || "Mijn assistent", {
    body: m.tekst || "",
    icon: "icoon-192.png",
    badge: "icoon-192.png",
    tag: m.soort === "vertrek" ? "vertrek" : undefined,
    data: { link: m.link || "" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const link = (e.notification.data || {}).link || "";
  const doel = new URL("./" + (link ? "?open=" + encodeURIComponent(link) : ""), self.registration.scope).href;
  e.waitUntil((async () => {
    const vensters = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const v of vensters) {
      if (v.url.startsWith(self.registration.scope)) {
        await v.focus();
        if (link) v.postMessage({ soort: "open", link });
        return;
      }
    }
    await self.clients.openWindow(doel);
  })());
});
