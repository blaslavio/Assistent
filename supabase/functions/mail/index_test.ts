// deno test --allow-net --allow-read --allow-env supabase/functions/mail/index_test.ts
// Met een kleine nep-mailserver (TLS) die alleen doet wat de functie nodig heeft. Certificaat: MAIL_TEST_CERT/KEY.
import { bericht, inloggen, kopTekst, lijst } from "./index.ts";

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
