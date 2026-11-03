import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { bijwerken, instellingenBijwerken, uitloggen } from "../api";
import { gekoppeld } from "../lib/mail";
import { naar, kaartOpenen, evenementenOpenen, vakantiesOpenen, gevraagdePagina } from "../lib/naar";
import {
  betaalStatus,
  lijst as bestellingenLijst,
  klaar,
  platformInstellen,
  stand,
  verkoperAanmelden,
  type BetaalStatus,
  type Bestelling,
} from "../lib/bestellingen";
import { euro } from "../lib/winkelen";
import { MailKoppelen } from "./AgendaPanelen";
import { BoekpaginaInstellen, MailVersturen } from "./Gasten";
import type { Staat } from "../App";
import {
  Boek,
  Envelop,
  Euro,
  Grafiek,
  Huis,
  Kalender,
  Lijstje,
  Persoon,
  Schuiven,
  Slot,
  Terug,
  Vonk,
  Vraag,
  Winkelpand,
} from "../iconen";
import { Schakelaar, kop } from "./instellingen-ui";
import { Account, Beveiliging, BeveiligingsOptie, Techniek } from "./Beveiliging";
import { ONDERDELEN, Onderdeel, type OnderdeelNaam } from "./Onderdelen";
import { AlgemeenScherm, IdeeScherm, type Weergave } from "./Algemeen";
import { Profiel, useEigenFoto } from "./Profiel";
import StatusHulp from "./StatusHulp";

type Props = {
  staat: Staat;
  vernieuw: () => Promise<void>;
  terug: () => void;
  opUitgelogd: () => void;
  setStaat: (s: Staat) => void;
  vraag: (tekst: string) => void;
  start?: { naam: OnderdeelNaam; n: number } | null;
  vorigeNaam?: string;
};
type Pagina =
  | null
  | "algemeen"
  | "idee"
  | "hulp"
  | "profiel"
  | "account"
  | "assistent"
  | "privacy"
  | "thuis"
  | "mail"
  | "betalingen"
  | "afspraken";

type Inst = {
  stijl?: Record<string, string | undefined>;
  avatar?: { naam?: string };
  geheugen_uit?: boolean;
  thuisadres?: string;
  anthropic_sleutel?: string;
  boekpagina?: boolean;
  mail?: { adres?: string };
};
type Feit = { id: number; feit: string; onderwerp?: string };

const KEUZES: { sleutel: string; label: string; opties: string[]; standaard: string }[] = [
  { sleutel: "toon", label: "Toon", opties: ["Automatisch", "Informeel", "Zakelijk"], standaard: "Automatisch" },
  { sleutel: "lengte", label: "Antwoorden", opties: ["Automatisch", "Kort", "Uitgebreid"], standaard: "Automatisch" },
  { sleutel: "aanspreken", label: "Aanspreken met", opties: ["je", "u"], standaard: "je" },
  { sleutel: "nadenken", label: "Nadenken", opties: ["Snel", "Normaal", "Grondig"], standaard: "Grondig" },
  { sleutel: "gevoel", label: "Gevoel", opties: ["Uit", "Rustig", "Normaal", "Sterk"], standaard: "Normaal" },
  { sleutel: "humor", label: "Humor", opties: ["Geen", "Af en toe", "Veel"], standaard: "Af en toe" },
];

export default function Instellingen({
  staat,
  vernieuw,
  terug,
  opUitgelogd,
  setStaat,
  vraag,
  start,
  vorigeNaam,
}: Props) {
  const [pagina, setPagina] = useState<Pagina>(() => (start ? null : (gevraagdePagina() as Pagina)));
  const [onderdeel, setOnderdeel] = useState<OnderdeelNaam | null>(start?.naam ?? null);
  const [vanApps, setVanApps] = useState(!!start);
  useEffect(() => {
    if (start) {
      setPagina(null);
      setOnderdeel(start.naam);
      setVanApps(true);
    }
  }, [start]);
  useEffect(() => {
    const open = () => {
      const p = gevraagdePagina();
      if (p) {
        setOnderdeel(null);
        setVanApps(false);
        setPagina(p as Pagina);
      }
    };
    window.addEventListener("instellingen-pagina", open);
    return () => window.removeEventListener("instellingen-pagina", open);
  }, []);
  const [bezig, setBezig] = useState(false);
  const [categorie, setCategorie] = useState<string | null>(null);
  const [zoek, setZoek] = useState("");
  const [melding, setMelding] = useState("");
  const g = staat.gebruiker;
  const [eigenFoto] = useEigenFoto(g);
  const inst = (staat.data.instellingen ?? {}) as Inst;
  const naam = g.weergavenaam || g.naam || "Jij";

  async function bewaar(
    aanpassen: (i: Record<string, unknown>) => void,
    klaar = "Bewaard",
    alles?: Parameters<typeof bijwerken>[0],
  ) {
    setBezig(true);
    setMelding("");
    try {
      await (alles ? bijwerken(alles) : instellingenBijwerken(aanpassen));
      await vernieuw();
      setMelding(klaar);
      setTimeout(() => setMelding(""), 1800);
    } catch {
      setMelding("Bewaren lukte niet. Probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  const scherm = (titel: string, inhoud: ReactNode) => (
    <div className="px-6 pt-4 pb-10">
      <button
        type="button"
        onClick={() => setPagina(null)}
        className="-ml-2 flex h-10 items-center gap-1 pr-3 text-rustig"
      >
        <Terug className="size-5" /> Instellingen
      </button>
      <h1 className="mt-4 mb-6 text-[28px] font-bold tracking-tight">{titel}</h1>
      <div className="flex flex-col gap-7">{inhoud}</div>
      <p aria-live="polite" className="mt-6 h-5 text-center text-sm text-rustig">
        {bezig ? "Bewaren…" : melding}
      </p>
    </div>
  );

  if (pagina === "profiel") return scherm("Profiel", <Profiel g={g} vernieuw={vernieuw} />);

  if (pagina === "assistent") {
    const stijl = inst.stijl ?? {};
    return scherm(
      "Assistent",
      <>
        <TekstVeld
          label="Naam van de assistent"
          uitleg="Leeg laten als je geen naam wilt."
          waarde={
            inst.avatar?.naam && !["Assistent", "Sam"].includes(inst.avatar.naam)
              ? inst.avatar.naam
              : ""
          }
          bewaar={(v) =>
            bewaar((i) => {
              i.avatar = { ...((i.avatar as object) ?? {}), naam: v.trim() || "Assistent" };
            })
          }
        />
        {KEUZES.map((k) => (
          <Keuze
            key={k.sleutel}
            label={k.label}
            opties={k.opties}
            waarde={stijl[k.sleutel] ?? k.standaard}
            kies={(v) =>
              bewaar((i) => {
                i.stijl = { ...((i.stijl as object) ?? {}), [k.sleutel]: v };
              })
            }
          />
        ))}
        <Sleutel
          ingesteld={Boolean(inst.anthropic_sleutel)}
          bewaar={(v) =>
            bewaar((i) => {
              i.anthropic_sleutel = v.trim();
            }, v ? "Sleutel bewaard" : "Sleutel verwijderd")
          }
        />
      </>,
    );
  }

  if (pagina === "privacy") {
    const feiten = ((staat.data.geheugen as Feit[] | undefined) ?? []).slice().reverse();
    return scherm(
      "Privacy en beveiliging",
      <div className="flex flex-col gap-3">
        <Beveiliging gebruiker={g} />
        <BeveiligingsOptie
          icoon={Vonk}
          titel="Wat de assistent van mij onthoudt"
          kort="Kies wat bewaard blijft en bekijk je persoonlijke voorkeuren."
        >
          <Schakelaar
            label="De assistent onthoudt dingen over mij"
            uitleg="Bijvoorbeeld voorkeuren en gewoontes, zodat hij je beter helpt."
            aan={!inst.geheugen_uit}
            zet={(aan) =>
              bewaar((i) => {
                i.geheugen_uit = !aan;
              })
            }
          />
          <section>
            <h2 className={kop}>Wat de assistent weet</h2>
            {feiten.length === 0 ? (
              <p className="px-1 text-rustig">Nog niets.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-lijn rounded-2xl bg-vlak">
                {feiten.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 py-2.5 pr-2 pl-4">
                    <span className="flex-1">{f.feit}</span>
                    <button
                      type="button"
                      onClick={() =>
                        bewaar(() => {}, "Vergeten", (d) => {
                          d.geheugen = ((d.geheugen as Feit[] | undefined) ?? []).filter(
                            (x) => x.id !== f.id,
                          );
                        })
                      }
                      aria-label={`Vergeet: ${f.feit}`}
                      className="h-9 shrink-0 rounded-full px-3 text-sm text-rustig hover:bg-white/60 dark:hover:bg-black/30"
                    >
                      Vergeet
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 px-1 text-sm text-rustig">
              Je vragen worden verwerkt door de ingestelde AI-dienst. Deel alleen wat nodig is.
            </p>
          </section>
        </BeveiligingsOptie>
        <BeveiligingsOptie icoon={Schuiven} titel="Technische uitleg" kort="Meer achtergrond bij de werking van de app.">
          <Techniek />
        </BeveiligingsOptie>
      </div>,
    );
  }

  if (pagina === "account")
    return scherm("Account", <Account gebruiker={g} vernieuw={vernieuw} opUitgelogd={opUitgelogd} />);

  if (pagina === "mail")
    return scherm(
      "Mail",
      gekoppeld(staat.data) ? (
        <>
          <p className="px-1 text-rustig">
            Gekoppeld: {inst.mail?.adres}. De app leest alleen en verandert niets in je mailbox.
          </p>
          <button
            type="button"
            onClick={() =>
              bewaar((i) => {
                delete i.mail;
              }, "Ontkoppeld")
            }
            className="h-12 rounded-2xl bg-vlak font-medium text-red-600 dark:text-red-400"
          >
            Ontkoppelen
          </button>
        </>
      ) : (
        <MailKoppelen staat={staat} setStaat={setStaat} />
      ),
    );

  if (pagina === "afspraken")
    return scherm(
      "Boekingspagina",
      <>
        <BoekpaginaInstellen naam={naam} />
        {g.id === 1 && <MailVersturen />}
      </>,
    );

  if (pagina === "betalingen") return scherm("Betalingen", <Betalingen eigenaar={g.id === 1} />);
  if (pagina === "hulp") return scherm("Status en meldingen", <StatusHulp />);
  if (onderdeel)
    return (
      <Onderdeel
        naam={onderdeel}
        staat={staat}
        vernieuw={vernieuw}
        vraag={vraag}
        terugNaam={vanApps ? vorigeNaam : undefined}
        terug={() => {
          setOnderdeel(null);
          if (vanApps) {
            setVanApps(false);
            terug();
          }
        }}
      />
    );
  if (pagina === "algemeen")
    return scherm("Weergave", <AlgemeenScherm inst={inst as Weergave} bewaar={(a) => bewaar(a)} />);
  if (pagina === "idee") return scherm("Idee of probleem", <IdeeScherm />);
  if (pagina === "thuis")
    return scherm(
      "Thuis",
      <TekstVeld
        label="Thuisadres"
        uitleg="Voor het weer op Vandaag en reistijden. Alleen jij ziet dit."
        waarde={inst.thuisadres ?? ""}
        bewaar={(v) =>
          bewaar((i) => {
            i.thuisadres = v.trim();
          })
        }
      />,
    );

  const groepen = [
    {
      id: "account",
      titel: "Account en privacy",
      uitleg: "Profiel, aanmelding en beveiliging",
      icoon: Slot,
      kleur: "#3a8f5c",
      rijen: [
        { titel: "Profiel", uitleg: "Naam, foto en openbare profielpagina", open: () => setPagina("profiel"), icoon: Persoon },
        { titel: "Account", uitleg: "Mailadres, wachtwoord en inloggen", open: () => setPagina("account"), icoon: Persoon },
        { titel: "Privacy en beveiliging", uitleg: "Tweestapsverificatie, apparaten en geheugen", open: () => setPagina("privacy"), icoon: Slot },
      ],
    },
    {
      id: "app",
      titel: "App en assistent",
      uitleg: "Weergave en persoonlijke voorkeuren",
      icoon: Schuiven,
      kleur: "#4f46e5",
      rijen: [
        { titel: "Weergave", uitleg: "Kleur, tekstgrootte, navigatie en Vandaag", open: () => setPagina("algemeen"), icoon: Schuiven },
        { titel: "Assistent", uitleg: "Naam, toon, antwoorden en AI-koppeling", open: () => setPagina("assistent"), icoon: Vonk },
        { titel: "Status en meldingen", uitleg: "Lokale activiteit en meldbeleid", open: () => setPagina("hulp"), icoon: Vraag },
      ],
    },
    {
      id: "planning",
      titel: "Planning en koppelingen",
      uitleg: "Agenda, reizen, mail en thuisadres",
      icoon: Kalender,
      kleur: "#2f80ed",
      rijen: [
        { titel: "Mail", uitleg: gekoppeld(staat.data) ? "Mailbox gekoppeld" : "Koppel je mailbox", open: () => setPagina("mail"), icoon: Envelop },
        { titel: "Kaart en routes", uitleg: "Bestemming zoeken en navigeren", open: kaartOpenen, icoon: Huis },
        { titel: "Vakantie en verblijf", uitleg: "Reisplannen en reserveringen", open: vakantiesOpenen, icoon: Kalender },
        { titel: "Evenementen", uitleg: "Organiseren en evenementpagina", open: evenementenOpenen, icoon: Kalender },
        { titel: "Thuis", uitleg: "Adres voor weer en reistijden", open: () => setPagina("thuis"), icoon: Huis },
      ],
    },
    {
      id: "geld",
      titel: "Geldzaken",
      uitleg: "Betalingen, budget en beleggingen",
      icoon: Euro,
      kleur: "#c2571a",
      rijen: [
        { titel: "Betalingen", uitleg: "Bestellingen en uitbetalen", open: () => setPagina("betalingen"), icoon: Euro },
        { titel: "Budget", uitleg: "Uitgaven en afschriften", open: () => naar({ tab: "projecten", onderdeel: "budget" }), icoon: Lijstje },
        { titel: "Beleggen", uitleg: "Portefeuille en markten", open: () => naar({ tab: "projecten", onderdeel: "beleggen" }), icoon: Grafiek },
      ],
    },
    {
      id: "apps",
      titel: "Mijn apps",
      uitleg: "Lijsten, documenten, leren en gezondheid",
      icoon: Boek,
      kleur: "#14866d",
      rijen: ONDERDELEN.filter(([id]) => !["budget", "beleggen", "zakelijk"].includes(id)).map(
        ([id, titel, icoon]) => ({
          titel,
          uitleg: ONDERDEEL_UITLEG[id] ?? titel,
          icoon,
          open: () => naar({ tab: "projecten", onderdeel: id }),
        }),
      ),
    },
    {
      id: "zakelijk",
      titel: "Zakelijke opties",
      uitleg: "Klanten, rooster en afspraken",
      icoon: Winkelpand,
      kleur: "#346a92",
      rijen: [
        { titel: "Zakelijk", uitleg: "Rooster, klanten en boekhouding", open: () => naar({ tab: "projecten", onderdeel: "zakelijk" }), icoon: Winkelpand },
        { titel: "Boekingspagina", uitleg: "Afspraken laten inplannen", open: () => setPagina("afspraken"), icoon: Kalender },
      ],
    },
  ];

  const volgorde = ["account", "app", "planning", "apps", "geld"];
  const persoonlijk = groepen
    .filter((g) => g.id !== "zakelijk")
    .sort((a, b) => volgorde.indexOf(a.id) - volgorde.indexOf(b.id));
  const term = zoek.trim().toLocaleLowerCase("nl");
  const gekozenGroep = groepen.find((g) => g.id === categorie);
  const resultaten = [
    ...groepen.flatMap((g) => g.rijen.map((r) => ({ ...r, kleur: g.kleur, groep: g.titel }))),
    { titel: "Idee of probleem", uitleg: "Hulp en feedback", icoon: Vraag, kleur: "#0e9fb3", groep: "Hulp", open: () => setPagina("idee") },
  ].filter((r) => `${r.titel} ${r.uitleg} ${r.groep}`.toLocaleLowerCase("nl").includes(term));

  return (
    <div className="px-6 pt-4 pb-10">
      <button
        type="button"
        onClick={() => {
          if (categorie || zoek) {
            setCategorie(null);
            setZoek("");
          } else terug();
        }}
        className="-ml-2 flex h-10 items-center gap-1 pr-3 text-rustig"
      >
        <Terug className="size-5" /> {categorie || zoek ? "Instellingen" : "Terug"}
      </button>
      <h1 className="mt-4 text-[32px] font-bold tracking-tight">
        {gekozenGroep?.titel ?? "Instellingen"}
      </h1>
      {!categorie && !term && (
        <p className="mb-4 mt-1 text-[13px] text-rustig">
          Account, privacy, apps en status — jij houdt de regie.
        </p>
      )}
      {!categorie && !term && (
        <button
          type="button"
          onClick={() => setPagina("profiel")}
          className="mb-5 flex w-full items-center gap-3 rounded-2xl bg-vlak p-3 text-left"
        >
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white dark:bg-black/40">
            {eigenFoto ? (
              <img src={eigenFoto} alt="" className="size-full object-cover" />
            ) : (
              naam[0].toUpperCase()
            )}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{naam}</span>
          <span className="text-sm text-rustig">Profiel</span>
        </button>
      )}
      <label className="block">
        <span className="sr-only">Zoek in instellingen en apps</span>
        <input
          type="search"
          value={zoek}
          onChange={(e) => {
            setZoek(e.target.value);
            setCategorie(null);
          }}
          placeholder="Zoek een instelling of app"
          className="h-12 w-full rounded-2xl bg-vlak px-4"
        />
      </label>
      {term ? (
        <>
          <p role="status" className="mt-4 text-sm text-rustig">
            {resultaten.length
              ? `${resultaten.length} gevonden`
              : "Niets gevonden. Probeer privacy, status of budget."}
          </p>
          <Groep titel="Zoekresultaten">
            {resultaten.map((r) => (
              <Rij key={r.titel} {...r} uitleg={`${r.groep} · ${r.uitleg}`} />
            ))}
          </Groep>
        </>
      ) : gekozenGroep ? (
        <Groep titel={gekozenGroep.uitleg}>
          {gekozenGroep.rijen.map((r) => (
            <Rij key={r.titel} {...r} kleur={gekozenGroep.kleur} />
          ))}
        </Groep>
      ) : (
        <>
          <Groep titel="Voor jezelf">
            {persoonlijk.map((g) => (
              <Rij
                key={g.id}
                titel={g.titel}
                uitleg={g.uitleg}
                icoon={g.icoon}
                kleur={g.kleur}
                open={() => setCategorie(g.id)}
              />
            ))}
          </Groep>
          <details className="mt-5 rounded-2xl border border-lijn p-4">
            <summary className="min-h-11 cursor-pointer py-2 font-medium">Zakelijke opties</summary>
            <Groep titel="Voor je werk of onderneming">
              {groepen
                .find((g) => g.id === "zakelijk")!
                .rijen.map((r) => (
                  <Rij key={r.titel} {...r} kleur="#346a92" />
                ))}
            </Groep>
          </details>
          <div className="mt-5 flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setPagina("hulp")}
              className="min-h-11 text-left text-sm font-medium text-accent"
            >
              Status en meldingen
            </button>
            <button
              type="button"
              onClick={() => setPagina("idee")}
              className="min-h-11 text-left text-sm text-accent"
            >
              Hulp of een idee doorgeven
            </button>
          </div>
        </>
      )}
      <button
        type="button"
        onClick={async () => {
          await uitloggen();
          opUitgelogd();
        }}
        className="mt-8 h-12 w-full rounded-2xl bg-vlak font-medium text-red-600 dark:text-red-400"
      >
        Uitloggen
      </button>
    </div>
  );
}

function Groep({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className={kop}>{titel}</h2>
      <ul className="flex flex-col overflow-hidden rounded-3xl bg-vlak">{children}</ul>
    </section>
  );
}

const ONDERDEEL_UITLEG: Record<string, string> = {
  leren: "Elke dag een beetje, met herhalen en overhoren",
  sport: "Trainingen, doelen, Strava en Apple Gezondheid",
  boodschappen: "Wat je nog moet haalen",
  kooplijst: "Wat je wilt kopen, met prijs",
  wenslijst: "Cadeau-ideeën en wensen",
  notities: "Snel iets opschrijven",
  documenten: "Brieven en teksten, ook als Word of PDF",
};

function Rij({
  icoon: Icoon,
  kleur,
  titel,
  uitleg,
  open,
}: {
  icoon: (p: { className?: string }) => ReactNode;
  kleur: string;
  titel: string;
  uitleg: string;
  open: () => void;
}) {
  return (
    <li className="[&+li>button>span:last-child]:border-t [&+li>button>span:last-child]:border-lijn">
      <button type="button" onClick={open} className="flex w-full items-center gap-3 pl-4 text-left">
        <span
          style={{ background: kleur }}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white"
        >
          <Icoon className="size-[18px]" />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-4">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">{titel}</span>
            <span className="truncate text-sm text-rustig">{uitleg}</span>
          </span>
          <Terug className="size-5 shrink-0 rotate-180 text-zacht" />
        </span>
      </button>
    </li>
  );
}

function Keuze({
  label,
  opties,
  waarde,
  kies,
}: {
  label: string;
  opties: string[];
  waarde: string;
  kies: (v: string) => void;
}) {
  return (
    <fieldset>
      <legend className={kop}>{label}</legend>
      <div className="flex rounded-2xl bg-vlak p-1">
        {opties.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={o === waarde}
            onClick={() => o !== waarde && kies(o)}
            className={`h-10 flex-1 rounded-xl text-[15px] ${
              o === waarde ? "bg-white font-semibold shadow-sm dark:bg-[#2a2a31]" : "text-rustig"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function TekstVeld({
  label,
  uitleg,
  waarde,
  bewaar,
}: {
  label: string;
  uitleg: string;
  waarde: string;
  bewaar: (v: string) => void;
}) {
  const [v, setV] = useState(waarde);
  useEffect(() => setV(waarde), [waarde]);
  return (
    <label className="flex flex-col gap-1">
      <span className={kop}>{label}</span>
      <span className="text-sm text-rustig">{uitleg}</span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== waarde && bewaar(v)}
        className="h-12 rounded-2xl bg-vlak px-4"
      />
    </label>
  );
}

function Sleutel({ ingesteld, bewaar }: { ingesteld: boolean; bewaar: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <p className={kop}>Eigen AI-sleutel (optioneel)</p>
      <p className="text-sm text-rustig">
        {ingesteld ? "Er staat een sleutel ingesteld." : "Geen eigen sleutel — de app-standaard geldt."}
      </p>
      <input
        type="password"
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={ingesteld ? "Nieuwe sleutel of leeg om te wissen" : "Plak sleutel"}
        className="h-12 rounded-2xl bg-vlak px-4"
      />
      <button
        type="button"
        onClick={() => {
          bewaar(v);
          setV("");
        }}
        className="h-11 self-start rounded-full bg-accent px-4 text-sm font-medium text-white"
      >
        Bewaar sleutel
      </button>
    </div>
  );
}

function Betalingen({ eigenaar }: { eigenaar: boolean }) {
  const [st, setSt] = useState<BetaalStatus | null>(null);
  const [lijst, setLijst] = useState<Bestelling[] | null>(null);
  const [melding, setMelding] = useState("");
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    let weg = false;
    (async () => {
      try {
        const [s, l] = await Promise.all([betaalStatus(), bestellingenLijst()]);
        if (!weg) {
          setSt(s);
          setLijst(l);
        }
      } catch {
        if (!weg) setMelding("Status laden lukte niet.");
      }
    })();
    return () => {
      weg = true;
    };
  }, []);

  async function doe(werk: () => Promise<void>) {
    setBezig(true);
    setMelding("");
    try {
      await werk();
      setSt(await betaalStatus());
      setLijst(await bestellingenLijst());
    } catch {
      setMelding("Actie lukte niet.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-rustig">
        Betalingen lopen via Stripe. De app bewaart geen pasgegevens. Jij start elke koppeling zelf.
      </p>
      {melding && (
        <p role="status" className="text-sm text-rustig">
          {melding}
        </p>
      )}
      {st && (
        <div className="rounded-2xl border border-lijn p-4 text-sm">
          <p>
            Status: <span className="font-medium">{st.klaar ? "Klaar voor betalingen" : "Nog instellen"}</span>
          </p>
          {eigenaar && (
            <button
              type="button"
              disabled={bezig}
              className="mt-3 h-10 rounded-full bg-accent px-4 text-sm font-medium text-white disabled:opacity-50"
              onClick={() =>
                doe(async () => {
                  (window.top ?? window).location.href = await verkoperAanmelden();
                })
              }
            >
              {st.ik_ben_aangemeld ? "Aanmelden afmaken" : "Aanmelden bij Stripe"}
            </button>
          )}
        </div>
      )}
      {lijst && lijst.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lijst.slice(0, 8).map((b) => (
            <li key={b.id} className="rounded-2xl bg-vlak px-4 py-3 text-sm">
              <span className="font-medium">{b.omschrijving || `Bestelling ${b.id}`}</span>
              <span className="mt-0.5 block text-rustig">
                {euro(b.bedrag_centen)} · {b.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
