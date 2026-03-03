# Como aplicar as migrations Anti-Fraude no Supabase

Se o app mostra **"column matches.status does not exist"**, o banco ainda não tem as alterações. Siga estes passos no **mesmo projeto Supabase** que o app usa (`.env.local`).

---

## Passo 1 — Abrir o SQL Editor

1. Acesse [supabase.com](https://supabase.com) e faça login.
2. Abra o **projeto** do Rei da Quadra (o que está na URL do `VITE_SUPABASE_URL` ou `SUPABASE_URL` do seu `.env.local`).
3. No menu lateral: **SQL Editor** → **New query**.

---

## Passo 2 — Rodar a migration v1.0 (obrigatória)

1. Abra no seu computador o arquivo:
   ```
   rei-da-quadra/supabase/migrations/20260224_anti_fraud_v1.sql
   ```
2. Selecione **todo** o conteúdo (Ctrl+A) e copie (Ctrl+C).
3. No SQL Editor do Supabase, **cole** o conteúdo na query.
4. Clique em **Run** (ou Ctrl+Enter).
5. Aguarde terminar. Deve aparecer algo como "Success. No rows returned" ou mensagem de sucesso.
   - Se aparecer erro de "constraint already exists" ou "column already exists", pode ignorar (a migration é idempotente). O importante é não ter erro de "syntax error" ou "permission denied".

Depois disso:
- A tabela `matches` ganha as colunas `status`, `reported_by`, `confirmed_by`, etc.
- A tela **Partidas** deve carregar sem o erro "column matches.status does not exist".

---

## Passo 3 — (Opcional) Rodar a migration v1.1

Só faça isso se quiser **resolução de disputas por admin** e **auditoria**:

1. Nova query no SQL Editor.
2. Abra o arquivo:
   ```
   rei-da-quadra/supabase/migrations/20260224_anti_fraud_v1_1.sql
   ```
3. Copie todo o conteúdo, cole na query e execute **Run**.

Isso adiciona:
- Tabela `anti_fraud_events` e RPCs admin `void_match`, `resolve_dispute`.
- Tabela `app_admins` para definir quem é admin (você insere o `user_id` lá).

---

## Passo 4 — (Opcional) Fase 1 do Protocolo (limite diário, reputação, auto-confirm 24h)

1. Nova query no SQL Editor.
2. Abra o arquivo:
   ```
   rei-da-quadra/supabase/migrations/20260224_phase1_anti_fraud.sql
   ```
3. Copie todo o conteúdo, cole na query e execute **Run**.

Isso adiciona:
- **Regra 3:** limite de 2 desafios por dia e 5 ativos (flag `challenge_daily_limits_enabled`, OFF por padrão).
- **Reputation Score (0–10)** por jogador; exposto em `get_ranking` e no frontend (badge "Rep. X").
- **Auto-confirmar após 24h:** flag `auto_confirm_pending_after_24h` (OFF) + função `process_auto_confirm_pending_matches()`. Para funcionar, você precisa **agendar** essa função (a cada hora). No Supabase: pg_cron (se disponível) ou uma Edge Function chamando `supabase.rpc('process_auto_confirm_pending_matches')` via cron externo.

Para **ativar** depois:
```sql
-- Limite diário (2/dia, 5 ativos)
update public.app_flags set enabled = true where name = 'challenge_daily_limits_enabled';

-- Auto-confirmar partidas pendentes após 24h
update public.app_flags set enabled = true where name = 'auto_confirm_pending_after_24h';
```

---

## Conferindo se deu certo (v1.0)

No SQL Editor, rode:

```sql
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'matches'
order by ordinal_position;
```

Deve aparecer, entre outras, as colunas: `status`, `reported_by`, `confirmed_by`, `dispute_reason`, `reported_at`, `confirmed_at`, `disputed_at`, `disputed_by`.

---

## (Opcional) Cooldown 7 dias atrás de flag — para testes

Se aparecer **"recent_match_between_players"** ao desafiar (bloqueio de 7 dias entre o mesmo par), você pode desligar essa regra na fase de testes:

1. No SQL Editor, **nova query**.
2. Copie todo o conteúdo do arquivo:
   ```
   rei-da-quadra/supabase/migrations/20260224_anti_fraud_cooldown_flag.sql
   ```
3. Cole e execute **Run**.

Com isso:
- É criada a flag `pair_cooldown_7d_enabled` com valor **false** (desligada).
- O bloqueio de 7 dias só acontece quando essa flag estiver **true**.
- Na fase de testes você pode desafiar de novo sem esperar 7 dias.

Para **ligar** o cooldown em produção depois:

```sql
update public.app_flags set enabled = true where name = 'pair_cooldown_7d_enabled';
```

---

## (Opcional) Conferir ranking com reputação (Fase 1)

Se rodou a migration da Fase 1, a RPC `get_ranking` passa a retornar a coluna `reputation_score` (0–10). No app, cada jogador exibe um badge "Rep. X".

---

## Fluxo do app após a migration

- **Sem** `VITE_LEGACY_MATCH_FLOW=true`: o app usa confirmação dupla (reportar → pendente → o outro confirma).  
- **Com** `VITE_LEGACY_MATCH_FLOW=true`: fluxo legado (reportar partida atualiza ranking na hora).

---

## (Opcional) Módulo Quadras + Chat por Desafio — 2026-02-26

Para usar as páginas **Quadras** (/quadras, /quadras/nova) e o **Chat** nos desafios aceitos:

1. Nova query no SQL Editor.
2. Abra o arquivo: `rei-da-quadra/supabase/migrations/20260226_courts_chat_mvp.sql`
3. Copie todo o conteúdo, cole na query e execute **Run**.

Isso adiciona: colunas em `courts` (owner_id, phone, whatsapp, hours, price_info, lat, lng, is_public, updated_at), novas policies RLS em courts, tabela `challenge_messages` com RLS, e tentativa de habilitar Realtime. Se a publicação Realtime falhar por permissão, ative em **Database → Replication** no Dashboard.
