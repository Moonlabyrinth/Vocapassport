# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Korean-language web app for a vocabulary-test academy (단어시험 관리): teachers enter scores, students log in to see their own scores/retests, plus monthly tests (먼슬리) tracked separately. Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 3. Deployed on Vercel with a Neon (Postgres) database; also runs fully locally against a JSON file. **UI text, comments, and commit messages are Korean.**

## Commands

```bash
npm install            # first time
npm run dev            # dev server (Turbopack off), http://localhost:3000
npm run build          # production build (also runs typecheck + eslint)
npm start              # serve the production build
npm run lint           # next lint
npx tsc --noEmit       # typecheck only (fast; do this after edits)
```

- **Non-technical launch (Windows):** `시작하기.bat` — installs/builds if needed, runs `next start`, opens the browser. The `.bat` must stay **pure ASCII** (Korean in it breaks under cp949 cmd) and bakes in `DATABASE_URL` so local runs share the same Neon data as the website.
- **"Tests"** are standalone integration scripts in `scripts/` run with Node against a **running** dev/prod server, e.g. `node scripts/monthly-test.mjs`. They authenticate by signing a session cookie with the local `data/secret.key` (or `AUTH_SECRET`). Run a single one by invoking that file. `smoke-test.mjs` (core flow), `auth-smoke.mjs` (auth/scoping), `monthly-test.mjs`, `passkind-test.mjs`, `neon-mode-test.mjs` (needs `DATABASE_URL`).
- **Excel import:** `node scripts/xlsx-import.mjs` rebuilds `data/db.json` from the teacher's spreadsheet (uses `@e965/xlsx`, a SheetJS fork). `xlsx-inspect.mjs`/`xlsx-analyze.mjs` are exploration helpers. Destructive (backs up first).

### Deploy (Vercel, needs the owner's token)

```bash
npx vercel@latest deploy --prod --yes --scope lindsay-ha-s-projects --token <vcp_...>
```

- Public production URL is the alias `https://word-test-manager-flame.vercel.app` (the per-deploy `*-xxxx.vercel.app` URLs are blocked by Deployment Protection — don't test those).
- Env vars (`DATABASE_URL`, `AUTH_SECRET`) live in Vercel. **Setting them via `vercel env add` + stdin pipe silently stores an empty value** — use the REST API instead: `POST https://api.vercel.com/v10/projects/<id>/env?upsert=true&slug=<scope>`.
- Vercel **refuses to deploy known-vulnerable Next.js versions**; keep Next current if a deploy fails on that.

## Architecture

### Storage is dual-mode — the key abstraction (`src/lib/db.ts`)

The **entire database is one JSON object** (`Database` in `types.ts`). `db.ts` picks a backend at runtime:

- **`DATABASE_URL` set → Neon Postgres.** Whole DB stored as one `jsonb` row in `app_state` (single row id=1) with an integer `version` for optimistic concurrency (read → mutate → `UPDATE ... WHERE version=$old`, retry on conflict). Photos go in a `photos` table (base64 text).
- **unset → local file.** `data/db.json` + `data/uploads/`, with an in-process write queue.

Both expose the same interface: `getDB()`, `mutate(fn)`, `savePhoto`, `getPhoto`, `genId`. `getDB()` spreads `...emptyDatabase()` so **new top-level collections auto-migrate** (old rows just get empty arrays). Routes never touch a DB backend directly — always go through these.

### Command/action pattern — all writes go through one reducer

- Reads: `GET /api/state` → role-scoped snapshot.
- Writes: `POST /api/command` with `{ type, ...payload }` → `applyAction(db, action)` in `src/lib/actions.ts` mutates the in-memory `Database` inside `mutate()`.
- **`src/lib/actions.ts` must not import any node-only module** (no `fs`, no `crypto`, no `db.ts`). It's imported by client code for the `Action` union types. Anything needing hashing/secrets/db lives in route handlers instead.

### Auth & authorization (`src/lib/auth.ts`)

- Two roles: `teacher` (single account, password in `settings`) and `student` (per-student `loginId` = the student's name, password). scrypt hashing.
- Session = **HMAC-signed httpOnly cookie** (`wtm_session`), stateless. Secret from `AUTH_SECRET` env, else `data/secret.key` file (local).
- `authorizeAction(db, session, action)` gates `/api/command`: teacher → everything; student → only `scheduleRetest`/`cancelRetest` **on their own records** (default-deny). Teacher-only credential issuance is a separate route, `POST /api/admin`.

### Scoping is a security boundary (`src/lib/scope.ts`)

`/api/state` returns a **role-scoped `Database`**: `teacherView` = everything but with password hashes stripped; `studentView` = only that student's records/retests/monthly results + their class. Password hashes/salts and the teacher password must **never** reach the client — `sanitizeStudent` enforces this. When adding fields, decide explicitly what a student is allowed to see.

### Domain model — two independent test systems (`src/lib/types.ts`)

- **Word tests:** `ScoreRecord` (per attempt) + `RetestSchedule`. Has `round` (회독 1–3), `session` (Day grouping), `attemptType` (first/retest), `passMarkUsed`, `passedOverride`, `passKind`.
- **Monthly tests:** `MonthlyTest` (name + date + `sections[{key,label,maxScore}]`) + `MonthlyResult` (per student, `scores` keyed by section). Score-only, no pass/retest.
- These are **deliberately separate** so statistics never mix. Keep word-test and monthly logic/UI apart.

### Pass判정 & stats (`src/lib/logic.ts`)

- Pass = manual override if present, else auto. Auto uses the book's **absolute `passMark`** (점수 이상 통과) when set, else a percentage `passThreshold` (book > class fallback). Scores allow one decimal (`.5`); do not `Math.round` them away.
- `passKind`: `main`/`retest`/`exempt` is the teacher's manual classification. **`exempt` (면제) is neutral** — `computeStreaks`/`avgPercent` skip it entirely (not counted as pass or fail, doesn't break streaks).
- Reward/summer-term stats (`computeRewardStats`) only count `attemptType === "first"` records on/after `REWARD_START_DATE` (`2026-06-10`).

### Frontend wiring (`src/lib/client.ts`, `src/app/page.tsx`)

`useAppState()` fetches `/api/state`, exposes `{ status, role, user, db, run, reload }`. `run(action)` POSTs to `/api/command` then reloads. `page.tsx` routes by `status`/`role`: unauth → `Login`, teacher → `TeacherApp` (점수입력 / 재시험 / 통계 / 먼슬리 / 관리 tabs), student → `StudentApp`.

### Korean input — non-obvious gotcha

Native React controlled inputs **garble Korean IME composition**. Use the **uncontrolled** `TextInput` from `ui.tsx` (ref + `defaultValue`, commits on `compositionend`) for any Korean text field. Native `<input type="date">` can't start the week on Sunday → use the custom `DatePicker` component (Sunday-first) instead, which is already wired into every date field.

## Conventions

- Data file (`/data`) is git-ignored and **not deployed** (contains password hashes); the cloud uses Neon. After verifying with a temp teacher password locally, restore `data/db.json` so the real password is untouched.
- New domain actions: add to the `Action` union + a `case` in `applyAction`, add authorization if a student could call it, and include the data in `teacherView`/`studentView` as appropriate.
- Match existing Korean comments/naming and the small UI primitives in `ui.tsx` (Card, Button, Field, Input, Select, Badge, Modal, Stat) rather than raw elements.
