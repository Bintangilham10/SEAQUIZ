# QR Quiz Battle

Mini realtime quiz app (Quizizz-style) built with:

- Next.js 14+ App Router
- TypeScript
- Tailwind CSS
- Supabase (Postgres + Realtime)

Targeted for zero-budget deployment on:

- Vercel (frontend + API route handlers)
- Supabase Free Tier (database + realtime)

## Product Summary

`QR Quiz Battle` provides room-based realtime quiz sessions:

- Host creates a room and gets 6-char room code + QR.
- Players scan QR (`/r/<room_code>`) and join as guests.
- Questions run simultaneously with timer.
- Score updates live.
- Final room ranking shown at game end.
- Global leaderboard shows Top 10 all-time players.

## File Tree

```txt
.
|-- .env.example
|-- .gitignore
|-- README.md
|-- next.config.mjs
|-- package.json
|-- postcss.config.mjs
|-- tailwind.config.ts
|-- tsconfig.json
|-- supabase
|   |-- seed.sql
|   `-- migrations
|       `-- 202603050001_init_qr_quiz_battle.sql
`-- src
    |-- app
    |   |-- api
    |   |   |-- answers
    |   |   |   `-- submit/route.ts
    |   |   |-- host
    |   |   |   |-- login/route.ts
    |   |   |   |-- logout/route.ts
    |   |   |   `-- session/route.ts
    |   |   |-- leaderboard/route.ts
    |   |   `-- rooms
    |   |       |-- create/route.ts
    |   |       |-- join/route.ts
    |   |       |-- next/route.ts
    |   |       |-- start/route.ts
    |   |       `-- [roomCode]/state/route.ts
    |   |-- host/page.tsx
    |   |-- leaderboard/page.tsx
    |   |-- r/[roomCode]/page.tsx
    |   |-- globals.css
    |   |-- layout.tsx
    |   |-- not-found.tsx
    |   `-- page.tsx
    |-- components
    |   |-- host/host-console.tsx
    |   |-- host/host-login-form.tsx
    |   |-- player/player-room.tsx
    |   `-- shared
    |       |-- button.tsx
    |       |-- join-room-form.tsx
    |       |-- panel.tsx
    |       `-- status-badge.tsx
    `-- lib
        |-- client-storage.ts
        |-- constants.ts
        |-- env
        |   |-- public.ts
        |   `-- server.ts
        |-- types.ts
        |-- use-room-realtime.ts
        |-- utils.ts
        |-- server
        |   |-- host-auth.ts
        |   |-- http.ts
        |   `-- room-snapshot.ts
        `-- supabase
            |-- browser.ts
            `-- server.ts
```

## Realtime Strategy (Why this approach)

This project uses **Supabase Realtime Postgres Changes** for:

- `rooms` (status change, current question index, timer start)
- `room_players` (join lobby, score updates)
- `room_answers` (answer submissions)

Reason:

- No custom websocket server needed (fits zero-budget).
- State source remains in Postgres tables.
- Host and players subscribe to same DB events for consistent live sync.

## Scoring Rules

Per question:

- Correct answer: `base = 100`
- Speed bonus: `floor((remaining_seconds / time_limit_seconds) * 50)`, minimum `0`
- Final score: `100 + bonus` if correct, else `0`

Server validation happens in `/api/answers/submit` using:

- `room.question_started_at`
- current room question index
- current question `time_limit_seconds`

## Security Model (Showcase-level)

- Host login gate (cookie session) for `/host` and host actions.
- Host auth: random `host_token` (stored hashed with SHA-256 in DB), raw token only in host localStorage.
- Player identity: `guest_id` generated on client and stored in localStorage.
- Sensitive actions (`start`, `next`, `submit answer`) go through Next.js route handlers (server gate).
- RLS enabled on all quiz tables with baseline policies:
  - read policies for public quiz/runtime data
  - player insert restricted to valid lobby room and max 50 players
  - answer insert restricted to players belonging to room

## Supabase Setup

1. Create a new Supabase project (Free tier).
2. Open SQL Editor.
3. Run migration:
   - `supabase/migrations/202603050001_init_qr_quiz_battle.sql`
4. Run seed data:
   - `supabase/seed.sql`
5. In Supabase Project Settings -> API, copy:
   - Project URL
   - `anon` key
   - `service_role` key

## Environment Variables

Copy `.env.example` to `.env.local` and fill values:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
HOST_LOGIN_USERNAME=...
HOST_LOGIN_PASSWORD=...
HOST_AUTH_SECRET=...
```
Set `HOST_LOGIN_USERNAME` and `HOST_LOGIN_PASSWORD` with your own secret credentials.

## Run Locally

```bash
npm install
npm run dev
```

Open:

- `http://localhost:3000` landing
- `http://localhost:3000/host` host console
- `http://localhost:3000/leaderboard` global leaderboard

## Deploy to Vercel (Free)

1. Push repo to GitHub.
2. Import repo into Vercel.
3. Add environment variables in Vercel Project Settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `HOST_LOGIN_USERNAME` (optional)
   - `HOST_LOGIN_PASSWORD` (optional)
   - `HOST_AUTH_SECRET` (recommended)
4. Deploy.
5. Verify host QR uses deployed domain for player joins.

## Manual Testing Checklist (Realtime + Scoring)

1. Open `/host` and click **Create Room**.
2. Confirm room code appears (6 chars A-Z0-9) and QR rendered.
3. Open player page `/r/<room_code>` in another browser/device.
4. Join with guest name and verify host sees player count update live.
5. Join second/third player and verify all appear in lobby list live.
6. Click **Start Game** as host and verify all players move from waiting room to question view.
7. Submit a correct answer quickly and verify score > 100 (with speed bonus).
8. Submit wrong answer and verify awarded score is `0`.
9. Try submitting same question twice and verify it is rejected/locked.
10. Wait timer hit `0` without clicking next and verify host auto-advances.
11. Continue until finish and verify room status changes to `finished` for all clients.
12. Open `/leaderboard` and verify finished game updates Top 10 global entries.

## Notes

- Max players per room: `50`.
- Guest-only mode is implemented (Auth optional, not required).
- Demo quiz seed contains 10 multiple-choice questions.
