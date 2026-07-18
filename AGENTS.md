# monocore

AI coding agents: follow this file for build commands, architecture, code style, and design rules. This project is a minimalist Personal OS (schedules, inbox).

**See also:** `README.md` · `README-design.md` · `docs/directory_structure.md`

---

## Build & Test

- Install: `npm install`
- Dev: `npm run dev`
- Test: `npm test` (Vitest)
- DB migrations (local): `npx supabase migration up`
- DB migrations (remote): `npx supabase db push`
- Migration list: `npx supabase migration list`
- DB reset (local, **destructive**): `npx supabase db reset`

Reference: `README.md` (Database Management, Testing)

---

## Architecture

- **Routing / pages:** `src/app/` — URL = folder; `page.tsx` per route. Use `(auth)` for route-grouping without URL.
- **UI components:** `src/components/` — `layout/` (Sidebar, Header), `ui/` (Button, Input), `[feature]/` (e.g. ScheduleGrid).
- **Data / infra:** `src/lib/` — `lib/supabase/client.ts`, `server.ts`; **all DB access in `lib/supabase/queries/`** (e.g. `schedules.ts`, `inboxes.ts`). Do not put `supabase.from(...)` in `page.tsx`.
- **State / logic:** `src/hooks/` — e.g. `useSchedules` for fetch + loading.
- **Types:** `src/types/` — use generated `database.types.ts`; avoid `any`.
- **Backend / DB:** `supabase/migrations/`, `supabase/config.toml`, `supabase/seed.sql`.

**Rule:** "Pages in `app`, UI in `components`, data functions in `lib`, state in `hooks`." When adding a feature: add/update migration → types → `lib/supabase/queries/*` → components → `app/**/page.tsx`.

Reference: `docs/directory_structure.md`

---

## Development Philosophy

1. **Everything is a Resource** — Schedules, inbox items are equal resources.
2. **Form follows function / Cognitive load minimization** — No decorative animation; maximize information density and speed; minimize modals and clicks.
3. **Focus on app logic** — Use `@supabase/ssr` fully; keep boilerplate minimal.
4. **Prioritize development speed above all** — In this solo, small-scale project, default decisions should favor faster implementation and iteration unless they introduce major product risk.

Reference: `README.md` (Technology Stack, Development Philosophy)

---

## Screen Layout (PIM)

- **Navigation:** Left-edge, minimal width; **hover to reveal** sidebar (no always-visible nav). Avoid hamburger (extra click).
- **Detail / edit:** Prefer **center focus modal** (blurred backdrop, close with `Esc` or click outside). Use when viewing/editing a single item; avoid right-side sheet for long editing sessions.
- Apply this layout by default; deviate only when standard harms usability. Source of truth is the React layout components (`src/components/layout/`).

---

## Code Style & Conventions

- **Exports:** Use `export function name() { }` / `export async function name() { }` for exported functions and React components. Do not use `export const name = () => { }` for those. Callbacks and short internal functions may use arrow functions. Constants (e.g. `metadata`, `config`) stay `export const`.
- **Tests:** Colocate with source: `filename.test.ts` or `filename.test.tsx` next to the implementation.
- **Test scope (small solo app):** Prioritize tests only for flows that are hard/time-consuming to verify manually, high-risk logic, and business-critical behavior. Avoid over-testing thin wrappers or easily verifiable UI details.
- **Icons:** Use `lucide-react` only. Do not import icons from other packages.
- **Commits:** Use prefixes — `feat:`, `fix:`, `refactor:`, `docs:`, `chore:` (e.g. `feat: add search to inventory list`).

Reference: `README.md` (development rules), `docs/directory_structure.md` (coding style)

---

## Design System (Tailwind) — Strict

- **Theme:** "Simple & refined" (Material Design 3–inspired), professional tool; high information density, no heavy decoration.
- **Tailwind:** **Standard classes only.** No arbitrary values (e.g. `w-[123px]`, `rounded-[3px]`). No custom CSS for layout/color that could be done with Tailwind.
- **Colors:** **Neutral + Amber + transparent only.** No `white`/`black`; use `neutral-50` / `neutral-950`. Always provide `dark:` variants.
- **Shadow:** **No `shadow-*`.** Use borders and background contrast for elevation.
- **Radius:** **Only `rounded-sm` or `rounded`.** No `rounded-md`, `rounded-lg`, `rounded-xl` (except `rounded-full` for avatars/circles).
- **Typography:** Only `text-sm`, `text-base`, `text-lg`. Only `font-normal`, `font-medium`. No arbitrary sizes (e.g. `text-[13px]`).
- **Spacing:** Restrict to scale: `1`–`2` (micro), `4` (small), `6` (medium), `12` (large) for p/m/gap.
- **Animation:** No decorative `animate-*`. Use `transition-colors duration-150 ease-in-out`; prefer `hover:bg-*`, `active:bg-*`; focus with `focus-visible:ring-1 focus-visible:ring-neutral-900 dark:focus-visible:ring-neutral-50 focus-visible:outline-none` (or amber for primary actions). No `transition-all`.
- **DRY:** Set app-wide background, base text color, and base font size (`text-sm`) on the root layout (`src/app/layout.tsx` `<body>`). Pages only override where needed.

### Contrast Constraints (readability first)

- Prioritize legibility over visual subtlety. Ensure sufficient luminance contrast for body text, labels, and form values.
- **Text hierarchy usage:**
  - Primary: `text-neutral-900` / dark `text-neutral-50` for headings, body text, and primary action labels.
  - Secondary: `text-neutral-800` / dark `text-neutral-200` for supportive but still important information.
  - Tertiary: `text-neutral-700` / dark `text-neutral-300` for metadata only; avoid for long copy and primary actions.
  - Disabled: `text-neutral-500` only for inactive states and placeholders.
- **Interactive element visibility:**
  - Clickable elements (`button`, `a`, menu items) must be visually identifiable even at rest (via text/background/border contrast).
  - Active/selected states must raise contrast by at least one step versus default (prefer combining background + text and/or border changes).

### Palette (always with dark:)

- **Background:** App `bg-neutral-100` / dark `bg-neutral-950`. Surface `bg-neutral-50` / dark `bg-neutral-900`. Sub surface `bg-neutral-200` / dark `bg-neutral-800`.
- **Border:** `border-neutral-200` / dark `border-neutral-800`; focus `border-neutral-400` / dark `border-neutral-600`.
- **Text:** Primary `text-neutral-900` / dark `text-neutral-50`; secondary `text-neutral-800` / dark `text-neutral-200`; tertiary(meta) `text-neutral-700` / dark `text-neutral-300`; disabled `text-neutral-500`.
- **Accent (Amber):** Primary actions only, small area. Button: `bg-amber-500` hover `bg-amber-600` / dark `bg-amber-500` hover `dark:bg-amber-400`; text/icon `text-amber-600` / dark `text-amber-400`; ring/border `ring-amber-500` / dark `ring-amber-400`.

### Component templates

- **Primary button:** `bg-amber-500 text-neutral-50 hover:bg-amber-600 dark:bg-amber-500 dark:text-neutral-950 dark:hover:bg-amber-400` + `px-4 py-2 text-sm font-medium rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 dark:focus-visible:ring-amber-400`.
- **Secondary button:** `bg-neutral-200 border border-neutral-300 text-neutral-900 hover:bg-neutral-300 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-50 dark:hover:bg-neutral-700` + `px-4 py-2 text-sm font-medium rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-500 dark:focus-visible:ring-neutral-500`.
- **Danger button:** `bg-neutral-50 border border-red-800 text-red-800 hover:bg-neutral-100 hover:border-red-900 hover:text-red-900 dark:bg-neutral-900 dark:border-red-700 dark:text-red-400 dark:hover:bg-neutral-800 dark:hover:border-red-600 dark:hover:text-red-300` + `px-4 py-2 text-sm font-medium rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-700 dark:focus-visible:ring-red-500`.
- **Surface / card / dialog:** `bg-neutral-50 border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800` + `rounded p-4` or `p-6`.
- **Input / textarea:** `bg-neutral-50 border border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400` + dark variants (`dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-50 dark:placeholder:text-neutral-600 dark:focus:border-neutral-600 dark:focus:ring-neutral-600`) + `px-3 py-2 text-sm rounded-sm outline-none transition-colors`.

### Button Component Usage Rules

- Use `src/components/ui/Button.tsx` for all standard buttons. Prefer props (`color`, `size`) over direct visual class overrides.
- Keep `className` for layout-only concerns (e.g. `w-full`, `ml-auto`, `sm:hidden`, `fixed`, `z-10`).
- Do not override visual tokens via `className` (`bg-*`, `text-*`, `px-*`, `py-*`, `rounded-*`, `focus-visible:ring-*`) unless there is an explicit approved exception.
- If the same visual exception appears 3+ times, add a new `color`/`size` variant in `Button` instead of repeating local overrides.
- Keep semantic emphasis consistent: one `primary` action per view; use `secondary` for the rest.
- Required variants: `color` = `primary | secondary | danger`, `size` = `sm | md`.

### Self-check before submitting

1. No `shadow*` classes.
2. No `[ ]` arbitrary Tailwind values.
3. No `rounded-md` or larger (except `rounded-full` where needed).
4. Only `neutral`, `amber`, `red`, `transparent` for color (red is ONLY for cancellation confirmation or fatal errors); no `white`, `black`, `slate`, etc.
5. Every color/layout has `dark:` where applicable.
6. No decorative `animate-*` classes.

### z-index Layering Rule

- Do not assign `z-*` ad hoc. Use a fixed semantic scale:
  - `z-0`: regular page content
  - `z-10`: page-level fixed helpers (e.g. floating action button)
  - `z-20`: menu/backdrop overlays
  - `z-30`: navigation/drawer panels and nav triggers
  - `z-40`: modal backdrop
  - `z-50`: modal/dialog surface (top-most interactive layer)
- Keep ordering consistent: **backdrop < panel/dialog**.
- If a modal is open, interactive navigation elements must stay behind it.

Reference: `README-design.md`

---

## Agent Behaviour Rules

- Do **not** put DB calls in `page.tsx`; use `lib/supabase/queries/` only.
- Do **not** rename existing classes/methods/files without explicit approval.
- Do **not** guess business logic — ask when unclear.
- Use exact file paths when referring to code. Prefer implementing over long summaries or READMEs.
- When in doubt, ask.

---

## Reference documents (paths)

| Path | Content |
|------|--------|
| `README.md` | Tech stack, development philosophy, DB workflow, test setup, UI/UX requirements, commit rules |
| `README-design.md` | Design system detail (theme, constraints, palette, typography, spacing, radius, component templates, checklist) |
| `docs/directory_structure.md` | Directory map, folder roles, dev flow, operational rules, coding style (function declarations) |
