import BerichtTaak from "./BerichtTaak";
import { useSchermActief } from "./BewaarScherm";
import { KaartVouw } from "../iconen";
import { kaartOpenen, kaartGevraagd, gevraagdGesprek, gevraagdBericht, winkelAppGevraagd } from "../lib/naar";
import { Fragment, Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Bewerk, Mensen, Projectmap, Telefoon, Tandwiel } from "../iconen";
import { GastGesprekScherm, GastenLijst } from "./Gasten";
import { gesprekken as gastGesprekken, type GastGesprek } from "../lib/gasten";
import { isGevraagd, openGevraagd } from "../lib/bestellingen";
import { overzicht, starten, voorbeeld, type Community, type Gesprek } from "../lib/chat";
import { luisteren } from "../lib/bellen";
import { Oproepen } from "./Oproepen";
import { cursusLinkOpenen, cursusTerug, isCursusLinkGevraagd, terugControleren } from "../lib/cursus";
import { mascotteZeg } from "../mascotte";
import { isWinkelGevraagd, winkelGevraagd } from "../lib/mijnwinkel";
import { AppKop, AppMenu, type MenuItem } from "./AppMenu";
import { DELEN, chatDelenVan, type Deel } from "./chatdelen";
import type { Staat } from "../App";
import { peilen } from "../lib/peilen";
import type { Product } from "../lib/winkelen";
import { Chats } from "./ChatPanelen";
import { Communitys, CommunityScherm } from "./ChatCommunity";
import { WinkelApp } from "./ChatWinkel";
import { NieuwVeld, Gesprekscherm } from "./ChatGesprek";

const Projecten = lazy(() => import("./Projecten"));

function bewaardDeel(): Deel {
  if (isGevraagd() || isWinkelGevraagd()) return "chats";
  if (isCursusLinkGevraagd()) return "communitys";
  try {
    const d = localStorage.getItem("assistent.chatdeel");
    if (d === "chats" || d === "communitys" || d === "oproepen" || d === "projecten") return d;
  } catch { /* geen opslag */ }
  return "chats";
}

type Props = {
  verlaat?: () => void;
  terugNaam?: string;
  staat: Staat;
  setStaat?: React.Dispatch<React.SetStateAction<Staat | null>>;
  naarInstellingen: () => void;
  bestel: (p: Product) => void;
  projectGeopend?: (id: number) => void;
  ongelezenGewijzigd?: (aantal: number) => void;
  werkGesprek?: { id: number; ronde: number; gebruiker: number } | null;
};

export default function Chat({
  staat, setStaat, bestel, werkGesprek, ongelezenGewijzigd, verlaat, terugNaam, projectGeopend,
}: Props) {
  const schermActief = useSchermActief();
  const markeerGelezen = useCallback(
    (id: number) =>
      setLijst((oud) =>
        oud.some((g) => g.id === id && g.ongelezen > 0)
          ? oud.map((g) => (g.id === id ? { ...g, ongelezen: 0 } : g))
          : oud,
      ),
    [],
  );
  const concepten = useRef(new Map<number, string>());
  const bewaarConcept = useCallback((id: number, tekst: string) => {
    if (tekst) concepten.current.set(id, tekst);
    else concepten.current.delete(id);
  }, []);
  const [vanBuiten, setVanBuiten] = useState(isGevraagd() || isWinkelGevraagd());
  const [zoekGesprek, setZoekGesprek] = useState("");
  const [projectVan, setProjectVan] = useState<number | null>(null);
  const [ik, setIk] = useState<number | null>(null);
  const [belInst, setBelInst] = useState(false);
  const [lijst, setLijst] = useState<Gesprek[]>([]);
  const [groepen, setGroepen] = useState<Community[]>([]);
  const [voorbeelden, setVoorbeelden] = useState<Record<number, string>>({});
  const [bronBericht, setBronBericht] = useState(gevraagdBericht);
  const [open, setOpen] = useState<number | null>(gevraagdGesprek);
  const [openCommunity, setOpenCommunity] = useState<number | null>(null);
  const [gasten, setGasten] = useState<GastGesprek[]>([]);
  const [openGast, setOpenGast] = useState<number | null>(null);
  const [nieuw, setNieuw] = useState(false);
  const [fout, setFout] = useState("");
  const [deel, setDeelRuw] = useState<Deel>(bewaardDeel);
  const [winkel, setWinkel] = useState<{
    deel: "ontdekken" | "verkopen" | "bestellingen" | "kaart";
    melding?: string;
    bon?: number;
    adres?: string;
    ronde?: number;
  } | null>(() => {
    const v = openGevraagd();
    if (v) return { deel: "bestellingen", melding: v.melding, bon: v.bon };
    const adres = winkelGevraagd();
    return adres ? { deel: "ontdekken", adres } : null;
  });

  function verlaatGesprek() {
    setOpen(null);
    setOpenGast(null);
    setOpenCommunity(null);
    setNieuw(false);
  }
  function setDeel(d: Deel) {
    if (d === "winkel") {
      setVanBuiten(false);
      setWinkel((oud) => ({ deel: "ontdekken", ronde: (oud?.ronde ?? 0) + 1 }));
      return;
    }
    setDeelRuw(d);
    try {
      localStorage.setItem("assistent.chatdeel", d);
    } catch { /* geen opslag */ }
  }

  useEffect(() => {
    const openGevraagdEv = () => {
      const id = gevraagdGesprek();
      if (id !== null) {
        setBronBericht(gevraagdBericht());
        setOpen(id);
      }
    };
    window.addEventListener("chat-open", openGevraagdEv);
    return () => window.removeEventListener("chat-open", openGevraagdEv);
  }, []);

  useEffect(() => {
    if (werkGesprek?.gebruiker === staat.gebruiker.id) {
      setBronBericht(null);
      setOpen(werkGesprek.id);
    }
  }, [werkGesprek, staat.gebruiker.id]);

  useEffect(() => {
    const openKaart = () => {
      if (kaartGevraagd()) {
        setVanBuiten(true);
        verlaatGesprek();
        setWinkel((oud) => ({ deel: "kaart", ronde: (oud?.ronde ?? 0) + 1 }));
      }
    };
    openKaart();
    window.addEventListener("kaart-openen", openKaart);
    return () => window.removeEventListener("kaart-openen", openKaart);
  }, []);

  useEffect(() => {
    const openWinkel = () => {
      if (winkelAppGevraagd()) {
        setVanBuiten(true);
        verlaatGesprek();
        setWinkel((oud) => ({ deel: "ontdekken", ronde: (oud?.ronde ?? 0) + 1 }));
      }
    };
    openWinkel();
    window.addEventListener("winkel-app-openen", openWinkel);
    return () => window.removeEventListener("winkel-app-openen", openWinkel);
  }, []);

  useEffect(() => {
    const dienst = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.gesprek === open && d?.dienst === "betaling") {
        setOpen(null);
        setWinkel({ deel: "bestellingen", melding: "Controleer de bestelling en bevestig zelf de gewenste betaalhandeling." });
      }
    };
    window.addEventListener("assistent-projectdienst", dienst);
    return () => window.removeEventListener("assistent-projectdienst", dienst);
  }, [open]);

  useEffect(() => {
    const bestelling = () => {
      const v = openGevraagd();
      if (v) {
        setVanBuiten(true);
        verlaatGesprek();
        setWinkel((oud) => ({ deel: "bestellingen", melding: v.melding, bon: v.bon, ronde: (oud?.ronde ?? 0) + 1 }));
      }
    };
    const adres = () => {
      const a = winkelGevraagd();
      if (a) {
        setVanBuiten(true);
        verlaatGesprek();
        setWinkel((oud) => ({ deel: "ontdekken", adres: a, ronde: (oud?.ronde ?? 0) + 1 }));
      }
    };
    window.addEventListener("bestellingen-openen", bestelling);
    window.addEventListener("winkel-adres-openen", adres);
    return () => {
      window.removeEventListener("bestellingen-openen", bestelling);
      window.removeEventListener("winkel-adres-openen", adres);
    };
  }, []);

  const vorige = useRef("");
  const kijkNieuw = useCallback(async () => {
    const o = await overzicht();
    const stand = JSON.stringify(o);
    const isNieuw = stand !== vorige.current;
    vorige.current = stand;
    setLijst(o.gesprekken);
    setGroepen(o.communities);
    gastGesprekken()
      .then((g) => setGasten(g.gesprekken))
      .catch(() => {});
    for (const x of o.gesprekken.slice(0, 30))
      voorbeeld(x)
        .then((tekst) => setVoorbeelden((v) => (v[x.id] === tekst ? v : { ...v, [x.id]: tekst })))
        .catch(() => {});
    return isNieuw;
  }, []);
  const laden = useCallback(async () => {
    await kijkNieuw();
  }, [kijkNieuw]);

  useEffect(() => {
    const t = cursusTerug();
    if (t)
      terugControleren(t)
        .then(mascotteZeg)
        .catch((e) => setFout(e instanceof Error ? e.message : "Controleren lukte niet."));
  }, []);

  useEffect(() => {
    starten()
      .then((id) => {
        setIk(id);
        luisteren(id);
        return laden();
      })
      .then(() =>
        cursusLinkOpenen()
          .then((c) => c !== null && setOpenCommunity(c))
          .catch(() =>
            setFout("Deze cursus, training of dienst zie je als je lid bent van de community."),
          ),
      )
      .catch((e) => setFout(e instanceof Error ? e.message : "De chat kon niet starten."));
  }, [laden]);

  useEffect(() => {
    if (ik === null || (open !== null && schermActief)) return;
    const p = peilen(kijkNieuw, 4000, 20_000);
    return p.stop;
  }, [ik, open, kijkNieuw, schermActief]);

  const totaalOngelezen =
    lijst.filter((g) => g.ongelezen > 0).length +
    gasten.filter((g) => g.ongelezen).length +
    groepen.filter(
      (c) => c.status === "uitgenodigd" || c.kanalen.some((k) => k.ongelezen > 0),
    ).length;
  useEffect(() => {
    ongelezenGewijzigd?.(totaalOngelezen);
  }, [totaalOngelezen, ongelezenGewijzigd]);

  if (open !== null && ik !== null) {
    const g = lijst.find((x) => x.id === open);
    return (
      <Gesprekscherm
        key={open}
        id={open}
        ik={ik}
        begin={g}
        bronBericht={bronBericht}
        projectGeopend={projectGeopend}
        beginConcept={concepten.current.get(open) ?? ""}
        bewaarConcept={bewaarConcept}
        gelezen={markeerGelezen}
        projectOpen={werkGesprek?.id === open || projectVan === open}
        staat={staat}
        setStaat={setStaat}
        terug={() => {
          setOpen(null);
          laden().catch(() => {});
        }}
      />
    );
  }
  if (openGast !== null)
    return (
      <GastGesprekScherm
        boeking={openGast}
        terug={() => {
          setOpenGast(null);
          laden().catch(() => {});
        }}
      />
    );
  if (winkel)
    return (
      <WinkelApp
        staat={staat}
        setData={(data) =>
          setStaat?.((s) => (s && s.gebruiker.id === staat.gebruiker.id ? { ...s, data } : s))
        }
        key={winkel.ronde}
        start={winkel.deel}
        melding={winkel.melding}
        bon={winkel.bon}
        adres={winkel.adres}
        thuisadres={staat?.data.instellingen?.thuisadres}
        bestel={bestel}
        terugNaam={vanBuiten ? terugNaam : "Chat"}
        losseKaart={vanBuiten && winkel.deel === "kaart"}
        terug={() => {
          setWinkel(null);
          if (vanBuiten) verlaat?.();
          setVanBuiten(false);
        }}
      />
    );
  if (openCommunity !== null && ik !== null) {
    const c = groepen.find((x) => x.id === openCommunity);
    if (c)
      return (
        <CommunityScherm
          c={c}
          openKanaal={(id) => {
            setBronBericht(null);
            setOpen(id);
          }}
          vernieuw={laden}
          bijgewerkt={(data) => setStaat?.((s) => (s ? { ...s, data } : s))}
          terug={() => {
            setOpenCommunity(null);
            laden().catch(() => {});
          }}
        />
      );
  }

  const ongelezenChats =
    lijst.reduce((n, g) => n + (g.ongelezen ? 1 : 0), 0) +
    gasten.filter((g) => g.ongelezen).length;
  const ongelezenGroepen = groepen.reduce(
    (n, c) =>
      n +
      (c.status === "uitgenodigd"
        ? 1
        : c.kanalen.reduce((m, k) => m + k.ongelezen, 0) > 0
          ? 1
          : 0),
    0,
  );
  const rijBevat = (d: string) => chatDelenVan(staat.data.instellingen?.chatdelen).includes(d as never);
  const acties =
    deel === "chats" && !nieuw
      ? [
          ...(rijBevat("oproepen") ? [] : [{ label: "Bellen", icoon: <Telefoon className="size-5" />, doe: () => setDeel("oproepen") }]),
          { label: "Nieuw gesprek", icoon: <Bewerk className="size-5" />, doe: () => setNieuw(true) },
        ]
      : deel === "oproepen"
        ? [{ label: "Belinstellingen", icoon: <Tandwiel className="size-5" />, doe: () => setBelInst(true) }]
        : [];
  const zichtbaar = chatDelenVan(staat.data.instellingen?.chatdelen);
  const rij = zichtbaar.includes(deel) ? DELEN.filter(([k]) => zichtbaar.includes(k)) : [];

  return (
    <div className="flex min-h-full flex-col">
      <AppKop
        titel={DELEN.find(([k]) => k === deel)?.[1] ?? "Chat"}
        terug={!zichtbaar.includes(deel) ? () => setDeel("chats") : undefined}
        terugNaam="Chats"
        rechts={
          <span className="flex shrink-0 gap-2">
            {acties.map((a) => (
              <button
                key={a.label}
                onClick={a.doe}
                aria-label={a.label}
                className="flex size-10 items-center justify-center rounded-full bg-vlak"
              >
                {a.icoon}
              </button>
            ))}
          </span>
        }
      />
      {fout && <p className="px-6 text-rustig">{fout}</p>}
      {deel === "chats" && nieuw && (
        <NieuwVeld
          sluit={() => setNieuw(false)}
          gestart={(id) => {
            setNieuw(false);
            laden().then(() => setOpen(id));
          }}
        />
      )}
      {deel === "chats" && !nieuw && <GastenLijst lijst={gasten} open={setOpenGast} />}
      {deel === "chats" && ik !== null && (
        <Chats
          zoek={zoekGesprek}
          setZoek={setZoekGesprek}
          ik={ik}
          lijst={lijst}
          voorbeelden={voorbeelden}
          open={(id) => {
            setBronBericht(null);
            setOpen(id);
          }}
          nieuw={() => setNieuw(true)}
          fout={fout}
          zoekt={nieuw}
        />
      )}
      {deel === "communitys" && ik !== null && (
        <Communitys lijst={groepen} open={setOpenCommunity} vernieuw={laden} staat={staat} />
      )}
      {deel === "oproepen" && ik !== null && (
        <Oproepen
          ik={ik}
          lijst={lijst}
          instellingen={belInst}
          sluitInstellingen={() => setBelInst(false)}
          zoekIemand={() => {
            setDeel("chats");
            setNieuw(true);
          }}
          bewaard={(data) => setStaat?.((s) => (s ? { ...s, data } : s))}
        />
      )}
      {deel === "projecten" && (
        <Suspense fallback={null}>
          <Projecten
            ingebed
            staat={staat}
            open={(g) => {
              projectGeopend?.(g);
              setProjectVan(g);
              setBronBericht(null);
              setOpen(g);
            }}
            naarChat={() => setDeel("chats")}
          />
        </Suspense>
      )}
      {rij.length > 1 && (
        <AppMenu
          naam="Chat"
          actief={deel}
          kies={setDeel}
          items={rij.map(
            ([k, naam, Icoon]) =>
              [
                k,
                naam,
                Icoon,
                k === "chats" ? ongelezenChats : k === "communitys" ? ongelezenGroepen : 0,
              ] as MenuItem<Deel>,
          )}
        />
      )}
    </div>
  );
}
