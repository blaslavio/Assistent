/** Local display preferences only. Never deletes an app, project or server data. */
export type PlekStatus={archived:string[];removed:string[]};
const empty=():PlekStatus=>({archived:[],removed:[]});
const key=(userId:number|string)=>`werkruimte-recent-v1:${userId}`;
const clean=(v:unknown):string[]=>Array.isArray(v)?[...new Set(v.filter(x=>typeof x==="string"&&/^(app:[a-z0-9_-]+|project:[1-9][0-9]*)$/.test(x)))].slice(0,100):[];
export function plekStatus(userId:number|string):PlekStatus{
 if(!userId||typeof localStorage==="undefined")return empty();
 try{const v=JSON.parse(localStorage.getItem(key(userId))||"{}");return {archived:clean(v.archived),removed:clean(v.removed)};}catch{return empty();}
}
export function volgendePlekStatus(status:PlekStatus,id:string,actie:"archive"|"remove"|"restore"):PlekStatus{
 if(!clean([id]).length)throw new Error("Ongeldige recente werkplek.");
 const archived=status.archived.filter(x=>x!==id),removed=status.removed.filter(x=>x!==id);
 if(actie==="archive")archived.unshift(id);
 if(actie==="remove")removed.unshift(id);
 return {archived:clean(archived),removed:clean(removed)};
}
export function bewaarPlekStatus(userId:number|string,status:PlekStatus,id:string,actie:"archive"|"remove"|"restore"):PlekStatus{
 const next=volgendePlekStatus(status,id,actie);
 try{if(userId&&typeof localStorage!=="undefined")localStorage.setItem(key(userId),JSON.stringify(next));}catch{/* Private browsing: keep session UI responsive. */}
 return next;
}
