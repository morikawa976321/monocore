# monocore

AI coding agents: follow this file for build commands, architecture, code style, and design rules. This project is a minimalist Personal OS (schedules, inbox).

**See also:** `docs/DEVELOPMENT.md` · `README-design.md` · `docs/directory_structure.md`

---

## Build & Test

- Install: `npm install`
- Dev: `npm run dev`
- Test: `npm test` (Vitest, then `scraper/` pytest via `scripts/run-pytest.mjs`)
- DB migrations (local): `npx supabase migration up`
- DB migrations (remote): `npx supabase db push`
- Migration list: `npx supabase migration list`
- DB reset (local, **destructive**): `npx supabase db reset`

Reference: `docs/DEVELOPMENT.md` (Database Management, Testing)

---

## Architecture

- **Routing / pages:** `src/app/` — URL = folder; `page.tsx` per route. Use `(auth)` for route-grouping without URL.
- **UI components:** `src/components/` — `layout/` (Sidebar, Header), `ui/` (Button, …), `[feature]/` (e.g. DaySection).
- **Data / infra:** `src/lib/` — `lib/supabase/client.ts`, `server.ts`; **all DB access in `lib/supabase/queries/`** (e.g. `schedules.ts`, `inboxes.ts`). Do not put `supabase.from(...)` in `page.tsx`.
- **State / logic:** `src/hooks/` — e.g. `useSchedules` for fetch + loading + persistence orchestration.
- **Types:** `src/types/` — use generated `database.types.ts`; avoid `any`.
- **Auth gate:** `src/proxy.ts` (Next.js proxy; not `middleware.ts`).
- **Backend / DB:** `supabase/migrations/`, `supabase/config.toml`, `supabase/seed.sql`.

**Rule:** "Pages in `app`, UI in `components`, data functions in `lib`, state in `hooks`." When adding a feature: add/update migration → types → `lib/supabase/queries/*` → components → `app/**/page.tsx`.

Reference: `docs/directory_structure.md`

---

## Development Philosophy

1. **Schedules-centered Personal OS** — Schedules is the primary surface; Inbox is a companion panel on that page (not a peer route). Projects, Reports, and Finance are separate resources with their own routes.
2. **Form follows function / Cognitive load minimization** — No decorative animation; maximize information density and speed; minimize clicks.
3. **Focus on app logic** — Use `@supabase/ssr` fully; keep boilerplate minimal.
4. **Prioritize development speed above all** — In this solo, small-scale project, default decisions should favor faster implementation and iteration unless they introduce major product risk.

Reference: `docs/DEVELOPMENT.md` (Technology Stack, Development Philosophy)

---

## Screen Layout (PIM)

- **Navigation:** Left-edge, minimal width; **hover to reveal** sidebar on desktop (no always-visible nav). Mobile may use a compact FAB / drawer when hover is unavailable.
- **Detail / edit:** Prefer **inline editing** on the page. Source of truth is the React layout components (`src/components/layout/`).

---

## Code Style & Conventions

- **Exports:** Use `export function name() { }` / `export async function name() { }` for exported functions and React components. Do not use `export const name = () => { }` for those. Callbacks and short internal functions may use arrow functions. Constants (e.g. `metadata`, `config`) stay `export const`.
- **Tests:** Colocate with source: `filename.test.ts` or `filename.test.tsx` next to the implementation.
- **Test scope (small solo app):** Prioritize tests only for flows that are hard/time-consuming to verify manually, high-risk logic, and business-critical behavior. Avoid over-testing thin wrappers (e.g. PostgREST query chain stubs) or easily verifiable UI details.
- **Icons:** Use `lucide-react` only. Do not import icons from other packages.
- **Commits:** Use prefixes — `feat:`, `fix:`, `refactor:`, `docs:`, `chore:` (e.g. `feat: add search to inventory list`).

Reference: `docs/DEVELOPMENT.md` (development rules), `docs/directory_structure.md` (coding style)

---

## Design System

**Source of truth:** `README-design.md` (palette, typography, spacing, radius, Button/Input/Textarea rules, z-index, checklist).

Do not duplicate those rules here. Quick pointers for agents:

- Neutral + Amber (+ Red only for destructive/fatal); always `dark:` where applicable.
- No `shadow-*`; no arbitrary Tailwind `[…]` values; radius only `rounded-sm` / `rounded` (or `rounded-full` for circles).
- Use `src/components/ui/Button.tsx`, `Input.tsx`, and `Textarea.tsx` for standard controls (`color`/`size`/`variant` props; layout-only `className`).
- Before submitting UI: run the self-check list in `README-design.md` §10.

---

## Agent Behaviour Rules

- **Check `git log` before starting work.** The owner sometimes commits directly to this repo from Cursor while a Claude Code session is running (2026-07-17: 6 unrelated commits in two hours). Migrations and skills that assume an older schema break silently otherwise.
- **Work directly on local `main` and push it to `origin` without asking** (owner, 2026-10-23: 「以後はローカルのmainで直接作業してそのままリモートにpushしていい」). No feature branch or PR is needed. Still commit by path (`git add <path>` → `git commit -- <path>`), since other sessions share the index.
- **Every change gets a sol review before it is pushed** (owner, 2026-10-23: 「どの修正もsolレビューを受けてからPush」). Commit locally, run the Codex `review` role (`codex-role.cmd review`, see the codex-roles skill) on those commits, verify and fix the findings, then push. This includes migrations: apply them to the remote (`supabase db push`) only after the review, too.
- Do **not** put DB calls in `page.tsx`; use `lib/supabase/queries/` only.
- Do **not** rename existing classes/methods/files without explicit approval.
- Do **not** guess business logic — ask when unclear.
- Use exact file paths when referring to code. Prefer implementing over long summaries or READMEs.
- When in doubt, ask.

---

## Reference documents (paths)

| Path | Content |
|------|--------|
| `docs/DEVELOPMENT.md` | Tech stack, development philosophy, DB workflow, test setup, UI/UX requirements, commit rules |
| `README-design.md` | Design system (single source of truth) |
| `docs/directory_structure.md` | Directory map, folder roles, dev flow, operational rules, coding style (function declarations) |
| `docs/design.md` | Constraints the implementation must keep, and open questions |
| `docs/decisions.md` | Per-surface decisions and their reasons; criteria for adding/removing surfaces |
| `docs/database.md` | Supabase: service_role vs `auth.uid()`, migration workflow, `gen types`, observation, incidents |
| `docs/supabase-backup.md` | Periodic/manual backup, prod→local sync, recovery (including dead-tuple restore) |
