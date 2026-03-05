-- Rei da Quadra — Migração 001: Suporte a Rankings por Quadra
-- Data: 2026-03-04
-- Objetivo: Adicionar court_id a category_members e challenges para criar rankings isolados por quadra

-- Adicionar court_id a category_members (com índices únicos)
alter table public.category_members
add column if not exists court_id uuid references public.courts(id) on delete cascade;

-- Remover constraint antigo (rank_position único por categoria)
alter table public.category_members
drop constraint if exists category_members_unique_rank_position;

-- Novo constraint: rank_position único por (court_id, category_id)
create unique index if not exists category_members_unique_rank_position_v2
on public.category_members(court_id, category_id, rank_position)
where court_id is not null;

-- Constraint: um usuário tem no máximo 1 posição por (court_id, category_id)
create unique index if not exists category_members_unique_user_per_court_category
on public.category_members(court_id, category_id, user_id)
where court_id is not null;

-- Índice para performance: listar membros por quadra + categoria
create index if not exists category_members_by_court_category
on public.category_members(court_id, category_id, rank_position)
where court_id is not null;

-- Adicionar court_id a challenges
alter table public.challenges
add column if not exists court_id uuid references public.courts(id) on delete cascade;

-- Índice para performance: listar desafios por quadra + categoria
create index if not exists challenges_by_court_category
on public.challenges(court_id, category_id, status);

-- Índice para listar desafios por quadra
create index if not exists challenges_by_court
on public.challenges(court_id, created_at desc);

-- Melhorar tabela courts
alter table public.courts
add column if not exists owner_id uuid references public.profiles(id) on delete set null;

alter table public.courts
add column if not exists is_public boolean not null default true;

alter table public.courts
add column if not exists description text;

-- Índice para listar quadras públicas
create index if not exists courts_by_is_public
on public.courts(is_public, created_at desc);

-- Índice para listar quadras por owner
create index if not exists courts_by_owner
on public.courts(owner_id, created_at desc);

-- Criar tabela court_members (para futuro controle de acesso)
create table if not exists public.court_members (
  court_id uuid not null references public.courts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  constraint court_members_pk primary key (court_id, user_id)
);

-- Índice para listar quadras de um usuário
create index if not exists court_members_by_user
on public.court_members(user_id, joined_at desc);

-- RLS para court_members
alter table public.court_members enable row level security;

drop policy if exists court_members_select_self on public.court_members;
create policy court_members_select_self
on public.court_members
for select
to authenticated
using (user_id = auth.uid());

-- Atualizar RLS policies para category_members (considerar court_id)
drop policy if exists category_members_select_members on public.category_members;

-- Nova policy: usuário vê membros apenas de quadras onde participa (ou públicas)
create policy category_members_select_members_v2
on public.category_members
for select
to authenticated
using (
  auth.uid() is not null
  and (
    (select is_public from public.courts where id = court_id) = true
    or exists (
      select 1 from public.court_members cm
      where cm.court_id = category_members.court_id
        and cm.user_id = auth.uid()
    )
  )
);

-- Atualizar RLS policies para challenges (considerar court_id)
drop policy if exists challenges_select_parties on public.challenges;

create policy challenges_select_parties_v2
on public.challenges
for select
to authenticated
using (
  auth.uid() is not null
  and (
    (select is_public from public.courts where id = court_id) = true
    or auth.uid() in (challenger_id, defender_id)
  )
);

-- Atualizar RLS policies para matches (considerar court_id)
drop policy if exists matches_select_members on public.matches;

create policy matches_select_members_v2
on public.matches
for select
to authenticated
using (
  auth.uid() is not null
  and (
    (select is_public from public.courts where id = court_id) = true
  )
);

-- Criar função helper: is_category_member_in_court
create or replace function public.is_category_member_in_court(p_court_id uuid, p_category_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.category_members cm
    where cm.court_id = p_court_id
      and cm.category_id = p_category_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
  );
$$;

-- Atualizar RPC: get_ranking (adicionar court_id)
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

-- Atualizar RPC: get_king (adicionar court_id)
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

-- Atualizar RPC: create_challenge (adicionar court_id)
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

-- Atualizar RPC: report_match_v2 (adicionar court_id, category_id)
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

-- Atualizar Grants (permissões para as novas RPCs)
revoke all on function public.get_ranking(uuid, uuid) from public;
revoke all on function public.get_king(uuid, uuid) from public;
revoke all on function public.create_challenge(uuid, uuid, uuid) from public;
revoke all on function public.is_category_member_in_court(uuid, uuid) from public;

grant execute on function public.get_ranking(uuid, uuid) to authenticated;
grant execute on function public.get_king(uuid, uuid) to authenticated;
grant execute on function public.create_challenge(uuid, uuid, uuid) to authenticated;
grant execute on function public.is_category_member_in_court(uuid, uuid) to authenticated;
