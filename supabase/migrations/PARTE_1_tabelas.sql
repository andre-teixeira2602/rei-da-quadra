-- PARTE 1: Adicionar colunas e criar índices nas tabelas existentes
-- Execute esta parte PRIMEIRO

-- Adicionar court_id a category_members
alter table public.category_members
add column if not exists court_id uuid references public.courts(id) on delete cascade;

-- Remover constraint antigo
alter table public.category_members
drop constraint if exists category_members_unique_rank_position;

-- Novo índice: rank_position único por (court_id, category_id)
create unique index if not exists category_members_unique_rank_position_v2
on public.category_members(court_id, category_id, rank_position)
where court_id is not null;

-- Índice: um usuário tem no máximo 1 posição por (court_id, category_id)
create unique index if not exists category_members_unique_user_per_court_category
on public.category_members(court_id, category_id, user_id)
where court_id is not null;

-- Índice para performance
create index if not exists category_members_by_court_category
on public.category_members(court_id, category_id, rank_position)
where court_id is not null;

-- Adicionar court_id a challenges
alter table public.challenges
add column if not exists court_id uuid references public.courts(id) on delete cascade;

-- Índices para challenges
create index if not exists challenges_by_court_category
on public.challenges(court_id, category_id, status);

create index if not exists challenges_by_court
on public.challenges(court_id, created_at desc);

-- Melhorar tabela courts
alter table public.courts
add column if not exists owner_id uuid references public.profiles(id) on delete set null;

alter table public.courts
add column if not exists is_public boolean not null default true;

alter table public.courts
add column if not exists description text;

-- Índices para courts
create index if not exists courts_by_is_public
on public.courts(is_public, created_at desc);

create index if not exists courts_by_owner
on public.courts(owner_id, created_at desc);

-- Criar tabela court_members
create table if not exists public.court_members (
  court_id uuid not null references public.courts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  constraint court_members_pk primary key (court_id, user_id)
);

-- Índice para court_members
create index if not exists court_members_by_user
on public.court_members(user_id, joined_at desc);

-- Habilitar RLS em court_members
alter table public.court_members enable row level security;

-- Policy RLS para court_members
drop policy if exists court_members_select_self on public.court_members;
create policy court_members_select_self
on public.court_members
for select
to authenticated
using (user_id = auth.uid());
