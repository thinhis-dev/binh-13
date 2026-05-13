# Game Logic Engine — Shuffling, Ranking & Realtime

**Scope:** Implement the complete game engine: deck shuffling, card dealing, hand evaluation (3-card & 5-card), foul validation, round comparison, and realtime game flow via Socket.io.  
**Phase:** Phase 2 (Card Engine) per PLAN.md  
**Depends on:** Phase 1 (completed) — sessions, rooms, lobby, card UI, arrangement hook.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Implementation Layers](#2-implementation-layers)
3. [Step 1 — Shared 3-Card Evaluator](#step-1--shared-3-card-evaluator)
4. [Step 2 — Server 5-Card Evaluator](#step-2--server-5-card-evaluator)
5. [Step 3 — Foul Check](#step-3--foul-check)
6. [Step 4 — Engine (Shuffle & Deal)](#step-4--engine-shuffle--deal)
7. [Step 5 — Round Comparison](#step-5--round-comparison)
8. [Step 6 — Database Schema Updates](#step-6--database-schema-updates)
9. [Step 7 — Game Event Handlers (Server)](#step-7--game-event-handlers-server)
10. [Step 8 — Frontend Game Integration](#step-8--frontend-game-integration)
11. [Step 9 — Timer & Auto-Submit](#step-9--timer--auto-submit)
12. [Test Plan](#test-plan)
13. [Files to Create / Modify](#files-to-create--modify)
14. [Implementation Order](#implementation-order)
15. [Out of Scope](#out-of-scope)

---

## 1. Overview

The game engine is split across three layers:

```
┌─────────────────────────────────────────────────────────────────────┐
│  packages/shared/                                                   │
│    evaluator.ts — 3-card evaluator (used on FE for live preview    │
│                   AND on server for authoritative comparison)       │
├─────────────────────────────────────────────────────────────────────┤
│  apps/server/src/game/                                              │
│    engine.ts       — createDeck(), shuffle(), deal()                │
│    evaluator.ts    — 5-card evaluator (pokersolver wrapper)         │
│                      + re-exports shared 3-card evaluator           │
│    foulCheck.ts    — validateArrangement() (Back ≥ Middle)          │
│    compareRound.ts — compareGroups(), compareRound()                │
├─────────────────────────────────────────────────────────────────────┤
│  apps/server/src/game/                                              │
│    gameEvents.ts   — Socket.io event handlers for game flow         │
│    gameManager.ts  — In-memory game state (hands, submissions, timer)│
├─────────────────────────────────────────────────────────────────────┤
│  apps/web/src/                                                      │
│    hooks/useArrangement.ts — add live evaluation labels             │
│    stores/gameStore.ts     — wire game:dealt, game:result events    │
│    hooks/useSocket.ts      — add game event listeners               │
│    pages/Game.tsx           — connect to realtime flow              │
│    components/game/GameBoard.tsx — submit to server, show eval      │
└─────────────────────────────────────────────────────────────────────┘
```

### Design Principles

- **Server is authoritative** — the server shuffles, deals, validates, and compares. Client evaluation is for UI preview only.
- **Shared evaluator** — the 3-card evaluator lives in `packages/shared` so both FE (live preview) and BE (authoritative) use identical logic. No duplication.
- **5-card stays server-only** — `pokersolver` is a server dependency. The FE does NOT evaluate 5-card hands (too heavy for the bundle). The FE shows group labels only after the server returns `game:result`.
- **Pure functions** — `engine.ts`, `evaluator.ts`, `foulCheck.ts`, `compareRound.ts` are pure functions with zero side effects. Easy to test, easy to reason about.
- **Game state is in-memory** — active game state (dealt hands, submission status, timers) lives in a `Map<roomCode, GameInstance>` on the server. Persisted to SQLite only for crash recovery (optional Phase 3 concern).

---

## 2. Implementation Layers

### What lives where and why

| Module              | Location                               | Used by                           | Why                                                                    |
| ------------------- | -------------------------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| 3-card evaluator    | `packages/shared/src/evaluator.ts`     | FE + BE                           | Live preview on FE, authoritative on BE. Same code, zero drift.        |
| 5-card evaluator    | `apps/server/src/game/evaluator.ts`    | BE only                           | Uses `pokersolver` (Node.js library). Too heavy for FE bundle (~50KB). |
| Foul check          | `apps/server/src/game/foulCheck.ts`    | BE (authoritative) + FE (preview) | BE validates on submit. FE calls shared version for live warning.      |
| Foul check (shared) | `packages/shared/src/foulCheck.ts`     | FE                                | Lightweight version using only 3-card eval + hand category comparison. |
| Shuffle & deal      | `apps/server/src/game/engine.ts`       | BE only                           | Cryptographically fair shuffle. Never expose deck order to clients.    |
| Round comparison    | `apps/server/src/game/compareRound.ts` | BE only                           | Combines foul check + evaluators to produce `RoundResult`.             |
| Game event handlers | `apps/server/src/game/gameEvents.ts`   | BE only                           | Socket.io handlers for `game:submit`, deals, timers.                   |
| Game state manager  | `apps/server/src/game/gameManager.ts`  | BE only                           | In-memory map of active games with dealt hands and submissions.        |

### FE Evaluation Strategy

The FE needs to show live feedback as the player arranges cards:

1. **Front group (3 cards):** Use shared `evaluateThreeCard()` to show "One Pair", "Three of a Kind", "High Card".
2. **Back/Middle groups (5 cards):** Show card count only (e.g., "3/5 cards"). Full hand name (e.g., "Full House") is shown **only after server returns `game:result`**.
3. **Foul warning:** Compare categories only — if front group has more cards filled than back, or use a lightweight shared foul check that compares 3-card eval categories. Full foul check with pokersolver is server-only.

**Why not evaluate 5-card on FE?**

- `pokersolver` adds ~50KB to the bundle
- The server is authoritative anyway — FE preview is a UX convenience, not a source of truth
- Adding it later (Phase 4 polish) is trivial if desired

**Alternative (decided against):** Bundle pokersolver on FE. Rejected because:

- Increases bundle size significantly
- Creates two sources of truth for hand ranking
- 5-card evaluation preview is not essential for playability

---

## Step 1 — Shared 3-Card Evaluator

### `packages/shared/src/evaluator.ts`

Replace the current stubs with the full implementation from PLAN.md § 3.

```ts
export const RANK_VALUE: Record<string, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
}

export const THREE_CARD_CATEGORY_NAME: Record<ThreeCardCategory, string> = {
  2: 'Three of a Kind',
  1: 'One Pair',
  0: 'High Card',
}

export function evaluateThreeCard(cards: Card[]): ThreeCardRank
export function compareThreeCard(a: ThreeCardRank, b: ThreeCardRank): -1 | 0 | 1
```

### Test scenarios — `packages/shared/src/__tests__/evaluator.test.ts`

| #   | Test                                          | Input                            | Expected                            |
| --- | --------------------------------------------- | -------------------------------- | ----------------------------------- |
| 1   | Three of a Kind detection                     | `[7S, 7H, 7D]`                   | category=2, tiebreakers=[7]         |
| 2   | One Pair detection                            | `[JS, JH, 5C]`                   | category=1, tiebreakers=[11, 5]     |
| 3   | High Card detection                           | `[AS, KH, 3C]`                   | category=0, tiebreakers=[14, 13, 3] |
| 4   | Pair with higher kicker wins                  | `[QS, QH, AC]` vs `[QD, QC, 2S]` | first wins (kicker A > 2)           |
| 5   | Three of a Kind beats Pair                    | `[3S, 3H, 3D]` vs `[AS, AH, KC]` | first wins                          |
| 6   | Three of a Kind beats High Card               | `[2S, 2H, 2D]` vs `[AS, KH, QC]` | first wins                          |
| 7   | Pair beats High Card                          | `[2S, 2H, 3C]` vs `[AS, KH, QC]` | first wins                          |
| 8   | High Card tiebreaker — second card            | `[AS, QH, 3C]` vs `[AS, JH, TC]` | first wins (Q > J)                  |
| 9   | High Card tiebreaker — third card             | `[AS, KH, 4C]` vs `[AS, KD, 3C]` | first wins (4 > 3)                  |
| 10  | Exact same ranks → draw                       | `[AS, KH, 3C]` vs `[AD, KC, 3S]` | draw (0)                            |
| 11  | Identical trips → draw                        | `[7S, 7H, 7D]` vs `[7C, 7S, 7H]` | draw (0) — suits don't matter       |
| 12  | Pair tiebreak — same pair, same kicker → draw | `[JS, JH, 5C]` vs `[JD, JC, 5S]` | draw (0)                            |
| 13  | Invalid: wrong card count                     | `[AS, KH]` (2 cards)             | throws error                        |
| 14  | Invalid: too many cards                       | `[AS, KH, QD, JC]` (4 cards)     | throws error                        |

---

## Step 2 — Server 5-Card Evaluator

### Install pokersolver

```bash
pnpm --filter server add pokersolver
pnpm --filter server add -D @types/pokersolver
```

### `apps/server/src/game/evaluator.ts`

Wraps `pokersolver` for 5-card hands and re-exports shared 3-card evaluator.

```ts
import { Hand } from 'pokersolver'
import type { Card } from '@binh-13/shared'
import { evaluateThreeCard, compareThreeCard } from '@binh-13/shared'

// Re-export shared evaluator for convenience
export { evaluateThreeCard, compareThreeCard }

/** Convert our Card format to pokersolver format: "AS" → "As" */
export function toPokersolverFormat(card: Card): string {
  return card.rank + card.suit.toLowerCase()
}

/** Evaluate a 5-card hand using pokersolver */
export function evaluateFiveCard(cards: Card[]): Hand {
  if (cards.length !== 5)
    throw new Error('5-card hand must have exactly 5 cards')
  return Hand.solve(cards.map(toPokersolverFormat))
}

/** Compare two 5-card hands. Returns 1 if a wins, -1 if b wins, 0 if draw */
export function compareFiveCard(a: Card[], b: Card[]): -1 | 0 | 1 {
  const handA = evaluateFiveCard(a)
  const handB = evaluateFiveCard(b)
  const winners = Hand.winners([handA, handB])
  if (winners.length === 2) return 0
  return winners[0] === handA ? 1 : -1
}

/** Get human-readable hand description */
export function describeFiveCard(cards: Card[]): string {
  return evaluateFiveCard(cards).descr
}
```

### Test scenarios — `apps/server/src/game/__tests__/evaluator.test.ts`

| #   | Test                                      | Hand A                                           | Hand B                 | Expected |
| --- | ----------------------------------------- | ------------------------------------------------ | ---------------------- | -------- |
| 1   | Royal Flush vs Straight Flush             | `[AS, KS, QS, JS, TS]`                           | `[9H, 8H, 7H, 6H, 5H]` | A wins   |
| 2   | Four of a Kind vs Full House              | `[KS, KH, KD, KC, 5S]`                           | `[QS, QH, QD, 9S, 9H]` | A wins   |
| 3   | Flush vs Straight                         | `[AS, JS, 8S, 5S, 2S]`                           | `[8S, 7H, 6D, 5C, 4S]` | A wins   |
| 4   | Two Pair vs One Pair                      | `[AS, AH, KS, KH, 5C]`                           | `[TS, TH, AC, KD, 2S]` | A wins   |
| 5   | Higher pair wins                          | `[AS, AH, 3D, 5C, 7S]`                           | `[KS, KH, QD, JC, TS]` | A wins   |
| 6   | Same pair, kicker decides                 | `[AS, AH, KD, 5C, 3S]` vs `[AD, AC, QD, JC, TS]` | A wins (K kicker)      |
| 7   | Identical hands → draw                    | `[AS, KH, QD, JC, 9S]` vs `[AD, KC, QS, JH, 9D]` | draw                   |
| 8   | Full House vs Flush                       | `[7S, 7H, 7D, 2S, 2H]` vs `[AS, KS, QS, JS, 9S]` | A wins                 |
| 9   | Straight A-high vs Straight K-high        | `[AS, KH, QD, JC, TS]` vs `[KS, QH, JD, TC, 9S]` | A wins                 |
| 10  | Three of a Kind vs Two Pair               | `[5S, 5H, 5D, KC, 2S]` vs `[AS, AH, KS, KH, QC]` | A wins                 |
| 11  | `toPokersolverFormat` converts correctly  | `{id:'AS',rank:'A',suit:'S'}`                    | → `"As"`               |
| 12  | `describeFiveCard` returns human-readable | `[AS, KS, QS, JS, TS]`                           | `"Royal Flush"`        |
| 13  | Invalid: wrong card count                 | 4 cards                                          | throws error           |

---

## Step 3 — Foul Check

### `apps/server/src/game/foulCheck.ts`

Uses `pokersolver` to compare Back vs Middle 5-card hands.

```ts
import type { PlayerArrangement } from '@binh-13/shared'
import { compareFiveCard } from './evaluator'

/**
 * Validates arrangement: Back (group1) must rank >= Middle (group2).
 * Front (group3) is independent — no constraint.
 * Returns true if valid, false if foul.
 */
export function validateArrangement(arrangement: PlayerArrangement): boolean {
  const result = compareFiveCard(arrangement.group1, arrangement.group2)
  return result >= 0 // Back wins or draws = valid
}
```

### `packages/shared/src/foulCheck.ts` (lightweight FE version)

For the FE live warning, we need a foul check that doesn't use pokersolver. This is a **best-effort preview** — the server is authoritative.

The FE version can only detect obvious fouls (e.g., category mismatch: Middle is a flush but Back is a pair). For edge cases within the same category (e.g., both are two-pair), the FE shows no warning — the server catches it.

```ts
import type { Card } from './types'

/**
 * Lightweight foul check for FE preview.
 * Returns true if arrangement is LIKELY valid, false if DEFINITELY foul.
 * Server performs the authoritative check.
 */
export function quickFoulCheck(group1: Card[], group2: Card[]): boolean
```

### Test scenarios — `apps/server/src/game/__tests__/foulCheck.test.ts`

| #   | Test                                             | Back (group1)     | Middle (group2)            | Expected |
| --- | ------------------------------------------------ | ----------------- | -------------------------- | -------- |
| 1   | Back stronger than Middle → valid                | Full House        | Two Pair                   | true     |
| 2   | Back equal to Middle → valid                     | One Pair (AA)     | One Pair (AA) same kickers | true     |
| 3   | Back weaker than Middle → foul                   | One Pair          | Full House                 | false    |
| 4   | Back High Card vs Middle Flush → foul            | High Card         | Flush                      | false    |
| 5   | Both same category, Back wins on kicker → valid  | Pair AA, K kicker | Pair AA, Q kicker          | true     |
| 6   | Both same category, Middle wins on kicker → foul | Pair AA, Q kicker | Pair AA, K kicker          | false    |
| 7   | Royal Flush vs Straight Flush → valid            | Royal Flush       | Straight Flush             | true     |
| 8   | Straight vs Flush → foul                         | Straight          | Flush                      | false    |
| 9   | Four of a Kind in both — higher wins → valid     | Four Kings        | Four Queens                | true     |

### Test scenarios — `packages/shared/src/__tests__/foulCheck.test.ts` (lightweight)

| #   | Test                                                   | Back (group1)           | Middle (group2)         | Expected |
| --- | ------------------------------------------------------ | ----------------------- | ----------------------- | -------- |
| 1   | Obviously valid — back is higher category              | (5 cards forming trips) | (5 cards forming pair)  | true     |
| 2   | Obviously foul — middle is higher category             | (5 cards forming pair)  | (5 cards forming flush) | false    |
| 3   | Same category — returns true (inconclusive)            | (both two pair)         | (both two pair)         | true     |
| 4   | Incomplete groups — returns true (not enough to check) | (3 cards)               | (2 cards)               | true     |

---

## Step 4 — Engine (Shuffle & Deal)

### `apps/server/src/game/engine.ts`

```ts
import type { Card, Suit, Rank } from '@binh-13/shared'
import crypto from 'node:crypto'

const SUITS: Suit[] = ['S', 'H', 'D', 'C']
const RANKS: Rank[] = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'T',
  'J',
  'Q',
  'K',
  'A',
]

/** Creates a standard 52-card deck. */
export function createDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${rank}${suit}`, rank, suit })
    }
  }
  return deck
}

/**
 * Fisher-Yates shuffle using crypto.getRandomValues for fairness.
 * Mutates the array in place and returns it.
 */
export function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const randomBytes = crypto.randomBytes(4)
    const j = randomBytes.readUInt32BE(0) % (i + 1)
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}

/**
 * Deals 13 cards to each of the given number of players.
 * Returns an array of hands (one per player).
 */
export function deal(playerCount: 2 | 3 | 4 = 2): Card[][] {
  if (playerCount < 2 || playerCount > 4) {
    throw new Error('Player count must be 2, 3, or 4')
  }
  const deck = shuffle(createDeck())
  const hands: Card[][] = []
  for (let p = 0; p < playerCount; p++) {
    hands.push(deck.slice(p * 13, (p + 1) * 13))
  }
  return hands
}
```

### Test scenarios — `apps/server/src/game/__tests__/engine.test.ts`

| #   | Test                                                | Assert                                           |
| --- | --------------------------------------------------- | ------------------------------------------------ |
| 1   | `createDeck()` returns 52 cards                     | length === 52                                    |
| 2   | `createDeck()` has no duplicates                    | Set of ids has size 52                           |
| 3   | `createDeck()` has 4 suits × 13 ranks               | check all combinations present                   |
| 4   | `shuffle()` returns same array reference (in-place) | arr === shuffle(arr)                             |
| 5   | `shuffle()` preserves all elements                  | same elements, potentially different order       |
| 6   | `shuffle()` produces different order (statistical)  | run 10 shuffles, at least 9 differ from original |
| 7   | `deal(2)` returns 2 hands of 13 cards each          | hands.length === 2, each hand.length === 13      |
| 8   | `deal(2)` hands have no overlap                     | intersection is empty                            |
| 9   | `deal(2)` uses all 26 cards from the deck           | union has 26 unique cards                        |
| 10  | `deal(4)` returns 4 hands of 13 cards each          | hands.length === 4, each hand.length === 13      |
| 11  | `deal(4)` hands have no overlap                     | all 52 cards used, no duplicates                 |
| 12  | `deal(1)` throws error                              | invalid player count                             |
| 13  | `deal(5)` throws error                              | invalid player count                             |
| 14  | Card format is correct                              | each card has `id = rank + suit`, uppercase      |

---

## Step 5 — Round Comparison

### `apps/server/src/game/compareRound.ts`

```ts
import type {
  PlayerArrangement,
  RoundResult,
  GroupComparison,
} from '@binh-13/shared'
import { compareFiveCard, describeFiveCard } from './evaluator'
import {
  evaluateThreeCard,
  compareThreeCard,
  THREE_CARD_CATEGORY_NAME,
} from '@binh-13/shared'
import { validateArrangement } from './foulCheck'

export function compareRound(
  p1: PlayerArrangement,
  p2: PlayerArrangement,
): RoundResult
```

Logic:

1. Check both players for fouls via `validateArrangement()`.
2. If a player fouls, they lose all 3 groups (opponent wins all 3 unless also fouled).
3. If both foul → all groups are draws, winner is `'draw'`.
4. If neither fouls, compare each group independently:
   - Groups 1 & 2: use `compareFiveCard()`
   - Group 3: use `evaluateThreeCard()` + `compareThreeCard()`
5. Count wins per player. 2+ wins = winner. 1-1-1 (each wins 1, 1 draw) = `'draw'`.

### Test scenarios — `apps/server/src/game/__tests__/compareRound.test.ts`

| #   | Test                            | Scenario                            | Expected                                   |
| --- | ------------------------------- | ----------------------------------- | ------------------------------------------ |
| 1   | P1 wins all 3 groups            | P1 has stronger hands in all groups | winner='p1', p1Score=3, p2Score=0          |
| 2   | P2 wins all 3 groups            | P2 has stronger hands in all groups | winner='p2', p1Score=0, p2Score=3          |
| 3   | P1 wins 2, P2 wins 1            | Mixed results                       | winner='p1', p1Score=2, p2Score=1          |
| 4   | P1 wins 2, 1 draw               | P1 stronger in 2 groups, tie in 1   | winner='p1', p1Score=2, p2Score=0          |
| 5   | Each wins 1, 1 draw             | Split result                        | winner='draw'                              |
| 6   | All 3 groups draw               | Identical strength hands            | winner='draw', p1Score=0, p2Score=0        |
| 7   | P1 fouls → P2 wins all          | P1 Back < Middle                    | winner='p2', p1Foul=true, p2Score=3        |
| 8   | P2 fouls → P1 wins all          | P2 Back < Middle                    | winner='p1', p2Foul=true, p1Score=3        |
| 9   | Both foul → draw                | Both have Back < Middle             | winner='draw', p1Foul=true, p2Foul=true    |
| 10  | Hand descriptions populated     | Any valid hands                     | group1.p1Hand is human-readable string     |
| 11  | Front group uses 3-card eval    | Trips vs Pair in group3             | group3.result='p1'                         |
| 12  | Arrangements included in result | Any                                 | result.arrangements.p1 and .p2 match input |

---

## Step 6 — Database Schema Updates

Add `hands` and `arrangements` tables to `db.ts` migrations:

```sql
CREATE TABLE IF NOT EXISTS hands (
  room_code  TEXT    NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  player_id  INTEGER NOT NULL REFERENCES sessions(player_id),
  cards_json TEXT    NOT NULL,
  PRIMARY KEY (room_code, player_id)
);

CREATE TABLE IF NOT EXISTS arrangements (
  room_code        TEXT    NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  player_id        INTEGER NOT NULL REFERENCES sessions(player_id),
  arrangement_json TEXT    NOT NULL,
  submitted_at     INTEGER NOT NULL,
  PRIMARY KEY (room_code, player_id)
);
```

Also update `rooms` table to include `current_round`:

```sql
ALTER TABLE rooms ADD COLUMN current_round INTEGER NOT NULL DEFAULT 1;
```

(Since migrations drop/recreate, just add the column to the CREATE statement.)

---

## Step 7 — Game Event Handlers (Server)

### `apps/server/src/game/gameManager.ts`

In-memory state for active games:

```ts
type GameInstance = {
  roomCode: string
  hands: Map<number, Card[]> // playerId → 13 dealt cards
  submissions: Map<number, PlayerArrangement> // playerId → submitted arrangement
  timerHandle: NodeJS.Timeout | null
  timerSeconds: number
  status: 'dealing' | 'arranging' | 'comparing' | 'finished'
}

const activeGames = new Map<string, GameInstance>()

export function startGame(roomCode: string, playerIds: number[]): GameInstance
export function getGame(roomCode: string): GameInstance | undefined
export function submitArrangement(
  roomCode: string,
  playerId: number,
  arrangement: PlayerArrangement,
): boolean
export function allSubmitted(roomCode: string): boolean
export function endGame(roomCode: string): void
```

### `apps/server/src/game/gameEvents.ts`

New socket event handlers registered in `server.ts`:

```ts
export function registerGameEvents(io: Server): void
```

#### Event: Game Start (triggered when 2nd player joins)

In `roomEvents.ts`, after a successful `room:join` when `players.length === 2`:

1. Call `startGame(roomCode, [p1Id, p2Id])`
2. `deal(2)` → store hands in `gameManager` + `hands` table
3. Update room status to `'arranging'`
4. Emit `game:dealt` to each player individually with **only their own hand**
5. Start 60-second timer

```ts
// Per-player emission — NEVER send opponent's cards
io.to(player1SocketId).emit(EVENTS.GAME_DEALT, {
  hand: hands[0],
  timerSeconds: 60,
})
io.to(player2SocketId).emit(EVENTS.GAME_DEALT, {
  hand: hands[1],
  timerSeconds: 60,
})
```

#### Event: `game:submit`

Payload schema:

```ts
const gameSubmitSchema = z.object({
  playerId: z.number().int().positive(),
  code: roomCodeSchema,
  arrangement: z.object({
    group1: z.array(cardSchema).length(5),
    group2: z.array(cardSchema).length(5),
    group3: z.array(cardSchema).length(3),
  }),
})
```

Handler:

1. Validate payload with Zod
2. Verify player is in the room and game is in `'arranging'` state
3. **Verify all 13 cards in the arrangement match the dealt hand** (prevent card injection)
4. Store submission in `gameManager`
5. Emit `game:opponent_submitted` to the other player
6. If both submitted → call `compareRound()` → emit `game:result` to both

#### Event: Timer tick

Every second, emit `game:timer` to the room:

```ts
io.to(roomCode).emit(EVENTS.GAME_TIMER, { secondsLeft })
```

When timer reaches 0:

- If player hasn't submitted and arrangement is valid → auto-submit
- If arrangement is incomplete → foul (submit empty/partial as foul)

#### Card Validation (critical security)

When a player submits, the server MUST verify:

1. **Exactly 13 unique cards** across all 3 groups
2. **Every card matches the dealt hand** — prevents swapping cards
3. **No duplicate cards** — a card can only be in one group
4. **Group sizes correct** — group1=5, group2=5, group3=3

```ts
function validateSubmittedCards(
  dealtHand: Card[],
  arrangement: PlayerArrangement,
): boolean {
  const submitted = [
    ...arrangement.group1,
    ...arrangement.group2,
    ...arrangement.group3,
  ]
  if (submitted.length !== 13) return false

  const submittedIds = new Set(submitted.map((c) => c.id))
  if (submittedIds.size !== 13) return false // duplicates

  const dealtIds = new Set(dealtHand.map((c) => c.id))
  for (const id of submittedIds) {
    if (!dealtIds.has(id)) return false // card not in dealt hand
  }
  return true
}
```

---

## Step 8 — Frontend Game Integration

### `apps/web/src/hooks/useSocket.ts` — Add game event listeners

```ts
// Inside useEffect:
socket.on(EVENTS.GAME_DEALT, ({ hand, timerSeconds }) => {
  gameStore.setHand(hand)
  gameStore.setTimer(timerSeconds)
  // navigate to game screen or update UI state
})

socket.on(EVENTS.GAME_TIMER, ({ secondsLeft }) => {
  gameStore.setTimer(secondsLeft)
})

socket.on(EVENTS.GAME_OPPONENT_SUBMITTED, () => {
  gameStore.setOpponentSubmitted(true)
})

socket.on(EVENTS.GAME_RESULT, (result: RoundResult) => {
  gameStore.setResult(result)
  // navigate to result screen
})
```

### `apps/web/src/stores/gameStore.ts` — Add fields

```ts
type GameState = {
  // ... existing fields ...
  opponentSubmitted: boolean
  submitted: boolean
  setOpponentSubmitted: (v: boolean) => void
  setSubmitted: (v: boolean) => void
}
```

### `apps/web/src/hooks/useArrangement.ts` — Add live evaluation

Add computed properties that evaluate the front group in real-time:

```ts
const frontEval = useMemo(() => {
  if (state.group3.length !== 3) return null
  return evaluateThreeCard(state.group3)
}, [state.group3])

const frontLabel = useMemo(() => {
  if (!frontEval) return null
  return THREE_CARD_CATEGORY_NAME[frontEval.category]
}, [frontEval])
```

### `apps/web/src/components/game/GameBoard.tsx` — Submit to server

Replace `console.log` with actual socket emission:

```ts
const handleSubmit = useCallback(() => {
  socket.emit(EVENTS.GAME_SUBMIT, {
    playerId: sessionStore.playerId,
    code: gameStore.room?.code,
    arrangement: { group1, group2, group3 },
  })
  gameStore.setSubmitted(true)
}, [group1, group2, group3])
```

### `apps/web/src/pages/Game.tsx` — Connect to realtime

Remove mock data fallback. Use `gameStore.hand` from the dealt event:

```tsx
export default function Game() {
  const hand = useGameStore((s) => s.hand)
  const result = useGameStore((s) => s.result)

  if (result) return <Navigate to={`/room/${code}/result`} />
  if (hand.length === 0) return <WaitingForDeal />

  return <GameBoard initialCards={hand} />
}
```

---

## Step 9 — Timer & Auto-Submit

### Server-side timer

```ts
function startTimer(io: Server, roomCode: string, seconds: number): void {
  const game = getGame(roomCode)
  if (!game) return

  game.timerSeconds = seconds
  game.timerHandle = setInterval(() => {
    game.timerSeconds -= 1
    io.to(roomCode).emit(EVENTS.GAME_TIMER, { secondsLeft: game.timerSeconds })

    if (game.timerSeconds <= 0) {
      clearInterval(game.timerHandle!)
      handleTimerExpiry(io, roomCode)
    }
  }, 1000)
}

function handleTimerExpiry(io: Server, roomCode: string): void {
  const game = getGame(roomCode)
  if (!game) return

  // For each player who hasn't submitted:
  // - If arrangement is somehow complete → auto-submit (not applicable since FE hasn't sent it)
  // - Otherwise → mark as foul (empty submission)
  for (const [playerId] of game.hands) {
    if (!game.submissions.has(playerId)) {
      // Force foul — player didn't submit in time
      game.submissions.set(
        playerId,
        createFoulArrangement(playerId, game.hands.get(playerId)!),
      )
    }
  }

  resolveRound(io, roomCode)
}
```

### Frontend timer display

Show countdown in `GameBoard`:

```tsx
const timer = useGameStore((s) => s.timerSeconds)
// Render: <span className={timer <= 10 ? 'text-red-500' : ''}>{timer}s</span>
```

---

## Test Plan

### Unit Tests (pure functions, no I/O)

| File                                                  | Tests                                     | Priority |
| ----------------------------------------------------- | ----------------------------------------- | -------- |
| `packages/shared/src/__tests__/evaluator.test.ts`     | 14 tests — 3-card evaluation & comparison | P0       |
| `packages/shared/src/__tests__/foulCheck.test.ts`     | 4 tests — lightweight FE foul check       | P1       |
| `apps/server/src/game/__tests__/engine.test.ts`       | 14 tests — deck, shuffle, deal            | P0       |
| `apps/server/src/game/__tests__/evaluator.test.ts`    | 13 tests — 5-card evaluation & comparison | P0       |
| `apps/server/src/game/__tests__/foulCheck.test.ts`    | 9 tests — authoritative foul check        | P0       |
| `apps/server/src/game/__tests__/compareRound.test.ts` | 12 tests — full round comparison          | P0       |

### Integration Tests (Socket.io + DB)

| File                                                            | Tests          | Priority |
| --------------------------------------------------------------- | -------------- | -------- |
| `apps/server/src/game/__tests__/gameEvents.integration.test.ts` | Full game flow | P0       |

Integration test scenarios:

| #   | Test                                                  | Assert                                             |
| --- | ----------------------------------------------------- | -------------------------------------------------- |
| 1   | Two players join → cards dealt automatically          | Both receive `game:dealt` with 13 cards each       |
| 2   | Cards are unique per player                           | No overlap between dealt hands                     |
| 3   | Player submits valid arrangement                      | `game:opponent_submitted` sent to other player     |
| 4   | Both submit → result emitted                          | `game:result` sent to both with correct winner     |
| 5   | Submit with wrong cards → error                       | Server rejects (card injection attempt)            |
| 6   | Submit with duplicate cards → error                   | Server rejects                                     |
| 7   | Submit foul arrangement → accepted but marked as foul | `game:result` shows foul=true, opponent wins all   |
| 8   | Timer tick events received                            | Client receives `game:timer` every second          |
| 9   | Timer expires → auto-foul for non-submitters          | `game:result` emitted with foul for timeout player |
| 10  | Player disconnects during game                        | Other player notified, game pauses or forfeits     |
| 11  | Submit before game starts → error                     | Server rejects                                     |
| 12  | Submit twice → error                                  | Server rejects second submission                   |

### Frontend Tests

| File                                                        | Tests                                     | Priority |
| ----------------------------------------------------------- | ----------------------------------------- | -------- |
| `apps/web/src/hooks/__tests__/useArrangement.test.ts`       | Add live eval label tests                 | P1       |
| `apps/web/src/stores/__tests__/gameStore.test.ts`           | New fields (opponentSubmitted, submitted) | P1       |
| `apps/web/src/components/game/__tests__/GameBoard.test.tsx` | Submit calls socket.emit                  | P1       |

---

## Files to Create / Modify

| File                                                            | Action                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `packages/shared/src/evaluator.ts`                              | **Rewrite** — implement `evaluateThreeCard`, `compareThreeCard`, exports |
| `packages/shared/src/foulCheck.ts`                              | **Create** — lightweight FE foul check                                   |
| `packages/shared/src/__tests__/evaluator.test.ts`               | **Create** — 14 test cases                                               |
| `packages/shared/src/__tests__/foulCheck.test.ts`               | **Create** — 4 test cases                                                |
| `apps/server/src/game/engine.ts`                                | **Rewrite** — `createDeck`, `shuffle`, `deal`                            |
| `apps/server/src/game/evaluator.ts`                             | **Rewrite** — pokersolver wrapper + re-exports                           |
| `apps/server/src/game/foulCheck.ts`                             | **Rewrite** — `validateArrangement` using 5-card eval                    |
| `apps/server/src/game/compareRound.ts`                          | **Rewrite** — full `compareRound` logic                                  |
| `apps/server/src/game/gameManager.ts`                           | **Create** — in-memory game state management                             |
| `apps/server/src/game/gameEvents.ts`                            | **Create** — Socket.io game event handlers                               |
| `apps/server/src/game/__tests__/engine.test.ts`                 | **Create** — 14 test cases                                               |
| `apps/server/src/game/__tests__/evaluator.test.ts`              | **Create** — 13 test cases                                               |
| `apps/server/src/game/__tests__/foulCheck.test.ts`              | **Create** — 9 test cases                                                |
| `apps/server/src/game/__tests__/compareRound.test.ts`           | **Create** — 12 test cases                                               |
| `apps/server/src/game/__tests__/gameEvents.integration.test.ts` | **Create** — 12 integration tests                                        |
| `apps/server/src/db.ts`                                         | **Modify** — add `hands` + `arrangements` tables                         |
| `apps/server/src/server.ts`                                     | **Modify** — register `gameEvents`                                       |
| `apps/server/src/rooms/roomEvents.ts`                           | **Modify** — trigger game start when 2 players join                      |
| `apps/web/src/hooks/useSocket.ts`                               | **Modify** — add game event listeners                                    |
| `apps/web/src/hooks/useArrangement.ts`                          | **Modify** — add live eval labels                                        |
| `apps/web/src/stores/gameStore.ts`                              | **Modify** — add opponentSubmitted, submitted                            |
| `apps/web/src/pages/Game.tsx`                                   | **Modify** — remove mock fallback, connect to realtime                   |
| `apps/web/src/components/game/GameBoard.tsx`                    | **Modify** — submit to server, show timer + eval                         |
| `packages/shared/src/types.ts`                                  | **Modify** — add GAME_START event if needed                              |
| `packages/shared/src/events.ts`                                 | **Modify** — add `GAME_START` event constant                             |

---

## Implementation Order

Execute in this sequence — each step is independently testable:

```
Phase A — Pure Game Logic (no I/O, no sockets)
──────────────────────────────────────────────
1. Shared 3-card evaluator + tests
2. Install pokersolver
3. Server 5-card evaluator + tests
4. Server foul check + tests
5. Engine (shuffle/deal) + tests
6. Round comparison + tests

Phase B — Server Integration
────────────────────────────
7. DB schema updates (hands + arrangements tables)
8. Game manager (in-memory state)
9. Game event handlers (gameEvents.ts)
10. Wire game start into roomEvents.ts
11. Integration tests

Phase C — Frontend Integration
──────────────────────────────
12. gameStore updates (new fields)
13. useSocket game event listeners
14. useArrangement live eval labels
15. GameBoard submit to server + timer display
16. Game.tsx realtime flow
17. Frontend tests
```

Each phase can be merged independently. Phase A has zero dependencies on the network layer.

---

## Out of Scope

- Multi-round / Best-of-N session management (Phase 3)
- Rematch flow (Phase 3)
- Reconnection during active game (Phase 3)
- Result screen UI (separate ticket — `Result.tsx`)
- Card flip animations on reveal (Phase 4)
- Sound effects (Phase 4)
- 4-player support (future)
- Spectator mode (future)
