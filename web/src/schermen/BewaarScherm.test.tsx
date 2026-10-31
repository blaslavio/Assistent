import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {useEffect,useState} from "react";
import BewaarScherm,{useSchermActief} from "./BewaarScherm";
afterEach(cleanup);
it("laadt pas bij bezoek, bewaart invoer en scrollpositie, en wist ze bij accountwissel",()=>{
 const start=vi.fn();function Inhoud(){const [v,setV]=useState("");useEffect(start,[]);return <input aria-label="Concept" value={v} onChange={e=>setV(e.target.value)}/>;}
 const beeld=(actief:boolean,account=1)=><BewaarScherm key={account} actief={actief} naam="Test"><Inhoud/></BewaarScherm>;
 const r=render(beeld(false));expect(start).not.toHaveBeenCalled();r.rerender(beeld(true));expect(start).toHaveBeenCalledOnce();fireEvent.change(screen.getByRole("textbox"),{target:{value:"Niet kwijt raken"}});
 const vak=screen.getByLabelText("Test");vak.scrollTop=120;fireEvent.scroll(vak);r.rerender(beeld(false));expect(screen.queryByRole("textbox")).toBeNull();vak.scrollTop=0;r.rerender(beeld(true));expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Niet kwijt raken");expect(vak.scrollTop).toBe(120);
 r.rerender(beeld(true,2));expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
});
it("geeft verborgen ouders door zodat een geopend gesprek kan stoppen met lezen",()=>{
 const actief=vi.fn();function Kind(){const a=useSchermActief();useEffect(()=>{actief(a);},[a]);return null;}
 const beeld=(aan:boolean)=><BewaarScherm actief={aan} naam="Ouder"><BewaarScherm actief naam="Kind"><Kind/></BewaarScherm></BewaarScherm>;
 const r=render(beeld(true));expect(actief).toHaveBeenLastCalledWith(true);r.rerender(beeld(false));expect(actief).toHaveBeenLastCalledWith(false);r.rerender(beeld(true));expect(actief).toHaveBeenLastCalledWith(true);
});
