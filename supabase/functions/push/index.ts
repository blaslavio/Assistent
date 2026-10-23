// Verstuurt pushmeldingen naar de toestellen die met de web-app gekoppeld zijn (zie sql/webpush.sql).
//
// De database wekt deze functie elke minuut als er iets klaarstaat. Een extra aanroep kan geen kwaad: hij verstuurt
// alleen wat aan de beurt is en markeert het meteen als verstuurd. Hij leest en schrijft alleen via de
// service-role, die de app en de web-app nooit te zien krijgen.

import { Vapid, vapidMaken, versturen } from "./webpush.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CONTACT = "https://blaslavio.github.io/Assistent/";

async function rpc(functie: string, parameters: Record<string, unknown> = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functie}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(parameters),
  });
  if (!r.ok) throw new Error(`database ${functie}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

let sleutels: Vapid | null = null;

async function vapid(): Promise<Vapid> {
  if (!sleutels?.prive) {
    let v = await rpc("push_vapid");
    if (!v?.prive) {
      const nieuw = await vapidMaken();
      v = await rpc("push_vapid_opslaan", { p_publiek: nieuw.publiek, p_prive: nieuw.prive });
    }
    sleutels = v;
  }
  return sleutels!;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, apikey, authorization" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const v = await vapid();
    const lijst = await rpc("push_web_ophalen") as Array<{
      id: number; soort: string; titel: string; tekst: string; link: string; dringend: boolean;
      toestellen: Array<{ id: number; endpoint: string; p256dh: string; auth: string }>;
    }>;
    const ok: number[] = [], weg: number[] = [], fout: number[] = [];
    await Promise.all(lijst.flatMap((m) => m.toestellen.map(async (t) => {
      try {
        const r = await versturen(t, { id: m.id, soort: m.soort, titel: m.titel, tekst: m.tekst, link: m.link },
          v, CONTACT, m.dringend);
        await r.body?.cancel();
        if (r.status === 404 || r.status === 410) weg.push(t.id);
        else if (r.ok) ok.push(t.id);
        else fout.push(t.id);
      } catch {
        fout.push(t.id);
      }
    })));
    if (ok.length || weg.length || fout.length) {
      await rpc("push_web_resultaat", { p_ok: ok, p_weg: weg, p_fout: fout });
    }
    return new Response(JSON.stringify({ verstuurd: ok.length, weg: weg.length, fout: fout.length, publiek: v.publiek }),
      { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ fout: "Even niet gelukt." }), { status: 500, headers: CORS });
  }
});
