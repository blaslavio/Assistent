// Een blad dat van onderen omhoog komt, voor keuzes die bij het scherm erachter horen.
import type { ReactNode } from "react";

export function Onderblad({ titel, sluit, children }: { titel: string; sluit: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30" onClick={sluit}>
      <div role="dialog" aria-label={titel} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85%] w-full [&>*]:shrink-0 max-w-xl flex-col gap-4 overflow-y-auto rounded-t-[28px] bg-white px-6 pt-3 pb-[max(env(safe-area-inset-bottom),24px)] dark:bg-[#16161a]">
        <span className="mx-auto h-1 w-10 shrink-0 rounded-full bg-lijn" />
        <h2 className="text-xl font-semibold">{titel}</h2>
        {children}
      </div>
    </div>
  );
}
