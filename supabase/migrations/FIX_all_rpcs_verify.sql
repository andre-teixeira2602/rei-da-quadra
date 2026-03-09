-- ============================================================
-- VERIFICAÇÃO E CORREÇÃO COMPLETA DE TODAS AS RPCs
-- Execute no Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. DELETAR TODAS AS VERSÕES ANTIGAS (limpeza total)
drop function if exists public.get_ranking(uuid) cascade;
drop function if exists public.get_ranking(uuid, uuid) cascade;
drop function if exists public.get_king(uuid) cascade;
drop function if exists public.get_king(uuid, uuid) cascade;
drop function if exists public.create_challenge(uuid, uuid) cascade;
drop function if exists public.create_challenge(uuid, uuid, uuid) cascade;
drop function if exists public.respond_challenge(uuid, text) cascade;
drop function if exists public.report_match_v2(uuid, uuid, text, timestamptz) cascade;
drop function if exists public.report_match_v2(uuid, uuid, uuid, uuid, text, timestamptz) cascade;
drop function if exists public.confirm_match_result(uuid) cascade;
drop function if exists public.dispute_match_result(uuid, text) cascade;
drop function if exists public.is_category_member_in_court(uuid, uuid) cascade;

-- 2. HELPER: is_category_member_in_court
create or replace function public.is_category_member_in_court(p_court_id uuid, p_category_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return exists (
    select 1 from public.category_members cm
    where cm.court_id = p_court_id
      and cm.category_id = p_category_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
  );
end;
$$;

-- 3. RPC: get_ranking
create function public.get_ranking(p_court_id uuid, p_category_id uuid)
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
  return query
  select
    cm.user_id,
    coalesce(nullif(p.display_name, ''), 'Jogador') as display_name,
    cm.rank_position,
    cm.status,
    (cm.user_id = auth.uid()) as is_me
  from public.category_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.court_id = p_court_id
    and cm.category_id = p_category_id
    and cm.status = 'active'
  order by cm.rank_position asc;
end;
$$;

-- 4. RPC: get_king
create function public.get_king(p_court_id uuid, p_category_id uuid)
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
  return query
  select
    cm.user_id,
    coalesce(nullif(p.display_name, ''), 'Jogador') as display_name,
    cm.rank_position
  from public.category_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.court_id = p_court_id
    and cm.category_id = p_category_id
    and cm.status = 'active'
    and cm.rank_position = 1
  limit 1;
end;
$$;

-- 5. RPC: create_challenge
create function public.create_challenge(p_court_id uuid, p_category_id uuid, p_defender_id uuid)
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
  v_challenge_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  v_challenger := auth.uid();
  if not public.is_category_member_in_court(p_court_id, p_category_id) then
    raise exception 'not_authorized';
  end if;
  if not exists (
    select 1 from public.category_members cm
    where cm.court_id = p_court_id
      and cm.category_id = p_category_id
      and cm.user_id = p_defender_id
      and cm.status = 'active'
  ) then
    raise exception 'invalid_defender';
  end if;
  if v_challenger = p_defender_id then
    raise exception 'self_challenge_not_allowed';
  end if;
  select c.challenge_range into v_range
  from public.categories c
  where c.id = p_category_id;
  if v_range is null then
    raise exception 'category_not_found';
  end if;
  select cm.rank_position into v_pos_challenger
  from public.category_members cm
  where cm.court_id = p_court_id
    and cm.category_id = p_category_id
    and cm.user_id = v_challenger;
  select cm.rank_position into v_pos_defender
  from public.category_members cm
  where cm.court_id = p_court_id
    and cm.category_id = p_category_id
    and cm.user_id = p_defender_id;
  if v_pos_challenger is null or v_pos_defender is null then
    raise exception 'ranking_position_missing';
  end if;
  if v_pos_defender >= v_pos_challenger then
    raise exception 'invalid_challenge_target';
  end if;
  if v_pos_challenger - v_pos_defender > v_range then
    raise exception 'challenge_out_of_range';
  end if;
  insert into public.challenges (court_id, category_id, challenger_id, defender_id, status)
  values (p_court_id, p_category_id, v_challenger, p_defender_id, 'pending')
  returning id into v_challenge_id;
  return v_challenge_id;
end;
$$;

-- 6. RPC: respond_challenge
create or replace function public.respond_challenge(p_challenge_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c record;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select * into c from public.challenges where id = p_challenge_id;
  if c is null then
    raise exception 'challenge_not_found';
  end if;
  if c.defender_id != auth.uid() then
    raise exception 'not_authorized';
  end if;
  if c.status != 'pending' then
    raise exception 'invalid_status';
  end if;
  if p_action = 'accept' then
    update public.challenges
    set status = 'accepted', responded_at = now()
    where id = p_challenge_id;
  elsif p_action = 'reject' then
    update public.challenges
    set status = 'rejected', responded_at = now()
    where id = p_challenge_id;
  else
    raise exception 'invalid_action';
  end if;
end;
$$;

-- 7. RPC: report_match_v2
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
  v_match_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select * into c from public.challenges where id = p_challenge_id;
  if c is null then
    raise exception 'challenge_not_found';
  end if;
  if c.court_id != p_court_id or c.category_id != p_category_id then
    raise exception 'challenge_court_mismatch';
  end if;
  if c.status != 'accepted' then
    raise exception 'invalid_status';
  end if;
  if auth.uid() != c.challenger_id and auth.uid() != c.defender_id then
    raise exception 'not_authorized';
  end if;
  if p_winner_id is null or p_winner_id not in (c.challenger_id, c.defender_id) then
    raise exception 'invalid_winner';
  end if;
  v_loser := case when p_winner_id = c.challenger_id then c.defender_id else c.challenger_id end;
  v_played_at := coalesce(p_played_at, now());
  insert into public.matches (court_id, category_id, challenge_id, winner_id, loser_id, score, played_at, status, reported_by, reported_at)
  values (p_court_id, p_category_id, c.id, p_winner_id, v_loser, nullif(coalesce(p_score,''),''), v_played_at, 'pending_confirmation', auth.uid(), now())
  returning id into v_match_id;
  update public.challenges set status = 'completed', completed_at = now() where id = p_challenge_id;
  return v_match_id;
end;
$$;

-- 8. RPC: confirm_match_result
create or replace function public.confirm_match_result(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  m record;
  v_pos_winner int;
  v_pos_loser int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select * into m from public.matches where id = p_match_id;
  if m is null then
    raise exception 'match_not_found';
  end if;
  if m.status != 'pending_confirmation' then
    raise exception 'not_pending';
  end if;
  if auth.uid() = m.reported_by then
    raise exception 'not_authorized';
  end if;
  if auth.uid() != m.winner_id and auth.uid() != m.loser_id then
    raise exception 'not_authorized';
  end if;
  update public.matches
  set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
  where id = p_match_id;
  -- Atualizar ranking: se o winner for o challenger, trocar posições
  select cm.rank_position into v_pos_winner
  from public.category_members cm
  where cm.court_id = m.court_id and cm.category_id = m.category_id and cm.user_id = m.winner_id;
  select cm.rank_position into v_pos_loser
  from public.category_members cm
  where cm.court_id = m.court_id and cm.category_id = m.category_id and cm.user_id = m.loser_id;
  if v_pos_winner is not null and v_pos_loser is not null and v_pos_winner > v_pos_loser then
    update public.category_members
    set rank_position = v_pos_loser
    where court_id = m.court_id and category_id = m.category_id and user_id = m.winner_id;
    update public.category_members
    set rank_position = v_pos_winner
    where court_id = m.court_id and category_id = m.category_id and user_id = m.loser_id;
  end if;
end;
$$;

-- 9. RPC: dispute_match_result
create or replace function public.dispute_match_result(p_match_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  m record;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select * into m from public.matches where id = p_match_id;
  if m is null then
    raise exception 'match_not_found';
  end if;
  if m.status != 'pending_confirmation' then
    raise exception 'not_pending';
  end if;
  if auth.uid() != m.winner_id and auth.uid() != m.loser_id then
    raise exception 'not_authorized';
  end if;
  update public.matches
  set status = 'disputed', disputed_by = auth.uid(), dispute_reason = p_reason, disputed_at = now()
  where id = p_match_id;
end;
$$;

-- 10. GRANTS
revoke all on function public.get_ranking(uuid, uuid) from public;
revoke all on function public.get_king(uuid, uuid) from public;
revoke all on function public.create_challenge(uuid, uuid, uuid) from public;
revoke all on function public.respond_challenge(uuid, text) from public;
revoke all on function public.report_match_v2(uuid, uuid, uuid, uuid, text, timestamptz) from public;
revoke all on function public.confirm_match_result(uuid) from public;
revoke all on function public.dispute_match_result(uuid, text) from public;
revoke all on function public.is_category_member_in_court(uuid, uuid) from public;

grant execute on function public.get_ranking(uuid, uuid) to authenticated;
grant execute on function public.get_king(uuid, uuid) to authenticated;
grant execute on function public.create_challenge(uuid, uuid, uuid) to authenticated;
grant execute on function public.respond_challenge(uuid, text) to authenticated;
grant execute on function public.report_match_v2(uuid, uuid, uuid, uuid, text, timestamptz) to authenticated;
grant execute on function public.confirm_match_result(uuid) to authenticated;
grant execute on function public.dispute_match_result(uuid, text) to authenticated;
grant execute on function public.is_category_member_in_court(uuid, uuid) to authenticated;
