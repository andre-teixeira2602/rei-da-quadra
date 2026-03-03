-- ============================================================================
-- Rei da Quadra — Protocolo Anti-Fraude FASE 2
-- Data: 2026-02-24
--
-- Objetivo:
--  - Usar o Reputation Score (0–10) para limitar desafios.
--  - Mantém tudo atrás de feature flag (reputation_enforcement_enabled).
--
-- Regras:
--  - Rep < 2.0  → não pode criar desafios.
--  - Rep < 5.0  → não pode desafiar jogadores ACIMA (pode desafiar abaixo).
--
-- IMPORTANTE:
--  - Não altera comportamento se a flag estiver OFF (default).
--  - Mantém todas as outras regras já existentes (range, cooldown 7/14d, limite diário, etc.).
-- ============================================================================

-- Flag para enforcement de reputação
insert into public.app_flags (name, enabled, description)
values (
  'reputation_enforcement_enabled',
  false,
  'Se true: jogadores com reputação baixa têm restrições de desafio (não desafiar acima ou não criar desafios).'
)
on conflict (name) do update set description = excluded.description;

-- ============================================================================
-- Recriar create_challenge com checagem de reputação (quando flag ligada)
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
  v_rep numeric(3,1);
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

  -- Posições no ranking
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

  -- Se alvo estiver ACIMA (posição menor), aplica alcance.
  -- Se alvo estiver ABAIXO (posição maior), pode desafiar livremente.
  if v_pos_defender < v_pos_challenger then
    if (v_pos_challenger - v_pos_defender) > v_range then
      raise exception 'out_of_challenge_range';
    end if;
  end if;

  -- Enforcement de reputação (atrás de flag).
  if public.is_flag_enabled('reputation_enforcement_enabled') then
    v_rep := public.get_reputation_score(v_challenger);

    if v_rep < 2.0 then
      raise exception 'reputation_too_low_for_challenges';
    end if;

    -- Reputação baixa (<5): não pode desafiar para cima, apenas para baixo.
    if v_rep < 5.0 and v_pos_defender < v_pos_challenger then
      raise exception 'reputation_cannot_challenge_above';
    end if;
  end if;

  -- Impede duplicado pending/accepted recentes entre o mesmo par.
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

  -- Limite diário / ativos (Regra 3), se ligado.
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

  -- Cooldown 7 dias, se ligado.
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

  -- Limite 2 partidas em 14 dias, se ligado.
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

