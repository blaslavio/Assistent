import { describe, expect, it } from "vitest";
import { aggregateRatings, fulfillmentMetrics, mayRate, validStars, type RatingRecord } from "./universal-trust-engine";
const base = { authenticatedReviewerId:"buyer",transactionBuyerId:"buyer",transactionSellerId:"seller",transactionStatus:"completed" as const,subjectBelongsToTransaction:true,paymentOrServiceVerified:true,transactionDisputed:false };
const votes = (n:number): RatingRecord[] => Array.from({length:n},(_,i)=>({transactionId:String(i),reviewerId:"buyer"+i,subjectType:"seller",subjectId:"s1",stars:5,verified:true,voided:false,updatedAt:"2026-11-01T10:00:00Z"}));
describe("Universal Trust Engine",()=>{
 it("permits only verified completed transactions",()=>{
   expect(mayRate(base)).toBe(true);
   expect(mayRate({...base,transactionStatus:"paid"})).toBe(false);
   expect(mayRate({...base,transactionDisputed:true})).toBe(false);
   expect(mayRate({...base,authenticatedReviewerId:"seller"})).toBe(false);
   expect(mayRate({...base,subjectBelongsToTransaction:false})).toBe(false);
 });
 it("rejects malformed star values",()=>{expect(validStars(5)).toBe(true);expect(validStars(0)).toBe(false);expect(validStars(3.5)).toBe(false);expect(validStars("5")).toBe(false)});
 it("hides low-volume ratings",()=>expect(aggregateRatings(votes(4),"seller","s1")).toEqual({average:null,count:4,distribution:[0,0,0,0,0],display:"not_enough_data"}));
 it("aggregates verified votes without text",()=>expect(aggregateRatings(votes(5),"seller","s1")).toEqual({average:5,count:5,distribution:[0,0,0,0,5],display:"rated"}));
 it("keeps only latest vote per transaction and reviewer",()=>{
   const v=votes(5);v.push({...v[0],stars:1,updatedAt:"2026-11-02T10:00:00Z"});
   expect(aggregateRatings(v,"seller","s1")).toEqual({average:4.2,count:5,distribution:[1,0,0,0,4],display:"rated"});
 });
 it("excludes unverified and voided votes",()=>{
   const v=votes(5);v[0].verified=false;v[1].voided=true;
   expect(aggregateRatings(v,"seller","s1").display).toBe("not_enough_data");
 });
 it("does not invent fulfillment metrics",()=>{
   expect(fulfillmentMetrics({total:0,onTime:0,issues:0,resolved:0}).onTimePercent).toBeNull();
   expect(fulfillmentMetrics({total:10,onTime:9,issues:2,resolved:1})).toEqual({onTimePercent:90,issuePercent:20});
 });
});
