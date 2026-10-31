import {useCallback,useEffect,useRef,useState} from "react";
import {huidigeSessie} from "../api";
export function useStudioSessie(){const account=useRef(huidigeSessie()),actief=useRef(true),[vervallen,setVervallen]=useState(false);
 useEffect(()=>{actief.current=true;const wis=()=>{if(huidigeSessie()!==account.current)setVervallen(true);};window.addEventListener("assistent-sessie",wis);return()=>{actief.current=false;window.removeEventListener("assistent-sessie",wis);};},[]);
 const geldig=useCallback(()=>actief.current&&!!account.current&&huidigeSessie()===account.current,[]);return{geldig,vervallen};
}
