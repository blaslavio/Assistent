/**
 * Universal Trust Engine — deterministic, privacy-preserving public ratings.
 *
 * SECURITY: This module is pure domain logic. Call it ONLY with transaction and
 * identity facts independently verified by an authenticated backend. Never
 * authorize rating writes using browser-supplied purchase/completion flags.
 * Do not publish free-text reviews, reviewer identities or private disputes.
 */
export type RatedSubject = "product" | "seller" | "service";
export type Rating = 1 | 2 | 3 | 4 | 5;
export type RatingRecord = {
  transactionId: string;
  subjectType: RatedSubject;
  subjectId: string;
  reviewerId: string;
  stars: Rating;
  verified: boolean;
  voided: boolean;
  updatedAt: string;
};
export type RatingPermission = {
  authenticatedReviewerId: string;
  transactionBuyerId: string;
  transactionSellerId: string;
  transactionStatus: "pending" | "paid" | "delivered" | "completed" | "refunded" | "disputed";
  subjectBelongsToTransaction: boolean;
  paymentOrServiceVerified: boolean;
  transactionDisputed: boolean;
};
export function mayRate(p: RatingPermission): boolean {
  return !!p.authenticatedReviewerId &&
    p.authenticatedReviewerId === p.transactionBuyerId &&
    p.transactionBuyerId !== p.transactionSellerId &&
    p.subjectBelongsToTransaction &&
    p.paymentOrServiceVerified &&
    p.transactionStatus === "completed" &&
    !p.transactionDisputed;
}
export function validStars(value: unknown): value is Rating {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}
export type PublicRating = {
  average: number | null;
  count: number;
  distribution: readonly [number, number, number, number, number];
  display: "not_enough_data" | "rated";
};
/**
 * Last valid vote per verified transaction/subject. Duplicate submissions
 * cannot inflate the count. Public aggregates deliberately expose no text.
 * For low sample sizes, suppress the score and distribution to reduce
 * inference and retaliation against individual buyers.
 */
export function aggregateRatings(records: readonly RatingRecord[], subjectType: RatedSubject, subjectId: string, minPublicCount = 5): PublicRating {
  const latest = new Map<string, RatingRecord>();
  for (const record of records) {
    if (record.subjectType !== subjectType || record.subjectId !== subjectId ||
        !record.verified || record.voided || !validStars(record.stars) ||
        !Number.isFinite(Date.parse(record.updatedAt))) continue;
    const key = record.transactionId + "\u0000" + record.reviewerId;
    const previous = latest.get(key);
    if (!previous || Date.parse(record.updatedAt) > Date.parse(previous.updatedAt)) latest.set(key, record);
  }
  const votes = [...latest.values()];
  if (votes.length < Math.max(1, minPublicCount)) return {
    average: null, count: votes.length, distribution: [0, 0, 0, 0, 0], display: "not_enough_data"
  };
  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const vote of votes) distribution[vote.stars - 1]++;
  const sum = votes.reduce((n, vote) => n + vote.stars, 0);
  return { average: Math.round(sum / votes.length * 10) / 10, count: votes.length, distribution, display: "rated" };
}
/** Operational metrics are distinct from subjective stars and must be sourced from verified events. */
export type VerifiedFulfillment = { total: number; onTime: number; resolved: number; issues: number };
export function fulfillmentMetrics(input: VerifiedFulfillment): { onTimePercent: number | null; issuePercent: number | null } {
  const { total, onTime, issues } = input;
  if (![total, onTime, issues].every(n => Number.isSafeInteger(n) && n >= 0) || onTime > total || issues > total || total === 0)
    return { onTimePercent: null, issuePercent: null };
  return { onTimePercent: Math.round(100 * onTime / total), issuePercent: Math.round(100 * issues / total) };
}
