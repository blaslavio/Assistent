// Gaat er iets mis in een scherm, dan zie je een korte melding in plaats van een leeg scherm. De rest van de app
// blijft werken. De fout zelf (zonder je gegevens) gaat naar de server, zodat we hem kunnen oplossen.
import { Component, type ReactNode } from "react";
import { rpc } from "./api";

let gemeld = 0;

/** Alleen vaste categorieën; foutteksten, stacks en browsergegevens kunnen privégegevens bevatten. */
export function foutMelden(fout: unknown, waar: string) {
  if (gemeld >= 5) return;
  gemeld += 1;
  const plekken = ["app", "vandaag", "projecten", "agenda", "chat", "assistent", "instellingen", "bellen", "venster", "belofte"];
  const soorten = ["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "URIError", "EvalError"];
  const plek = plekken.includes(waar) ? waar : "onbekend";
  const soort = fout instanceof Error && soorten.includes(fout.name) ? fout.name : "Error";
  rpc("app_fout_melden", { p_tekst: `clientfout\nplek: ${plek}\nsoort: ${soort}` }).catch(() => {});
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

  componentDidCatch(fout: Error) {
    foutMelden(fout, this.props.naam);
  }

  render() {
    const { fout } = this.state;
    if (!fout) return this.props.children;
    if (this.props.klein) return null;
    return (
      <div role="alert" className="flex min-h-full flex-col items-center justify-center gap-3 px-8 py-16 text-center">
        <p className="text-lg font-semibold">Dit scherm lukt even niet</p>
        <p className="text-sm text-rustig">Probeer het scherm opnieuw te openen. Blijft dit gebeuren, herlaad dan de app.</p>
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
