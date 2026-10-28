-- Deellinks: een link naar jouw product of dienst die vanzelf verloopt. Wie de link heeft, ziet het aanbod zonder in
-- te loggen, tot de link verloopt of je hem intrekt. De code is willekeurig en lang (128 bits), dus niet te raden.
-- Alleen de eigenaar van het aanbod kan een link maken. Niets wordt verwijderd: intrekken zet alleen een vlag.
create table if not exists private.deellinks (
  id bigint generated always as identity primary key,
  code text not null unique,
  gebruiker_id bigint not null references private.gebruikers(id),
  aanbod_id bigint not null references private.aanbod(id),
  gemaakt timestamptz not null default now(),
  verloopt timestamptz not null,
  ingetrokken boolean not null default false,
  bekeken integer not null default 0
);
alter table private.deellinks enable row level security;
create index if not exists deellinks_gebruiker on private.deellinks (gebruiker_id, verloopt desc);

create or replace function public.deellink_maken(p_naam text, p_wachtwoord text, p_aanbod bigint, p_dagen integer)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_code text; v_tot timestamptz;
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_dagen is null or p_dagen < 1 or p_dagen > 30 then
    return jsonb_build_object('fout', 'Kies 1 tot 30 dagen.');
  end if;
  if not exists (select 1 from private.aanbod a where a.id = p_aanbod and a.gebruiker_id = v_id and not a.geblokkeerd) then
    return jsonb_build_object('fout', 'Je kunt alleen je eigen aanbod delen.');
  end if;
  if (select count(*) from private.deellinks d where d.gebruiker_id = v_id and d.gemaakt > now() - interval '1 day') >= 50 then
    return jsonb_build_object('fout', 'Je hebt vandaag al veel links gemaakt. Probeer het morgen weer.');
  end if;
  v_code := translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_');
  v_tot := now() + make_interval(days => p_dagen);
  insert into private.deellinks (code, gebruiker_id, aanbod_id, verloopt) values (v_code, v_id, p_aanbod, v_tot);
  return jsonb_build_object('code', v_code, 'verloopt', v_tot);
end; $$;

create or replace function public.deellinks_mijn(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('links', coalesce((
    select jsonb_agg(jsonb_build_object('code', d.code, 'aanbod', d.aanbod_id, 'titel', a.titel, 'verloopt', d.verloopt,
                                        'bekeken', d.bekeken) order by d.verloopt)
    from private.deellinks d join private.aanbod a on a.id = d.aanbod_id
    where d.gebruiker_id = v_id and not d.ingetrokken and d.verloopt > now()), '[]'::jsonb));
end; $$;

create or replace function public.deellink_intrekken(p_naam text, p_wachtwoord text, p_code text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  update private.deellinks set ingetrokken = true where code = p_code and gebruiker_id = v_id;
  return jsonb_build_object('ingetrokken', found);
end; $$;

-- Voor iedereen met de link: alleen wat ook op de marktplaats staat, geen contactgegevens.
create or replace function public.deellink_bekijken(p_code text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_d private.deellinks; v_a private.aanbod;
begin
  select * into v_d from private.deellinks where code = p_code and not ingetrokken and verloopt > now();
  if v_d.id is null then return jsonb_build_object('verlopen', true); end if;
  select a.* into v_a from private.aanbod a join private.gebruikers g on g.id = a.gebruiker_id
  where a.id = v_d.aanbod_id and a.actief and not a.geblokkeerd and not g.geblokkeerd and not g.verwijderd;
  if v_a.id is null then return jsonb_build_object('verlopen', true); end if;
  update private.deellinks set bekeken = bekeken + 1 where id = v_d.id;
  return jsonb_build_object('id', v_a.id, 'soort', v_a.soort, 'titel', v_a.titel, 'omschrijving', v_a.omschrijving,
    'prijs', v_a.prijs, 'prijs_per', v_a.prijs_per, 'plaats', v_a.plaats, 'aanbieder', private.weergave(v_a.gebruiker_id),
    'heeft_foto', private.heeft_foto(v_a.id), 'verloopt', v_d.verloopt);
end; $$;

revoke all on function public.deellink_maken(text, text, bigint, integer), public.deellinks_mijn(text, text),
  public.deellink_intrekken(text, text, text), public.deellink_bekijken(text) from public;
grant execute on function public.deellink_maken(text, text, bigint, integer), public.deellinks_mijn(text, text),
  public.deellink_intrekken(text, text, text), public.deellink_bekijken(text) to anon, authenticated;
