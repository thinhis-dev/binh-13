# Binh 13 — Enhancement Roadmap

> **Status:** Draft v1.0 · **Date:** 2026-07-18 · **Type:** Product/BA analysis
> Prioritized feature roadmap to take the game from "complete core loop" to "attractive, retainable product."
> Companion to [PLAN.md](../PLAN.md) — resolves open questions #8/#9/#10 sequencing.

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Technical Prerequisites](#2-technical-prerequisites)
3. [Theme A — Identity & Lightweight Auth](#3-theme-a--identity--lightweight-auth)
4. [Theme B — Lobby & Discovery](#4-theme-b--lobby--discovery)
5. [Theme C — Bot Mode](#5-theme-c--bot-mode)
6. [Theme D — Game Depth](#6-theme-d--game-depth)
7. [Theme E — UI & Polish](#7-theme-e--ui--polish)
8. [Theme F — Retention & Social](#8-theme-f--retention--social)
9. [Recommended Sequencing (Waves)](#9-recommended-sequencing-waves)
10. [Effort Legend & Summary Table](#10-effort-legend--summary-table)

---

## 1. Current State Assessment

### What already works (do not rebuild)

The core game loop is complete and tested:

- Room create/join via 6-char code, owner-only room settings (single / BO3 / BO5 / custom)
- Dealing, drag-and-drop arrangement with live hand evaluation, foul prevention in UI + server validation
- 60s round timer with auto-submit, reconnection handling, surrender with confirmation, rematch flow
- Shared evaluator/foul-check between client preview and server authority (`packages/shared`)

### What's missing (the gaps this document addresses)

| Gap | Consequence |
| --- | --- |
| No identity beyond a per-session name | No stats, no history, no recognition — every visit starts from zero |
| No room discovery | You cannot play without pre-arranging a friend and sharing a code out-of-band |
| No solo play | Empty-lobby cold start: new players find nobody to play and leave |
| Plain UI, no reveal drama | The emotional payoff of the comparison — the heart of Chinese Poker — is flat |
| Flat scoring, no naturals | Missing signature Binh rules ("mậu binh" instant wins) that make the variant feel authentic |

---

## 2. Technical Prerequisites

These are not features but blockers. **Wave 1 starts here.**

### P-1. Real database migrations (blocker for A, D, F)

`runMigrations` in `apps/server/src/db.ts` runs `DROP TABLE IF EXISTS` for every table on every server start — the DB is wiped on each deploy/restart. Fine for ephemeral rooms; fatal for accounts, stats, match history, and leaderboards.

**Required change:** replace drop-and-recreate with versioned incremental migrations (a `schema_version` table + ordered migration steps is enough; no framework needed for better-sqlite3). Keep the wipe behavior only for `DATABASE_PATH=:memory:` (integration tests depend on it).

### P-2. Decide open questions #8 and #10 from PLAN.md

- **#8 Bonus scoring** — proposed answer in [D-1](#d-1-bonus-scoring--naturals-mậu-binh) below.
- **#10 Spectator** — deferred to Wave 5 (see [D-3](#d-3-spectator-mode)); decision needed only on event visibility, not implementation.
- **#9 Four players** — explicitly deferred (see [D-4](#d-4-4-player-support)).

---

## 3. Theme A — Identity & Lightweight Auth

> Goal: players are *recognized*, not *authenticated*. Zero-friction first; opt-in account claim later.
> Explicitly **not** in scope: email verification, password reset flows, 2FA, sessions-across-team features.

### A-1. Persistent guest identity — **Effort: S — Wave 1**

- On first visit, server issues a long-lived device token (signed, stored in `localStorage`), bound to a new `players` row (id, display name, created_at).
- Subsequent visits restore identity automatically — name, stats, history all survive refresh and revisit.
- This covers ~80% of the value of "auth" with zero user friction. Ship it before any password work.
- Touches: new `players` table, extend session create/restore flow (`sessionStore.ts`, session events), migration from current per-session model.

### A-2. Claimable accounts (username + password) — **Effort: M — Wave 1 (stretch)**

- "Claim your account" form **on the profile page, not at the door** — binds a username + password to the existing guest `players` row from A-1. Guests who never register lose nothing; the game stays instant-play.
- Purpose: play the same identity across devices. Nothing else gates on it — if it slips, no downstream feature breaks.
- Scope, kept deliberately minimal:
  - bcrypt (or argon2) hash, unique username, login form. That's the whole feature.
  - **No email, no password reset** — state plainly in the UI: "forgotten passwords can't be recovered; it's a game account."
  - Basic rate limit on the login endpoint (in-memory counter is fine).
- Why not OAuth: for a hobby-scale game, minimal password auth is genuinely simpler — no Google Cloud console setup, no per-environment redirect-URI config, works on localhost with zero ceremony.
- **Anti-pattern to avoid:** building password auth *first* and hanging identity off it. That gates every feature behind registration friction and makes the guest flow an afterthought — backwards for a game whose pitch is "share a code, play instantly." A-1 always comes first.

### A-3. Player profile & basic stats — **Effort: S — Wave 1**

- Display name (editable), avatar from a preset set (no uploads — no moderation/storage burden).
- Stats: games played, wins, losses, fouls committed, 3-0 sweeps.
- Stats are computed from a new `match_results` table written at round resolution (also powers D-2 history and F-1 leaderboard — design the table once).

---

## 4. Theme B — Lobby & Discovery

> Goal: "I can always find a game" replaces "I need a friend and a code."

### B-1. Public room list — **Effort: M — Wave 2**

- New Lobby/Browse page: open public rooms with host name, game mode, seats filled, Join button.
- Add a **public/private toggle** to the existing `RoomSettingsModal` (default: private, to preserve current behavior).
- Server: `LOBBY_LIST` request event + `LOBBY_UPDATE` broadcast on room create/fill/close. Follow the AGENTS.md checklist (shared events + types, Zod schema, server handler, web wrapper).
- Guard: room disappears from list the moment the second seat fills or the game starts.

### B-2. Quick match — **Effort: S — Wave 2**

- "Play now" button: join the oldest open public room; if none, create a public room and wait.
- Nearly free once B-1 exists — it is one server-side query plus a button.

### B-3. Share-link join — **Effort: S — Wave 2**

- `/room/:code` URL pre-fills the join form (already sketched in PLAN.md Phase 4).
- Add a "Copy invite link" button in the room lobby. Cheapest acquisition feature on this list.

---

## 5. Theme C — Bot Mode

> Goal: solve the cold-start problem — there is always someone to play.
> The **arrangement solver (C-1) is the single highest-leverage build in this roadmap**: it powers bots, the suggest button, difficulty tiers, and daily puzzles (F-4).

### C-1. Arrangement solver — **Effort: M — Wave 3**

- Given 13 cards, enumerate candidate Back/Middle/Front splits, score each with the *existing* shared evaluators, prune fouls, rank by expected strength.
- Lives in `packages/shared` (pure function, no I/O) so both server bots and client suggestions use the identical implementation — same rationale as the shared 3-card evaluator.
- Full enumeration is 13C5 × 8C5 = 72,072 splits — trivially brute-forceable; no heuristics needed for v1.
- Ships with heavy unit tests (known deals → known best arrangements, never returns a foul when a non-foul exists).

### C-2. Play vs bot — **Effort: M — Wave 3**

- "Play vs Bot" from Home: creates a room with a server-side virtual player that receives a deal and submits via the normal game flow (no client socket needed — call into game manager directly, but reuse the same submit path so validation stays uniform).
- Difficulty from the solver for free:
  - **Easy** — random valid (non-foul) arrangement
  - **Medium** — top-N random pick from solver ranking
  - **Hard** — solver's best arrangement
- Bot "thinks" for a randomized 3–8s before submitting so it feels human.

### C-3. "Suggest arrangement" button — **Effort: S — Wave 3**

- One button in the game UI: auto-fill groups with the solver's best arrangement; player can still adjust before submitting.
- Huge new-player UX win and a permanent debugging surface for C-1.
- Optional setting: room owner can disable it for "purist" rooms (fits the existing room-settings pattern).

### C-4. Bot takeover on abandonment — **Effort: S — Wave 4+ (optional)**

- Opponent leaves mid-BO3/BO5 → offer "finish vs bot" instead of killing the series.
- Nice-to-have; only after C-2 is stable.

---

## 6. Theme D — Game Depth

### D-1. Bonus scoring & naturals ("mậu binh") — **Effort: M — Wave 4**

Resolves PLAN.md open question #8. Two layers:

1. **Bonus scoring:** 3-0 sweep = bonus (proposal: sweep counts double). Keep per-group scoring otherwise flat for v1.
2. **Naturals (instant wins, checked before arrangement):** the signature Binh rules —
   - **Dragon** (13-card straight A→2)
   - **Six pairs**
   - **Three flushes** (each group flush-capable)
   - **Three straights** (each group a straight; front 3-card straight counts here even though normal front scoring ignores straights)
- Implemented as a shared `naturalCheck.ts` next to `foulCheck.ts` (same client-preview/server-authority sharing rationale).
- Naturals should be a room setting (on/off) — some players consider them essential, others prefer pure arrangement play.

### D-2. Match & round history — **Effort: S — Wave 4**

- Per-room: round-by-round log on the Result screen for BO3/BO5 (already have `arrangements` rows; needs the `match_results` table from A-3).
- Per-player: "recent games" list on the profile once A-1 exists.

### D-3. Spectator mode — **Effort: M — Wave 5**

- Resolves open question #10. Join a room as a watcher: sees both boards only *after* reveal (or live with a delay) — never sees unrevealed hands (server must scope `HAND_DEAL` emission to players only; this is the entire security surface of the feature).
- Only valuable after B-1 makes rooms discoverable — hence Wave 5.

### D-4. 4-player support — **Effort: L — deferred (post-roadmap)**

- Open question #9. Data model anticipates it, but round-robin comparison (3 matchups/player), a 4-seat board layout, and lobby changes are each substantial. Every feature above delivers more value per unit effort. Revisit after Wave 5.

---

## 7. Theme E — UI & Polish

> Goal: give the comparison reveal — the emotional core of the game — the drama it deserves, and make the table feel like a place.

### E-1. Result reveal drama — **Effort: M — Wave 4 — highest-value polish item**

- Group-by-group staggered flip reveal (Front → Middle → Back), per-group win/lose flourish, final winner celebration.
- Framer Motion (already planned in PLAN.md Phase 4). Currently results just appear — this is the single biggest "feel" upgrade available.

### E-2. Deal animation & sound — **Effort: S — Wave 4**

- Cards animate from deck to hand on deal; sound stings for deal / submit / group win / match win. Mute toggle persisted in `localStorage`.

### E-3. Table identity & themes — **Effort: S — Wave 4**

- Felt-table background, 2–3 card-back designs, selectable per player (client-side preference only — no server work).

### E-4. Onboarding & cheat sheet — **Effort: S — Wave 3**

- First-game tooltip tour (drag here, foul rule, timer).
- Always-available hand-ranking cheat-sheet drawer — players constantly forget the 3-card front rules (no straights/flushes). Placed in Wave 3 alongside bot mode because both target new-player activation.

### E-5. Vietnamese localization — **Effort: S — Wave 4**

- VI/EN toggle. Given the game and its likely audience, this is disproportionately high-value for its cost. String count is small at this stage — do it before the string count grows.

### E-6. Emotes / quick chat — **Effort: S — Wave 4**

- 6–8 canned emotes (👍 😂 😱 "gg" …) as a socket event. **Deliberately not free-text chat** — canned emotes need no moderation, filtering, or abuse handling.

---

## 8. Theme F — Retention & Social

> All items require A-1 (identity) + P-1 (persistent DB). Wave 5.

### F-1. Leaderboard — **Effort: S**

- Weekly + all-time by wins (simple count for v1; ELO later only if ranked play emerges as a demand).

### F-2. Friends & direct invites — **Effort: M**

- Friend by player id/name, "invite to room" notification if online. Skippable until there's a real concurrent-player base.

### F-3. Win-rate / streak badges — **Effort: S**

- Profile badges (10-win streak, first dragon, foul-free week). Cheap engagement from data already collected by A-3.

### F-4. Daily puzzle — **Effort: M**

- "Arrange this deal optimally" — one fixed deal per day, scored against the C-1 solver's best. Shareable result (Wordle-style). Entirely powered by assets already built; strong daily-return hook.

---

## 9. Recommended Sequencing (Waves)

| Wave | Focus | Items | Why this order |
| --- | --- | --- | --- |
| **1 — Foundation** | Persistence & identity | P-1, A-1, A-3 (A-2 stretch) | Everything downstream needs a DB that survives restarts and a player that survives sessions |
| **2 — Acquisition** | Discovery | B-1, B-2, B-3 | Removes "need a friend + a code" barrier; smallest wave, ships fast after Wave 1 |
| **3 — Engagement** | Solo play & activation | C-1, C-2, C-3, E-4 | Solves cold start (always an opponent); solver is the highest-leverage single build |
| **4 — Depth & delight** | Authenticity & feel | D-1, D-2, E-1, E-2, E-3, E-5, E-6, C-4 | Makes wins *feel* like wins and the variant feel authentically Binh |
| **5 — Retention** | Coming back | F-1, F-3, F-4, D-3, F-2 | Only meaningful once Waves 2–3 create a player base |
| **Deferred** | — | D-4 (4-player) | Highest cost, and every item above delivers more value per effort |

**Strategic logic:** Waves 2 and 3 attack the two sides of the same problem — finding an opponent. B-x makes humans findable; C-x guarantees an opponent exists even when no humans are online. The C-1 solver is the roadmap's keystone asset: four separate features (C-2, C-3, difficulty tiers, F-4) fall out of one pure function.

---

## 10. Effort Legend & Summary Table

**S** ≈ ≤2 dev-days · **M** ≈ 3–7 dev-days · **L** ≈ 2+ weeks. Estimates assume one developer familiar with the codebase, tests included (per repo convention: new logic ships with tests).

| ID | Feature | Effort | Wave |
| --- | --- | --- | --- |
| P-1 | Real DB migrations (stop wiping on start) | S | 1 |
| A-1 | Persistent guest identity | S | 1 |
| A-3 | Player profile & stats | S | 1 |
| A-2 | Claimable accounts (username + password) | M | 1 (stretch) |
| B-1 | Public room list + public/private toggle | M | 2 |
| B-2 | Quick match | S | 2 |
| B-3 | Share-link join | S | 2 |
| C-1 | Arrangement solver (shared) | M | 3 |
| C-2 | Play vs bot (3 difficulties) | M | 3 |
| C-3 | Suggest-arrangement button | S | 3 |
| E-4 | Onboarding + cheat sheet | S | 3 |
| D-1 | Bonus scoring & naturals (mậu binh) | M | 4 |
| D-2 | Match & round history | S | 4 |
| E-1 | Result reveal animation | M | 4 |
| E-2 | Deal animation & sound | S | 4 |
| E-3 | Themes & card backs | S | 4 |
| E-5 | Vietnamese localization | S | 4 |
| E-6 | Emotes / quick chat | S | 4 |
| C-4 | Bot takeover on abandonment | S | 4+ |
| F-1 | Leaderboard | S | 5 |
| F-3 | Badges | S | 5 |
| F-4 | Daily puzzle | M | 5 |
| D-3 | Spectator mode | M | 5 |
| F-2 | Friends & invites | M | 5 |
| D-4 | 4-player support | L | Deferred |
