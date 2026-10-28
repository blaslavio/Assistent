// Gaat er iets mis in een scherm, dan zie je een korte melding in plaats van een leeg scherm. De rest van de app
// blijft werken. De fout zelf (zonder je gegevens) gaat naar de server, zodat we hem kunnen oplossen.
import { Component, type ReactNode } from "react";
import { rpc } from "./api";

let gemeld = 0;

/** Stuurt een foutmelding naar de server: alleen de fout en waar die zat, nooit je gegevens. Hooguit 5 per keer laden. */
export function foutMelden(fout: unknown, waar: string, extra = "") {
  if (gemeld >= 5) return;
  gemeld += 1;
  const e = fout instanceof Error ? fout : new Error(String(fout));
  const tekst = [waar, `${e.name}: ${e.message}`, (e.stack ?? "").slice(0, 900), extra.slice(0, 400),
    navigator.userAgent].join("\n");
  rpc("app_fout_melden", { p_tekst: tekst.slice(0, 2000) }).catch(() => {});
}

/** Vangt fouten die buiten een scherm gebeuren, zoals in een timer of een antwoord van de server. */
export function foutenVolgen() {
  addEventListener("error", (e) => foutMelden(e.error ?? e.message, "venster"));
  addEventListener("unhandledrejection", (e) => foutMelden(e.reason, "belofte"));
}

type Props = { naam: string; children: ReactNode; klein?: boolean };

export class Vangnet extends Component<Props, { fout: Error | null }> {
  state = { fout: null as Error | null };

  static getDerivedStateFromError(fout: Error) {
    return { fout };
  }

  componentDidCatch(fout: Error, info: { componentStack?: string | null }) {
    foutMelden(fout, this.props.naam, info.componentStack ?? "");
  }

  render() {
    const { fout } = this.state;
    if (!fout) return this.props.children;
    if (this.props.klein) return null;
    return (
      <div role="alert" className="flex min-h-full flex-col items-center justify-center gap-3 px-8 py-16 text-center">
        <p className="text-lg font-semibold">Dit scherm lukt even niet</p>
        <p className="text-sm text-rustig">Er ging iets mis. Ik heb het doorgegeven, zodat het opgelost wordt.</p>
        <p className="max-w-full break-words text-xs text-zacht">{fout.message}</p>
        <div className="mt-2 flex gap-2">
          <button onClick={() => this.setState({ fout: null })}
            className="rounded-full bg-vlak px-4 py-2 text-sm font-medium">Opnieuw proberen</button>
          <button onClick={() => location.reload()}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white">App herladen</button>
        </div>
      </div>
    );
  }
}
