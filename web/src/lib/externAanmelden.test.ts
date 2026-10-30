import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({start:vi.fn(),oauth:vi.fn(),exchange:vi.fn()}));
vi.mock("../api",async o=>({...await o<object>(),sessieStarten:m.start}));
vi.mock("@supabase/auth-js",()=>({AuthClient:class { signInWithOAuth=m.oauth; exchangeCodeForSession=m.exchange; }}));
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();sessionStorage.clear();history.replaceState(null,"","/");});
afterEach(()=>vi.unstubAllGlobals());
it("start geen externe aanmelding zonder toestemming of bij een uitgeschakelde aanbieder",async()=>{
 const x=await import("./externAanmelden");vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({external:{google:false}})}));
 await expect(x.externBeginnen("google",false)).rejects.toThrow("Bevestig");
 await expect(x.externBeginnen("google",true)).rejects.toThrow("niet beschikbaar");expect(m.oauth).not.toHaveBeenCalled();
});
it("weigert een callback zonder eigen PKCE-poging en ruimt de URL op",async()=>{
 history.replaceState(null,"","/?aanmelding=extern&code=private-code&error_description=secret");
 const x=await import("./externAanmelden");await expect(x.externAfronden()).rejects.toThrow("Aanmelden lukte niet");
 expect(location.search).toBe("");expect(m.exchange).not.toHaveBeenCalled();expect(m.start).not.toHaveBeenCalled();
});
it("controleert aanbieder en vervaldatum vóór een app-sessie",async()=>{
 history.replaceState(null,"","/?aanmelding=extern&code=one-use");
 sessionStorage.setItem("assistent.externe-auth.poging",JSON.stringify({aanbieder:"google",akkoord:true,verloopt:Date.now()-1}));
 const x=await import("./externAanmelden");await expect(x.externAfronden()).rejects.toThrow();expect(m.exchange).not.toHaveBeenCalled();
});
it("vertrouwt geen toegangstoken van een andere aanbieder",async()=>{
 history.replaceState(null,"","/?aanmelding=extern&code=one-use");sessionStorage.setItem("assistent.externe-auth.poging",JSON.stringify({aanbieder:"google",akkoord:true,verloopt:Date.now()+60000}));
 m.exchange.mockResolvedValue({data:{session:{access_token:"temporary",user:{app_metadata:{provider:"apple"}}}},error:null});
 const x=await import("./externAanmelden");await expect(x.externAfronden()).rejects.toThrow();expect(m.start).not.toHaveBeenCalled();expect(sessionStorage.length).toBe(0);
});
it("wisselt exact eenmaal in en geeft alleen het serverantwoord aan de app",async()=>{
 history.replaceState(null,"","/?aanmelding=extern&code=one-use");sessionStorage.setItem("assistent.externe-auth.poging",JSON.stringify({aanbieder:"google",akkoord:true,verloopt:Date.now()+60000}));
 sessionStorage.setItem("assistent.externe-auth-code-verifier","temporary-verifier");
 m.exchange.mockResolvedValue({data:{session:{access_token:"temporary-provider-token",user:{app_metadata:{provider:"google"}}}},error:null});
 const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({versie:1})}).mockResolvedValueOnce({ok:true,json:async()=>({naam:"alice",token:"app-session"})});vi.stubGlobal("fetch",fetcher);
 const x=await import("./externAanmelden");await Promise.all([x.externAfronden(),x.externAfronden()]);
 expect(m.exchange).toHaveBeenCalledTimes(1);expect(m.start).toHaveBeenCalledWith("alice","app-session");
 expect(fetcher.mock.calls[1][1].headers.Authorization).toBe("Bearer temporary-provider-token");expect(sessionStorage.length).toBe(0);expect(location.search).toBe("");
});

it("activeert een provider niet zolang de veilige serverkoppeling ontbreekt",async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({external:{google:true}})}).mockResolvedValueOnce({ok:false});vi.stubGlobal("fetch",fetcher);
 const x=await import("./externAanmelden");await expect(x.externBeginnen("google",true)).rejects.toThrow("nog niet beschikbaar");expect(m.oauth).not.toHaveBeenCalled();
});
