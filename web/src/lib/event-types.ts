export type EventCategory="personal"|"family"|"social"|"ceremony"|"business"|"sports"|"community"|"education"|"travel"|"charity"|"other";
export type EventType={id:string;label:string;category:EventCategory;tools:readonly string[]};
export const EVENT_TYPES:readonly EventType[]=[
{id:"birthday",label:"Verjaardag",category:"personal",tools:["uitnodigingen","aanmeldingen","cadeaulijst","catering"]},
{id:"reunion",label:"Reünie",category:"family",tools:["datumprikker","deelnemers","locatie","herinneringen"]},
{id:"wedding",label:"Bruiloft",category:"ceremony",tools:["uitnodigingen","zitplaatsen","begroting","programma"]},
{id:"anniversary",label:"Jubileum",category:"ceremony",tools:["uitnodigingen","programma","catering"]},
{id:"babyshower",label:"Babyshower",category:"family",tools:["uitnodigingen","cadeaulijst","activiteiten"]},
{id:"family-day",label:"Familiedag",category:"family",tools:["datumprikker","activiteiten","deelnemers"]},
{id:"dinner",label:"Etentje of barbecue",category:"social",tools:["aanmeldingen","menu","boodschappen"]},
{id:"party",label:"Feest of festival",category:"social",tools:["tickets","programma","locatie","begroting"]},
{id:"neighborhood",label:"Buurtfeest",category:"community",tools:["vrijwilligers","uitnodigingen","activiteiten"]},
{id:"sports",label:"Sportwedstrijd of toernooi",category:"sports",tools:["deelnemers","programma","locatie","uitslagen"]},
{id:"workshop",label:"Workshop of cursus",category:"education",tools:["inschrijvingen","programma","materiaal"]},
{id:"conference",label:"Conferentie of seminar",category:"business",tools:["registraties","sprekers","programma"]},
{id:"networking",label:"Netwerkbijeenkomst",category:"business",tools:["uitnodigingen","aanmeldingen","programma"]},
{id:"launch",label:"Productlancering",category:"business",tools:["uitnodigingen","programma","promotie"]},
{id:"team",label:"Teamuitje",category:"business",tools:["datumprikker","deelnemers","begroting"]},
{id:"trip",label:"Groepsreis of uitstap",category:"travel",tools:["deelnemers","reisplan","begroting"]},
{id:"fundraiser",label:"Benefiet of inzamelactie",category:"charity",tools:["vrijwilligers","donaties","programma"]},
{id:"memorial",label:"Herdenking of afscheid",category:"ceremony",tools:["uitnodigingen","programma","locatie"]},
{id:"other",label:"Anders / eigen evenement",category:"other",tools:["deelnemers","programma","taken"]}
];
export function findEventType(id:string):EventType{return EVENT_TYPES.find(x=>x.id===id)??EVENT_TYPES[EVENT_TYPES.length-1];}
