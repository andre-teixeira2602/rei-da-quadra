-- PARTE 4: Atualizar RPC report_match_v2 (Registrar Partida)
-- Execute esta parte QUARTA (e última)

drop function if exists public.report_match_v2(uuid, uuid, text, timestamptz);

create function public.report_match_v2(
  p_court_id uuid,
  p_category_id uuid,
  p_challenge_id uuid,
  p_winner_id uuid,
  p_score text,
  p_played_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c record;
  v_loser uuid;
  v_played_at timestamptz;
  v_pos_challenger int;
  v_pos_defender int;
  v_max_pos int;
  v_tmp_pos int;
  v_match_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into c from public.challenges
  where id = p_challenge_id;

  if c is null then
    raise exception 'challenge_not_found';
  end if;

  if c.court_id != p_court_id or c.category_id != p_category_id then
    raise exception 'challenge_court_mismatch';
  end if;

  if c.status != 'accepted' then
    raise exception 'challenge_not_accepted';
  end if;

  if auth.uid() != c.challenger_id and auth.uid() != c.defender_id then
    raise exception 'not_authorized';
  end if;

  if p_winner_id is null or p_winner_id not in (c.challenger_id, c.defender_id) then
    raise exception 'invalid_winner';
  end if;

  v_loser := case when p_winner_id = c.challenger_id then c.defender_id else c.challenger_id end;
  v_played_at := coalesce(p_played_at, now());

  insert into public.matches (court_id, category_id, challenge_id, winner_id, loser_id, score, played_at)
  values (p_court_id, p_category_id, c.id, p_winner_id, v_loser, nullif(coalesce(p_score,''),''), v_played_at)
  returning id into v_match_id;

  if p_winner_id = c.challenger_id then
    select cm.rank_position into v_pos_challenger
    from public.category_members cm
    where cm.court_id = p_court_id
      and cm.category_id = p_category_id
      and cm.user_id = c.challenger_id
    for update;

    select cm.rank_position into v_pos_defender
    from public.category_members cm
    where cm.court_id = p_court_id
      and cm.category_id = p_category_id
      and cm.user_id = c.defender_id
    for update;

    if v_pos_challenger is null or v_pos_defender is null then
      raise exception 'ranking_rows_missing';
    end if;

    select coalesce(max(cm.rank_position), 0) into v_max_pos
    from public.category_members cm
    where cm.court_id = p_court_id
      and cm.category_id = p_category_id
    for share;

    v_tmp_pos := v_max_pos + 1000000;

    update public.category_members
    set rank_position = v_tmp_pos
    where court_id = p_court_id
      and category_id = p_category_id
      and user_id = c.challenger_id;

    update public.category_members
    set rank_position = v_pos_challenger
    where court_id = p_court_id
      and category_id = p_category_id
      and user_id = c.defender_id;

    update public.category_members
    set rank_position = v_pos_defender
    where court_id = p_court_id
      and category_id = p_category_id
      and user_id = c.challenger_id;
  end if;

  update public.challenges
  set status = 'completed',
      completed_at = now()
  where id = c.id;

  return v_match_id;
end;
$$;

-- Atualizar Grants para report_match_v2
revoke all on function public.report_match_v2(uuid, uuid, uuid, uuid, text, timestamptz) from public;
grant execute on function public.report_match_v2(uuid, uuid, uuid, uuid, text, timestamptz) to authenticated;
