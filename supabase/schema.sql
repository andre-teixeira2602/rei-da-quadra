-- Rei da Quadra — Supabase / Postgres schema (MVP real)
-- Foco: ranking por categoria + desafios + partidas, com RLS estrita e operações críticas via RPC transacional.
-- Regras:
-- - NUNCA confiar no frontend para validações críticas
-- - escrita em challenges/matches/category_members apenas via RPC (SECURITY DEFINER)
-- - leitura restrita a membros ativos da categoria (RLS)

-- =============================================================================
-- Extensions
-- =============================================================================
create extension if not exists pgcrypto;

-- =============================================================================
-- Constantes do MVP (determinísticas)
-- =============================================================================
-- Categoria default usada pelo frontend no MVP.
-- Se você preferir, pode trocar o UUID e refletir no frontend.
-- (uuid válido: 00000000-0000-0000-0000-00000000000b)

-- =============================================================================
-- Tabelas
-- =============================================================================

-- Perfis de usuário (1:1 com auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);

-- Categorias (cada uma com sua regra de alcance de desafio)
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  challenge_range int not null default 3,
  created_at timestamptz not null default now(),
  constraint categories_name_unique unique (name),
  constraint categories_challenge_range_check check (challenge_range > 0)
);

-- Quadras (admin-only para escrita; leitura para autenticados)
create table if not exists public.courts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint courts_name_nonempty check (length(trim(name)) > 0),
  constraint courts_name_unique unique (name)
);

do $$
begin
  alter table public.courts
  add constraint courts_name_unique unique (name);
exception
  when duplicate_object then null;
end $$;

-- Membros por categoria (fonte da verdade do ranking)
create table if not exists public.category_members (
  category_id uuid not null references public.categories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rank_position int not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint category_members_pk primary key (category_id, user_id),
  constraint category_members_rank_position_check check (rank_position > 0),
  constraint category_members_status_check check (status in ('active','inactive')),
  constraint category_members_unique_rank_position unique (category_id, rank_position)
);

-- Desafios (pending | accepted | declined | expired | completed)
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  challenger_id uuid not null references public.profiles(id) on delete cascade,
  defender_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  responded_at timestamptz,
  completed_at timestamptz,
  constraint challenges_status_check check (status in ('pending','accepted','declined','expired','completed')),
  constraint challenges_distinct_players_check check (challenger_id <> defender_id)
);

-- Impede duplicado (mesma direção) enquanto está ativo (pending/accepted)
create unique index if not exists challenges_unique_active_pair
on public.challenges(category_id, challenger_id, defender_id)
where status in ('pending','accepted');

create index if not exists challenges_by_defender_status
on public.challenges(defender_id, status, created_at desc);

create index if not exists challenges_by_challenger_status
on public.challenges(challenger_id, status, created_at desc);

-- Partidas (podem ser vinculadas a um challenge, no MVP 1 match por challenge)
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  challenge_id uuid references public.challenges(id) on delete set null,
  winner_id uuid not null references public.profiles(id) on delete cascade,
  loser_id uuid not null references public.profiles(id) on delete cascade,
  score text,
  played_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint matches_distinct_players_check check (winner_id <> loser_id)
);

create unique index if not exists matches_unique_challenge
on public.matches(challenge_id)
where challenge_id is not null;

create index if not exists matches_by_category_played_at
on public.matches(category_id, played_at desc);

-- Matches: suporte opcional a quadra (FK idempotente)
alter table public.matches
add column if not exists court_id uuid;

do $$
begin
  alter table public.matches
  add constraint matches_court_id_fkey
  foreign key (court_id) references public.courts(id) on delete set null;
exception
  when duplicate_object then null;
end $$;

-- =============================================================================
-- Trigger: auth.users -> profiles (cria profile automaticamente)
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_display text;
begin
  -- Não usar prefixo do email como display_name (UX/privacidade).
  -- Se vier display_name no metadata, usamos; caso contrário, fica NULL e o app força o usuário a definir um apelido.
  v_display := nullif(new.raw_user_meta_data->>'display_name','');

  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, v_display)
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =============================================================================
-- Helpers (para políticas RLS e RPCs)
-- =============================================================================

-- "Sou membro ativo desta categoria?"
create or replace function public.is_category_member(p_category_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.category_members cm
    where cm.category_id = p_category_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
  );
$$;

-- "Compartilho alguma categoria com este usuário?"
create or replace function public.shares_category_with(p_other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.category_members me
    join public.category_members other
      on other.category_id = me.category_id
    where me.user_id = auth.uid()
      and me.status = 'active'
      and other.user_id = p_other_user_id
      and other.status = 'active'
  );
$$;

-- =============================================================================
-- RPCs (SECURITY DEFINER) — validações fortes + transações atômicas
-- =============================================================================

-- 1) get_ranking: leitura do ranking por categoria (apenas para membros)
drop function if exists public.get_ranking(uuid);
create function public.get_ranking(p_category_id uuid)
returns table (
  user_id uuid,
  display_name text,
  rank_position int,
  status text,
  is_me boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_category_member(p_category_id) then
    raise exception 'not_authorized';
  end if;

  return query
  select
    cm.user_id,
    coalesce(nullif(p.display_name, ''), 'Jogador') as display_name,
    cm.rank_position,
    cm.status,
    (cm.user_id = auth.uid()) as is_me
  from public.category_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.category_id = p_category_id
    and cm.status = 'active'
  order by cm.rank_position asc;
end;
$$;

-- Rei atual (melhor performance que carregar o ranking inteiro).
drop function if exists public.get_king(uuid);
create function public.get_king(p_category_id uuid)
returns table (
  user_id uuid,
  display_name text,
  rank_position int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_category_member(p_category_id) then
    raise exception 'not_authorized';
  end if;

  return query
  select
    cm.user_id,
    coalesce(nullif(p.display_name, ''), 'Jogador') as display_name,
    cm.rank_position
  from public.category_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.category_id = p_category_id
    and cm.status = 'active'
    and cm.rank_position = 1
  limit 1;
end;
$$;

-- 2) create_challenge: cria desafio (pending) se respeitar alcance e regras de duplicidade
drop function if exists public.create_challenge(uuid, uuid);
create function public.create_challenge(p_category_id uuid, p_defender_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_challenger uuid;
  v_range int;
  v_pos_challenger int;
  v_pos_defender int;
  v_id uuid;
begin
  v_challenger := auth.uid();
  if v_challenger is null then
    raise exception 'not_authenticated';
  end if;
  if p_defender_id is null then
    raise exception 'defender_required';
  end if;
  if p_defender_id = v_challenger then
    raise exception 'cannot_challenge_self';
  end if;

  select c.challenge_range into v_range
  from public.categories c
  where c.id = p_category_id;

  if v_range is null then
    raise exception 'category_not_found';
  end if;

  -- challenger deve ser membro ativo
  if not public.is_category_member(p_category_id) then
    raise exception 'not_authorized';
  end if;

  -- defender deve ser membro ativo da mesma categoria
  select cm.rank_position into v_pos_defender
  from public.category_members cm
  where cm.category_id = p_category_id
    and cm.user_id = p_defender_id
    and cm.status = 'active'
  for share;

  if v_pos_defender is null then
    raise exception 'defender_not_member_or_inactive';
  end if;

  select cm.rank_position into v_pos_challenger
  from public.category_members cm
  where cm.category_id = p_category_id
    and cm.user_id = v_challenger
    and cm.status = 'active'
  for share;

  if v_pos_challenger is null then
    raise exception 'challenger_not_member_or_inactive';
  end if;

  -- defender precisa estar acima (posição menor) e dentro do range
  if v_pos_defender >= v_pos_challenger then
    raise exception 'defender_not_above_challenger';
  end if;
  if (v_pos_challenger - v_pos_defender) > v_range then
    raise exception 'out_of_challenge_range';
  end if;

  -- impede duplicado pending/accepted entre os mesmos jogadores (qualquer direção)
  if exists (
    select 1
    from public.challenges c
    where c.category_id = p_category_id
      and c.status in ('pending','accepted')
      and c.expires_at > now()
      and (
        (c.challenger_id = v_challenger and c.defender_id = p_defender_id)
        or
        (c.challenger_id = p_defender_id and c.defender_id = v_challenger)
      )
  ) then
    raise exception 'challenge_already_exists';
  end if;

  begin
    insert into public.challenges (category_id, challenger_id, defender_id, status, expires_at)
    values (p_category_id, v_challenger, p_defender_id, 'pending', now() + interval '48 hours')
    returning id into v_id;
  exception when unique_violation then
    raise exception 'challenge_already_exists';
  end;

  return v_id;
end;
$$;

-- 3) respond_challenge: defender aceita/recusa
drop function if exists public.respond_challenge(uuid, text);
create function public.respond_challenge(p_challenge_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_action text;
  c public.challenges%rowtype;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  v_action := lower(coalesce(p_action,''));
  if v_action not in ('accept','decline') then
    raise exception 'invalid_action';
  end if;

  select * into c
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'challenge_not_found';
  end if;

  if v_actor <> c.defender_id then
    raise exception 'not_authorized';
  end if;

  if c.status <> 'pending' then
    raise exception 'invalid_status';
  end if;

  if now() >= c.expires_at then
    update public.challenges
    set status = 'expired'
    where id = c.id and status = 'pending';
    raise exception 'challenge_expired';
  end if;

  if v_action = 'accept' then
    update public.challenges
    set status = 'accepted',
        responded_at = now()
    where id = c.id;
  else
    update public.challenges
    set status = 'declined',
        responded_at = now()
    where id = c.id;
  end if;
end;
$$;

-- 4) report_match: registra partida e atualiza ranking se challenger vencer (swap atômico)
-- Função ORIGINAL (mantida) — usada por clientes antigos.
-- Assinatura:
--   report_match(p_challenge_id, p_winner_id, p_score, p_played_at)
create or replace function public.report_match(
  p_challenge_id uuid,
  p_winner_id uuid,
  p_score text,
  p_played_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  c public.challenges%rowtype;
  v_loser uuid;
  v_played_at timestamptz;
  v_pos_challenger int;
  v_pos_defender int;
  v_tmp_pos int;
  v_max_pos int;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  select * into c
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'challenge_not_found';
  end if;

  if v_actor not in (c.challenger_id, c.defender_id) then
    raise exception 'not_authorized';
  end if;

  if now() >= c.expires_at then
    update public.challenges
    set status = 'expired'
    where id = c.id and status in ('pending','accepted');
    raise exception 'challenge_expired';
  end if;

  if c.status <> 'accepted' then
    raise exception 'invalid_status';
  end if;

  if exists (select 1 from public.matches m where m.challenge_id = c.id) then
    raise exception 'match_already_reported';
  end if;

  if p_winner_id is null or p_winner_id not in (c.challenger_id, c.defender_id) then
    raise exception 'invalid_winner';
  end if;

  v_loser := case when p_winner_id = c.challenger_id then c.defender_id else c.challenger_id end;
  v_played_at := coalesce(p_played_at, now());

  insert into public.matches (category_id, challenge_id, winner_id, loser_id, score, played_at)
  values (c.category_id, c.id, p_winner_id, v_loser, nullif(coalesce(p_score,''),''), v_played_at);

  -- Swap somente se challenger vencer
  if p_winner_id = c.challenger_id then
    select cm.rank_position into v_pos_challenger
    from public.category_members cm
    where cm.category_id = c.category_id and cm.user_id = c.challenger_id
    for update;

    select cm.rank_position into v_pos_defender
    from public.category_members cm
    where cm.category_id = c.category_id and cm.user_id = c.defender_id
    for update;

    if v_pos_challenger is null or v_pos_defender is null then
      raise exception 'ranking_rows_missing';
    end if;

    -- Atenção: rank_position é UNIQUE por categoria (constraint).
    -- Swap direto (mesmo em um UPDATE com CASE) pode violar unicidade em PostgreSQL.
    -- Fazemos swap seguro usando uma posição temporária fora do intervalo.
    select coalesce(max(cm.rank_position), 0) into v_max_pos
    from public.category_members cm
    where cm.category_id = c.category_id
    for share;

    v_tmp_pos := v_max_pos + 1000000;

    update public.category_members
    set rank_position = v_tmp_pos
    where category_id = c.category_id and user_id = c.challenger_id;

    update public.category_members
    set rank_position = v_pos_challenger
    where category_id = c.category_id and user_id = c.defender_id;

    update public.category_members
    set rank_position = v_pos_defender
    where category_id = c.category_id and user_id = c.challenger_id;
  end if;

  update public.challenges
  set status = 'completed',
      completed_at = now()
  where id = c.id;
end;
$$;

-- Função WRAPPER (compatibilidade com o frontend atual / PostgREST named params):
-- Assinatura exigida pelo client:
--   report_match(p_challenge_id, p_court_id, p_played_at, p_score, p_winner_id)
create or replace function public.report_match(
  p_challenge_id uuid,
  p_court_id uuid,
  p_played_at timestamptz,
  p_score text,
  p_winner_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Mantém toda a lógica original (validações + swap + insert + completar challenge)
  perform public.report_match(p_challenge_id, p_winner_id, p_score, p_played_at);

  -- Depois seta a quadra no match recém-criado (1 match por challenge no MVP).
  update public.matches
  set court_id = p_court_id
  where challenge_id = p_challenge_id;
end;
$$;

-- =============================================================================
-- RLS (Row Level Security)
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.courts enable row level security;
alter table public.category_members enable row level security;
alter table public.challenges enable row level security;
alter table public.matches enable row level security;

-- PROFILES
drop policy if exists profiles_select on public.profiles;
create policy profiles_select
on public.profiles
for select
to authenticated
using (
  auth.uid() is not null
  and (id = auth.uid() or public.shares_category_with(id))
);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles
for update
to authenticated
using (auth.uid() is not null and id = auth.uid())
with check (auth.uid() is not null and id = auth.uid());

-- CATEGORIES: leitura para autenticados
drop policy if exists categories_select_auth on public.categories;
create policy categories_select_auth
on public.categories
for select
to authenticated
using (auth.uid() is not null);

-- COURTS: leitura para autenticados (admin-only para escrita: sem policies de write)
drop policy if exists courts_select_auth on public.courts;
create policy courts_select_auth
on public.courts
for select
to authenticated
using (auth.uid() is not null);

-- CATEGORY_MEMBERS: leitura apenas para membros ativos da categoria
drop policy if exists category_members_select_members on public.category_members;
create policy category_members_select_members
on public.category_members
for select
to authenticated
using (public.is_category_member(category_id));

-- CHALLENGES: leitura apenas para envolvidos (e membros ativos)
drop policy if exists challenges_select_parties on public.challenges;
create policy challenges_select_parties
on public.challenges
for select
to authenticated
using (
  auth.uid() is not null
  and public.is_category_member(category_id)
  and auth.uid() in (challenger_id, defender_id)
);

-- MATCHES: leitura apenas para membros ativos da categoria
drop policy if exists matches_select_members on public.matches;
create policy matches_select_members
on public.matches
for select
to authenticated
using (public.is_category_member(category_id));

-- =============================================================================
-- Grants (explícitos, conservadores)
-- =============================================================================
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.categories from anon, authenticated;
revoke all on table public.courts from anon, authenticated;
revoke all on table public.category_members from anon, authenticated;
revoke all on table public.challenges from anon, authenticated;
revoke all on table public.matches from anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant select on table public.categories to authenticated;
grant select on table public.courts to authenticated;
grant select on table public.category_members to authenticated;
grant select on table public.challenges to authenticated;
grant select on table public.matches to authenticated;

revoke all on function public.get_ranking(uuid) from public;
revoke all on function public.get_king(uuid) from public;
revoke all on function public.create_challenge(uuid, uuid) from public;
revoke all on function public.respond_challenge(uuid, text) from public;
revoke all on function public.report_match(uuid, uuid, text, timestamptz) from public;
revoke all on function public.report_match(uuid, uuid, timestamptz, text, uuid) from public;

grant execute on function public.get_ranking(uuid) to authenticated;
grant execute on function public.get_king(uuid) to authenticated;
grant execute on function public.create_challenge(uuid, uuid) to authenticated;
grant execute on function public.respond_challenge(uuid, text) to authenticated;
grant execute on function public.report_match(uuid, uuid, text, timestamptz) to authenticated;
grant execute on function public.report_match(uuid, uuid, timestamptz, text, uuid) to authenticated;

-- =============================================================================
-- Seed mínimo (Categoria B)
-- =============================================================================
insert into public.categories (id, name, challenge_range)
values ('00000000-0000-0000-0000-00000000000b', 'Categoria B', 3)
on conflict (id) do nothing;

-- Para testar localmente (manual, após criar usuários no Supabase Auth):
-- 1) Descubra os UUIDs em Authentication > Users.
-- 2) Insira membros (posições únicas por categoria):
-- insert into public.category_members (category_id, user_id, rank_position, status)
-- values
--   ('00000000-0000-0000-0000-00000000000b', '<USER_A_UUID>', 4, 'active'),
--   ('00000000-0000-0000-0000-00000000000b', '<USER_B_UUID>', 2, 'active');


