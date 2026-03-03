-- Correção imediata: erro "FOR SHARE is not allowed with aggregate functions"
-- no confirm_match_result. Rode este bloco no SQL Editor do Supabase uma vez.

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

    -- SEM "for share" aqui: PostgreSQL não permite FOR SHARE com max()
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
