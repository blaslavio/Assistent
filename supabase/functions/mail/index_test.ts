// MAIL_TEST=1 deno test --allow-net --allow-read --allow-env supabase/functions/mail/index_test.ts
// Met een kleine nep-mailserver (TLS) die alleen doet wat de functie nodig heeft. Certificaat: MAIL_TEST_CERT/KEY.
import { bericht, controleren, inloggen, kopCoderen, kopTekst, lijst, opstellen, versturen } from "./index.ts";

const gelijk = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
};

Deno.test("koppen", () => {
  gelijk(kopTekst("=?utf-8?B?SMOpIFNhbm5l?="), "Hé Sanne");
  gelijk(kopTekst("=?iso-8859-1?Q?Caf=E9_morgen?= om 10"), "Café morgen om 10");
});

const MULTI = [
  "From: =?utf-8?Q?Bram_de_V=C3=A9?= <bram@voorbeeld.nl>", "Subject: Etentje vrijdag", "Date: Tue, 27 Oct 2026 18:00:00 +0100",
  'Content-Type: multipart/alternative; boundary="xx"', "", "--xx", "Content-Type: text/plain; charset=utf-8",
  "Content-Transfer-Encoding: quoted-printable", "", "Zin in een etentje vrijdag om 19:00? Groet, Br=C3=A9m", "> oud citaat",
  "--xx", "Content-Type: text/html", "", "<p>html</p>", "--xx--", ""].join("\r\n");

Deno.test("bericht uit multipart", () => {
  const b = bericht(7, false, MULTI);
  gelijk([b.van, b.adres, b.onderwerp, b.tekst], ["Bram de Vé", "bram@voorbeeld.nl", "Etentje vrijdag",
    "Zin in een etentje vrijdag om 19:00? Groet, Brém"]);
});

Deno.test("html en base64", () => {
  const ruw = ["From: winkel@voorbeeld.nl", "Subject: Je bestelling", "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64", "", btoa("<style>x{}</style><p>Verzonden &amp; onderweg</p>")].join("\r\n");
  gelijk(bericht(1, true, ruw).tekst, "Verzonden & onderweg");
});

Deno.test("nep-mailserver: inloggen, alleen-lezen openen en ophalen", async () => {
  const cert = Deno.env.get("MAIL_TEST_CERT"), key = Deno.env.get("MAIL_TEST_KEY");
  if (!cert || !key) return;
  const opdrachten: string[] = [];
  const server = Deno.listenTls({ port: 0, hostname: "127.0.0.1", cert: await Deno.readTextFile(cert), key: await Deno.readTextFile(key) });
  const verbinding = async (c: Deno.TlsConn) => {
    const w = (s: string) => c.write(new TextEncoder().encode(s));
    await w("* OK nep\r\n");
    const buf = new Uint8Array(4096);
    let rest = "";
    while (true) {
      const n = await c.read(buf);
      if (n === null) break;
      rest += new TextDecoder().decode(buf.subarray(0, n));
      while (rest.includes("\r\n")) {
        const regel = rest.slice(0, rest.indexOf("\r\n"));
        rest = rest.slice(rest.indexOf("\r\n") + 2);
        const [label, ...r] = regel.split(" ");
        const opdracht = r.join(" ");
        opdrachten.push(opdracht.replace(/"geheim"/, '"***"'));
        if (opdracht.startsWith("LOGIN")) await w(opdracht.includes('"geheim"') ? `${label} OK\r\n` : `${label} NO fout\r\n`);
        else if (opdracht.startsWith("EXAMINE")) await w(`* 2 EXISTS\r\n${label} OK [READ-ONLY]\r\n`);
        else if (opdracht.startsWith("UID SEARCH")) await w(`* SEARCH 3 9\r\n${label} OK\r\n`);
        else if (opdracht.startsWith("UID FETCH")) {
          const een = new TextEncoder().encode(MULTI);
          await w(`* 1 FETCH (UID 3 FLAGS (\\Seen) BODY[]<0> {${een.length}}\r\n`);
          await c.write(een);
          await w(`)\r\n* 2 FETCH (UID 9 FLAGS () BODY[]<0> {${"Subject: Nieuw\r\n\r\nHoi".length}}\r\nSubject: Nieuw\r\n\r\nHoi)\r\n${label} OK\r\n`);
        } else if (opdracht.startsWith("LOGOUT")) { await w(`* BYE\r\n${label} OK\r\n`); c.close(); return; }
        else await w(`${label} BAD\r\n`);
      }
    }
  };
  const klaar = (async () => {
    for (let i = 0; i < 2; i++) await verbinding(await server.accept());
  })();
  const { port } = server.addr as Deno.NetAddr;
  const caCerts = [await Deno.readTextFile(Deno.env.get("MAIL_TEST_CA") ?? cert)];
  let mislukt = "";
  try {
    await inloggen({ imap: "localhost", imap_poort: port, adres: "sanne@voorbeeld.nl", wachtwoord: "fout" }, { caCerts });
  } catch (e) {
    mislukt = (e as Error).message;
  }
  gelijk(mislukt, "Inloggen bij je mail lukte niet. Klopt het app-wachtwoord?");
  const imap = await inloggen({ imap: "localhost", imap_poort: port, adres: "sanne@voorbeeld.nl", wachtwoord: "geheim" }, { caCerts });
  const b = await lijst(imap);
  imap.sluiten();
  await klaar;
  server.close();
  gelijk(b.map((x) => [x.uid, x.gelezen, x.onderwerp]), [[9, false, "Nieuw"], [3, true, "Etentje vrijdag"]]);
  if (!opdrachten.includes("EXAMINE INBOX")) throw new Error("niet alleen-lezen geopend");
  if (opdrachten.some((o) => /STORE|SELECT|EXPUNGE|COPY|MOVE/.test(o))) throw new Error("schrijfopdracht gestuurd");
});

Deno.test("bericht opstellen en controleren", () => {
  gelijk(kopCoderen("Re: Etentje"), "Re: Etentje");
  gelijk(kopTekst(kopCoderen("Café vrijdag")), "Café vrijdag");
  const b = controleren({ aan: [" bram@voorbeeld.nl "], onderwerp: "Re: Etentje", tekst: "Leuk!\nTot vrijdag", antwoord_op: "<a1@x.nl>" });
  const ruw = opstellen("sanne@voorbeeld.nl", b, new Date("2026-10-28T20:00:00Z"));
  const delen = ruw.split("\r\n\r\n");
  if (!delen[0].includes("In-Reply-To: <a1@x.nl>") || !delen[0].includes("To: bram@voorbeeld.nl")) throw new Error(delen[0]);
  gelijk(new TextDecoder().decode(Uint8Array.from(atob(delen[1].replace(/\r\n/g, "")), (c) => c.charCodeAt(0))), "Leuk!\r\nTot vrijdag");
  for (const fout of [{ aan: [], tekst: "x" }, { aan: ["geen adres"], tekst: "x" }, { aan: ["a@b.nl\r\nBcc: c@d.nl"], tekst: "x" },
    { aan: ["a@b.nl"], tekst: "  " }]) {
    let goed = false;
    try { controleren(fout); } catch { goed = true; }
    if (!goed) throw new Error(`niet geweigerd: ${JSON.stringify(fout)}`);
  }
  // Een kop kan geen extra regels krijgen.
  if (/\r\nBcc/.test(opstellen("s@v.nl", controleren({ aan: ["a@b.nl"], onderwerp: "Hoi\r\nBcc: c@d.nl", tekst: "x" })))) {
    throw new Error("kopinjectie");
  }
});

Deno.test("nep-mailserver: versturen over 465", async () => {
  const cert = Deno.env.get("MAIL_TEST_CERT"), key = Deno.env.get("MAIL_TEST_KEY");
  if (!cert || !key) return;
  const server = Deno.listenTls({ port: 0, hostname: "127.0.0.1", cert: await Deno.readTextFile(cert), key: await Deno.readTextFile(key) });
  const gezien: string[] = [];
  const klaar = (async () => {
    const c = await server.accept();
    const w = (s: string) => c.write(new TextEncoder().encode(s));
    await w("220 nep\r\n");
    const buf = new Uint8Array(65536);
    let rest = "", data = false;
    while (true) {
      const n = await c.read(buf);
      if (n === null) break;
      rest += new TextDecoder().decode(buf.subarray(0, n));
      while (rest.includes("\r\n")) {
        const regel = rest.slice(0, rest.indexOf("\r\n"));
        rest = rest.slice(rest.indexOf("\r\n") + 2);
        if (data) { if (regel === ".") { data = false; await w("250 ok\r\n"); } else gezien.push(regel); continue; }
        gezien.push(regel.startsWith("AUTH") ? "AUTH" : regel);
        if (regel.startsWith("EHLO")) await w("250-nep\r\n250 AUTH PLAIN\r\n");
        else if (regel.startsWith("AUTH")) await w(regel === `AUTH PLAIN ${btoa("\0sanne@voorbeeld.nl\0geheim")}` ? "235 ok\r\n" : "535 nee\r\n");
        else if (regel === "DATA") { data = true; await w("354 ga\r\n"); }
        else if (regel === "QUIT") { await w("221 dag\r\n"); c.close(); return; }
        else await w("250 ok\r\n");
      }
    }
  })();
  const { port } = server.addr as Deno.NetAddr;
  const caCerts = [await Deno.readTextFile(Deno.env.get("MAIL_TEST_CA") ?? cert)];
  await versturen({ smtp: "localhost", smtp_poort: port, adres: "sanne@voorbeeld.nl", wachtwoord: "geheim" },
    controleren({ aan: ["bram@voorbeeld.nl"], onderwerp: "Hoi", tekst: "Tot morgen" }), { caCerts, direct: true });
  await klaar;
  server.close();
  gelijk(gezien.slice(0, 5), ["EHLO assistent", "AUTH", "MAIL FROM:<sanne@voorbeeld.nl>", "RCPT TO:<bram@voorbeeld.nl>", "DATA"]);
  if (!gezien.includes("Subject: Hoi")) throw new Error("geen onderwerp");
});
