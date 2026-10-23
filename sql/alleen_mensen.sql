-- Accounts zijn alleen voor mensen. Een account maken kan alleen met een eenmalige uitdaging van de server:
--   * de browser moet een rekenpuzzel oplossen (proof of work, SHA-256): voor één persoon een seconde,
--     voor wie duizenden accounts wil maken heel duur;
--   * tussen het ophalen van de uitdaging en het versturen moeten minstens 4 seconden zitten (zo snel vult geen mens
--     een formulier in), en hij is 30 minuten geldig;
--   * elke uitdaging werkt één keer, en de server geeft er hooguit 300 per minuut uit.
-- De oude manier (zonder uitdaging) werkt niet meer. Alleen toevoegen of vervangen, niets weggooien.

create table if not exists private.aanmeld_uitdagingen (
  id bigint generated always as identity primary key,
  zout text not null,
  moeilijkheid integer not null,
  aangemaakt timestamptz not null default now(),
  gebruikt boolean not null default false
);
create index if not exists aanmeld_uitdagingen_tijd on private.aanmeld_uitdagingen (aangemaakt);
alter table private.aanmeld_uitdagingen enable row level security;

create or replace function public.aanmelden_uitdaging()
returns jsonb language plpgsql security definer set search_path to '' as $$
declare u private.aanmeld_uitdagingen;
begin
  if (select count(*) from private.aanmeld_uitdagingen where aangemaakt > now() - interval '1 minute') >= 300 then
    return jsonb_build_object('fout', 'Het is even te druk. Probeer het over een paar minuten opnieuw.');
  end if;
  insert into private.aanmeld_uitdagingen (zout, moeilijkheid)
  values (encode(extensions.gen_random_bytes(16), 'hex'), 18) returning * into u;
  return jsonb_build_object('id', u.id, 'zout', u.zout, 'moeilijkheid', u.moeilijkheid);
end; $$;

-- Geeft een foutmelding, of null als de uitdaging goed is opgelost. Een uitdaging werkt maar één keer.
create or replace function private.uitdaging_fout(p_id bigint, p_oplossing text)
returns text language plpgsql security definer set search_path to '' as $$
declare u private.aanmeld_uitdagingen; v_hash bytea;
begin
  select * into u from private.aanmeld_uitdagingen where id = p_id for update;
  if u.id is null or u.gebruikt then return 'Ververs de pagina en probeer het opnieuw.'; end if;
  update private.aanmeld_uitdagingen set gebruikt = true where id = p_id;
  if u.aangemaakt > now() - interval '4 seconds' then return 'Dat ging wel erg snel. Probeer het nog eens.'; end if;
  if u.aangemaakt < now() - interval '30 minutes' then return 'Het formulier stond te lang open. Probeer het nog eens.'; end if;
  if p_oplossing is null or length(p_oplossing) > 32 then return 'Ververs de pagina en probeer het opnieuw.'; end if;
  v_hash := extensions.digest(u.zout || p_oplossing, 'sha256');
  if (('x' || encode(substring(v_hash from 1 for 4), 'hex'))::bit(32)::bigint >> (32 - u.moeilijkheid)) <> 0 then
    return 'Ververs de pagina en probeer het opnieuw.';
  end if;
  return null;
end; $$;

create or replace function public.account_maken(p_naam text, p_weergavenaam text, p_email text, p_wachtwoord text,
                                                 p_akkoord boolean, p_uitdaging bigint, p_oplossing text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_naam text := lower(trim(coalesce(p_naam, '')));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id bigint;
  v_fout text;
begin
  if not coalesce(p_akkoord, false) then
    return jsonb_build_object('fout', 'Ga akkoord met de voorwaarden en de privacyverklaring.');
  end if;
  if v_naam !~ '^[a-z0-9_.-]{3,30}$' then
    return jsonb_build_object('fout', 'Kies een gebruikersnaam van 3 tot 30 tekens: kleine letters, cijfers, punt, streepje of laag streepje.');
  end if;
  if not private.email_ok(v_email) then
    return jsonb_build_object('fout', 'Vul een geldig mailadres in.');
  end if;
  if length(coalesce(p_wachtwoord, '')) < 10 then
    return jsonb_build_object('fout', 'Kies een wachtwoord van minstens 10 tekens.');
  end if;
  if (select count(*) from private.gebruikers where aangemaakt > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('fout', 'Het is even te druk. Probeer het over een uur opnieuw.');
  end if;
  if exists (select 1 from private.gebruikers where naam = v_naam) then
    return jsonb_build_object('fout', 'Deze gebruikersnaam is al bezet.');
  end if;
  if exists (select 1 from private.gebruikers where lower(email) = v_email) then
    return jsonb_build_object('fout', 'Er is al een account met dit mailadres. Log in met je mailadres.');
  end if;
  v_fout := private.uitdaging_fout(p_uitdaging, p_oplossing);
  if v_fout is not null then return jsonb_build_object('fout', v_fout, 'opnieuw', true); end if;
  insert into private.gebruikers (naam, weergavenaam, email, hash, akkoord_op)
  values (v_naam, left(trim(coalesce(p_weergavenaam, '')), 60), v_email,
          extensions.crypt(p_wachtwoord, extensions.gen_salt('bf', 10)), now())
  returning id into v_id;
  insert into public.gegevens (id, data) values (v_id, '{}'::jsonb) on conflict (id) do nothing;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

-- Zonder uitdaging gaat het niet meer (zo kan een script niet om de controle heen).
create or replace function public.account_maken(p_naam text, p_weergavenaam text, p_email text, p_wachtwoord text,
                                                 p_akkoord boolean)
returns jsonb language sql security definer set search_path to '' as $$
  select jsonb_build_object('fout', 'Ververs de pagina en probeer het opnieuw.')
$$;
create or replace function public.account_maken(p_naam text, p_weergavenaam text, p_wachtwoord text, p_akkoord boolean)
returns jsonb language sql security definer set search_path to '' as $$
  select jsonb_build_object('fout', 'Ververs de pagina en probeer het opnieuw.')
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.aanmelden_uitdaging(),
  public.account_maken(text, text, text, text, boolean, bigint, text) from public;
grant execute on function public.aanmelden_uitdaging(),
  public.account_maken(text, text, text, text, boolean, bigint, text) to anon, authenticated;
