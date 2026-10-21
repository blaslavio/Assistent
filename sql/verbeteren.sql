-- Ideeën, problemen en foutmeldingen uit de app. Hiermee verbetert de app zichzelf: een vaste routine leest dit,
-- bouwt verbeteringen en zet de status op 'klaar' met een kort antwoord dat de melder in de app ziet.
-- Fouten worden zonder naam bewaard (alleen soort fout en pagina) en per dag samengeteld.
create table if not exists private.app_meldingen (
  id bigint generated always as identity primary key,
  gebruiker_id bigint references private.gebruikers (id),
  soort text not null check (soort in ('idee', 'probleem', 'fout')),
  tekst text not null,
  pagina text not null default '',
  aantal integer not null default 1,
  dag date not null default current_date,
  status text not null default 'nieuw' check (status in ('nieuw', 'opgepakt', 'klaar', 'afgewezen')),
  antwoord text not null default '',
  aangemaakt timestamptz not null default now(),
  bijgewerkt timestamptz not null default now());
alter table private.app_meldingen enable row level security;
create index if not exists app_meldingen_gebruiker on private.app_meldingen (gebruiker_id);
create index if not exists app_meldingen_status on private.app_meldingen (status, soort);
create unique index if not exists app_meldingen_fout_dag on private.app_meldingen (tekst, pagina, dag) where soort = 'fout';

create or replace function public.app_melden(p_naam text, p_wachtwoord text, p_soort text, p_tekst text, p_pagina text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord); v_tekst text := left(trim(coalesce(p_tekst, '')), 2000);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  if p_soort not in ('idee', 'probleem', 'fout') or v_tekst = '' then
    return jsonb_build_object('fout', 'Schrijf kort wat je bedoelt.');
  end if;
  if p_soort = 'fout' then
    insert into private.app_meldingen (soort, tekst, pagina) values ('fout', left(v_tekst, 300), left(coalesce(p_pagina, ''), 60))
    on conflict (tekst, pagina, dag) where soort = 'fout'
    do update set aantal = private.app_meldingen.aantal + 1, bijgewerkt = now();
    return jsonb_build_object('ok', true);
  end if;
  if (select count(*) from private.app_meldingen where gebruiker_id = v_id and aangemaakt > now() - interval '1 day') >= 20 then
    return jsonb_build_object('fout', 'Je hebt vandaag al veel gemeld. Morgen kan het weer.');
  end if;
  insert into private.app_meldingen (gebruiker_id, soort, tekst, pagina)
  values (v_id, p_soort, v_tekst, left(coalesce(p_pagina, ''), 60));
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.mijn_app_meldingen(p_naam text, p_wachtwoord text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint := private.gebruiker_id(p_naam, p_wachtwoord);
begin
  if v_id is null then return jsonb_build_object('geen_toegang', true); end if;
  return jsonb_build_object('meldingen', coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'soort', m.soort, 'tekst', m.tekst, 'status', m.status,
                                        'antwoord', m.antwoord, 'aangemaakt', m.aangemaakt) order by m.id desc)
    from (select * from private.app_meldingen where gebruiker_id = v_id order by id desc limit 30) m), '[]'::jsonb));
end; $$;

-- Wie zijn account verwijdert, laat geen tekst achter.
create or replace function private.app_meldingen_wissen() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.verwijderd and not old.verwijderd then
    update private.app_meldingen set tekst = '(verwijderd)', gebruiker_id = null where gebruiker_id = new.id;
  end if;
  return new;
end; $$;
create or replace trigger app_meldingen_wissen after update of verwijderd on private.gebruikers
  for each row execute function private.app_meldingen_wissen();

revoke all on function private.app_meldingen_wissen() from public, anon, authenticated;
