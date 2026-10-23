// Ontvangt pushmeldingen (al versleuteld door de server, ontsleuteld door de browser) en toont ze.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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
