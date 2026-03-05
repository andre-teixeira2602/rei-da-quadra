-- FIX: Adicionar colunas faltantes à tabela courts

-- Adicionar colunas se não existirem
alter table public.courts
add column if not exists owner_id uuid references public.profiles(id) on delete set null,
add column if not exists is_public boolean not null default true,
add column if not exists description text;

-- Criar índice para owner_id
create index if not exists courts_owner_id_idx on public.courts(owner_id);

-- Atualizar RLS policies para considerar is_public e owner_id
drop policy if exists "courts_select_policy" on public.courts;

create policy "courts_select_policy" on public.courts
  for select using (
    is_public = true
    or owner_id = auth.uid()
    or auth.role() = 'authenticated'
  );

drop policy if exists "courts_insert_policy" on public.courts;

create policy "courts_insert_policy" on public.courts
  for insert with check (
    owner_id = auth.uid()
  );

drop policy if exists "courts_update_policy" on public.courts;

create policy "courts_update_policy" on public.courts
  for update using (
    owner_id = auth.uid()
  );

drop policy if exists "courts_delete_policy" on public.courts;

create policy "courts_delete_policy" on public.courts
  for delete using (
    owner_id = auth.uid()
  );

-- Grants
grant select on public.courts to authenticated;
grant insert on public.courts to authenticated;
grant update on public.courts to authenticated;
grant delete on public.courts to authenticated;
