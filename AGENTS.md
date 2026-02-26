# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

**Rei da Quadra** is a React + Vite frontend SPA for sports (tennis/padel) ranking and challenge management. It connects to **Supabase** (Postgres + Auth + RLS + RPCs) as its backend. See `README.md` for full architecture details.

### Running the app

- **Dev server**: `npm run dev` (default port 5173)
- **Lint**: `npm run lint`
- **Build**: `npm run build`

### Key caveats

- `@supabase/supabase-js` is imported in `src/supabase/client.js` but is **not declared in `package.json`**. The update script installs it explicitly. If the dependency is later added to `package.json`, the explicit install becomes a no-op.
- The app requires a `.env.local` file with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. If these environment variables are available in the shell (e.g., via Cursor Secrets), the update script writes them into `.env.local` automatically. Without real Supabase credentials, the app UI loads but authentication and data features (ranking, challenges, matches) will not function.
- `VITE_SUPABASE_URL` must be a full URL like `https://<project-ref>.supabase.co`, not a secret reference or token.
- The `createClient` call in `src/supabase/client.js` will throw if `VITE_SUPABASE_URL` is undefined — always ensure `.env.local` exists.
- The app has local mock state managed via `src/state/AppState.jsx` with `localStorage`. The dashboard page renders UI elements (arena, achievements, progress bar) even without Supabase auth, using this local state.
- No automated test suite exists in the repo (no test framework configured). Validation is done via lint, build, and manual QA.
- Protected routes (`/desafios`, `/perfil`, `/partidas`) require Supabase authentication. Without a test user account, these pages redirect to `/login`.
- All critical database operations use `SECURITY DEFINER` RPCs (see `supabase/schema.sql`). Direct table queries rely on RLS policies. When adding new data operations, prefer RPCs over direct queries for consistency.
