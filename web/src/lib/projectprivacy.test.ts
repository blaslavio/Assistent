import { beforeEach, expect, it, vi } from "vitest";
import { aiGepauzeerd, controleerProjectAi, pauzeerProjectAi, privacyVoorbeeld } from "./projectprivacy";
import { huidigeSessie } from "../api";
vi.mock("../api",()=>({huidigeSessie:vi.fn()}));
beforeEach(()=>vi.mocked(huidigeSessie).mockReturnValue({naam:"Alice",token:"test"}));
it("schermt contactgegevens af zonder de bron te wijzigen of omringende tekst op te eten",()=>{
 const bron="Mail alice@example.nl, bel 06 1234 5678, betaal NL91 ABNA 0417 1643 00 voor het ontwerp. alice@example.nl";
 const r=privacyVoorbeeld(bron);expect(r.aantal).toBe(3);expect(r.inhoud).not.toContain("alice@example.nl");expect(r.inhoud).not.toContain("1234");expect(r.inhoud).not.toContain("ABNA");expect(r.inhoud).toContain("voor het ontwerp.");expect(r.inhoud.match(/\[e-mailadres 1\]/g)).toHaveLength(2);expect(bron).toContain("alice@example.nl");
});
it("blokkeert herkenbare geheime sleutels en te grote context",()=>{for(const geheim of ["sk-ant-1234567890abcdef","sk_live_1234567890abcdef","-----BEGIN PRIVATE KEY-----"]){expect(()=>privacyVoorbeeld(geheim)).toThrow("geheime sleutel");}expect(()=>privacyVoorbeeld("a".repeat(16001))).toThrow("te groot");});
it("bindt een privacy-pauze aan het project en de huidige sessie",()=>{
 pauzeerProjectAi(1,true);expect(()=>controleerProjectAi(1)).toThrow("gepauzeerd");expect(aiGepauzeerd(2)).toBe(false);
 vi.mocked(huidigeSessie).mockReturnValue({naam:"Bob",token:"anders"});expect(aiGepauzeerd(1)).toBe(false);
 pauzeerProjectAi(1,true);pauzeerProjectAi(1,false);expect(()=>controleerProjectAi(1)).not.toThrow();vi.mocked(huidigeSessie).mockReturnValue(null);expect(aiGepauzeerd(1)).toBe(true);
});
