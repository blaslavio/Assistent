import {useCallback,useRef} from "react";
import {bijwerken,huidigeSessie,type Staat} from "../api";
import {onthoudWerkplek,type Werkplek} from "../lib/werkplekken";
/** Kleine identifiers, geen berichtinhoud of bestandsnamen; navigatie wacht niet op de opslag. */
export function useWerkplekken(staat:Staat|null,setStaat:React.Dispatch<React.SetStateAction<Staat|null>>){
 const rij=useRef(Promise.resolve()),gebruiker=staat?.gebruiker.id;
 return useCallback((p:Werkplek)=>{const sessie=huidigeSessie();if(!sessie||!gebruiker)return;
  rij.current=rij.current.catch(()=>{}).then(async()=>{if(huidigeSessie()!==sessie)return;try{const data=await bijwerken(g=>onthoudWerkplek(g,p));if(huidigeSessie()===sessie)setStaat(oud=>oud?.gebruiker.id===gebruiker?{...oud,data}:oud);}catch{/* De gekozen app blijft bruikbaar als recent bijwerken niet lukt. */}});
 },[gebruiker,setStaat]);
}
