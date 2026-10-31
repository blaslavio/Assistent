-- Na community_agenda.sql en evenementpagina.sql. Eigen tickets voor gratis evenementen.
-- Betaalde toegang blijft buiten deze migratie: een client kan geen betaalstatus zetten.
begin;
alter table private.community_activiteiten add column if not exists studio_type text not null default 'anders' check(studio_type in ('bijeenkomst','workshop','festival','concert','sport','markt','feest','online','open_dag','anders'));
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table if not exists private.studio_event_opdrachten (
 gebruiker bigint not null references private.gebruikers(id), opdracht uuid not null, community bigint not null,
 gegevens jsonb not null, evenement bigint not null references private.community_activiteiten(id), primary key(gebruiker,opdracht)
);
create table if not exists private.event_ticketinstellingen (
 evenement bigint primary key references private.community_activiteiten(id), versie integer not null default 1,
 open boolean not null default false, iedereen boolean not null default false,
 capaciteit integer not null check(capaciteit between 1 and 100000)
);
create table if not exists private.event_scanners (
 evenement bigint not null references private.community_activiteiten(id), gebruiker bigint not null references private.gebruikers(id),
 primary key(evenement,gebruiker)
);
create table if not exists private.event_tickets (
 id uuid primary key default gen_random_uuid(), evenement bigint not null references private.community_activiteiten(id),
 gebruiker bigint not null references private.gebruikers(id), opdracht uuid not null,
 code text not null unique default encode(extensions.gen_random_bytes(32),'hex'),
 status text not null default 'geldig' check(status in ('geldig','binnen','ingetrokken')),
 uitgegeven timestamptz not null default now(), binnen_op timestamptz, binnen_door bigint references private.gebruikers(id), binnen_opdracht uuid,
 unique(evenement,gebruiker),unique(gebruiker,opdracht)
);
create table if not exists private.event_ticketlog (
 id bigint generated always as identity primary key, evenement bigint not null references private.community_activiteiten(id),
 ticket uuid references private.event_tickets(id), actor bigint not null references private.gebruikers(id),
 actie text not null check(actie in ('uitgifte','toegang','intrekken','instellen','scanner_toevoegen','scanner_verwijderen')), tijd timestamptz not null default now()
);
alter table private.studio_event_opdrachten enable row level security;
alter table private.event_ticketinstellingen enable row level security;
alter table private.event_scanners enable row level security;
alter table private.event_tickets enable row level security;
alter table private.event_ticketlog enable row level security;
create index if not exists event_tickets_evenement_status on private.event_tickets(evenement,status);
create index if not exists event_ticketlog_evenement on private.event_ticketlog(evenement,tijd);
create or replace function private.et_actief(p_event bigint) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.community_activiteiten a join private.chat_communities c on c.id=a.community where a.id=p_event and a.soort='evenement' and not a.weg and not a.afgelast and not c.weg and not coalesce((to_jsonb(c)->>'herinnering')::boolean,false))
$$;
create or replace function private.et_beheer(p_ik bigint,p_event bigint) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((a.maker=p_ik or private.ca_beheer(p_ik,a.community)) and private.chat_community_rol(p_ik,a.community) is not null,false)
 from private.community_activiteiten a join private.chat_communities c on c.id=a.community where a.id=p_event and not a.weg and not c.weg
$$;
create or replace function private.et_scanner(p_ik bigint,p_event bigint) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.et_beheer(p_ik,p_event),false) or exists(select 1 from private.event_scanners s join private.community_activiteiten a on a.id=s.evenement
 join private.chat_communities c on c.id=a.community where s.evenement=p_event and s.gebruiker=p_ik and not a.weg and not c.weg and private.chat_community_rol(p_ik,a.community) is not null)
$$;
create or replace function public.studio_evenement_maken(p_naam text,p_wachtwoord text,p_community bigint,p_opdracht uuid,p_gegevens jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u bigint:=private.gebruiker_id(p_naam,p_wachtwoord); oud private.studio_event_opdrachten; r jsonb; e bigint;
begin
 if u is null then return jsonb_build_object('geen_toegang',true); end if;
 if jsonb_typeof(p_gegevens) is distinct from 'object' then return jsonb_build_object('fout','Controleer de evenementgegevens.');end if;
 if exists(select 1 from jsonb_object_keys(p_gegevens) k where k not in ('soort','event_type','titel','start','einde','plaats','notitie')) or jsonb_typeof(p_gegevens->'titel') is distinct from 'string' or jsonb_typeof(p_gegevens->'start') is distinct from 'string' or jsonb_typeof(p_gegevens->'einde') is distinct from 'string' or length(p_gegevens->>'titel')>120 or length(coalesce(p_gegevens->>'plaats',''))>200 or length(coalesce(p_gegevens->>'notitie',''))>1000 then return jsonb_build_object('fout','Controleer de evenementvelden en tekstlengtes.');end if;
 if p_opdracht is null or private.chat_community_rol(u,p_community) is null then return jsonb_build_object('fout','Geen toegang of ongeldige opdracht.'); end if;
 perform pg_advisory_xact_lock(hashtextextended('studio-event:'||u||':'||p_opdracht,0));
 select * into oud from private.studio_event_opdrachten where gebruiker=u and opdracht=p_opdracht;
 if found then
  if oud.community<>p_community or oud.gegevens<>p_gegevens then return jsonb_build_object('fout','Deze opdracht is al gebruikt met andere gegevens.'); end if;
  return jsonb_build_object('id',oud.evenement,'eerder',true);
 end if;
 if coalesce(p_gegevens->>'event_type','') not in ('bijeenkomst','workshop','festival','concert','sport','markt','feest','online','open_dag','anders') then return jsonb_build_object('fout','Kies een type evenement.');end if;
 if p_gegevens->>'soort' is distinct from 'evenement' then return jsonb_build_object('fout','Kies een evenement.'); end if;
 r:=public.community_activiteit_bewaren(p_naam,p_wachtwoord,p_community,null,p_gegevens,0);
 if r ? 'fout' or r ? 'geen_toegang' then return r; end if;
 e:=(r->'ids'->>0)::bigint;
 if e is null then raise exception 'Evenementopslag niet bevestigd'; end if;
 update private.community_activiteiten set studio_type=p_gegevens->>'event_type' where id=e;
 insert into private.studio_event_opdrachten values(u,p_opdracht,p_community,p_gegevens,e);
 return jsonb_build_object('id',e);
end $$;
create or replace function public.event_tickets_instellen(p_naam text,p_wachtwoord text,p_event bigint,p_versie integer,p_open boolean,p_iedereen boolean,p_capaciteit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u bigint:=private.gebruiker_id(p_naam,p_wachtwoord); c private.event_ticketinstellingen; a private.community_activiteiten; n bigint;
begin
 if u is null then return jsonb_build_object('geen_toegang',true); end if;
 select * into a from private.community_activiteiten where id=p_event for update;
 if not coalesce(private.et_beheer(u,p_event),false) or a.soort<>'evenement' or not private.et_actief(p_event) then return jsonb_build_object('fout','Alleen de organisator of een beheerder kan tickets instellen.'); end if;
 if p_capaciteit is null or p_capaciteit not between 1 and 100000 or p_open is null or p_iedereen is null then return jsonb_build_object('fout','Controleer de ticketinstellingen.'); end if;
 select * into c from private.event_ticketinstellingen where evenement=p_event for update;
 if (c.evenement is null and p_versie is distinct from 0) or (c.evenement is not null and p_versie is distinct from c.versie) then return jsonb_build_object('fout','Instellingen zijn gewijzigd. Haal de actuele stand op.'); end if;
 select count(*) into n from private.event_tickets where evenement=p_event and status<>'ingetrokken';
 if p_capaciteit<n then return jsonb_build_object('fout','De capaciteit ligt onder het aantal uitgegeven tickets.'); end if;
 if p_open and (a.einde is null or a.einde<=now()) then return jsonb_build_object('fout','Kies een toekomstig evenement met eindtijd.'); end if;
 insert into private.event_ticketinstellingen(evenement,open,iedereen,capaciteit) values(p_event,p_open,p_iedereen,p_capaciteit)
 on conflict(evenement) do update set open=excluded.open,iedereen=excluded.iedereen,capaciteit=excluded.capaciteit,versie=private.event_ticketinstellingen.versie+1;
 insert into private.event_ticketlog(evenement,actor,actie) values(p_event,u,'instellen');
 return jsonb_build_object('ok',true);
end $$;
create or replace function public.studio_evenementen_lijst(p_naam text,p_wachtwoord text,p_community bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u bigint:=private.gebruiker_id(p_naam,p_wachtwoord);
begin
 if u is null then return jsonb_build_object('geen_toegang',true);end if;
 if private.chat_community_rol(u,p_community) is null or not exists(select 1 from private.chat_communities where id=p_community and not weg) then return jsonb_build_object('fout','Alleen groepsleden zien deze evenementen.');end if;
 return jsonb_build_object('evenementen',coalesce((select jsonb_agg(x order by x.start) from(select a.id,a.titel,a.start,a.einde,a.plaats,a.afgelast,a.studio_type event_type from private.community_activiteiten a where a.community=p_community and not a.weg and a.soort='evenement' and a.start>=now()-interval '2 days' order by a.start limit 200)x),'[]'::jsonb));
end $$;
create or replace function public.event_ticket_overzicht(p_naam text,p_wachtwoord text,p_event bigint,p_zoek text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u bigint:=private.gebruiker_id(p_naam,p_wachtwoord); c private.event_ticketinstellingen; a private.community_activiteiten; beheer boolean; scan boolean; t private.event_tickets; n bigint; binnen bigint;
begin
 if u is null then return jsonb_build_object('geen_toegang',true); end if;
 select * into a from private.community_activiteiten where id=p_event and not weg and soort='evenement';
 if a.id is null then return jsonb_build_object('fout','Dit evenement is niet beschikbaar.'); end if;
 select * into c from private.event_ticketinstellingen where evenement=p_event;
 beheer:=coalesce(private.et_beheer(u,p_event),false);scan:=coalesce(private.et_scanner(u,p_event),false);
 select * into t from private.event_tickets where evenement=p_event and gebruiker=u;
 if not scan and t.id is null and private.chat_community_rol(u,a.community) is null and not coalesce(c.open and c.iedereen,false) then return jsonb_build_object('fout','Geen toegang tot dit evenement.'); end if;
 select count(*),count(*) filter(where status='binnen') into n,binnen from private.event_tickets where evenement=p_event and status<>'ingetrokken';
 return jsonb_build_object('evenement',jsonb_build_object('beschikbaar',private.et_actief(p_event),'event_type',a.studio_type,'id',a.id,'groep',a.community,'titel',a.titel,'start',a.start,'einde',a.einde,'plaats',a.plaats,'afgelast',a.afgelast),
 'beheer',beheer,'scanner',scan,'instellingen',jsonb_build_object('versie',coalesce(c.versie,0),'open',coalesce(c.open,false),'iedereen',coalesce(c.iedereen,false),'capaciteit',coalesce(c.capaciteit,a.max_deelnemers,100)),
 'vrij',greatest(0,coalesce(c.capaciteit,0)-n),'uitgegeven',case when scan then n end,'binnen',case when scan then binnen end,
 'mijn_ticket',case when t.id is not null then jsonb_build_object('id',t.id,'code',t.code,'status',t.status,'binnen_op',t.binnen_op) end,
 'bezoekers',case when scan then coalesce((select jsonb_agg(x) from(select tt.id,coalesce(g.weergavenaam,g.naam,'Bezoeker') naam,tt.status,tt.binnen_op from private.event_tickets tt join private.gebruikers g on g.id=tt.gebruiker
 where tt.evenement=p_event and (coalesce(p_zoek,'')='' or position(lower(left(p_zoek,100)) in lower(coalesce(g.weergavenaam,g.naam,'')))>0) order by tt.uitgegeven desc limit 50)x),'[]'::jsonb) else '[]'::jsonb end,
 'team',case when beheer then coalesce((select jsonb_agg(jsonb_build_object('naam',g.naam,'weergavenaam',coalesce(g.weergavenaam,g.naam))) from private.event_scanners s join private.gebruikers g on g.id=s.gebruiker where s.evenement=p_event),'[]'::jsonb) else '[]'::jsonb end);
end $$;
create or replace function public.event_ticket_maken(p_naam text,p_wachtwoord text,p_event bigint,p_opdracht uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u bigint:=private.gebruiker_id(p_naam,p_wachtwoord); c private.event_ticketinstellingen; a private.community_activiteiten; t private.event_tickets; n bigint;
begin
 if u is null then return jsonb_build_object('geen_toegang',true); end if;
 if p_opdracht is null then return jsonb_build_object('fout','Ongeldige opdracht.'); end if;
 select * into a from private.community_activiteiten where id=p_event and not weg for share;
 select * into c from private.event_ticketinstellingen where evenement=p_event for update;
 if c.evenement is null or a.id is null then return jsonb_build_object('fout','Tickets zijn nog niet ingesteld.'); end if;
 if not private.et_actief(p_event) or a.einde is null or a.einde<=now() then return jsonb_build_object('fout','Dit evenement is afgelopen of afgelast.'); end if;
 if private.chat_community_rol(u,a.community) is null and not(c.open and c.iedereen) then return jsonb_build_object('fout','Geen toegang tot deze inschrijving.'); end if;
 select * into t from private.event_tickets where gebruiker=u and opdracht=p_opdracht;
 if found and t.evenement<>p_event then return jsonb_build_object('fout','Deze opdracht hoort bij een ander evenement.'); end if;
 select * into t from private.event_tickets where evenement=p_event and gebruiker=u;
 if found then return jsonb_build_object('id',t.id,'eerder',true); end if;
 if not c.open then return jsonb_build_object('fout','De ticketinschrijving is gesloten.'); end if;
 select count(*) into n from private.event_tickets where evenement=p_event and status<>'ingetrokken';
 if n>=c.capaciteit then return jsonb_build_object('fout','Dit evenement is vol.'); end if;
 insert into private.event_tickets(evenement,gebruiker,opdracht) values(p_event,u,p_opdracht) returning * into t;
 insert into private.event_ticketlog(evenement,ticket,actor,actie) values(p_event,t.id,u,'uitgifte');
 return jsonb_build_object('id',t.id);
end $$;
create or replace function public.event_scanner_instellen(p_naam text,p_wachtwoord text,p_event bigint,p_gebruiker text,p_aan boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u bigint:=private.gebruiker_id(p_naam,p_wachtwoord); ander bigint;
begin
 if u is null then return jsonb_build_object('geen_toegang',true); end if;
 perform 1 from private.event_ticketinstellingen where evenement=p_event for update;
 if not found or not coalesce(private.et_beheer(u,p_event),false) then return jsonb_build_object('fout','Alleen een organisator of beheerder beheert het scanteam.'); end if;
 if p_aan is null then return jsonb_build_object('fout','Kies toevoegen of verwijderen.');end if;
 select min(id) into ander from private.gebruikers where lower(naam)=lower(trim(p_gebruiker)) and (not p_aan or (not geblokkeerd and not verwijderd)) having count(*)=1;
 if ander is null or (p_aan and not exists(select 1 from private.community_activiteiten a where a.id=p_event and private.chat_community_rol(ander,a.community) is not null)) then return jsonb_build_object('fout','Kies een bestaand groepslid.'); end if;
 if p_aan then insert into private.event_scanners values(p_event,ander) on conflict do nothing;
 else delete from private.event_scanners where evenement=p_event and gebruiker=ander;end if;
 insert into private.event_ticketlog(evenement,actor,actie) values(p_event,u,case when p_aan then 'scanner_toevoegen' else 'scanner_verwijderen' end);
 return jsonb_build_object('ok',true);
end $$;
create or replace function public.event_ticket_intrekken(p_naam text,p_wachtwoord text,p_event bigint,p_ticket uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u bigint:=private.gebruiker_id(p_naam,p_wachtwoord); t private.event_tickets;
begin
 if u is null then return jsonb_build_object('geen_toegang',true); end if;
 perform 1 from private.event_ticketinstellingen where evenement=p_event for update;
 if not coalesce(private.et_beheer(u,p_event),false) then return jsonb_build_object('fout','Alleen een organisator of beheerder trekt tickets in.'); end if;
 select * into t from private.event_tickets where id=p_ticket and evenement=p_event for update;
 if not found then return jsonb_build_object('fout','Ticket niet gevonden.'); end if;
 if t.status='binnen' then return jsonb_build_object('fout','Dit ticket is al gebruikt.'); end if;
 if t.status<>'ingetrokken' then update private.event_tickets set status='ingetrokken' where id=t.id;insert into private.event_ticketlog(evenement,ticket,actor,actie) values(p_event,t.id,u,'intrekken');end if;
 return jsonb_build_object('ok',true);
end $$;
create or replace function public.event_ticket_controleren(p_naam text,p_wachtwoord text,p_event bigint,p_code text,p_opdracht uuid,p_toelaten boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u bigint:=private.gebruiker_id(p_naam,p_wachtwoord); a private.community_activiteiten; t private.event_tickets; naam text;
begin
 if u is null then return jsonb_build_object('geen_toegang',true); end if;
 select * into a from private.community_activiteiten where id=p_event and not weg for share;
 perform 1 from private.event_ticketinstellingen where evenement=p_event for share;
 if not found or not coalesce(private.et_scanner(u,p_event),false) then return jsonb_build_object('fout','Je hebt geen scanrechten voor dit evenement.'); end if;
 if a.id is null or not private.et_actief(p_event) or a.einde is null or now()>a.einde+interval '2 hours' or now()<a.start-interval '12 hours' then return jsonb_build_object('status','niet_beschikbaar','melding','Toegang voor dit evenement is nu niet beschikbaar.'); end if;
 if p_code is null or p_code !~ '^[a-f0-9]{64}$' or p_opdracht is null then return jsonb_build_object('status','ongeldig','melding','Ongeldig ticket.'); end if;
 select * into t from private.event_tickets where evenement=p_event and code=p_code for update;
 if not found then return jsonb_build_object('status','ongeldig','melding','Dit ticket hoort niet bij dit evenement.'); end if;
 select coalesce(weergavenaam,private.gebruikers.naam,'Bezoeker') into naam from private.gebruikers where id=t.gebruiker;
 if t.status='ingetrokken' then return jsonb_build_object('status','ingetrokken','melding','Dit ticket is ingetrokken.');end if;
 if t.status='binnen' then
  if p_toelaten and t.binnen_opdracht=p_opdracht and t.binnen_door=u then return jsonb_build_object('status','toegelaten','eerder',true,'naam',naam,'tijd',t.binnen_op);end if;
  return jsonb_build_object('status','al_binnen','naam',naam,'tijd',t.binnen_op,'melding','Al gebruikt: geen tweede toegang.');
 end if;
 if p_toelaten is distinct from true then return jsonb_build_object('status','geldig','naam',naam,'melding','Controleer de bezoeker en bevestig toegang.');end if;
 update private.event_tickets set status='binnen',binnen_op=now(),binnen_door=u,binnen_opdracht=p_opdracht where id=t.id;
 insert into private.event_ticketlog(evenement,ticket,actor,actie) values(p_event,t.id,u,'toegang');
 return jsonb_build_object('status','toegelaten','naam',naam,'tijd',now(),'melding','Toegang bevestigd.');
end $$;
-- Alleen RPC-toegang; geen tabellen, hulpfuncties of geheime codes via directe API-toegang.
revoke all on private.studio_event_opdrachten,private.event_ticketinstellingen,private.event_scanners,private.event_tickets,private.event_ticketlog from public,anon,authenticated;
revoke all on function private.et_actief(bigint),private.et_beheer(bigint,bigint),private.et_scanner(bigint,bigint) from public;
revoke all on function public.studio_evenementen_lijst(text,text,bigint),public.studio_evenement_maken(text,text,bigint,uuid,jsonb),public.event_tickets_instellen(text,text,bigint,integer,boolean,boolean,integer),public.event_ticket_overzicht(text,text,bigint,text),public.event_ticket_maken(text,text,bigint,uuid),public.event_scanner_instellen(text,text,bigint,text,boolean),public.event_ticket_intrekken(text,text,bigint,uuid),public.event_ticket_controleren(text,text,bigint,text,uuid,boolean) from public;
grant execute on function public.studio_evenementen_lijst(text,text,bigint),public.studio_evenement_maken(text,text,bigint,uuid,jsonb),public.event_tickets_instellen(text,text,bigint,integer,boolean,boolean,integer),public.event_ticket_overzicht(text,text,bigint,text),public.event_ticket_maken(text,text,bigint,uuid),public.event_scanner_instellen(text,text,bigint,text,boolean),public.event_ticket_intrekken(text,text,bigint,uuid),public.event_ticket_controleren(text,text,bigint,text,uuid,boolean) to anon,authenticated;
notify pgrst,'reload schema';
commit;
