# Rei da Quadra (Web) — MVP real (Supabase)

Frontend em **React + Vite** consumindo **Supabase (Postgres + RLS + RPC)**.

## Requisitos

- Node.js (LTS recomendado)
- Projeto Supabase configurado (URL + anon key)

## Configuração de ambiente

Crie/edite o arquivo `.env.local` na pasta `rei-da-quadra/`:

```bash
VITE_SUPABASE_URL="https://<seu-projeto>.supabase.co"
VITE_SUPABASE_ANON_KEY="<sua-anon-key>"
```

## Rodar o app

```bash
npm install
npm run dev
```

## Aplicar o SQL (schema + RLS + RPC)

1) Abra o **Supabase Dashboard** → **SQL Editor**
2) Cole o conteúdo de `supabase/schema.sql`
3) Execute (Run)

O schema cria:
- tabelas: `profiles`, `categories`, `courts`, `category_members`, `challenges`, `matches`
- trigger: `auth.users` → `profiles`
- RLS em todas as tabelas
- RPCs: `get_ranking`, `get_king`, `create_challenge`, `respond_challenge`, `report_match`

### Categoria padrão do MVP

O seed cria a categoria:
- **Categoria B** com id fixo: `00000000-0000-0000-0000-00000000000b`

O frontend usa esse mesmo id (ver `src/config/mvp.js`).

## Seed manual (membros do ranking)

Depois de criar usuários em **Authentication → Users**, pegue os UUIDs e insira membros na Categoria B:

```sql
insert into public.category_members (category_id, user_id, rank_position, status)
values
  ('00000000-0000-0000-0000-00000000000b', '<USER_A_UUID>', 4, 'active'),
  ('00000000-0000-0000-0000-00000000000b', '<USER_B_UUID>', 2, 'active');
```

Regras importantes:
- `rank_position` deve ser **única** dentro da categoria
- `status = 'active'` para aparecer no ranking

## Admin (fora do cliente): gerenciar membros/posições

O app **não** expõe UI de admin para `category_members`. Para administrar com segurança:

1) Supabase Dashboard → **SQL Editor**
2) Use os scripts em `supabase/admin.sql` para:
   - adicionar membros no fim do ranking
   - ativar/inativar
   - trocar posições (swap transacional)
   - resequenciar posições (1..n)

### Criar categorias novas (C, D, Iniciantes)

No SQL Editor, use os inserts em `supabase/admin.sql` (seção “Criar categorias adicionais”).
Depois, o dropdown **Categoria** no app lista automaticamente.

### Cadastrar quadras (courts)

No SQL Editor, use os inserts em `supabase/admin.sql` (seção “Cadastrar quadras”).
No app, ao registrar partida em `/partidas`, você pode selecionar uma quadra (opcional).

## Perfil / Apelido (obrigatório)

No primeiro login (ou se o apelido for inválido), o app força `/perfil` para o usuário definir um apelido:
- 3 a 20 caracteres
- apenas letras/números/underscore
- não pode ser igual ao prefixo do email

## Fluxo MVP (manual QA)

1) Crie 2 usuários no Supabase Auth (A e B)
2) Insira ambos em `category_members` na Categoria B com posições distintas (ex.: A=4, B=2)
3) Logue como A:
   - `/ranking` deve carregar o ranking real e marcar sua posição
   - A deve conseguir desafiar B se B estiver até 3 posições acima (diferença <= 3)
4) Logue como B:
   - `/desafios` → “Contra mim” → aceitar
5) Logue como A:
   - `/desafios` → desafio aceito → “Registrar partida”
   - informe placar e data/hora → confirmar
   - se A venceu, o ranking troca posições automaticamente
6) Verifique `/ranking` atualizado e `/partidas` com o histórico
7) Pressione **F5**: a sessão deve permanecer (o client está configurado com `sessionStorage`)

## Notas de segurança (RLS)

- Leitura do ranking via RPC `get_ranking` exige ser **membro ativo** da categoria (server-side).
- `challenges` só é visível para quem é `challenger` ou `defender`.
- Escrita crítica (criar/aceitar/registrar partida) é feita via **RPC SECURITY DEFINER** com validações.
- Não use `service_role` no frontend.
