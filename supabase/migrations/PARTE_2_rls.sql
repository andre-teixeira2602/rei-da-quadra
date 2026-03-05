-- PARTE 2: Atualizar RLS Policies
-- Execute esta parte SEGUNDA

-- Atualizar RLS para category_members
drop policy if exists category_members_select_members on public.category_members;

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

-- Atualizar RLS para challenges
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

-- Atualizar RLS para matches
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
