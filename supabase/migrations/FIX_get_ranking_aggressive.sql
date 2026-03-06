-- FIX: Deletar agressivamente e recriar get_ranking com assinatura correta

-- 1. Deletar TODAS as versões da função get_ranking
drop function if exists public.get_ranking(uuid) cascade;
drop function if exists public.get_ranking(uuid, uuid) cascade;
drop function if exists public.get_ranking cascade;

-- 2. Aguardar um pouco para garantir que foi deletada
-- (comentário: em produção, o Supabase cuida disso)

-- 3. Recriar RPC get_ranking com assinatura correta (2 parâmetros)
create function public.get_ranking(p_court_id uuid, p_category_id uuid)
returns table (
  user_id uuid,
  display_name text,
  rank_position bigint,
  points bigint,
  wins bigint,
  losses bigint,
  is_you boolean
) as $$
begin
  return query
  select
    cm.user_id,
    p.display_name,
    row_number() over (order by cm.points desc, cm.wins desc) as rank_position,
    cm.points,
    cm.wins,
    cm.losses,
    cm.user_id = auth.uid() as is_you
  from category_members cm
  join profiles p on cm.user_id = p.id
  where cm.court_id = p_court_id
    and cm.category_id = p_category_id
  order by cm.points desc, cm.wins desc;
end;
$$ language plpgsql security definer;

-- 4. Atualizar grant para get_ranking
grant execute on function public.get_ranking(uuid, uuid) to authenticated;
grant execute on function public.get_ranking(uuid, uuid) to anon;

-- 5. Corrigir permissões de profiles para signup
-- Deletar políticas antigas se existirem
drop policy if exists "Users can insert their own profile" on profiles;
drop policy if exists "Users can update their own profile" on profiles;
drop policy if exists "Users can read their own profile" on profiles;
drop policy if exists "Users can read other profiles" on profiles;

-- Criar novas políticas
create policy "Users can insert their own profile" on profiles
  for insert with check (auth.uid() = id);

create policy "Users can update their own profile" on profiles
  for update using (auth.uid() = id);

create policy "Users can read their own profile" on profiles
  for select using (auth.uid() = id);

create policy "Users can read other profiles" on profiles
  for select using (true);

-- 6. Garantir que o role anon pode inserir em profiles (para signup)
grant insert on profiles to anon;
grant select on profiles to anon;
grant update on profiles to anon;

-- 7. Criar trigger para auto-inserir profile na criação de usuário
-- Deletar trigger antigo se existir
drop trigger if exists on_auth_user_created on auth.users;

-- Deletar função antiga se existir
drop function if exists public.handle_new_user();

-- Criar função nova
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, email)
  values (new.id, new.email, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Criar novo trigger
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
