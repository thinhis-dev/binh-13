# binh-13 — Architecture & Game Design Plan

> **Status:** Draft v0.3 · **Authors:** You + GitHub Copilot  
> This is a living document. Discuss open questions before coding.

---

## Table of Contents

1. [Game Overview](#1-game-overview)
2. [Game Rules (Full Spec)](#2-game-rules-full-spec)
3. [Card Comparison Algorithm](#3-card-comparison-algorithm)
4. [Tech Stack Decision](#4-tech-stack-decision)
5. [Framework Options](#5-framework-options)
6. [Architecture](#6-architecture)
7. [Card Rendering Strategy](#7-card-rendering-strategy)
8. [Data Models](#8-data-models)
9. [Real-time Event Contract](#9-real-time-event-contract)
10. [Project Structure](#10-project-structure)
11. [Development Phases](#11-development-phases)
12. [Deployment Strategy](#12-deployment-strategy)
13. [Open Questions](#13-open-questions)

---

## 1. Game Overview

**Game name:** Binh 13 (a variant of **Chinese Poker / Pusoy**)

A browser-based real-time card game. Players share a 6-character room code to join a room.
No complex account setup — enter a name, play instantly.

### User Flow

```
Player A                              Player B
   │                                     │
[Enter name]                         [Enter name]
   │                                     │
[Create Room] ──── code: "ABC123" ───► [Join Room]
   │                                     │
   └──────────────── Lobby ─────────────┘
             (waiting for 2nd player)
   │                                     │
[Both present — cards dealt automatically]
   │                                     │
[Arrange 13 cards into 3 groups]     [Arrange 13 cards into 3 groups]
   │                                     │
[Submit arrangement]                 [Submit arrangement]
   │                                     │
   └──────── Server compares groups ─────┘
                  │
            [Show results]
            [Winner declared]
            [Rematch / Leave]
```

### UI Screens

| Screen | Path          | Description                           |
| ------ | ------------- | ------------------------------------- |
| Home   | `/`           | Enter name → Create or Join room      |
| Lobby  | `/room/:code` | Waiting for 2nd player                |
| Game   | `/room/:code` | Arrange cards into 3 groups, submit   |
| Result | `/room/:code` | Side-by-side group comparison, winner |

---

## 2. Game Rules (Full Spec)

### Setup

- Standard 52-card deck (no Jokers)
- **2 players** for MVP (design to scale to 4)
- Each player receives **13 cards**
- Players arrange their 13 cards into **3 groups**:

```
┌──────────────────────────────────────────────────────┐
│  Group 1 (Back)    │  5 cards  │  Poker hand ranking │
│  Group 2 (Middle)  │  5 cards  │  Poker hand ranking │
│  Group 3 (Front)   │  3 cards  │  Simplified ranking │
└──────────────────────────────────────────────────────┘
```

### Validity Rule (Foul Check)

> **Group 1 (Back) MUST rank ≥ Group 2 (Middle)**  
> **Group 3 (Front) is independent** — no ranking constraint relative to Middle.  
> If a player submits an arrangement where Back < Middle, it is a **foul** — they automatically lose all 3 groups.

This is the only foul condition. The Front group can be weaker, stronger, or equal to Middle — it does not matter.

This is the core skill of the game: arranging your 13 cards optimally without fouling.

### Card Rank

```
Highest → Lowest
A  K  Q  J  10  9  8  7  6  5  4  3  2
```

- Ace is **always high**
- 2 is the **lowest** card

### 5-Card Group Ranking (Poker)

Standard poker hand rankings, highest to lowest:

| Rank | Hand            | Example          |
| ---- | --------------- | ---------------- |
| 9    | Royal Flush     | A♠ K♠ Q♠ J♠ 10♠  |
| 8    | Straight Flush  | 9♥ 8♥ 7♥ 6♥ 5♥   |
| 7    | Four of a Kind  | K♠ K♥ K♦ K♣ 5♠   |
| 6    | Full House      | Q♠ Q♥ Q♦ 9♠ 9♥   |
| 5    | Flush           | A♠ J♠ 8♠ 5♠ 2♠   |
| 4    | Straight        | 8♠ 7♥ 6♦ 5♣ 4♠   |
| 3    | Three of a Kind | J♠ J♥ J♦ 7♠ 3♣   |
| 2    | Two Pair        | A♠ A♥ K♠ K♥ 5♣   |
| 1    | One Pair        | 10♠ 10♥ A♣ K♦ 2♠ |
| 0    | High Card       | A♠ J♥ 9♦ 6♣ 2♠   |

Tiebreaker within same category: compare primary cards then kickers by rank descending.

### 3-Card Group Ranking (Simplified)

| Rank | Hand            | Example  |
| ---- | --------------- | -------- |
| 2    | Three of a Kind | 7♠ 7♥ 7♦ |
| 1    | One Pair        | J♠ J♥ 5♣ |
| 0    | High Card       | A♠ K♥ 3♣ |

> **No flushes or straights in the 3-card group.**  
> Tiebreaker: compare by highest relevant card rank, then kickers.

### Winning

Each group is compared independently:

```
Player A Group 1 (Back)   vs  Player B Group 1 (Back)   → 1 point to winner
Player A Group 2 (Middle) vs  Player B Group 2 (Middle) → 1 point to winner
Player A Group 3 (Front)  vs  Player B Group 3 (Front)  → 1 point to winner
```

Player with **2 or 3 points** wins the round.

**Foul rules (resolved):**

- The UI prevents submitting an invalid arrangement (Submit button disabled, live warning shown)
- If somehow an invalid arrangement reaches the server, the server treats it as a foul: that player loses all 3 groups
- **If both players foul** → both lose (0 points each for that round)
- Tiebreaker on equal group score → **draw** (suits are not ranked; suits are equal)

---

## 3. Card Comparison Algorithm

### Recommended Library: `pokersolver`

[pokersolver](https://github.com/goldfire/pokersolver) — mature, well-tested JS library for evaluating and comparing poker hands.

```bash
pnpm add pokersolver
pnpm add -D @types/pokersolver
```

```typescript
import { Hand } from 'pokersolver'

// Card format: rank + suit (lowercase)
// Ranks: '2'-'9', 'T', 'J', 'Q', 'K', 'A'
// Suits: 's' (spades), 'h' (hearts), 'd' (diamonds), 'c' (clubs)

const handA = Hand.solve(['As', 'Ks', 'Qs', 'Js', 'Ts']) // Royal Flush
const handB = Hand.solve(['9h', '8h', '7h', '6h', '5h']) // Straight Flush

const winners = Hand.winners([handA, handB]) // [handA]
```

`pokersolver` handles all 5-card hand rankings and tiebreakers correctly.

### Custom 3-Card Evaluator (in `packages/shared`)

`pokersolver` is designed for 5+ cards. We write a small evaluator for the 3-card front group:

```typescript
// packages/shared/src/evaluator.ts

const RANK_VALUE: Record<string, number> = {
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
}

type ThreeCardCategory = 2 | 1 | 0 // ThreeOfAKind | OnePair | HighCard

interface ThreeCardRank {
  category: ThreeCardCategory
  tiebreakers: number[] // descending — primary matches first, then kickers
}

function evaluateThreeCard(cards: Card[]): ThreeCardRank {
  const values = cards.map(c => RANK_VALUE[c.rank]).sort((a, b) => b - a)
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)

  const pairs = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])

  if (pairs[0][1] === 3) {
    return { category: 2, tiebreakers: [pairs[0][0]] }
  }
  if (pairs[0][1] === 2) {
    const kicker = pairs[1][0]
    return { category: 1, tiebreakers: [pairs[0][0], kicker] }
  }
  return { category: 0, tiebreakers: values }
}

function compareThreeCard(a: ThreeCardRank, b: ThreeCardRank): -1 | 0 | 1 {
  if (a.category !== b.category)
    return a.category > b.category ? 1 : -1
  for (let i = 0; i < a.tiebreakers.length; i++) {
    if (a.tiebreakers[i] !== b.tiebreakers[i])
      return a.tiebreakers[i] > b.tiebreakers[i] ? 1 : -1
  }
  return 0
}
```

### Foul Validation

```typescript
// Group 1 (Back) must be >= Group 2 (Middle) in poker rank
function validateArrangement(arrangement: PlayerArrangement): boolean {
  const back = Hand.solve(arrangement.group1.map(toPokerSolver))
  const middle = Hand.solve(arrangement.group2.map(toPokerSolver))

  const [winner] = Hand.winners([back, middle])
  const backWinsOrDraw
    = winner === back || Hand.winners([back, middle]).length === 2

  return backWinsOrDraw
}
```

### Why Not Build From Scratch?

`pokersolver` has 4k+ stars, handles edge cases like wheel straights (A-2-3-4-5), and is actively maintained. Writing a correct poker evaluator from scratch is surprisingly error-prone (especially Ace-low straights and kicker ordering). Use the library for 5-card groups; the 3-card evaluator is simple enough to own.

### Card Format Convention

```typescript
// Our internal format — uppercase rank + uppercase suit
type CardId = string // e.g. "AS", "TH", "2C", "KD"

// pokersolver format — rank uppercase, suit lowercase
const toPokerSolver = (id: CardId): string => id[0] + id.slice(1).toLowerCase() // "AS" → "As", "10S" → "10s"

// Note: '10' stays as-is — pokersolver uses 'T' for 10
// Use 'T' in our internal format too to avoid this edge case
```

---

## 4. Tech Stack Decision

### What We're NOT Using and Why

| Rejected                            | Reason                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Next.js                             | Recent versions have had critical security vulnerabilities; SSR adds complexity we don't need for a game SPA |
| Turborepo                           | Overkill for 2–3 packages; pnpm workspaces is sufficient                                                     |
| Complex auth (Supabase Auth, Clerk) | Too much friction; we want sub-10-second game start                                                          |
| Redis / Upstash                     | External service with extra credentials; SQLite is simpler, free, and requires no network calls              |

### Chosen Stack

| Layer                  | Choice                        | Why                                                                                  |
| ---------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| **Frontend**           | React + Vite (SPA)            | No SSR needed; Vite is fast and has no known security issues; simple build output    |
| **Backend**            | Hono + Node.js                | Tiny (~14KB), fast, typed, runs on Node and edge runtimes                            |
| **Real-time**          | Socket.io                     | Best-in-class rooms, reconnection, and fallback; battle-tested                       |
| **Auth**               | Guest token (JWT, name only)  | Zero friction — enter name, start playing                                            |
| **Styling**            | Tailwind CSS 4                | Utility-first; pairs well with Vite                                                  |
| **Animations**         | Framer Motion                 | Card drag-drop and flip animations                                                   |
| **Drag-drop**          | dnd-kit                       | Accessible, touch-friendly, works on mobile                                          |
| **State (client)**     | Zustand                       | Lightweight; integrates cleanly with socket events                                   |
| **Validation**         | Zod                           | Runtime schema validation on all socket events                                       |
| **Card eval (5-card)** | pokersolver                   | Proven library; handles all poker hand rankings                                      |
| **Card eval (3-card)** | Custom (in `packages/shared`) | Simple enough to own; ~50 lines                                                      |
| **Database**           | SQLite (`better-sqlite3`)     | File-based, zero config, no external service, fast synchronous API                   |
| **Monorepo**           | pnpm workspaces               | Simple; no extra tooling; share types between apps                                   |
| **Deployment**         | Fly.io                        | WebSocket support, free tier, `fly deploy` is one command; SQLite file on Fly volume |

---

## 5. Framework Options Considered

### Real-time Framework Options

| Framework        | Best For                                                                       | Verdict                                                                       |
| ---------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| **Socket.io** ✅ | Custom game logic, full control                                                | **Chosen** — transparent, debuggable, great TypeScript support                |
| **Colyseus**     | Purpose-built multiplayer game server; built-in rooms, state sync, matchmaking | Good option if room management grows complex (4-player+). Evaluate after MVP. |
| **PartyKit**     | Serverless rooms on Cloudflare Workers                                         | Simplest deploy but limited Node.js API surface; harder to debug              |
| **Liveblocks**   | Collaborative apps (docs, whiteboards)                                         | Wrong abstraction for a card game                                             |

### Frontend Framework Options

| Framework           | Verdict                                                           |
| ------------------- | ----------------------------------------------------------------- |
| **React + Vite** ✅ | Chosen — familiar ecosystem, great DX, large library support      |
| SvelteKit           | Excellent, but less ecosystem support for dnd-kit + Framer Motion |
| Remix               | Good but still React-server heavy; overkill for a pure SPA        |
| Vue + Vite          | Solid alternative if you prefer Vue                               |

### Auth Options (future upgrade path)

| Option           | When to use                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------ |
| **Guest JWT** ✅ | MVP — enter name, get token, play immediately                                              |
| **Better Auth**  | When you want persistent accounts with social login — drop-in upgrade, minimal code change |
| **Lucia Auth**   | If you want full ownership of auth (no third-party)                                        |

### Hono vs Express — Which to Use?

Both work with Socket.io identically — both attach to Node's `http.Server`. The HTTP layer for this game is thin (health check, static file serving, `/session` endpoint). Here is the honest comparison:

|                    | **Hono**                                                | **Express**                                       |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------- |
| TypeScript         | First-class — typed routes and middleware               | Needs `@types/express`; less precise              |
| Bundle size        | ~14KB                                                   | ~220KB+ (+ middleware)                            |
| API style          | Web-standard `Request`/`Response`                       | Custom `req`/`res` objects                        |
| Ecosystem          | Growing — most Express middleware doesn't port directly | Huge — every Node.js library has Express examples |
| Socket.io examples | Fewer online, but attachment is identical               | Officially documented with Express                |
| Future runtimes    | Runs on Node, Bun, Cloudflare Workers                   | Node.js only                                      |

**Verdict: Hono.** Reasons:

1. First-class TypeScript keeps the whole codebase consistently typed
2. Web-standard `Request`/`Response` — less custom API surface to learn
3. The HTTP layer is so thin that we don't need Express's wide middleware ecosystem
4. If we ever want Bun or Cloudflare Workers, Hono works without code changes

Socket.io attachment with Hono is straightforward:

```typescript
import { serve } from '@hono/node-server'
import { Server as SocketServer } from 'socket.io'

const app = new Hono()
const httpServer = serve({ fetch: app.fetch, port: 8080 })
const io = new SocketServer(httpServer, { cors: { origin: CORS_ORIGIN } })
```

---

## 6. Architecture

### High-Level

```
┌─────────────────────┐           ┌──────────────────────────────────┐
│  Browser            │           │  Game Server (Fly.io)            │
│                     │           │                                  │
│  React + Vite SPA   │─WebSocket─►  Hono HTTP + Socket.io           │
│                     │           │                                  │
│  Zustand store      │◄──────────│  ┌────────────────────────────┐  │
│                     │  events   │  │  Room Manager              │  │
│  pokersolver        │           │  │  Game Engine (pure fn)     │  │
│  + 3-card eval      │           │  │  Card Evaluator            │  │
│  (UI previews)      │           │  │  Session Manager (JWT)     │  │
└─────────────────────┘           │  └──────────────┬─────────────┘  │
                                  │                 │                │
                                  │          SQLite (file)           │
                                  │          (room + session state)  │
                                  └──────────────────────────────────┘
```

### Key Design Principles

1. **Server is authoritative** — clients propose arrangements, server validates + compares. The server result is final.
2. **Evaluator lives in `packages/shared`** — both server (authoritative) and client (live UI preview of hand strength) use the same code.
3. **No opponent's cards until reveal** — server holds both hands; sends each player only their own hand via `game:dealt`. Reveals both only in `game:result`.
4. **Rooms are ephemeral** — stored in SQLite with an `expires_at` timestamp. A cleanup pass removes stale rooms on server start and periodically. No external service needed.
5. **Scale to 4 players** — `Room.players` is an array; comparison logic iterates pairs. No 2-player hardcoding.

### Session / Auth Design (Frictionless)

```
Player visits /
     │
[Enter display name "Bim"]
     │
POST /session { name: "Bim" }
     │
Server returns: { playerId: uuid, token: jwt }
     │
Token stored in localStorage (persists across refreshes)
     │
All socket events include the token for identity
     │
On reconnect → socket sends token → server restores session
```

No email. No password. No OAuth. Token-based guest sessions only for MVP.  
**Future upgrade:** Add `Better Auth` social login without breaking existing token flow.

### Game State Machine

```
                  ┌─────────────────────────────────────────────┐
                  │                                             │
WAITING ──► IN_PROGRESS ──► ARRANGING ──► LOCKED ──► FINISHED ──► WAITING (rematch)
              (cards dealt)   (timer on)  (both        (result
                                          submitted)    shown)
```

---

## 7. Card Rendering Strategy

13 cards in hand + 3 groups visible + opponent's face-down cards = up to ~30 card elements on screen. Rendering must be smooth.

### Approach: Inline SVG Components (Recommended for MVP)

Each card is a self-contained SVG React component. No image assets.

```tsx
// components/card/Card.tsx
const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' }
const RED_SUITS = new Set(['H', 'D'])

function Card({ rank, suit, faceDown = false }: CardProps) {
  if (faceDown)
    return <CardBack />

  return (
    <svg
      viewBox="0 0 70 100"
      className="card"
      aria-label={`${rank} of ${suit}`}
    >
      <rect
        width="70"
        height="100"
        rx="6"
        fill="white"
        stroke="#e2e8f0"
        strokeWidth="1.5"
      />
      <text
        x="6"
        y="18"
        fontSize="14"
        fontWeight="bold"
        fill={RED_SUITS.has(suit) ? '#dc2626' : '#1e293b'}
      >
        {rank}
      </text>
      <text
        x="35"
        y="62"
        fontSize="28"
        textAnchor="middle"
        fill={RED_SUITS.has(suit) ? '#dc2626' : '#1e293b'}
      >
        {SUIT_SYMBOL[suit]}
      </text>
    </svg>
  )
}
```

**Why SVG over images:**

- No HTTP requests for card assets
- Perfectly sharp at any screen size
- Animatable with Framer Motion
- Accessible via `aria-label`
- No licensing concerns

**Optimization — avoid re-rendering all 52 cards:**

- Wrap `Card` in `React.memo` — cards don't re-render unless their props change
- Only the group slots and hand re-render on drag events
- Use `content-visibility: auto` on the hand container for off-screen cards

### Drag-and-Drop: dnd-kit

[dnd-kit](https://dndkit.com) — accessible, touch-friendly, no dependency on HTML5 DnD API.

```tsx
// User drags a card from hand → drops into Group 1 slot
<DndContext onDragEnd={handleDragEnd}>
  <Hand cards={unassignedCards} />
  {' '}
  {/* draggable source */}
  <GroupSlot group={1} maxCards={5} />
  {' '}
  {/* droppable target */}
  <GroupSlot group={2} maxCards={5} />
  <GroupSlot group={3} maxCards={3} />
</DndContext>
```

### Live Hand Strength Preview

As the player arranges cards, show a real-time label per group using the client-side evaluator:

```
Group 1: [ A♠ ][ K♠ ][ Q♠ ][ J♠ ][ 10♠ ]  →  "Royal Flush ✓"
Group 2: [ Q♥ ][ Q♦ ][ 9♠ ][ 9♥ ][ 3♣  ]  →  "Full House ✓"
Group 3: [ 7♠ ][ 7♥ ][ 2♣ ]           →  "One Pair ✓"
                                              [Group 1 ≥ Group 2 ✓]
```

The foul check runs live — if the arrangement is invalid, the Submit button is disabled and shows "⚠ Group 2 cannot be stronger than Group 1".

### Game Board Layout

```
┌──────────────────────────────────────────────┐
│ Opponent: "Player B"  ⏱ 0:42                │
├──────────────────────────────────────────────┤
│ [■■■■■] Group1   [■■■■■] Group2   [■■■] G3  │ ← opponent (face down)
├──────────────────────────────────────────────┤
│                                              │
│  Drop Zone 1 (5)    Drop Zone 2 (5)         │
│  [    ][    ][    ][    ][    ]              │
│  [    ][    ][    ][    ][    ]              │
│  Drop Zone 3 (3)                            │
│  [    ][    ][    ]                         │
│                                              │
│ "Group 1: Full House ✓"                     │
│ "Group 2: Two Pair ✓"    "Group 1 ≥ Group 2 ✓" │
│ "Group 3: High Card"                        │
├──────────────────────────────────────────────┤
│ Your hand (remaining unassigned cards):      │
│ [2♠][7♥][A♦][K♣][Q♠][J♥][T♦][9♣][8♠]...  │
├──────────────────────────────────────────────┤
│           [Submit Arrangement]               │
└──────────────────────────────────────────────┘
```

---

## 8. Data Models

### Card

```typescript
// packages/shared/src/types.ts

type Suit = 'S' | 'H' | 'D' | 'C' // Spades, Hearts, Diamonds, Clubs
type Rank
  = | '2'
    | '3'
    | '4'
    | '5'
    | '6'
    | '7'
    | '8'
    | '9'
    | 'T'
    | 'J'
    | 'Q'
    | 'K'
    | 'A'
// Note: use 'T' for 10 — aligns with pokersolver's format

interface Card {
  id: string // rank + suit, e.g. "AS", "TH", "2C", "KD"
  rank: Rank
  suit: Suit
}
```

### Player Arrangement

```typescript
interface PlayerArrangement {
  playerId: string
  group1: [Card, Card, Card, Card, Card] // Back — must be strongest
  group2: [Card, Card, Card, Card, Card] // Middle
  group3: [Card, Card, Card] // Front — simplified rules
}
```

### Game Mode

```typescript
// Set by room creator when creating the room
type GameMode
  = | { type: 'single' } // 1 round
    | { type: 'best_of', rounds: 3 | 5 | 7 } // BO3 / BO5 / BO7
    | { type: 'custom', roundCount: number } // any fixed number
```

### Room

```typescript
type RoomStatus = 'waiting' | 'arranging' | 'locked' | 'finished'

interface Player {
  id: string
  name: string
  connected: boolean
}

interface Room {
  code: string
  status: RoomStatus
  players: Player[] // max 2 for MVP; array supports 4-player future
  mode: GameMode // set by room creator; defaults to single
  currentRound: number // 1-indexed
  createdAt: number
  expiresAt: number
}
```

### Game Result

```typescript
type GroupResult = 'p1' | 'p2' | 'draw'

interface GroupComparison {
  result: GroupResult
  p1Hand: string // e.g. "Full House, Queens full of Nines"
  p2Hand: string
  p1Foul: boolean
  p2Foul: boolean
}

interface RoundResult {
  group1: GroupComparison
  group2: GroupComparison
  group3: GroupComparison
  winner: 'p1' | 'p2' | 'draw' // draw if both foul or tied
  p1Score: number // 0–3 groups won
  p2Score: number
  p1Foul: boolean
  p2Foul: boolean
  arrangements: {
    p1: PlayerArrangement
    p2: PlayerArrangement
  }
}

// Accumulates across rounds for multi-round modes
interface SessionResult {
  mode: GameMode
  rounds: RoundResult[]
  p1RoundsWon: number
  p2RoundsWon: number
  sessionWinner: 'p1' | 'p2' | 'draw' | null // null while in progress
}
```

### SQLite Schema

```sql
-- Sessions (guest players)
CREATE TABLE sessions (
  player_id  TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  token_hash TEXT NOT NULL,  -- bcrypt hash of the JWT; raw token is never stored
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL  -- unix timestamp; 7 days
);

-- Rooms
CREATE TABLE rooms (
  code          TEXT PRIMARY KEY,
  status        TEXT NOT NULL DEFAULT 'waiting',
  mode_json     TEXT NOT NULL DEFAULT '{"type":"single"}',  -- GameMode as JSON
  current_round INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL  -- unix timestamp; 2 hours
);

-- Players in a room (max 2 for MVP)
CREATE TABLE room_players (
  room_code  TEXT NOT NULL REFERENCES rooms(code),
  player_id  TEXT NOT NULL REFERENCES sessions(player_id),
  connected  INTEGER NOT NULL DEFAULT 1,  -- boolean
  PRIMARY KEY (room_code, player_id)
);

-- Dealt hands (private per player)
CREATE TABLE hands (
  room_code  TEXT NOT NULL,
  player_id  TEXT NOT NULL,
  cards_json TEXT NOT NULL,  -- Card[] as JSON
  PRIMARY KEY (room_code, player_id)
);

-- Submitted arrangements
CREATE TABLE arrangements (
  room_code        TEXT NOT NULL,
  player_id        TEXT NOT NULL,
  arrangement_json TEXT NOT NULL,  -- PlayerArrangement as JSON
  submitted_at     INTEGER NOT NULL,
  PRIMARY KEY (room_code, player_id)
);
```

`better-sqlite3` is synchronous — reads and writes are straightforward function calls, no `await` needed inside the game engine. Perfect for a server that processes one room at a time.

---

## 9. Real-time Event Contract

### Client → Server (all validated with Zod on server)

| Event            | Payload                                             | Description                  |
| ---------------- | --------------------------------------------------- | ---------------------------- |
| `session:create` | `{ name: string }`                                  | Create guest session         |
| `room:create`    | `{ token: string }`                                 | Create room, become Player 1 |
| `room:join`      | `{ code: string, token: string }`                   | Join existing room           |
| `room:rejoin`    | `{ code: string, token: string }`                   | Reconnect after disconnect   |
| `game:submit`    | `{ arrangement: PlayerArrangement, token: string }` | Submit final arrangement     |

### Server → Client

| Event                     | Payload                                  | Description                             |
| ------------------------- | ---------------------------------------- | --------------------------------------- |
| `session:created`         | `{ playerId, token }`                    | Session ready                           |
| `room:created`            | `{ code }`                               | Room created                            |
| `room:joined`             | `{ code, players }`                      | Joined room state                       |
| `room:state`              | `{ players, status }`                    | Lobby update (player 2 joined)          |
| `game:dealt`              | `{ hand: Card[], timerSeconds: number }` | Your 13 private cards + countdown       |
| `game:timer`              | `{ secondsLeft: number }`                | Countdown tick (every second)           |
| `game:opponent_submitted` | `{}`                                     | Opponent locked in (cards still hidden) |
| `game:result`             | `RoundResult`                            | Both submitted — full reveal            |
| `player:disconnected`     | `{ name: string }`                       | Opponent dropped                        |
| `player:reconnected`      | `{ name: string }`                       | Opponent back                           |
| `error`                   | `{ code: string, message: string }`      | Rejected action                         |

### Socket Event Name Constants

```typescript
// packages/shared/src/events.ts
// Always import from here — never use raw strings

export const EVENTS = {
  SESSION_CREATE: 'session:create',
  SESSION_CREATED: 'session:created',
  ROOM_CREATE: 'room:create',
  ROOM_CREATED: 'room:created',
  ROOM_JOIN: 'room:join',
  ROOM_JOINED: 'room:joined',
  ROOM_REJOIN: 'room:rejoin',
  ROOM_STATE: 'room:state',
  GAME_DEALT: 'game:dealt',
  GAME_TIMER: 'game:timer',
  GAME_SUBMIT: 'game:submit',
  GAME_OPPONENT_SUBMITTED: 'game:opponent_submitted',
  GAME_RESULT: 'game:result',
  PLAYER_DISCONNECTED: 'player:disconnected',
  PLAYER_RECONNECTED: 'player:reconnected',
  ERROR: 'error',
} as const
```

---

## 10. Project Structure

```
binh-13/
├── apps/
│   ├── web/                            # React + Vite SPA
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── Home.tsx            # Name input + create/join
│   │   │   │   ├── Lobby.tsx           # Waiting for players
│   │   │   │   ├── Game.tsx            # Card arrangement screen
│   │   │   │   └── Result.tsx          # Round result reveal
│   │   │   ├── components/
│   │   │   │   ├── card/
│   │   │   │   │   ├── Card.tsx        # SVG card (memo'd)
│   │   │   │   │   ├── CardBack.tsx    # Face-down card
│   │   │   │   │   └── Hand.tsx        # Draggable card row
│   │   │   │   ├── game/
│   │   │   │   │   ├── GroupSlot.tsx   # Droppable group zone
│   │   │   │   │   ├── HandPreview.tsx # Live "Full House ✓" label
│   │   │   │   │   ├── Table.tsx       # Full game board layout
│   │   │   │   │   └── ResultGrid.tsx  # Group-by-group comparison
│   │   │   │   └── ui/                 # Button, Input, Modal, Timer
│   │   │   ├── hooks/
│   │   │   │   ├── useSocket.ts        # Typed socket event bindings
│   │   │   │   └── useArrangement.ts   # dnd-kit state + live eval
│   │   │   ├── stores/
│   │   │   │   ├── sessionStore.ts     # playerId, token, name (persisted)
│   │   │   │   └── gameStore.ts        # hand, arrangement, room, result
│   │   │   └── lib/
│   │   │       ├── socket.ts           # Socket.io singleton
│   │   │       └── cards.ts            # SUIT_SYMBOL, RANK_VALUE, helpers
│   │   ├── index.html
│   │   └── vite.config.ts
│   │
│   └── server/                         # Hono + Socket.io
│       ├── src/
│       │   ├── rooms/
│       │   │   ├── roomManager.ts      # Create/join/expire rooms via Redis
│       │   │   └── roomEvents.ts       # Socket event handlers for rooms
│       │   ├── game/
│       │   │   ├── engine.ts           # shuffle(), deal() — pure functions
│       │   │   ├── evaluator.ts        # Wraps pokersolver + compareThreeCard
│       │   │   ├── foulCheck.ts        # validateArrangement()
│       │   │   ├── compareRound.ts     # Full round comparison logic
│       │   │   └── __tests__/          # Vitest unit tests for all engine fns
│       │   ├── session/
│       │   │   └── sessionManager.ts   # JWT guest token create/verify
│       │   ├── db.ts                   # better-sqlite3 client + schema init
│       │   └── index.ts                # Hono app + Socket.io bootstrap
│       └── package.json
│
├── packages/
│   └── shared/                         # Shared between web + server
│       ├── src/
│       │   ├── types.ts                # Card, Room, PlayerArrangement, RoundResult
│       │   ├── events.ts               # EVENTS constant map
│       │   └── evaluator.ts            # evaluateThreeCard, compareThreeCard
│       └── package.json
│
├── pnpm-workspace.yaml
├── package.json                        # Root scripts: dev, build, test, typecheck
├── PLAN.md                             # This file
└── AGENTS.md                           # AI agent instructions
```

---

## 11. Development Phases

### Phase 1 — Skeleton (Week 1)

- [ ] pnpm monorepo setup — `packages/shared`, `apps/web`, `apps/server`
- [ ] `packages/shared`: all types, EVENTS constants, 3-card evaluator
- [ ] Server: Hono + Socket.io bootstrap, `/health` endpoint
- [ ] Server: Guest session (JWT sign/verify), `session:create` event
- [ ] Server: Room create/join with in-memory Map (no Redis yet)
- [ ] Web: React + Vite + Tailwind + react-router setup
- [ ] Web: Home page — name input, create/join buttons
- [ ] Web: `useSocket.ts` — typed socket connection hook
- [ ] Web: Lobby screen — show connected players
- [ ] **Milestone:** Two tabs can create and join the same room and see each other

### Phase 2 — Card Engine (Week 2)

- [ ] Server: `engine.ts` — shuffle and deal 13 cards per player
- [ ] Server: `evaluator.ts` + `foulCheck.ts` (unit tested with Vitest)
- [ ] Server: `compareRound.ts` — full round comparison using pokersolver
- [ ] Web: `Card.tsx` SVG component (memoized)
- [ ] Web: Game board layout + dnd-kit drag-and-drop
- [ ] Web: `useArrangement.ts` — live hand evaluation as player drags
- [ ] Web: Submit flow → receive `game:result`
- [ ] Web: `ResultGrid.tsx` — group-by-group comparison reveal
- [ ] **Milestone:** Two players can play a complete round start-to-finish

### Phase 3 — Resilience (Week 3)

- [ ] Server: Reconnection — `room:rejoin` with token
- [ ] Server: Arrangement timer — countdown with `game:timer` events
- [ ] Server: Auto-submit on timer expiry
- [ ] Server: Switch in-memory Map → SQLite (`better-sqlite3`); add stale room cleanup
- [ ] Web: Disconnection/reconnection UI banners
- [ ] Web: Timer display + urgency styling (red when < 10s)
- [ ] Web: Rematch flow
- [ ] Web: Mobile-responsive game board
- [ ] **Milestone:** Game survives refreshes and reconnects

### Phase 4 — Polish & Deploy (Week 4)

- [ ] Fly.io setup — `fly.toml`, Dockerfile for server
- [ ] Static frontend bundled with server (serve `dist/` from Hono)
- [ ] Card flip animation on result reveal (Framer Motion)
- [ ] Share room link (pre-filled code in URL)
- [ ] Sound effects (card deal, submit, win)
- [ ] GitHub Actions CI — lint + typecheck + test on PR
- [ ] **Milestone:** Public URL shareable with friends

---

## 12. Deployment Strategy

### Goal: Simplest Possible Deployment

Serve frontend static files from the same Hono server — one app, one deploy.

```
Fly.io (single app)
    └── Hono server (Node.js)
          ├── Socket.io (wss://)
          ├── GET /           → serves dist/index.html (React SPA)
          └── GET /assets/*   → serves Vite build assets
```

```bash
# One command to deploy everything
fly deploy
```

### Build Pipeline

```bash
# Build step (in Dockerfile or fly.toml [deploy] release_command)
pnpm --filter web build          # → apps/web/dist/
pnpm --filter server build       # → apps/server/dist/
# Server copies or references apps/web/dist/ for static serving
```

### Environment Variables (Fly.io secrets)

```bash
fly secrets set JWT_SECRET="..."
# No external DB credentials needed — SQLite is a local file on the Fly volume
```

```bash
# Build-time env for Vite (set in fly.toml [build.args])
VITE_SOCKET_URL=wss://binh-13.fly.dev
```

```bash
# Server runtime env
DATABASE_PATH=/data/binh13.db   # mounted Fly volume path in prod; ./dev.db locally
```

### fly.toml (skeleton)

```toml
app = "binh-13"
primary_region = "sin" # Singapore — closest to Vietnam

[build]
dockerfile = "apps/server/Dockerfile"

[[services]]
protocol = "tcp"
internal_port = 8080

[[services.ports]]
port = 443
handlers = [
  "tls",
  "http"
]

[services.concurrency]
type = "connections"
hard_limit = 100
```

---

## 13. Open Questions

### ✅ Resolved

| #   | Question                                  | Decision                                                                                                                                                                      |
| --- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Suit ranking in tiebreakers?**          | **No suit ranking.** Equal hands → draw.                                                                                                                                      |
| 2   | **If both players foul?**                 | **Both lose** — 0 points each for that round, `winner: 'draw'`.                                                                                                               |
| 3   | **Foul handling UX**                      | UI prevents submitting invalid arrangement (Submit button disabled). Server validates as defense-in-depth — invalid submission = foul.                                        |
| 4   | **Arrangement timer**                     | **60 seconds.** Auto-submit on expiry if arrangement is valid; forfeit (foul) if incomplete.                                                                                  |
| 5   | **Multi-round play?**                     | **Multiple modes:** single, BO3, BO5, custom. Room creator picks mode. `GameMode` + `SessionResult` types added.                                                              |
| 6   | **Foul cross-check: Group 2 vs Group 3?** | **Group 3 (Front) is independent.** Only `Back ≥ Middle` is enforced. Front can be any valid 3-card hand regardless of Middle's rank.                                         |
| 7   | **CSS layout direction?**                 | **Desktop-first.** Design for wide screens; add responsive breakpoints for mobile as a secondary concern. Use Tailwind's `md:` / `lg:` prefixes to shrink down, not scale up. |

### ⏳ Still Open

Answer these before Phase 2 implementation starts.

| #   | Question                                                                                      | Why It Matters                                                 |
| --- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 8   | **Bonus scoring?** 3-0 sweep = 2 points, 2-1 = 1 point? Or flat win/lose?                     | Affects `SessionResult` scoring                                |
| 9   | **4-player comparison format?** Round-robin (each vs each, 3 matchups per player) or bracket? | Data model supports N players; comparison logic needs defining |
| 10  | **Spectator mode?** Can someone join a room and watch without playing?                        | Affects which events are emitted to non-player sockets         |
