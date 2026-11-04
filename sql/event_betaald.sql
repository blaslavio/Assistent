-- Na studio_tickets.sql, webshop.sql en stripe.sql. Betaalde tickets, een evenementenpagina en automatisch verlopen.
-- Betalen loopt via de bestaande webshopbestelling en Stripe; deze migratie zet zelf nooit een betaalstatus.
begin;
alter table private.aanbod add column if not exists event_id bigint references private.community_activiteiten(id);
create index if not exists aanbod_event on private.aanbod(event_id) where event_id is not null;
alter table private.event_ticketinstellingen add column if not exists betaald boolean not null default false;
alter table private.event_ticketinstellingen add column if not exists omschrijving text not null default '' check(length(omschrijving)<=2000);
alter table private.event_tickets add column if not exists bestelling bigint references private.bestellingen(id);
-- Een gratis ticket blijft één per persoon; wie betaalt, mag er meer kopen (bijvoorbeeld voor vrienden).
alter table private.event_tickets drop constraint if exists event_tickets_evenement_gebruiker_key;
create unique index if not exists event_tickets_gratis_een on private.event_tickets(evenement,gebruiker) where bestelling is null;
create index if not exists event_tickets_bestelling on private.event_tickets(bestelling) where bestelling is not null;

-- Betaald: tickets uitgeven. Terugbetaald of geannuleerd: niet-gebruikte tickets intrekken.
create or replace function private.event_bestelling_tickets() returns trigger language plpgsql security definer set search_path='' as $$
declare e bigint; i integer;
begin
 select event_id into e from private.aanbod where id=new.aanbod_id;
 if e is null or new.status is not distinct from old.status then return new; end if;
 if new.status='betaald' and not exists(select 1 from private.event_tickets where bestelling=new.id) then
  for i in 1..greatest(coalesce(new.aantal,1),1) loop
   insert into private.event_tickets(evenement,gebruiker,opdracht,bestelling) values(e,new.koper,gen_random_uuid(),new.id);
  end loop;
  insert into private.event_ticketlog(evenement,actor,actie) values(e,new.koper,'uitgifte');
 elsif new.status in ('terugbetaald','geannuleerd') then
  update private.event_tickets set status='ingetrokken' where bestelling=new.id and status='geldig';
  if found then insert into private.event_ticketlog(evenement,actor,actie) values(e,new.verkoper,'intrekken'); end if;
 end if;
 return new;
end $$;
drop trigger if exists event_bestelling_tickets on private.bestellingen;
create trigger event_bestelling_tickets after update of status on private.bestellingen
 for each row execute function private.event_bestelling_tickets();

-- Een ticketsoort is een product in je eigen webshop, gekoppeld aan het evenement.
create or replace function public.event_ticketsoort_bewaren(p_naam text,p_wachtwoord text,p_event bigint,p_id bigint,p_titel text,p_prijs numeric,p_aantal integer,p_aan boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u bigint:=private.gebruiker_id(p_naam,p_wachtwoord); a private.community_activiteiten; x private.aanbod; n bigint;
begin
 if u is null then return jsonb_build_object('geen_toegang',true); end if;
 select * into a from private.community_activiteiten where id=p_event and not weg for update;
 if a.id is null or not coalesce(private.et_beheer(u,p_event),false) or not private.et_actief(p_event) then return jsonb_build_object('fout','Alleen de organisator of een beheerder kan tickets verkopen.'); end if;
 if a.einde is null or a.einde<=now() then return jsonb_build_object('fout','Kies een toekomstig evenement met eindtijd.'); end if;
 if not exists(select 1 from private.winkels where gebruiker_id=u and open) then return jsonb_build_object('fout','Open eerst je webshop in Studio. Tickets worden daar verkocht.'); end if;
 if coalesce(trim(p_titel),'')='' or length(p_titel)>80 then return jsonb_build_object('fout','Geef het ticket een korte naam, bijvoorbeeld Staanplaats.'); end if;
 if p_prijs is null or p_prijs<1 or p_prijs>5000 then return jsonb_build_object('fout','Kies een prijs van 1 tot 5000 euro.'); end if;
 if p_aantal is null or p_aantal not between 1 and 100000 then return jsonb_build_object('fout','Kies een aantal van 1 tot 100000.'); end if;
 if p_id is null then
  if (select count(*) from private.aanbod where event_id=p_event and gebruiker_id=u)>=10 then return jsonb_build_object('fout','Maximaal 10 ticketsoorten per evenement.'); end if;
  insert into private.aanbod(gebruiker_id,soort,titel,omschrijving,prijs,plaats,contact,actief,geblokkeerd,betaalwijzen,levering,in_winkel,voorraad,event_id)
  values(u,'product',left(trim(p_titel)||' · '||a.titel,120),format('Ticket voor %s op %s.',a.titel,to_char(a.start at time zone 'Europe/Amsterdam','DD-MM-YYYY HH24:MI')),
   round(p_prijs,2),left(coalesce(a.plaats,''),200),'',coalesce(p_aan,true),false,'{app}','{ophalen}',coalesce(p_aan,true),p_aantal,p_event)
  returning * into x;
 else
  select * into x from private.aanbod where id=p_id and event_id=p_event and gebruiker_id=u for update;
  if x.id is null then return jsonb_build_object('fout','Deze ticketsoort bestaat niet meer.'); end if;
  update private.aanbod set titel=left(trim(p_titel)||' · '||a.titel,120),prijs=round(p_prijs,2),voorraad=p_aantal,
   actief=coalesce(p_aan,actief),in_winkel=coalesce(p_aan,in_winkel) where id=x.id;
 end if;
 insert into private.event_ticketinstellingen(evenement,open,iedereen,capaciteit,betaald)
  values(p_event,false,true,greatest(coalesce(a.max_deelnemers,0),p_aantal,1),true)
  on conflict(evenement) do update set betaald=true,iedereen=true,versie=private.event_ticketinstellingen.versie+1,
   capaciteit=greatest(private.event_ticketinstellingen.capaciteit,(select coalesce(sum(voorraad),0) from private.aanbod where event_id=p_event and actief)::integer
    +(select count(*) from private.event_tickets where evenement=p_event and status<>'ingetrokken')::integer);
 insert into private.event_ticketlog(evenement,actor,actie) values(p_event,u,'instellen');
 return jsonb_build_object('ok',true,'id',x.id);
end $$;

create or replace function public.event_omschrijving_bewaren(p_naam text,p_wachtwoord text,p_event bigint,p_tekst text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u bigint:=private.gebruiker_id(p_naam,p_wachtwoord);
begin
 if u is null then return jsonb_build_object('geen_toegang',true); end if;
 if not coalesce(private.et_beheer(u,p_event),false) then return jsonb_build_object('fout','Alleen de organisator of een beheerder past dit aan.'); end if;
 if length(coalesce(p_tekst,''))>2000 then return jsonb_build_object('fout','Hooguit 2000 tekens.'); end if;
 update private.event_ticketinstellingen set omschrijving=trim(coalesce(p_tekst,'')),versie=versie+1 where evenement=p_event;
 if not found then return jsonb_build_object('fout','Stel eerst tickets in.'); end if;
 return jsonb_build_object('ok',true);
end $$;

-- Openbaar: wat de organisator voor iedereen openzette, zolang het nog niet voorbij is.
create or replace function private.event_kaart(a private.community_activiteiten,c private.event_ticketinstellingen) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'titel',a.titel,'start',a.start,'einde',a.einde,'plaats',a.plaats,'event_type',a.studio_type,
  'omschrijving',c.omschrijving,'gratis',not c.betaald,'open',c.open,
  'vrij',greatest(0,c.capaciteit-(select count(*) from private.event_tickets t where t.evenement=a.id and t.status<>'ingetrokken'))::integer,
  'organisator',(select coalesce(w.naam,g.weergavenaam,g.naam) from private.gebruikers g left join private.winkels w on w.gebruiker_id=g.id where g.id=a.maker),
  'soorten',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'titel',split_part(x.titel,' · ',1),'prijs',x.prijs,'vrij',x.voorraad) order by x.prijs)
    from private.aanbod x where x.event_id=a.id and x.actief and x.in_winkel and not x.geblokkeerd),'[]'::jsonb))
$$;
create or replace function public.events_lijst(p_naam text,p_wachtwoord text,p_zoek text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u bigint:=private.gebruiker_id(p_naam,p_wachtwoord);
begin
 if u is null then return jsonb_build_object('geen_toegang',true); end if;
 return jsonb_build_object('events',coalesce((select jsonb_agg(private.event_kaart(s.a,s.c) order by (s.a).start) from (
   select a,c from private.community_activiteiten a join private.event_ticketinstellingen c on c.evenement=a.id
   where c.iedereen and (c.open or c.betaald) and a.einde>now() and private.et_actief(a.id)
    and (coalesce(p_zoek,'')='' or position(lower(left(p_zoek,100)) in lower(a.titel||' '||coalesce(a.plaats,'')))>0)
   order by a.start limit 100) s),'[]'::jsonb));
end $$;
create or replace function public.event_bekijken(p_naam text,p_wachtwoord text,p_event bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u bigint:=private.gebruiker_id(p_naam,p_wachtwoord); a private.community_activiteiten; c private.event_ticketinstellingen;
begin
 if u is null then return jsonb_build_object('geen_toegang',true); end if;
 select * into a from private.community_activiteiten where id=p_event and not weg and soort='evenement';
 select * into c from private.event_ticketinstellingen where evenement=p_event;
 if a.id is null or c.evenement is null or not private.et_actief(p_event) or a.einde<=now()
    or (not c.iedereen and private.chat_community_rol(u,a.community) is null) then
  return jsonb_build_object('fout','Dit evenement is voorbij of niet beschikbaar.');
 end if;
 return jsonb_build_object('event',private.event_kaart(a,c),'beheer',coalesce(private.et_beheer(u,p_event),false),
  'mijn_tickets',(select count(*) from private.event_tickets where evenement=p_event and gebruiker=u and status<>'ingetrokken'));
end $$;
-- Alle tickets van mij, ook betaalde en meerdere per evenement; afgelopen evenementen na een dag niet meer.
create or replace function public.mijn_event_tickets(p_naam text,p_wachtwoord text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u bigint:=private.gebruiker_id(p_naam,p_wachtwoord);
begin
 if u is null then return jsonb_build_object('geen_toegang',true); end if;
 return jsonb_build_object('tickets',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'code',t.code,'status',t.status,'evenement',a.id,'titel',a.titel,
   'start',a.start,'einde',a.einde,'plaats',a.plaats,'betaald',t.bestelling is not null) order by a.start,t.uitgegeven)
  from private.event_tickets t join private.community_activiteiten a on a.id=t.evenement
  where t.gebruiker=u and t.status<>'ingetrokken' and not a.weg and a.einde>now()-interval '1 day'),'[]'::jsonb));
end $$;
-- Mijn eigen ticketsoorten bij een evenement, met verkocht aantal.
create or replace function public.event_ticketsoorten(p_naam text,p_wachtwoord text,p_event bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u bigint:=private.gebruiker_id(p_naam,p_wachtwoord);
begin
 if u is null then return jsonb_build_object('geen_toegang',true); end if;
 if not coalesce(private.et_beheer(u,p_event),false) then return jsonb_build_object('fout','Alleen de organisator of een beheerder ziet dit.'); end if;
 return jsonb_build_object('winkel',exists(select 1 from private.winkels where gebruiker_id=u and open),
  'kan_betalen',private.winkel_kan_betalen(u),
  'omschrijving',(select omschrijving from private.event_ticketinstellingen where evenement=p_event),
  'soorten',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'titel',split_part(x.titel,' · ',1),'prijs',x.prijs,'vrij',x.voorraad,'aan',x.actief,
   'verkocht',(select count(*) from private.event_tickets t join private.bestellingen b on b.id=t.bestelling where b.aanbod_id=x.id and t.status<>'ingetrokken')) order by x.id)
  from private.aanbod x where x.event_id=p_event and x.gebruiker_id=u),'[]'::jsonb));
end $$;

-- Gratis tickets alleen als het evenement geen betaalde tickets heeft; één gratis ticket per persoon.
create or replace function public.event_ticket_maken(p_naam text,p_wachtwoord text,p_event bigint,p_opdracht uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u bigint:=private.gebruiker_id(p_naam,p_wachtwoord); c private.event_ticketinstellingen; a private.community_activiteiten; t private.event_tickets; n bigint;
begin
 if u is null then return jsonb_build_object('geen_toegang',true); end if;
 if p_opdracht is null then return jsonb_build_object('fout','Ongeldige opdracht.'); end if;
 select * into a from private.community_activiteiten where id=p_event and not weg for share;
 select * into c from private.event_ticketinstellingen where evenement=p_event for update;
 if c.evenement is null or a.id is null then return jsonb_build_object('fout','Tickets zijn nog niet ingesteld.'); end if;
 if c.betaald then return jsonb_build_object('fout','Voor dit evenement koop je een ticket via de evenementenpagina.'); end if;
 if not private.et_actief(p_event) or a.einde is null or a.einde<=now() then return jsonb_build_object('fout','Dit evenement is afgelopen of afgelast.'); end if;
 if private.chat_community_rol(u,a.community) is null and not(c.open and c.iedereen) then return jsonb_build_object('fout','Geen toegang tot deze inschrijving.'); end if;
 select * into t from private.event_tickets where gebruiker=u and opdracht=p_opdracht;
 if found and t.evenement<>p_event then return jsonb_build_object('fout','Deze opdracht hoort bij een ander evenement.'); end if;
 select * into t from private.event_tickets where evenement=p_event and gebruiker=u and bestelling is null;
 if found then return jsonb_build_object('id',t.id,'eerder',true); end if;
 if not c.open then return jsonb_build_object('fout','De ticketinschrijving is gesloten.'); end if;
 select count(*) into n from private.event_tickets where evenement=p_event and status<>'ingetrokken';
 if n>=c.capaciteit then return jsonb_build_object('fout','Dit evenement is vol.'); end if;
 insert into private.event_tickets(evenement,gebruiker,opdracht) values(p_event,u,p_opdracht) returning * into t;
 insert into private.event_ticketlog(evenement,ticket,actor,actie) values(p_event,t.id,u,'uitgifte');
 return jsonb_build_object('id',t.id);
end $$;

-- Na afloop: verkoop en inschrijving dicht. Niets wordt gewist; tickets en bestellingen blijven bewaard.
create or replace function private.events_verlopen() returns void language plpgsql security definer set search_path='' as $$
begin
 update private.aanbod x set actief=false,in_winkel=false from private.community_activiteiten a
  where x.event_id=a.id and (x.actief or x.in_winkel) and (a.einde<=now() or a.weg or a.afgelast);
 update private.event_ticketinstellingen c set open=false,versie=c.versie+1 from private.community_activiteiten a
  where c.evenement=a.id and c.open and (a.einde<=now() or a.weg or a.afgelast);
end $$;
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('events-verlopen','7 * * * *','select private.events_verlopen()');
 end if;
end $$;

revoke all on function private.event_bestelling_tickets(),private.event_kaart(private.community_activiteiten,private.event_ticketinstellingen),private.events_verlopen() from public,anon,authenticated;
revoke all on function public.event_ticketsoort_bewaren(text,text,bigint,bigint,text,numeric,integer,boolean),public.event_omschrijving_bewaren(text,text,bigint,text),
 public.events_lijst(text,text,text),public.event_bekijken(text,text,bigint),public.mijn_event_tickets(text,text),public.event_ticketsoorten(text,text,bigint) from public;
grant execute on function public.event_ticketsoort_bewaren(text,text,bigint,bigint,text,numeric,integer,boolean),public.event_omschrijving_bewaren(text,text,bigint,text),
 public.events_lijst(text,text,text),public.event_bekijken(text,text,bigint),public.mijn_event_tickets(text,text),public.event_ticketsoorten(text,text,bigint) to anon,authenticated;
notify pgrst,'reload schema';
commit;
