-- ============================================================================
-- Rei da Quadra — FASE 1 do Protocolo Anti-Fraude (Roadmap CEO)
-- Data: 2026-02-24
--
-- 1.1 Regra 3 – Limite diário: máx. 2 desafios enviados/dia, máx. 5 ativos
-- 1.2 Auto-confirmar após 24h: flag + função process_auto_confirm_pending_matches
-- 1.3 Reputation Score (0–10) + expor em get_ranking
--
-- Tudo idempotente; flags OFF por padrão.
-- ============================================================================

-- ============================================================================
-- 1.1) Flags para Regra 3 (limite diário) e auto-confirm 24h
-- ============================================================================

insert into public.app_flags (name, enabled, description)
values (
  'challenge_daily_limits_enabled',
  false,
  'Se true: máx. 2 desafios enviados por dia e máx. 5 desafios ativos (pending/accepted) por usuário.'
)
on conflict (name) do update set description = excluded.description;

insert into public.app_flags (name, enabled, description)
values (
  'auto_confirm_pending_after_24h',
  false,
  'Se true: partidas pending_confirm com reported_at há mais de 24h são confirmadas automaticamente (ranking atualizado).'
)
on conflict (name) do update set description = excluded.description;

-- ============================================================================
-- 1.1) Recriar create_challenge com limite diário (quando flag ligada)
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
  v_challenges_today int;
  v_active_challenges int;
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

  if not public.is_category_member(p_category_id) then
    raise exception 'not_authorized';
  end if;

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

  -- Nova regra:
  -- - Se o alvo estiver ACIMA (posição menor), aplica limite de alcance (v_range).
  -- - Se o alvo estiver ABAIXO (posição maior), é permitido independentemente da distância.
  if v_pos_defender < v_pos_challenger then
    if (v_pos_challenger - v_pos_defender) > v_range then
      raise exception 'out_of_challenge_range';
    end if;
  end if;

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

  -- REGRA 3 – Limite diário (só quando a flag estiver ligada)
  if public.is_flag_enabled('challenge_daily_limits_enabled') then
    select count(*)::int into v_challenges_today
    from public.challenges c
    where c.challenger_id = v_challenger
      and c.created_at >= date_trunc('day', now())
      and c.created_at < date_trunc('day', now()) + interval '1 day';

    if v_challenges_today >= 2 then
      raise exception 'max_challenges_per_day_reached';
    end if;

    select count(*)::int into v_active_challenges
    from public.challenges c
    where c.challenger_id = v_challenger
      and c.status in ('pending', 'accepted');

    if v_active_challenges >= 5 then
      raise exception 'max_active_challenges_reached';
    end if;
  end if;

  -- BLOQUEIO 7 DIAS (flag pair_cooldown_7d_enabled)
  if public.is_flag_enabled('pair_cooldown_7d_enabled') then
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
  end if;

  -- BLOQUEIO 14 DIAS (flag limit_two_matches_14d)
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
-- 1.3) Reputation Score (0–10) – função + expor em get_ranking
-- ============================================================================

create or replace function public.get_reputation_score(p_user_id uuid)
returns numeric(3,1)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_won int;
  v_lost int;
  v_disputed int;
  v_total int;
  v_score numeric(3,1);
begin
  select
    coalesce(p.confirmed_matches_won, 0),
    coalesce(p.confirmed_matches_lost, 0),
    coalesce(p.disputed_matches_reported, 0)
  into v_won, v_lost, v_disputed
  from public.profiles p
  where p.id = p_user_id;

  if v_won is null then
    return 5.0; -- neutro para quem não tem partidas
  end if;

  v_total := v_won + v_lost;
  if v_total = 0 then
    return 5.0;
  end if;

  -- Score = 10 * (1 - razão de disputas reportadas). Sem disputas = 10; muitas = próximo de 0.
  v_score := 10.0 * (1.0 - (v_disputed::numeric / greatest(v_total, 1)));
  v_score := round(greatest(0, least(10, v_score))::numeric, 1);
  return v_score;
end;
$$;

revoke all on function public.get_reputation_score(uuid) from public;
grant execute on function public.get_reputation_score(uuid) to authenticated;

-- get_ranking passa a retornar reputation_score (compatível: nova coluna no final)
drop function if exists public.get_ranking(uuid);

create function public.get_ranking(p_category_id uuid)
returns table (
  user_id uuid,
  display_name text,
  rank_position int,
  status text,
  is_me boolean,
  reputation_score numeric(3,1)
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
    (cm.user_id = auth.uid()) as is_me,
    public.get_reputation_score(cm.user_id) as reputation_score
  from public.category_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.category_id = p_category_id
    and cm.status = 'active'
  order by cm.rank_position asc;
end;
$$;

revoke all on function public.get_ranking(uuid) from public;
grant execute on function public.get_ranking(uuid) to authenticated;

-- ============================================================================
-- 1.2) Auto-confirmar após 24h – função interna + refatorar confirm + job
-- ============================================================================

-- Função interna: aplica a confirmação ao match (ranking + status + contadores).
-- p_confirmed_by null = confirmação automática (sistema).
create or replace function public.apply_match_confirmation(
  p_match_id uuid,
  p_confirmed_by uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  m public.matches%rowtype;
  c public.challenges%rowtype;
  v_pos_challenger int;
  v_pos_defender int;
  v_tmp_pos int;
  v_max_pos int;
begin
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

  if now() >= c.expires_at then
    update public.challenges
    set status = 'expired'
    where id = c.id and status in ('pending','accepted');
    raise exception 'challenge_expired';
  end if;

  -- Swap de ranking se challenger venceu
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

  update public.matches
  set status = 'confirmed',
      confirmed_by = p_confirmed_by,
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

revoke all on function public.apply_match_confirmation(uuid, uuid) from public;
grant execute on function public.apply_match_confirmation(uuid, uuid) to authenticated;

-- confirm_match_result: valida quem confirma e chama apply_match_confirmation
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
    raise exception 'cannot_confirm_own_report';
  end if;

  if v_actor not in (c.challenger_id, c.defender_id) then
    raise exception 'not_authorized';
  end if;

  perform public.apply_match_confirmation(p_match_id, v_actor);
end;
$$;

revoke all on function public.confirm_match_result(uuid) from public;
grant execute on function public.confirm_match_result(uuid) to authenticated;

-- Job: processa partidas pending_confirm com mais de 24h sem resposta
-- Chamar via pg_cron (a cada hora) ou Edge Function + cron externo.
create or replace function public.process_auto_confirm_pending_matches()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_count int := 0;
begin
  if not public.is_flag_enabled('auto_confirm_pending_after_24h') then
    return 0;
  end if;

  for r in
    select m.id
    from public.matches m
    where m.status = 'pending_confirm'
      and m.reported_at is not null
      and m.reported_at < now() - interval '24 hours'
    order by m.reported_at asc
    for update skip locked
  loop
    begin
      perform public.apply_match_confirmation(r.id, null);
      v_count := v_count + 1;
    exception
      when others then
        null; -- ignora erro (ex.: challenge expirado) e segue
    end;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.process_auto_confirm_pending_matches() from public;
grant execute on function public.process_auto_confirm_pending_matches() to authenticated;

-- ============================================================================
-- Fim Fase 1
-- ============================================================================
-- Para ativar:
--   Regra 3 (limite diário):  update app_flags set enabled = true where name = 'challenge_daily_limits_enabled';
--   Auto-confirm 24h:         update app_flags set enabled = true where name = 'auto_confirm_pending_after_24h';
--
-- Agendar process_auto_confirm_pending_matches():
--   - pg_cron (se disponível): select cron.schedule('auto-confirm', '0 * * * *', 'select process_auto_confirm_pending_matches()');
--   - Ou Edge Function chamando supabase.rpc('process_auto_confirm_pending_matches') a cada hora.
-- ============================================================================
