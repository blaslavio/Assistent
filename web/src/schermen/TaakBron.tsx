import type {Taak} from "../api";
import {taakBron} from "../lib/berichttaak";
import {chatOpenen} from "../lib/naar";
import {Ballon} from "../iconen";
export default function TaakBron({taak}:{taak:Taak}){const bron=taakBron(taak);return bron?<button onClick={()=>chatOpenen(bron.gesprek,bron.bericht)} className="flex min-h-11 items-center gap-1.5 text-xs text-accent"><Ballon className="size-4"/>Naar bronbericht</button>:null;}
