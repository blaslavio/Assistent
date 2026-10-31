import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const SchermActief=createContext(true);
export const useSchermActief=()=>useContext(SchermActief);

/** Alleen bezochte schermen blijven in dit accountgeheugen; verbergen bewaart invoer en scrollpositie. */
export default function BewaarScherm({ actief, naam, children }: { actief: boolean; naam: string; children: ReactNode }) {
  const ouderActief=useSchermActief();
  const [bezocht, setBezocht] = useState(actief);
  const vak = useRef<HTMLDivElement>(null), positie = useRef(0);
  useLayoutEffect(() => {
    if (actief&&ouderActief) { setBezocht(true); if (vak.current) vak.current.scrollTop = positie.current; }
  }, [actief,ouderActief]);
  if (!bezocht && !actief) return null;
  return <div ref={vak} hidden={!actief} aria-label={naam} data-bewaard-scherm={naam}
    className={actief ? "h-full overflow-y-auto" : "hidden"}
    onScroll={e => { if (actief&&ouderActief) positie.current = e.currentTarget.scrollTop; }}><SchermActief.Provider value={ouderActief&&actief}>{children}</SchermActief.Provider></div>;
}
