-- FIX: Corrigir chave primária de category_members para suportar múltiplas quadras
-- Problema: a PK era (category_id, user_id) sem court_id,
-- impedindo que um usuário participasse da mesma categoria em quadras diferentes.
-- Solução: alterar PK para (category_id, user_id, court_id)

-- 1. Remover a chave primária antiga
alter table public.category_members drop constraint if exists category_members_pk;

-- 2. Garantir que court_id não seja null antes de criar nova PK
-- (registros antigos sem court_id devem ser tratados antes)
-- alter table public.category_members alter column court_id set not null;
-- Nota: não forçamos NOT NULL aqui para não quebrar registros existentes sem court_id

-- 3. Adicionar nova chave primária incluindo court_id
-- Nota: como court_id pode ser null, usamos unique constraint em vez de PK
-- pois PostgreSQL não aceita NULL em chaves primárias
alter table public.category_members 
add constraint category_members_pk 
unique (category_id, user_id, court_id);

-- 4. Adicionar índice para performance nas queries de ranking
create index if not exists category_members_court_category_idx 
on public.category_members(court_id, category_id, rank_position);

-- 5. Atualizar a RPC join_court para usar a nova constraint
-- (já está correta no CREATE_join_court_rpc.sql com ON CONFLICT (category_id, user_id, court_id))
