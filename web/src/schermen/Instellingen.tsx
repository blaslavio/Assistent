import { uitloggen } from "../api";
import type { Staat } from "../App";
import { Terug } from "../iconen";

type Props = { staat: Staat; terug: () => void; opUitgelogd: () => void };

export default function Instellingen({ staat, terug, opUitgelogd }: Props) {
  const g = staat.gebruiker;
  const naam = g.weergavenaam || g.naam || "Jij";
  return (
    <div className="px-6 pt-12 pb-8">
      <button onClick={terug} className="-ml-2 flex h-10 items-center gap-1 pr-3 text-rustig">
        <Terug className="size-5" /> Terug
      </button>
      <div className="mt-6 flex items-center gap-4">
        <span className="flex size-16 items-center justify-center overflow-hidden rounded-full bg-vlak text-2xl font-semibold">
          {g.foto ? <img src={g.foto} alt="" className="size-full object-cover" /> : naam[0].toUpperCase()}
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{naam}</h1>
          {g.naam && <p className="text-rustig">@{g.naam}</p>}
        </div>
      </div>
      <p className="mt-8 text-rustig">De andere instellingen zet ik nog over naar de nieuwe stijl.</p>
      <button
        onClick={async () => {
          await uitloggen();
          opUitgelogd();
        }}
        className="mt-8 h-12 w-full rounded-2xl bg-vlak font-medium text-red-600 dark:text-red-400">
        Uitloggen
      </button>
    </div>
  );
}
