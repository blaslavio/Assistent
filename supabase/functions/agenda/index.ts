// Je agenda als abonnement voor Apple Agenda, Google Agenda en Outlook (alleen lezen).
//
// GET /functions/v1/agenda?t=<geheime code>  geeft een .ics-bestand. De code maakt de gebruiker in de app
// (Instellingen › Koppelingen); een nieuwe code zet de oude meteen uit. Zonder geldige code: 404.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

type Afspraak = { id: string; start: string; einde: string | null; titel: string; locatie: string; notitie: string };

export function tekst(waarde: string): string {
  return (waarde ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Regels langer dan 75 tekens moeten worden afgebroken (RFC 5545).
function vouwen(regel: string): string {
  const delen: string[] = [];
  let rest = regel;
  while (new TextEncoder().encode(rest).length > 74) {
    let n = 74;
    while (new TextEncoder().encode(rest.slice(0, n)).length > 74) n--;
    delen.push(rest.slice(0, n));
    rest = " " + rest.slice(n);
  }
  delen.push(rest);
  return delen.join("\r\n");
}

const tijd = (s: string) => s.slice(0, 16).replace(/[-:]/g, "") + "00";
const datum = (s: string) => s.slice(0, 10).replace(/-/g, "");

function volgendeDag(s: string): string {
  const d = new Date(`${s.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function eenUurLater(s: string): string {
  const [d, t] = [s.slice(0, 10), s.slice(11, 16)];
  const moment = new Date(`${d}T${t}:00Z`);
  moment.setUTCHours(moment.getUTCHours() + 1);
  return moment.toISOString().slice(0, 16).replace(/[-:]/g, "") + "00";
}

export function ics(afspraken: Afspraak[], nu = new Date()): string {
  const stempel = nu.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const regels = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mijn assistent//NL", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Mijn assistent", "X-WR-TIMEZONE:Europe/Amsterdam", "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    "BEGIN:VTIMEZONE", "TZID:Europe/Amsterdam",
    "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD", "END:VTIMEZONE",
  ];
  for (const a of afspraken) {
    regels.push("BEGIN:VEVENT", `UID:assistent-${a.id}@mijn-assistent`, `DTSTAMP:${stempel}`,
      `SUMMARY:${tekst(a.titel || "Afspraak")}`);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(a.start)) {
      const einde = a.einde && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(a.einde) ? tijd(a.einde) : eenUurLater(a.start);
      regels.push(`DTSTART;TZID=Europe/Amsterdam:${tijd(a.start)}`, `DTEND;TZID=Europe/Amsterdam:${einde}`);
    } else {
      regels.push(`DTSTART;VALUE=DATE:${datum(a.start)}`, `DTEND;VALUE=DATE:${volgendeDag(a.start)}`);
    }
    if (a.locatie) regels.push(`LOCATION:${tekst(a.locatie)}`);
    if (a.notitie) regels.push(`DESCRIPTION:${tekst(a.notitie)}`);
    regels.push("END:VEVENT");
  }
  regels.push("END:VCALENDAR");
  return regels.map(vouwen).join("\r\n") + "\r\n";
}

Deno.serve(async (verzoek) => {
  const token = new URL(verzoek.url).searchParams.get("t") ?? "";
  if (!/^[0-9a-f]{48}$/.test(token)) return new Response("Niet gevonden", { status: 404 });
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/agenda_feed`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_token: token }),
  });
  if (!r.ok) return new Response("Even niet beschikbaar", { status: 503 });
  const feed = await r.json();
  if (!feed) return new Response("Niet gevonden", { status: 404 });
  return new Response(ics(feed.afspraken), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300",
               "Content-Disposition": 'inline; filename="agenda.ics"' },
  });
});
