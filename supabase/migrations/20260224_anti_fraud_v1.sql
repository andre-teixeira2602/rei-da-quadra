-- ============================================================================
-- Rei da Quadra — Protocolo Anti-Fraude v1.0
-- Data: 2026-02-24
--
-- Objetivos principais (MVP):
--  A) Confirmação dupla do resultado (sem confirmação, não atualiza ranking/pontos)
--  B) Bloqueio de repetição (7 dias + opcional 2 jogos em 14 dias via feature flag)
--  C) Limite de alcance já existe via categories.challenge_range/create_challenge
--
-- PLUS (parcial):
--  D) Status/flags de match: pending_confirm / confirmed / disputed / voided
--  E) Auditoria mínima: reported_by / confirmed_by / timestamps / dispute_reason
--  F) Base para reputação: contadores simples em profiles
--
-- Regras:
--  - Idempotente: CREATE IF NOT EXISTS, ALTER IF NOT EXISTS, DO $$ EXCEPTION $$.
--  - NENHUMA tabela/coluna existente é renomeada.
--  - Fluxo atual (RPC report_match existente) permanece funcionando.
--  - Novo fluxo v2 adiciona confirmação dupla sem depender do frontend para segurança.
-- ============================================================================

-- ============================================================================
-- 1) Novas colunas em matches (status + auditoria)
-- ============================================================================

alter table public.matches
  add column if not exists status text;

alter table public.matches
  add column if not exists reported_by uuid;

alter table public.matches
  add column if not exists confirmed_by uuid;

alter table public.matches
  add column if not exists dispute_reason text;

alter table public.matches
  add column if not exists reported_at timestamptz default now();

alter table public.matches
  add column if not exists confirmed_at timestamptz;

alter table public.matches
  add column if not exists disputed_at timestamptz;

alter table public.matches
  add column if not exists disputed_by uuid;

-- Default seguro para linhas antigas: já foram contabilizadas no ranking,
-- então consideramos como "confirmed".
alter table public.matches
  alter column status set default 'confirmed';

update public.matches
set status = 'confirmed'
where status is null;

-- Constraint de status (idempotente)
do $$
begin
  alter table public.matches
    add constraint matches_status_check
    check (status in ('pending_confirm','confirmed','disputed','voided'));
exception
  when duplicate_object then
    null;
end $$;

-- FKs opcionais para auditoria (idempotentes)
do $$
begin
  alter table public.matches
    add constraint matches_reported_by_fkey
    foreign key (reported_by) references public.profiles(id) on delete set null;
exception
  when duplicate_object then
    null;
end $$;

do $$
begin
  alter table public.matches
    add constraint matches_confirmed_by_fkey
    foreign key (confirmed_by) references public.profiles(id) on delete set null;
exception
  when duplicate_object then
    null;
end $$;

do $$
begin
  alter table public.matches
    add constraint matches_disputed_by_fkey
    foreign key (disputed_by) references public.profiles(id) on delete set null;
exception
  when duplicate_object then
    null;
end $$;

-- Índices auxiliares para consultas por status/tempo (idempotentes)
create index if not exists matches_by_status_played_at
on public.matches(status, played_at desc);

create index if not exists matches_by_players_recent
on public.matches(category_id, winner_id, loser_id, played_at desc);

-- Para cada challenge, garante no máximo 1 partida pendente de confirmação
-- (além do índice único já existente em schema.sql para qualquer match por challenge).
create unique index if not exists matches_unique_pending_per_challenge
on public.matches(challenge_id)
where status = 'pending_confirm' and challenge_id is not null;

-- ============================================================================
-- 2) Base de reputação em profiles (contadores simples)
-- ============================================================================

alter table public.profiles
  add column if not exists confirmed_matches_won int not null default 0;

alter table public.profiles
  add column if not exists confirmed_matches_lost int not null default 0;

alter table public.profiles
  add column if not exists disputed_matches_reported int not null default 0;

-- ============================================================================
-- 3) Infra de feature flags simples (para regras de repetição em 14 dias)
-- ============================================================================

create table if not exists public.app_flags (
  name text primary key,
  enabled boolean not null default false,
  description text,
  updated_at timestamptz not null default now()
);

create index if not exists app_flags_enabled_idx
on public.app_flags(enabled, name);

-- Atualiza updated_at automaticamente quando houver alteração em app_flags
-- (CORRIGIDO: sem DO $$ e sem bloco exception solto)

create or replace function public.set_app_flags_updated_at()
returns trigger
language plpgsql
as $func$
begin
  new.updated_at := now();
  return new;
end;
$func$;

drop trigger if exists trg_app_flags_updated_at on public.app_flags;

create trigger trg_app_flags_updated_at
before update on public.app_flags
for each row
execute function public.set_app_flags_updated_at();

-- Helper para checar flag (SECURITY DEFINER para uso em funções com RLS)
create or replace function public.is_flag_enabled(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.app_flags f
    where f.name = p_name
      and f.enabled = true
  );
$$;

revoke all on table public.app_flags from anon, authenticated;
grant select, update, insert, delete on table public.app_flags to authenticated; -- opcional; pode ser restringido a role de admin

revoke all on function public.is_flag_enabled(text) from public;
grant execute on function public.is_flag_enabled(text) to authenticated;

-- Seed opcional de flag para limite 2 partidas em 14d.
insert into public.app_flags (name, enabled, description)
values ('limit_two_matches_14d', false, 'Limita a 2 partidas confirmadas entre o mesmo par em 14 dias.')
on conflict (name) do nothing;

-- ============================================================================
-- 4) Helper para posição no ranking (fail-open se não houver posição)
-- ============================================================================

create or replace function public.get_player_position(
  p_category_id uuid,
  p_user_id uuid
)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cm.rank_position
  from public.category_members cm
  where cm.category_id = p_category_id
    and cm.user_id = p_user_id
    and cm.status = 'active';
$$;

revoke all on function public.get_player_position(uuid, uuid) from public;
grant execute on function public.get_player_position(uuid, uuid) to authenticated;

-- ============================================================================
-- 5) Atualização da RPC create_challenge com bloqueio por repetição (7d / 14d)
-- ============================================================================

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
  v_recent_matches_14d int;
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

  -- Impede duplicado pending/accepted entre os mesmos jogadores (qualquer direção)
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

  -- BLOQUEIO 7 DIAS:
  if exists (
    select 1
    from public.matches m
    where m.category_id = p_category_id
      and m.played_at >= now() - interval '7 days'
      and coalesce(m.status, 'confirmed') = 'confirmed'
      and (
        (m.winner_id = v_challenger and m.loser_id = p_defender_id) or
        (m.winner_id = p_defender_id and m.loser_id = v_challenger)
      )
  ) then
    raise exception 'recent_match_between_players';
  end if;

  -- BLOQUEIO 14 DIAS (feature flag: limit_two_matches_14d):
  if public.is_flag_enabled('limit_two_matches_14d') then
    select count(*)::int into v_recent_matches_14d
    from public.matches m
    where m.category_id = p_category_id
      and m.played_at >= now() - interval '14 days'
      and coalesce(m.status, 'confirmed') = 'confirmed'
      and (
        (m.winner_id = v_challenger and m.loser_id = p_defender_id) or
        (m.winner_id = p_defender_id and m.loser_id = v_challenger)
      );

    if v_recent_matches_14d >= 2 then
      raise exception 'too_many_matches_last_14d';
    end if;
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

revoke all on function public.create_challenge(uuid, uuid) from public;
grant execute on function public.create_challenge(uuid, uuid) to authenticated;

-- ============================================================================
-- 6) Novo fluxo de partida com confirmação dupla
-- ============================================================================

-- 6.1) report_match_v2

drop function if exists public.report_match_v2(uuid, uuid, timestamptz, text, uuid);

create function public.report_match_v2(
  p_challenge_id uuid,
  p_court_id uuid,
  p_played_at timestamptz,
  p_score text,
  p_winner_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  c public.challenges%rowtype;
  v_loser uuid;
  v_played_at timestamptz;
  v_match_id uuid;
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

  if v_played_at > now() then
    raise exception 'played_at_in_future';
  end if;
  if v_played_at < now() - interval '60 days' then
    raise exception 'played_at_too_old';
  end if;

  insert into public.matches (
    category_id,
    challenge_id,
    winner_id,
    loser_id,
    score,
    played_at,
    status,
    reported_by,
    reported_at,
    court_id
  )
  values (
    c.category_id,
    c.id,
    p_winner_id,
    v_loser,
    nullif(coalesce(p_score, ''), ''),
    v_played_at,
    'pending_confirm',
    v_actor,
    now(),
    p_court_id
  )
  returning id into v_match_id;

  return v_match_id;
end;
$$;

revoke all on function public.report_match_v2(uuid, uuid, timestamptz, text, uuid) from public;
grant execute on function public.report_match_v2(uuid, uuid, timestamptz, text, uuid) to authenticated;

-- 6.2) confirm_match_result

drop function if exists public.confirm_match_result(uuid);

create function public.confirm_match_result(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  m public.matches%rowtype;
  c public.challenges%rowtype;
  v_pos_challenger int;
  v_pos_defender int;
  v_tmp_pos int;
  v_max_pos int;
  v_challenger uuid;
  v_defender uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  select * into m
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'match_not_found';
  end if;

  if coalesce(m.status, 'confirmed') <> 'pending_confirm' then
    raise exception 'invalid_status';
  end if;

  if m.challenge_id is null then
    raise exception 'challenge_not_found';
  end if;

  select * into c
  from public.challenges
  where id = m.challenge_id
  for update;

  if not found then
    raise exception 'challenge_not_found';
  end if;

  if m.category_id is distinct from c.category_id then
    raise exception 'category_mismatch';
  end if;

  v_challenger := c.challenger_id;
  v_defender := c.defender_id;

  if v_actor = m.reported_by then
    raise exception 'cannot_confirm_own_report';
  end if;

  if v_actor not in (v_challenger, v_defender) then
    raise exception 'not_authorized';
  end if;

  if now() >= c.expires_at then
    update public.challenges
    set status = 'expired'
    where id = c.id and status in ('pending','accepted');
    raise exception 'challenge_expired';
  end if;

  if m.winner_id = v_challenger then
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

    select coalesce(max(cm.rank_position), 0) into v_max_pos
    from public.category_members cm
    where cm.category_id = c.category_id;

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

  update public.matches
  set status = 'confirmed',
      confirmed_by = v_actor,
      confirmed_at = now()
  where id = m.id;

  update public.challenges
  set status = 'completed',
      completed_at = now()
  where id = c.id;

  update public.profiles
  set confirmed_matches_won = confirmed_matches_won + 1
  where id = m.winner_id;

  update public.profiles
  set confirmed_matches_lost = confirmed_matches_lost + 1
  where id = m.loser_id;
end;
$$;

revoke all on function public.confirm_match_result(uuid) from public;
grant execute on function public.confirm_match_result(uuid) to authenticated;

-- 6.3) dispute_match_result

drop function if exists public.dispute_match_result(uuid, text);

create function public.dispute_match_result(
  p_match_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  m public.matches%rowtype;
  c public.challenges%rowtype;
  v_reason text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  select * into m
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'match_not_found';
  end if;

  if coalesce(m.status, 'confirmed') <> 'pending_confirm' then
    raise exception 'invalid_status';
  end if;

  if m.challenge_id is null then
    raise exception 'challenge_not_found';
  end if;

  select * into c
  from public.challenges
  where id = m.challenge_id
  for update;

  if not found then
    raise exception 'challenge_not_found';
  end if;

  if m.category_id is distinct from c.category_id then
    raise exception 'category_mismatch';
  end if;

  if v_actor = m.reported_by then
    raise exception 'cannot_dispute_own_report';
  end if;

  if v_actor not in (c.challenger_id, c.defender_id) then
    raise exception 'not_authorized';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is not null then
    v_reason := left(v_reason, 500);
  end if;

  update public.matches
  set status = 'disputed',
      dispute_reason = v_reason,
      disputed_at = now(),
      disputed_by = v_actor
  where id = m.id;

  if m.reported_by is not null then
    update public.profiles
    set disputed_matches_reported = disputed_matches_reported + 1
    where id = m.reported_by;
  end if;
end;
$$;

revoke all on function public.dispute_match_result(uuid, text) from public;
grant execute on function public.dispute_match_result(uuid, text) to authenticated;

-- ============================================================================
-- Fim da migration Anti-Fraude v1.0
-- ============================================================================