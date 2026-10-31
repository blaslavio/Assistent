/** Server-authoritative admission decisions. Never activate membership solely from client state. */
export type AdmissionMode = "manual" | "automatic" | "after_payment";
export type ApplicationStatus = "submitted" | "pending_payment" | "waitlisted" | "approved" | "rejected";
export type AdmissionPolicy = {
  mode: AdmissionMode;
  capacityRemaining: number;
  applicantIsMinor: boolean;
  guardianVerified: boolean;
  identityVerified: boolean;
  termsAccepted: boolean;
  duplicateNeedsReview: boolean;
  paymentConfirmedByServer: boolean;
};
export type AdmissionDecision = { status: ApplicationStatus; reason: string; notifyOwner: boolean };
/** Pure decision helper; backend must recheck capacity and identity atomically before writing. */
export function evaluateAdmission(p: AdmissionPolicy): AdmissionDecision {
  const review = (reason: string): AdmissionDecision => ({ status: "submitted", reason, notifyOwner: true });
  if (!p.identityVerified) return review("identity_verification_required");
  if (!p.termsAccepted) return review("terms_required");
  if (p.applicantIsMinor && !p.guardianVerified) return review("guardian_verification_required");
  if (p.duplicateNeedsReview) return review("possible_duplicate");
  if (p.capacityRemaining <= 0) return { status: "waitlisted", reason: "group_full", notifyOwner: true };
  if (p.mode === "manual") return review("owner_approval_required");
  if (p.mode === "after_payment" && !p.paymentConfirmedByServer) return { status: "pending_payment", reason: "verified_payment_required", notifyOwner: true };
  return { status: "approved", reason: "policy_conditions_met", notifyOwner: true };
}
