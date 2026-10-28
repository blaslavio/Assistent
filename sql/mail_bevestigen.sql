-- Mailadres bevestigen met een code per mail (via Brevo, zie sql/toegangssleutels.sql).
-- Een code van 6 cijfers, 30 minuten geldig, 5 pogingen, hoogstens 3 mails per uur per account.
-- Een code hoort bij het mailadres waar hij heen ging: verander je daarna je adres, dan telt hij niet meer.
-- Wie zijn wachtwoord herstelt met een code uit de mail, heeft zijn adres daarmee ook bevestigd.
-- Alleen toevoegen of vervangen, niets weggooien.

create table if not exists private.mailbevestiging (
  id bigserial primary key,
  gebruiker_id bigint not null references private.gebruikers (id),
  email text not null,
  code_hash text not null,
  geldig_tot timestamptz not null,
  pogingen integer not null default 0,
  gebruikt boolean not null default false,
  aangemaakt timestamptz not null default now()
);
create index if not exists mailbevestiging_wie on private.mailbevestiging (gebruiker_id, aangemaakt);
alter table private.mailbevestiging enable row level security;
revoke all on private.mailbevestiging from public, anon, authenticated;

create or replace function public.email_code_sturen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); g private.gebruikers; v_code text;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into g from private.gebruikers where id = v_id;
  if coalesce(g.email, '') = '' then return jsonb_build_object('fout', 'Vul eerst je mailadres in.'); end if;
  if g.email_bevestigd then return jsonb_build_object('ok', true, 'bevestigd', true); end if;
  if not public.mail_ingesteld() then return jsonb_build_object('fout', 'Mail versturen is nog niet beschikbaar.'); end if;
  if (select count(*) from private.mailbevestiging where gebruiker_id = v_id and aangemaakt > now() - interval '1 hour') >= 3
     or (select count(*) from private.mailbevestiging where aangemaakt > now() - interval '1 hour') >= 200 then
    return jsonb_build_object('fout', 'Je hebt net al een code gekregen. Kijk in je mail of probeer het later opnieuw.');
  end if;
  v_code := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');
  update private.mailbevestiging set gebruikt = true where gebruiker_id = v_id and not gebruikt;
  insert into private.mailbevestiging (gebruiker_id, email, code_hash, geldig_tot)
  values (v_id, lower(g.email), private.hash(v_id || ':' || lower(g.email) || ':' || v_code), now() + interval '30 minutes');
  perform private.mail_sturen(g.email, 'Je code: ' || v_code,
    'Hallo ' || coalesce(nullif(g.weergavenaam, ''), g.naam, '') || E',\n\n'
    || 'Je code om je mailadres te bevestigen is: ' || v_code || E'\n\n'
    || E'De code is 30 minuten geldig. Heb jij dit niet gevraagd? Dan kun je deze mail negeren.\n');
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.email_bevestigen(p_naam text, p_wachtwoord text, p_code text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); g private.gebruikers; b private.mailbevestiging;
  v_code text := regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g');
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  select * into g from private.gebruikers where id = v_id;
  select * into b from private.mailbevestiging
  where gebruiker_id = v_id and not gebruikt and geldig_tot > now() and email = lower(coalesce(g.email, ''))
  order by id desc limit 1 for update;
  if b.id is null then return jsonb_build_object('fout', 'Deze code is verlopen. Vraag een nieuwe aan.'); end if;
  if b.pogingen >= 5 then
    update private.mailbevestiging set gebruikt = true where id = b.id;
    return jsonb_build_object('fout', 'Te vaak geprobeerd. Vraag een nieuwe code aan.');
  end if;
  if private.hash(v_id || ':' || b.email || ':' || v_code) <> b.code_hash then
    update private.mailbevestiging set pogingen = pogingen + 1 where id = b.id;
    return jsonb_build_object('fout', 'Deze code klopt niet.');
  end if;
  update private.mailbevestiging set gebruikt = true where id = b.id;
  update private.gebruikers set email_bevestigd = true where id = v_id and lower(email) = b.email;
  return jsonb_build_object('ok', true, 'bevestigd', true);
end; $$;

revoke all on function public.email_code_sturen(text, text), public.email_bevestigen(text, text, text) from public;
grant execute on function public.email_code_sturen(text, text), public.email_bevestigen(text, text, text)
  to anon, authenticated;
