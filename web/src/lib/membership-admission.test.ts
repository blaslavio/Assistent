import { describe, expect, it } from "vitest";
import { evaluateAdmission, type AdmissionPolicy } from "./membership-admission";
const base: AdmissionPolicy = { mode:"manual", capacityRemaining:4, applicantIsMinor:false, guardianVerified:false, identityVerified:true, termsAccepted:true, duplicateNeedsReview:false, paymentConfirmedByServer:false };
describe("membership admission",()=>{
  it("requires owner approval for manual clubs",()=>expect(evaluateAdmission(base).status).toBe("submitted"));
  it("allows eligible automatic signups",()=>expect(evaluateAdmission({...base,mode:"automatic"}).status).toBe("approved"));
  it("never trusts unverified payments",()=>expect(evaluateAdmission({...base,mode:"after_payment"}).status).toBe("pending_payment"));
  it("activates after server-confirmed payment",()=>expect(evaluateAdmission({...base,mode:"after_payment",paymentConfirmedByServer:true}).status).toBe("approved"));
  it("waitlists full groups",()=>expect(evaluateAdmission({...base,mode:"automatic",capacityRemaining:0}).status).toBe("waitlisted"));
  it("requires verified guardian for minors",()=>expect(evaluateAdmission({...base,mode:"automatic",applicantIsMinor:true}).status).toBe("submitted"));
  it("requires review for duplicate profiles",()=>expect(evaluateAdmission({...base,mode:"automatic",duplicateNeedsReview:true}).status).toBe("submitted"));
  it("requires identity and terms",()=>{expect(evaluateAdmission({...base,mode:"automatic",identityVerified:false}).status).toBe("submitted");expect(evaluateAdmission({...base,mode:"automatic",termsAccepted:false}).status).toBe("submitted")});
});
