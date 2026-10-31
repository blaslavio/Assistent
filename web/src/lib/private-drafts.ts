import {findEventType} from "./event-types";
/** Device-local private drafts. No invitations, server sync or publication. */
export type DraftKind="event"|"project";
export type PrivateDraft={id:string;kind:DraftKind;title:string;description:string;date:string;eventType?:string;createdAt:string};
const storageKey=(userId:number|string)=>"assistent.private-drafts.v1:"+userId;
export function loadPrivateDrafts(userId:number|string):PrivateDraft[]{
 if(!userId||typeof localStorage==="undefined")return [];
 try{const v=JSON.parse(localStorage.getItem(storageKey(userId))||"[]");return Array.isArray(v)?v.filter((d):d is PrivateDraft=>!!d&&typeof d.id==="string"&&["event","project"].includes(d.kind)&&typeof d.title==="string"&&typeof d.description==="string"&&typeof d.date==="string"&&typeof d.createdAt==="string").slice(0,100):[];}catch{return [];}
}
export function createPrivateDraft(userId:number|string,kind:DraftKind,title:string,description="",date="",eventType="other"):PrivateDraft[]{
 if(!userId)throw new Error("Log eerst in.");
 const cleanTitle=title.trim();if(!cleanTitle||cleanTitle.length>150)throw new Error("Vul een titel van maximaal 150 tekens in.");
 const drafts=loadPrivateDrafts(userId);
 const entry:PrivateDraft={id:crypto.randomUUID(),kind,title:cleanTitle,description:description.trim().slice(0,2000),date,eventType:kind==="event"?findEventType(eventType).id:undefined,createdAt:new Date().toISOString()};
 const next=[entry,...drafts].slice(0,100);
 try{localStorage.setItem(storageKey(userId),JSON.stringify(next));}catch{throw new Error("Opslaan op dit apparaat is niet beschikbaar.");}
 return next;
}
export function deletePrivateDraft(userId:number|string,id:string):PrivateDraft[]{
 const next=loadPrivateDrafts(userId).filter(d=>d.id!==id);
 localStorage.setItem(storageKey(userId),JSON.stringify(next));return next;
}
