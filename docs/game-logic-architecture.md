# Game Logic Architecture — Shuffling, Ranking & Realtime Flow

**Version:** 1.0  
**Last updated:** 2026-05-14  
**Implements:** PLAN.md § 2 (Game Rules), § 3 (Card Comparison Algorithm), § 9 (Event Contract)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Evaluation Architecture](#2-evaluation-architecture)
3. [Data Flow — Complete Game Round](#3-data-flow--complete-game-round)
4. [Deck & Dealing](#4-deck--dealing)
5. [3-Card Evaluation (Shared)](#5-3-card-evaluation-shared)
6. [5-Card Evaluation (Server)](#6-5-card-evaluation-server)
7. [Foul Detection](#7-foul-detection)
8. [Round Comparison](#8-round-comparison)
9. [Game State Machine](#9-game-state-machine)
10. [Realtime Event Flow](#10-realtime-event-flow)
11. [Security Model](#11-security-model)
12. [Timer & Auto-Submit](#12-timer--auto-submit)
13. [Frontend Live Preview](#13-frontend-live-preview)
14. [Error Handling](#14-error-handling)
15. [Module Dependency Graph](#15-module-dependency-graph)

---

## 1. System Overview

The game engine handles the core gameplay loop: shuffling a 52-card deck, dealing 13 cards to each player, validating player arrangements, evaluating hand strength, detecting fouls, and comparing results.

```
┌─────────────────────────────────┐     ┌──────────────────────────────────────┐
│  Frontend (React SPA)           │     │  Server (Hono + Socket.io)           │
│                                 │     │                                      │
│  ┌─────────────────────────┐    │     │  ┌──────────────────────────────┐    │
│  │ useArrangement hook     │    │     │  │ gameManager.ts               │    │
│  │  - card arrangement     │    │     │  │  - in-memory game instances  │    │
│  │  - live 3-card eval     │    │     │  │  - dealt hands               │    │
│  │  - quick foul warning   │    │     │  │  - submission tracking       │    │
│  └──────────┬──────────────┘    │     │  │  - timer management          │    │
│             │ submit            │     │  └──────────┬───────────────────┘    │
│             ▼                   │     │             │                        │
│  ┌─────────────────────────┐    │     │  ┌──────────▼───────────────────┐    │
│  │ socket.emit(game:submit)│────┼─ws──┼──► gameEvents.ts                │    │
│  └─────────────────────────┘    │     │  │  1. Zod validate payload     │    │
│                                 │     │  │  2. Verify cards match deal  │    │
│  ┌─────────────────────────┐    │     │  │  3. Store submission         │    │
│  │ socket.on(game:result)  │◄───┼─ws──┼──│  4. If both → compareRound() │    │
│  │  → show RoundResult     │    │     │  └──────────┬───────────────────┘    │
│  └─────────────────────────┘    │     │             │                        │
│                                 │     │  ┌──────────▼───────────────────┐    │
│                                 │     │  │ compareRound.ts              │    │
│                                 │     │  │  ├─ foulCheck.ts             │    │
│                                 │     │  │  ├─ evaluator.ts (5-card)    │    │
│                                 │     │  │  └─ shared/evaluator (3-card)│    │
│                                 │     │  └─────────────────────────────┘    │
└─────────────────────────────────┘     └──────────────────────────────────────┘
                  │                                       │
                  └───── both use ────────────────────────┘
                              │
                  ┌───────────▼──────────────┐
                  │ packages/shared/          │
                  │   evaluator.ts (3-card)   │
                  │   types.ts                │
                  │   events.ts               │
                  └──────────────────────────┘
```

---

## 2. Evaluation Architecture

### Why split between shared and server?

| Evaluator                         | Location                            | Used By | Reason                                                                                         |
| --------------------------------- | ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| **3-card** (Front group)          | `packages/shared/src/evaluator.ts`  | FE + BE | Small (~60 lines), needed for live FE preview. Identical logic on both sides eliminates drift. |
| **5-card** (Back + Middle groups) | `apps/server/src/game/evaluator.ts` | BE only | Uses `pokersolver` library (~50KB). Too heavy for FE bundle. Server is authoritative anyway.   |

### FE evaluation capabilities

| Group            | FE Can Evaluate?                   | What FE Shows                              |
| ---------------- | ---------------------------------- | ------------------------------------------ |
| Front (3 cards)  | Yes — shared evaluator             | "Three of a Kind", "One Pair", "High Card" |
| Middle (5 cards) | No — pokersolver is server-only    | Card count only ("3/5 cards")              |
| Back (5 cards)   | No — pokersolver is server-only    | Card count only ("4/5 cards")              |
| Foul check       | Partial — category comparison only | Warning if Middle category > Back category |

After `game:result` arrives from server, the FE displays full hand descriptions for all groups.

---

## 3. Data Flow — Complete Game Round

```
Timeline  Player A                    Server                     Player B
────────  ────────                    ──────                     ────────
  T+0     [in lobby]                  2nd player joins           [joins room]
          ◄─── game:dealt ────────── shuffle + deal(2) ──────── game:dealt ──►
          hand: 13 cards              store hands in memory      hand: 13 cards
          (only A's cards)            start 60s timer            (only B's cards)
                                      room status → 'arranging'
  T+1s    ◄─── game:timer(59) ──────────────────────────────── game:timer(59) ──►
  T+2s    ◄─── game:timer(58) ──────────────────────────────── game:timer(58) ──►
  ...
  T+25s   [arranges cards]
           game:submit ──────────►  validate:
                                     1. Zod schema
                                     2. Cards match dealt hand
                                     3. No duplicates
                                     4. Group sizes correct
                                     store submission
                                    ──── game:opponent_submitted ────────────────►
  T+40s                                                          [arranges cards]
                                    ◄──────────────── game:submit
                                     validate (same checks)
                                     store submission
                                     BOTH SUBMITTED → compare:
                                      1. foulCheck(P1), foulCheck(P2)
                                      2. compare group1 (5-card)
                                      3. compare group2 (5-card)
                                      4. compare group3 (3-card)
                                      5. count wins → determine winner
          ◄─── game:result ─────── emit RoundResult ─────── game:result ──►
          {                          room status → 'finished'  (same payload)
            winner: 'p1',
            p1Score: 2, p2Score: 1,
            arrangements: { p1: {...}, p2: {...} },  ← BOTH arrangements revealed
            group1: { result: 'p1', p1Hand: 'Full House...', ... },
            group2: { result: 'p2', p2Hand: 'Flush...', ... },
            group3: { result: 'p1', ... },
          }
```

---

## 4. Deck & Dealing

### Card representation

```
Card = { id: "AS", rank: "A", suit: "S" }
       ───────  ────────   ──────────
       rank+suit  Rank type  Suit type

Ranks: 2 3 4 5 6 7 8 9 T J Q K A  (T = 10, A = always high)
Suits: S H D C  (Spades, Hearts, Diamonds, Clubs)
Full deck: 4 suits × 13 ranks = 52 cards
```

### Shuffle algorithm

**Fisher-Yates shuffle** with `crypto.randomBytes()` for cryptographic fairness:

```
for i from n-1 down to 1:
    j = cryptoRandom(0, i)    ← uniform random using crypto.randomBytes
    swap array[i] and array[j]
```

Why `crypto.randomBytes` instead of `Math.random()`?

- `Math.random()` uses a PRNG that may be predictable
- Card games require fair randomness — players must not be able to predict the deck
- `crypto.randomBytes` uses the OS CSPRNG (Cryptographically Secure Pseudo-Random Number Generator)

### Deal logic

```
deck = shuffle(createDeck())      // 52 shuffled cards
player1_hand = deck[0..12]        // cards 0-12
player2_hand = deck[13..25]       // cards 13-25
// cards 26-51 are unused (2-player game)
```

For 4-player future: all 52 cards are dealt (13 × 4).

---

## 5. 3-Card Evaluation (Shared)

### Hand categories (Front group only)

| Category        | Value | Example    | Description                      |
| --------------- | ----- | ---------- | -------------------------------- |
| Three of a Kind | 2     | `7♠ 7♥ 7♦` | All three cards same rank        |
| One Pair        | 1     | `J♠ J♥ 5♣` | Two cards same rank + one kicker |
| High Card       | 0     | `A♠ K♥ 3♣` | No matching ranks                |

**No flushes or straights in 3-card hands.** This is per the game rules.

### Evaluation algorithm

```
Input: 3 cards
Output: { category: 0|1|2, tiebreakers: number[] }

1. Convert ranks to numeric values (2=2, ..., T=10, J=11, Q=12, K=13, A=14)
2. Sort descending
3. Count rank frequencies
4. If any rank appears 3× → category=2, tiebreakers=[that rank]
5. If any rank appears 2× → category=1, tiebreakers=[pair rank, kicker rank]
6. Else → category=0, tiebreakers=[highest, middle, lowest]
```

### Comparison algorithm

```
Input: ThreeCardRank A, ThreeCardRank B
Output: -1 (B wins) | 0 (draw) | 1 (A wins)

1. Compare categories: higher category wins
2. If same category: compare tiebreakers element by element
3. If all tiebreakers equal → draw (suits are never ranked)
```

---

## 6. 5-Card Evaluation (Server)

### Hand categories (Back and Middle groups)

| Rank | Hand            | Description                  |
| ---- | --------------- | ---------------------------- |
| 9    | Royal Flush     | A K Q J T, same suit         |
| 8    | Straight Flush  | 5 consecutive, same suit     |
| 7    | Four of a Kind  | 4 same rank + 1 kicker       |
| 6    | Full House      | 3 same rank + 2 same rank    |
| 5    | Flush           | 5 same suit, not consecutive |
| 4    | Straight        | 5 consecutive, mixed suits   |
| 3    | Three of a Kind | 3 same rank + 2 kickers      |
| 2    | Two Pair        | 2 pairs + 1 kicker           |
| 1    | One Pair        | 1 pair + 3 kickers           |
| 0    | High Card       | No matches                   |

### Library: pokersolver

We use `pokersolver` (4k+ stars, battle-tested) for 5-card evaluation. It handles:

- All hand rankings and tiebreakers
- Kicker ordering
- Ace-high straights (A-K-Q-J-T)
- Special cases (split pots, identical hands)

### Card format conversion

```
Our format:  "AS" (rank uppercase + suit uppercase)
pokersolver: "As" (rank uppercase + suit lowercase)

Conversion: card.rank + card.suit.toLowerCase()
  "AS" → "As"
  "TH" → "Th"
  "2C" → "2c"
```

### Comparison

```ts
const handA = Hand.solve(cardsA.map(toPokersolverFormat))
const handB = Hand.solve(cardsB.map(toPokersolverFormat))
const winners = Hand.winners([handA, handB])

if (winners.length === 2) → draw
if (winners[0] === handA) → A wins
else → B wins
```

---

## 7. Foul Detection

### Rule

> **Back (group1) must rank ≥ Middle (group2)**  
> Front (group3) is independent — no constraint.

If Back < Middle → **foul** → player loses all 3 groups automatically.

### Server-side (authoritative)

Uses `pokersolver` to compare Back vs Middle as 5-card poker hands:

```
result = compareFiveCard(group1, group2)
if result >= 0 → valid (Back wins or ties)
if result < 0  → FOUL (Middle is stronger)
```

### Client-side (preview only)

The FE cannot use pokersolver (too heavy). Instead, it uses a **lightweight category-only check**:

```
1. Estimate category of Back and Middle using basic counting:
   - Count pairs, trips, quads
   - Check if all same suit (flush)
   - Check if consecutive (straight)
2. If Middle category > Back category → show foul warning
3. If same category → show no warning (inconclusive — server decides)
4. If groups incomplete → show no warning
```

This catches obvious fouls (e.g., Middle is a flush, Back is a pair) but may miss edge cases within the same category (e.g., both are two-pair but Middle's pairs are higher). The server catches all cases.

### Foul consequences

| P1 Foul | P2 Foul | Result                                   |
| ------- | ------- | ---------------------------------------- |
| No      | No      | Normal comparison of all 3 groups        |
| Yes     | No      | P2 wins all 3 groups (score: P1=0, P2=3) |
| No      | Yes     | P1 wins all 3 groups (score: P1=3, P2=0) |
| Yes     | Yes     | Draw (score: P1=0, P2=0) — both lose     |

---

## 8. Round Comparison

### Algorithm

```
function compareRound(p1Arrangement, p2Arrangement) → RoundResult:

  1. p1Foul = !validateArrangement(p1)
  2. p2Foul = !validateArrangement(p2)

  3. IF both foul:
       all groups = draw, winner = 'draw', scores = 0/0

  4. IF only p1 fouls:
       all groups = p2 wins, winner = 'p2', scores = 0/3

  5. IF only p2 fouls:
       all groups = p1 wins, winner = 'p1', scores = 3/0

  6. IF neither fouls:
       group1Result = compareFiveCard(p1.group1, p2.group1)
       group2Result = compareFiveCard(p1.group2, p2.group2)
       group3Result = compareThreeCard(
                        evaluateThreeCard(p1.group3),
                        evaluateThreeCard(p2.group3))

       p1Score = count of groups where p1 wins
       p2Score = count of groups where p2 wins

       winner = p1Score > p2Score ? 'p1'
              : p2Score > p1Score ? 'p2'
              : 'draw'

  7. Build and return RoundResult with:
       - Per-group comparison details (result, hand descriptions, foul flags)
       - Overall winner
       - Scores
       - Both full arrangements (for result reveal)
```

### RoundResult structure

```ts
{
  group1: {
    result: 'p1' | 'p2' | 'draw',
    p1Hand: "Full House, Queens full of Nines",
    p2Hand: "Two Pair, Aces and Kings",
    p1Foul: false,
    p2Foul: false,
  },
  group2: { ... },
  group3: { ... },
  winner: 'p1' | 'p2' | 'draw',
  p1Score: 2,
  p2Score: 1,
  p1Foul: false,
  p2Foul: false,
  arrangements: {
    p1: { playerId: 1, group1: [...], group2: [...], group3: [...] },
    p2: { playerId: 2, group1: [...], group2: [...], group3: [...] },
  }
}
```

---

## 9. Game State Machine

```
                    room:join (2nd player)
                           │
                           ▼
WAITING ──────────────► ARRANGING ──────────────► LOCKED ──────────────► FINISHED
                       (cards dealt)           (both submitted)        (result shown)
                       timer starts            comparison runs         room status reset
                           │                                                │
                           │ timer expires                                  │ rematch
                           │ (auto-submit/foul)                             │
                           └───────────────────────────────────────────────┘
```

### State transitions

| From        | To          | Trigger                                   | Server Action                                    |
| ----------- | ----------- | ----------------------------------------- | ------------------------------------------------ |
| `waiting`   | `arranging` | 2nd player joins room                     | `deal()`, emit `game:dealt`, start timer         |
| `arranging` | `arranging` | Player submits                            | Store submission, emit `game:opponent_submitted` |
| `arranging` | `locked`    | Both players submitted (or timer expires) | —                                                |
| `locked`    | `finished`  | Immediate                                 | `compareRound()`, emit `game:result`             |
| `finished`  | `waiting`   | Both players request rematch              | Reset game state                                 |

### In-memory game instance

```ts
interface GameInstance {
  roomCode: string
  hands: Map<number, Card[]> // playerId → dealt 13 cards
  submissions: Map<number, PlayerArrangement> // playerId → submitted arrangement
  timerHandle: NodeJS.Timeout | null
  timerSeconds: number
  status: 'dealing' | 'arranging' | 'comparing' | 'finished'
}
```

Why in-memory (not SQLite)?

- Game state is transient — only exists during an active round
- Timer handles can't be serialized to SQLite
- In-memory Map is faster than DB queries for hot-path operations
- Dealt hands are also stored in SQLite `hands` table for crash recovery (Phase 3)

---

## 10. Realtime Event Flow

### Events added/modified for game logic

| Event                     | Direction       | Payload                                  | When                                  |
| ------------------------- | --------------- | ---------------------------------------- | ------------------------------------- |
| `game:dealt`              | Server → Client | `{ hand: Card[], timerSeconds: number }` | Game starts (2 players present)       |
| `game:timer`              | Server → Client | `{ secondsLeft: number }`                | Every second during arrangement       |
| `game:submit`             | Client → Server | `{ playerId, code, arrangement }`        | Player submits arrangement            |
| `game:opponent_submitted` | Server → Client | `{}`                                     | Other player submitted (cards hidden) |
| `game:result`             | Server → Client | `RoundResult`                            | Both submitted or timer expired       |

### Event handler registration

```
server.ts
  └── registerRoomEvents(io)      ← existing
  └── registerGameEvents(io)      ← NEW

roomEvents.ts
  └── on 'room:join' → if 2 players → triggerGameStart(io, roomCode)

gameEvents.ts
  └── on 'game:submit' → validate + store + maybe resolve
```

### Triggering game start

The game starts automatically when the 2nd player joins. This happens inside `roomEvents.ts`:

```ts
// After successful room:join
const room = getRoom(code)
if (room && room.players.length === 2) {
  triggerGameStart(io, code, room.players)
}
```

`triggerGameStart` (in `gameEvents.ts`):

1. Call `deal(2)` to get two 13-card hands
2. Create `GameInstance` in `gameManager`
3. Store hands in SQLite `hands` table
4. Update room status to `'arranging'`
5. Emit `game:dealt` to each player with only their own cards
6. Start 60-second timer

---

## 11. Security Model

### Principle: Never trust the client

The server validates everything. The client is a UI convenience.

### Card injection prevention

When a player submits an arrangement, the server verifies:

```
1. Exactly 13 cards total (5 + 5 + 3)
2. No duplicate card IDs
3. Every card ID exists in the player's dealt hand
4. No cards from outside the dealt hand
```

This prevents:

- **Card swapping**: replacing a weak card with a stronger one
- **Card duplication**: using the same card in multiple groups
- **Card injection**: adding cards that weren't dealt

### Information hiding

- `game:dealt` sends **only the recipient's cards** — never the opponent's
- During arrangement phase, players cannot see each other's cards
- `game:opponent_submitted` contains no card data — only the fact of submission
- Both arrangements are revealed **only** in `game:result` after comparison

### Payload validation

All `game:submit` payloads are validated with Zod:

```ts
const cardSchema = z.object({
  id: z.string().regex(/^[2-9TJQKA][SHDC]$/),
  rank: z.enum([
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
  ]),
  suit: z.enum(['S', 'H', 'D', 'C']),
})

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

### Rate limiting

- A player can only submit once per round — duplicate submissions are rejected
- Submissions are only accepted when game status is `'arranging'`
- Only players in the room can submit (verified via session)

---

## 12. Timer & Auto-Submit

### Timer design

- **Duration:** 60 seconds (configurable per room in future)
- **Server-side:** `setInterval` ticks every 1 second, emitting `game:timer`
- **Client-side:** Displays the server's `secondsLeft` value (no client-side countdown)

### Why server-side timer?

- Clients can manipulate local timers
- Server ensures fairness — both players get exactly the same time
- Timer ticks are synchronized via socket events

### Timer expiry handling

```
When timer reaches 0:
  For each player who hasn't submitted:
    → Mark as FOUL (didn't submit in time)
    → Create a "foul arrangement" with their dealt cards split arbitrarily

  Resolve the round as if both had submitted
    → Foul player loses all 3 groups
    → If both timed out → both foul → draw
```

### Visual urgency

| Seconds Left | FE Display                |
| ------------ | ------------------------- |
| > 30         | Normal white/gray text    |
| 10–30        | Yellow/amber text         |
| ≤ 10         | Red text, pulse animation |
| 0            | "Time's up!" overlay      |

---

## 13. Frontend Live Preview

### What the player sees while arranging

```
┌──────────────────────────────────────────────────────────┐
│ ⏱ 42s                                              Timer │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Back (5)    [A♠][K♠][Q♠][J♠][T♠]    "5/5 cards"       │
│  Middle (5)  [Q♥][Q♦][9♠][9♥][3♣]    "5/5 cards"       │
│  Front (3)   [7♠][7♥][2♣]            "One Pair"    ← live│
│                                                          │
│  ⚠ Possible foul: Middle may be stronger than Back  ← live│
│                                                          │
│  Hand: [6♠][5♥][4♦]                                     │
│                                                          │
│  [Submit Arrangement]  ← disabled if groups incomplete   │
│                         ← disabled if obvious foul       │
└──────────────────────────────────────────────────────────┘
```

### Live evaluation sources

| Display                        | Source                                               | When                                     |
| ------------------------------ | ---------------------------------------------------- | ---------------------------------------- |
| Front group label ("One Pair") | `packages/shared/evaluator.ts` `evaluateThreeCard()` | When group3 has exactly 3 cards          |
| Foul warning                   | `packages/shared/foulCheck.ts` `quickFoulCheck()`    | When both group1 and group2 have 5 cards |
| Full hand names ("Full House") | `game:result` from server                            | After round comparison                   |

---

## 14. Error Handling

### Socket errors emitted to client

| Error                  | When                        | Client Action    |
| ---------------------- | --------------------------- | ---------------- |
| "Session not found"    | Invalid playerId in payload | Redirect to Home |
| "Room not found"       | Room code doesn't exist     | Show error toast |
| "Not in this room"     | Player not a room member    | Redirect to Home |
| "Game not in progress" | Submit when no active game  | Ignore           |
| "Already submitted"    | Duplicate submission        | Ignore           |
| "Invalid cards"        | Card injection attempt      | Show error toast |
| "Invalid arrangement"  | Wrong group sizes           | Show error toast |

### Server-side error handling

- All Zod validation failures emit `EVENTS.ERROR` with the first issue message
- Card validation failures are logged at WARN level (potential cheating)
- Unhandled errors in event handlers are caught and logged at ERROR level
- Game state is never corrupted — all mutations are atomic

---

## 15. Module Dependency Graph

```
packages/shared/
  ├── types.ts          ← Card, PlayerArrangement, RoundResult, etc.
  ├── events.ts         ← EVENTS constants
  ├── evaluator.ts      ← evaluateThreeCard, compareThreeCard, RANK_VALUE
  └── foulCheck.ts      ← quickFoulCheck (FE-friendly)

apps/server/src/game/
  ├── engine.ts         ← createDeck, shuffle, deal
  │     imports: shared/types
  │
  ├── evaluator.ts      ← evaluateFiveCard, compareFiveCard, describeFiveCard
  │     imports: pokersolver, shared/types, shared/evaluator (re-exports)
  │
  ├── foulCheck.ts      ← validateArrangement
  │     imports: shared/types, ./evaluator
  │
  ├── compareRound.ts   ← compareRound
  │     imports: shared/types, shared/evaluator, ./evaluator, ./foulCheck
  │
  ├── gameManager.ts    ← GameInstance, startGame, submitArrangement, etc.
  │     imports: shared/types, ./engine
  │
  └── gameEvents.ts     ← registerGameEvents (Socket.io handlers)
        imports: shared/events, shared/types, ./gameManager, ./compareRound

apps/web/src/
  ├── hooks/useArrangement.ts  ← add live eval using shared/evaluator
  │     imports: shared/types, shared/evaluator, shared/foulCheck
  │
  ├── stores/gameStore.ts      ← game state (hand, result, timer)
  │     imports: shared/types
  │
  └── hooks/useSocket.ts       ← game event listeners
        imports: shared/events, ./stores/gameStore
```

### Key dependency rules

1. **`packages/shared/` has zero external dependencies** — no pokersolver, no Node.js APIs
2. **`apps/server/src/game/` depends on shared + pokersolver** — server-only libraries
3. **`apps/web/` depends on shared only** — never imports from server
4. **Pure functions (engine, evaluator, foulCheck, compareRound) have zero I/O** — no DB, no sockets, no timers
5. **Side effects are isolated to gameManager and gameEvents** — the only modules that touch sockets, timers, and DB
