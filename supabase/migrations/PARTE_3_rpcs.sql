-- PARTE 3: Atualizar RPCs (Funções)
-- Execute esta parte TERCEIRA

-- RPC 1: get_ranking (com court_id)
drop function if exists public.get_ranking(uuid);

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

  if not public.is_category_member_in_court(p_court_id, p_category_id) then
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
  where cm.court_id = p_court_id
    and cm.category_id = p_category_id
    and cm.status = 'active'
  order by cm.rank_position asc;
end;
$$;

-- RPC 2: get_king (com court_id)
drop function if exists public.get_king(uuid);

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

  if not public.is_category_member_in_court(p_court_id, p_category_id) then
    raise exception 'not_authorized';
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

-- RPC 3: create_challenge (com court_id)
drop function if exists public.create_challenge(uuid, uuid);

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

-- Atualizar Grants
revoke all on function public.get_ranking(uuid, uuid) from public;
revoke all on function public.get_king(uuid, uuid) from public;
revoke all on function public.create_challenge(uuid, uuid, uuid) from public;
revoke all on function public.is_category_member_in_court(uuid, uuid) from public;

grant execute on function public.get_ranking(uuid, uuid) to authenticated;
grant execute on function public.get_king(uuid, uuid) to authenticated;
grant execute on function public.create_challenge(uuid, uuid, uuid) to authenticated;
grant execute on function public.is_category_member_in_court(uuid, uuid) to authenticated;
