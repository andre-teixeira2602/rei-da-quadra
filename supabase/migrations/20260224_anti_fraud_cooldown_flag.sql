-- ============================================================================
-- Rei da Quadra — Cooldown 7 dias atrás de feature flag (para testes)
-- Data: 2026-02-24
--
-- Objetivo: O bloqueio "recent_match_between_players" (7 dias) passa a ser
-- opcional. Com a flag OFF (padrão), você pode desafiar de novo na fase de testes.
-- Em produção, ative a flag para ligar o cooldown.
-- ============================================================================

-- Nova flag: cooldown de 7 dias entre o mesmo par (default OFF para testes)
insert into public.app_flags (name, enabled, description)
values (
  'pair_cooldown_7d_enabled',
  false,
  'Se true, bloqueia novo desafio se já houve partida confirmada entre o par nos últimos 7 dias.'
)
on conflict (name) do update set description = excluded.description;

-- Recria create_challenge com o bloqueio 7d atrás da flag
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
  -- - Se o alvo estiver ACIMA (posição menor), aplica limite de alcance (challenge_range).
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

  -- BLOQUEIO 7 DIAS (só quando a flag estiver ligada — OFF por padrão para testes)
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
