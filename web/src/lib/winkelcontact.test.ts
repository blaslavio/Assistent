import { expect,it } from "vitest";
import {controleerContact,standaardContact} from "./winkelcontact";
it("weigert scriptlinks, ongeldige contactgegevens en betaalafspraken zonder contact",()=>{
 for(const v of [{website:"javascript:alert(1)"},{website:"https://user:pass@example.org"},{email:"x\nBcc:other@example.org"},{whatsapp:"0612345678"},{chat:false,betaalwijzen:["contant"]},{betaalwijzen:["gratis"]}]) expect(()=>controleerContact({...standaardContact(),...v})).toThrow();
});
it("houdt alleen bewust ingevulde kanalen en unieke afspraken",()=>{
 const c=controleerContact({...standaardContact(),chat:false,whatsapp:"+31 6 1234 5678",email:"shop@example.org",betaalwijzen:["contant","contant"]});
 expect(c.whatsapp).toBe("+31612345678");expect(c.betaalwijzen).toEqual(["contant"]);expect(c.telefoon).toBe("");expect(c.chat).toBe(false);
});
