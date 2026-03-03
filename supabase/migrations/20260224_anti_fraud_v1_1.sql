-- ============================================================================
-- Rei da Quadra — Protocolo Anti-Fraude v1.1 (evolução incremental)
-- Data: 2026-02-24
--
-- Objetivo:
--  - NÃO alterar o comportamento atual da v1.0 (flags OFF).
--  - Adicionar:
--      1) Auditoria (anti_fraud_events + log_anti_fraud_event).
--      2) RPCs admin-only para tratar matches em 'disputed':
--           * void_match
--           * resolve_dispute
--      3) Flag opcional para marcar challenges como 'in_review' em disputas.
--
-- Regras:
--  - Tudo idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION ... $$).
--  - Nenhum rename/drop destrutivo de objetos existentes.
--  - Com flags OFF, o fluxo v1.0 permanece idêntico.
-- ============================================================================

-- ============================================================================
-- 1) Fonte de verdade para admin + helper is_admin
-- ============================================================================

-- Tabela simples de admins, separada de profiles para não acoplar demais.
create table if not exists public.app_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

revoke all on table public.app_admins from anon, authenticated;
grant select on table public.app_admins to authenticated; -- leitura não é crítica

-- Helper: "este usuário é admin?"
create or replace function public.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.app_admins a
    where a.user_id = p_user_id
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;

-- ============================================================================
-- 2) Auditoria: tabela anti_fraud_events + helper log_anti_fraud_event
-- ============================================================================

create table if not exists public.anti_fraud_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  user_id uuid,
  category_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

-- FKs opcionais (idempotentes) para facilitar joins, sem travar se já existirem.
do $$
begin
  alter table public.anti_fraud_events
    add constraint anti_fraud_events_user_fkey
    foreign key (user_id) references public.profiles(id) on delete set null;
exception
  when duplicate_object then
    null;
end $$;

do $$
begin
  alter table public.anti_fraud_events
    add constraint anti_fraud_events_category_fkey
    foreign key (category_id) references public.categories(id) on delete set null;
exception
  when duplicate_object then
    null;
end $$;

create index if not exists anti_fraud_events_by_type_created_at
on public.anti_fraud_events(event_type, created_at desc);

revoke all on table public.anti_fraud_events from anon, authenticated;
grant select, insert on table public.anti_fraud_events to authenticated;

-- Helper genérico de auditoria
create or replace function public.log_anti_fraud_event(
  p_event_type text,
  p_user_id uuid,
  p_category_id uuid,
  p_details jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.anti_fraud_events(event_type, user_id, category_id, details)
  values (p_event_type, p_user_id, p_category_id, p_details);
end;
$$;

revoke all on function public.log_anti_fraud_event(text, uuid, uuid, jsonb) from public;
grant execute on function public.log_anti_fraud_event(text, uuid, uuid, jsonb) to authenticated;

-- ============================================================================
-- 3) Flag opcional: challenge_in_review_on_dispute
-- ============================================================================

insert into public.app_flags(name, enabled, description)
values (
  'challenge_in_review_on_dispute',
  false,
  'Se true, disputa de partida marca o desafio como in_review até decisão admin.'
)
on conflict (name) do nothing;

-- ============================================================================
-- 4) Suporte a status "in_review" em challenges (atrás de flag)
-- ============================================================================

alter table public.challenges
  add column if not exists in_review_at timestamptz;

-- Atualiza constraint de status para incluir 'in_review' (idempotente).
do $$
begin
  alter table public.challenges
    drop constraint if exists challenges_status_check;

  alter table public.challenges
    add constraint challenges_status_check
    check (status in ('pending','accepted','declined','expired','completed','in_review'));
exception
  when others then
    null;
end $$;

-- ============================================================================
-- 5) Atualizar dispute_match_result para opcionalmente marcar challenge como in_review
--      - Com a flag OFF, comportamento permanece igual ao da v1.0.
-- ============================================================================

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

  -- Integridade extra: categoria do match deve bater com a do challenge
  if m.category_id is distinct from c.category_id then
    raise exception 'category_mismatch';
  end if;

  if v_actor = m.reported_by then
    raise exception 'cannot_dispute_own_report';
  end if;

  if v_actor not in (c.challenger_id, c.defender_id) then
    raise exception 'not_authorized';
  end if;

  -- Motivo (sanitizado e truncado para tamanho razoável)
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

  -- Contador simples de disputas reportadas pelo autor original do resultado
  if m.reported_by is not null then
    update public.profiles
    set disputed_matches_reported = disputed_matches_reported + 1
    where id = m.reported_by;
  end if;

  -- v1.1 opcional: se flag ligada, marca challenge como "em revisão".
  if public.is_flag_enabled('challenge_in_review_on_dispute') then
    update public.challenges
    set status = 'in_review',
        in_review_at = coalesce(in_review_at, now())
    where id = c.id;
  end if;

  -- Auditoria básica da disputa
  perform public.log_anti_fraud_event(
    'match_disputed',
    v_actor,
    m.category_id,
    jsonb_build_object(
      'match_id', m.id,
      'challenge_id', m.challenge_id,
      'reported_by', m.reported_by,
      'reason', v_reason
    )
  );
end;
$$;

revoke all on function public.dispute_match_result(uuid, text) from public;
grant execute on function public.dispute_match_result(uuid, text) to authenticated;

-- ============================================================================
-- 6) RPC admin-only: void_match (anula disputa sem mexer no ranking)
-- ============================================================================

drop function if exists public.void_match(uuid, text);

create function public.void_match(
  p_match_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  m public.matches%rowtype;
  c public.challenges%rowtype;
  v_reason text;
begin
  v_admin := auth.uid();
  if v_admin is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_admin(v_admin) then
    raise exception 'not_admin';
  end if;

  select * into m
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'match_not_found';
  end if;

  if coalesce(m.status, 'confirmed') <> 'disputed' then
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

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is not null then
    v_reason := left(v_reason, 500);
  end if;

  -- Marca o match como voided (status terminal sem ranking).
  update public.matches
  set status = 'voided'
  where id = m.id;

  -- Se o challenge estiver "in_review", marcamos como concluído administrativamente.
  if c.status = 'in_review' then
    update public.challenges
    set status = 'completed',
        completed_at = coalesce(completed_at, now())
    where id = c.id;
  end if;

  -- Auditoria
  perform public.log_anti_fraud_event(
    'void_match',
    v_admin,
    m.category_id,
    jsonb_build_object(
      'match_id', m.id,
      'challenge_id', m.challenge_id,
      'previous_status', 'disputed',
      'reason', v_reason
    )
  );
end;
$$;

revoke all on function public.void_match(uuid, text) from public;
grant execute on function public.void_match(uuid, text) to authenticated;

-- ============================================================================
-- 7) RPC admin-only: resolve_dispute (aplica decisão admin como confirmação)
-- ============================================================================

drop function if exists public.resolve_dispute(uuid, uuid, text, timestamptz);

create function public.resolve_dispute(
  p_match_id uuid,
  p_winner_id uuid,
  p_score text,
  p_played_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  m public.matches%rowtype;
  c public.challenges%rowtype;
  v_played_at timestamptz;
  v_winner uuid;
  v_loser uuid;
  v_pos_challenger int;
  v_pos_defender int;
  v_tmp_pos int;
  v_max_pos int;
begin
  v_admin := auth.uid();
  if v_admin is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_admin(v_admin) then
    raise exception 'not_admin';
  end if;

  select * into m
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'match_not_found';
  end if;

  if coalesce(m.status, 'confirmed') <> 'disputed' then
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

  -- Winner precisa ser um dos jogadores daquela partida.
  if p_winner_id not in (m.winner_id, m.loser_id) then
    raise exception 'invalid_winner';
  end if;

  v_winner := p_winner_id;
  v_loser := case
    when v_winner = m.winner_id then m.loser_id
    else m.winner_id
  end;

  v_played_at := coalesce(p_played_at, m.played_at, now());

  if v_played_at > now() then
    raise exception 'played_at_in_future';
  end if;
  if v_played_at < now() - interval '60 days' then
    raise exception 'played_at_too_old';
  end if;

  -- Atualiza os campos de resultado conforme decisão admin.
  update public.matches
  set winner_id = v_winner,
      loser_id = v_loser,
      score = nullif(coalesce(p_score, ''), ''),
      played_at = v_played_at
  where id = m.id;

  -- Recarrega m para trabalhar com os valores atualizados.
  select * into m
  from public.matches
  where id = p_match_id
  for update;

  -- Aplica a mesma lógica de ranking de confirm_match_result:
  -- swap apenas se challenger vencer.
  if m.winner_id = c.challenger_id then
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

  -- Marca match como confirmado por decisão admin.
  update public.matches
  set status = 'confirmed',
      confirmed_by = v_admin,
      confirmed_at = now()
  where id = m.id;

  -- Marca challenge como concluído (independente de estar in_review ou não).
  update public.challenges
  set status = 'completed',
      completed_at = coalesce(completed_at, now())
  where id = c.id;

  -- Atualiza contadores de reputação simples
  update public.profiles
  set confirmed_matches_won = confirmed_matches_won + 1
  where id = m.winner_id;

  update public.profiles
  set confirmed_matches_lost = confirmed_matches_lost + 1
  where id = m.loser_id;

  -- Auditoria
  perform public.log_anti_fraud_event(
    'resolve_dispute',
    v_admin,
    m.category_id,
    jsonb_build_object(
      'match_id', m.id,
      'challenge_id', m.challenge_id,
      'winner_id', m.winner_id,
      'loser_id', m.loser_id,
      'score', m.score,
      'played_at', m.played_at
    )
  );
end;
$$;

revoke all on function public.resolve_dispute(uuid, uuid, text, timestamptz) from public;
grant execute on function public.resolve_dispute(uuid, uuid, text, timestamptz) to authenticated;

-- ============================================================================
-- Nota sobre matches_unique_challenge
-- ============================================================================
-- O índice legado matches_unique_challenge (um match por challenge) permanece
-- inalterado nesta v1.1. Em uma futura v1.2, caso queiram suportar re-report
-- pós-void/disputed, a recomendação é:
--  - Relaxar/ajustar esse índice.
--  - Manter o índice matches_unique_pending_per_challenge para garantir que
--    nunca haja mais de um match em pending_confirm por challenge.
-- ============================================================================

