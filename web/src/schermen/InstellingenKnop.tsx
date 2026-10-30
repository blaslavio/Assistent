import { Tandwiel } from "../iconen";
import { instellingenOpenen, type InstellingenPagina } from "../lib/naar";

/** Dezelfde instellingenpagina vanuit de functie waar je al werkt. */
export default function InstellingenKnop({ pagina, label }: { pagina: InstellingenPagina; label: string }) {
  return <button type="button" onClick={() => instellingenOpenen(pagina)} aria-label={label}
    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-vlak text-rustig">
    <Tandwiel className="size-5" />
  </button>;
}
