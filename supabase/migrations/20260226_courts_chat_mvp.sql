-- ============================================================================
-- Rei da Quadra — Módulo Quadras + Chat por Desafio (MVP)
-- Data: 2026-02-26
--
-- PARTE 1: Atualizar public.courts (colunas, índices, trigger, RLS)
-- PARTE 2: Tabela public.challenge_messages + RLS
-- PARTE 3: Realtime para challenge_messages
--
-- Regras: idempotente (IF NOT EXISTS, DO $$ EXCEPTION $$), não alterar
-- lógica Anti-Fraude, backward-compatible, não renomear/remover tabelas existentes.
-- ============================================================================

-- =============================================================================
-- PARTE 1 — MÓDULO DE QUADRAS
-- =============================================================================

-- 1.1 Colunas adicionais em public.courts (apenas se não existirem)
alter table public.courts add column if not exists owner_id uuid references public.profiles(id) on delete set null;
alter table public.courts add column if not exists phone text;
alter table public.courts add column if not exists whatsapp text;
alter table public.courts add column if not exists hours text;
alter table public.courts add column if not exists price_info text;
alter table public.courts add column if not exists lat numeric;
alter table public.courts add column if not exists lng numeric;
alter table public.courts add column if not exists is_public boolean not null default true;
alter table public.courts add column if not exists updated_at timestamptz not null default now();

-- Índices para listagem/busca
create index if not exists courts_city_active_idx on public.courts(city, is_active);
create index if not exists courts_public_idx on public.courts(is_public, is_active);

-- Trigger updated_at (modelo app_flags)
create or replace function public.set_courts_updated_at()
returns trigger
language plpgsql
as $func$
begin
  new.updated_at := now();
  return new;
end;
$func$;

drop trigger if exists trg_courts_updated_at on public.courts;
create trigger trg_courts_updated_at
before update on public.courts
for each row
execute function public.set_courts_updated_at();

-- Garantir owner_id = auth.uid() em INSERT (evita spoof)
create or replace function public.set_courts_owner_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $func$
begin
  if auth.uid() is not null then
    new.owner_id := auth.uid();
  end if;
  return new;
end;
$func$;

drop trigger if exists trg_courts_owner_on_insert on public.courts;
create trigger trg_courts_owner_on_insert
before insert on public.courts
for each row
execute function public.set_courts_owner_on_insert();

-- 1.2 RLS para courts
alter table public.courts enable row level security;

-- Remover policy antiga de SELECT (era: authenticated vê tudo)
drop policy if exists courts_select_auth on public.courts;

-- SELECT: apenas courts is_public = true AND is_active = true
create policy courts_select_public_active
on public.courts
for select
to authenticated
using (
  auth.uid() is not null
  and is_public = true
  and is_active = true
);

-- SELECT: dono pode ver suas próprias quadras (para listagem "minhas quadras" e edição)
create policy courts_select_owner
on public.courts
for select
to authenticated
using (owner_id = auth.uid());

-- INSERT: authenticated; owner_id será preenchido pelo trigger (com check abaixo)
create policy courts_insert_authenticated
on public.courts
for insert
to authenticated
with check (auth.uid() is not null and (owner_id is null or owner_id = auth.uid()));

-- UPDATE: apenas dono
create policy courts_update_owner
on public.courts
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- DELETE: apenas dono
create policy courts_delete_owner
on public.courts
for delete
to authenticated
using (owner_id = auth.uid());

-- Grants: permitir insert/update/delete para authenticated (select já existia)
grant insert, update, delete on table public.courts to authenticated;

-- =============================================================================
-- PARTE 2 — CHAT POR DESAFIO
-- =============================================================================

-- Helper: usuário é challenger ou defender do desafio
create or replace function public.is_challenge_party(p_challenge_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.challenges c
    where c.id = p_challenge_id
      and auth.uid() is not null
      and auth.uid() in (c.challenger_id, c.defender_id)
  );
$$;

revoke all on function public.is_challenge_party(uuid) from public;
grant execute on function public.is_challenge_party(uuid) to authenticated;

-- Tabela de mensagens
create table if not exists public.challenge_messages (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now(),
  constraint challenge_messages_message_nonempty check (length(trim(message)) > 0)
);

create index if not exists challenge_messages_challenge_idx
on public.challenge_messages(challenge_id, created_at desc);

alter table public.challenge_messages enable row level security;

-- SELECT: apenas challenger ou defender do desafio
create policy challenge_messages_select_party
on public.challenge_messages
for select
to authenticated
using (public.is_challenge_party(challenge_id));

-- INSERT: apenas participante do desafio; sender_id deve ser auth.uid()
create policy challenge_messages_insert_party
on public.challenge_messages
for insert
to authenticated
with check (
  public.is_challenge_party(challenge_id)
  and sender_id = auth.uid()
);

-- Sem policy de UPDATE/DELETE (mensagem imutável)
-- Não criar policy para update ou delete = negado por padrão

revoke all on table public.challenge_messages from anon, authenticated;
grant select, insert on table public.challenge_messages to authenticated;

-- =============================================================================
-- PARTE 3 — REALTIME
-- =============================================================================
-- Habilitar a tabela na publicação do Realtime (Supabase).
-- Se falhar por permissão, habilitar manualmente em Dashboard > Database > Replication.
do $$
begin
  alter publication supabase_realtime add table public.challenge_messages;
exception
  when duplicate_object then null; -- já está na publicação
  when insufficient_privilege then null; -- rodar manualmente ou via Dashboard
  when others then null; -- não quebrar migração
end
$$;
