# E2E Testing with Playwright — Setup Plan & Guide

Status: **plan** — nothing here is implemented yet. This doc covers (1) how to wire Playwright
into the pnpm workspace, (2) how Claude uses the connected `playwright-mcp` server to explore the
UI before writing specs, and (3) the concrete test plan for session / auth / lobby / game /
surrender / result.

---

## 1. Where Playwright lives in the workspace

**Decision: a dedicated workspace package `apps/e2e` (`@binh-13/e2e`)** — not inside `apps/web`.

Why a separate package:

- E2E tests exercise the **whole stack** (Socket.io server + web SPA), so they don't belong to
  the web package any more than the server package.
- `apps/web` already runs vitest with jsdom + testing-library globals. Mixing `@playwright/test`
  into the same tsconfig/vitest scope causes type clashes (`expect`, `test` globals) and forces
  vitest `exclude` hacks.
- The e2e package can depend on `@binh-13/shared` (`workspace:*`) and reuse `quickFoulCheck`,
  `RANK_VALUE`, and `EVENTS` — e.g. to compute a valid arrangement from whatever hand was dealt.
  Shared resolves straight from `src/*.ts`, no build step needed.

Cleanup from the aborted `pnpm create playwright` run: **remove `@playwright/test` from
`apps/web/package.json` devDependencies** (currently an uncommitted change) and add it to
`apps/e2e` instead. No config files were scaffolded, so nothing else to delete.

### Target file tree

```
apps/e2e/
├── package.json            # @binh-13/e2e — private, no build
├── tsconfig.json           # extends root, types: ["node"], no DOM-test globals
├── playwright.config.ts
├── fixtures/
│   └── players.ts          # onePlayer / twoPlayers fixtures (contexts + guest session)
├── helpers/
│   ├── session.ts          # createGuestSession(page, name), register/login helpers
│   ├── room.ts             # createRoom(page) -> code, joinRoom(page, code)
│   ├── arrange.ts          # readHand(page), computeValidArrangement(cards), dragCardToGroup(...)
│   └── selectors.ts        # central locator builders (see §5)
└── tests/
    ├── session.spec.ts
    ├── auth.spec.ts
    ├── lobby.spec.ts
    ├── game.spec.ts
    ├── surrender.spec.ts
    └── result.spec.ts
```

### `apps/e2e/package.json`

```jsonc
{
  "name": "@binh-13/e2e",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "playwright test",
    "test:headed": "playwright test --headed",
    "test:ui": "playwright test --ui",
    "typecheck": "tsc --noEmit",
    "report": "playwright show-report"
  },
  "devDependencies": {
    "@binh-13/shared": "workspace:*",
    "@playwright/test": "^1.61.1",
    "@types/node": "22.19.18"   // exact — see §2, trust-policy workaround
  }
}
```

Root `package.json` additions:

```jsonc
"test:e2e": "pnpm --filter @binh-13/e2e test",
"test:e2e:ui": "pnpm --filter @binh-13/e2e test:ui"
```

Note: root `pnpm test` runs vitest recursively (`-r`). `@binh-13/e2e` deliberately has **no**
`test` matching vitest — its `test` script is playwright, so **exclude it from the recursive
run**: change root `test` to `pnpm -r --filter '!@binh-13/e2e' test` (and same for
`test:coverage`), otherwise every `pnpm test` would also launch browsers.

---

## 2. The `ERR_PNPM_TRUST_DOWNGRADE` blocker (why `pnpm create playwright` failed)

The scaffold succeeded installing `@playwright/test`, then died running
`pnpm add --save-dev @types/node`: our `pnpm-workspace.yaml` sets `trustPolicy: no-downgrade`,
and re-resolving `@types/node` to latest pulls `undici-types@6.21.0`, which pnpm flags as a trust
downgrade (earlier versions had provenance attestation, this one doesn't).

The twist: `@types/node@22.19.18` → `undici-types@6.21.0` is **already in our lockfile**
(vite/vitest/server depend on it). The check only fires on a *fresh resolution* during `pnpm add`.

**Fix, in order of preference:**

1. **Pin the exact already-locked version** in `apps/e2e/package.json` by hand
   (`"@types/node": "22.19.18"`) and run plain `pnpm install` from the repo root. pnpm reuses the
   existing lockfile entry instead of re-resolving, so no trust check is triggered. *(Verify this
   on first install; if it still trips, fall through.)*
2. **Override `undici-types`** in `pnpm-workspace.yaml` to the last provenance-attested version:
   ```yaml
   overrides:
     undici-types: 6.19.8   # pick the newest version that still has provenance
   ```
   `@types/node` treats it as a plain type dep; a minor-version pin is harmless.
3. Last resort: temporarily relax `trustPolicy` for the one install, then restore it. Don't leave
   it off — it's there to catch supply-chain takeovers.

General rule going forward: **never run `pnpm create playwright` / generators in this repo** —
scaffold by hand. Generators run their own `pnpm add` calls that fight the trust policy, and they
also don't understand the workspace layout.

Browsers install separately (not gated by the trust policy — it's a direct download):

```bash
pnpm --filter @binh-13/e2e exec playwright install chromium
# WSL2 may need system deps once. Plain `sudo pnpm ...` fails (sudo's secure_path
# doesn't include the per-user pnpm install), so either carry the PATH through:
sudo env "PATH=$PATH" pnpm --filter @binh-13/e2e exec playwright install-deps chromium
# ...or print the underlying apt command and run that with sudo yourself:
pnpm --filter @binh-13/e2e exec playwright install-deps --dry-run chromium
```

---

## 3. `playwright.config.ts`

Playwright boots both dev servers itself via the `webServer` array — no manual `pnpm dev` needed
for test runs (and `reuseExistingServer` means a running `pnpm dev` is reused locally, which is
exactly what we want during MCP exploration).

```ts
import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // The server is a shared singleton (one SQLite DB, one Socket.io instance) but rooms are
  // isolated by code and player names are unique per test, so parallel workers are safe.
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @binh-13/server dev',
      url: 'http://localhost:8080/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'pnpm --filter @binh-13/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
})
```

Facts the config leans on (from the codebase, keep in sync):

- **DB wipes on every server start** — `runMigrations` drops all tables in `initDb()`. Every
  `playwright test` run therefore starts from a clean DB. No global setup/teardown needed. But
  tests **within** a run share the DB → every test must use unique names/usernames
  (`e2e-${testInfo.workerIndex}-${Date.now()}`), never assume an empty players table.
- Web dev server proxies `/api` → `:8080` and the socket connects through the same origin, so
  tests only ever talk to `localhost:5173`.
- `GAME_TIMER_SECONDS = 600` — the round timer never expires mid-test; no timer races to worry
  about (a dedicated timeout-path test would need a way to shrink this, see §7 Open items).

---

## 4. Core test architecture

### 4.1 Two-player fixture

Almost every meaningful test needs two players. Two **browser contexts** (not tabs!) give each
player isolated `localStorage` — critical because the session persists in zustand key
`binh13-session`, and two tabs in one context would share (and clobber) it.

```ts
// fixtures/players.ts
export const test = base.extend<{ p1: Page, p2: Page }>({
  p1: async ({ browser }, use, testInfo) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await createGuestSession(page, uniqueName('P1', testInfo))
    await use(page)
    await ctx.close()
  },
  p2: /* same, 'P2' */,
})
```

`createGuestSession(page, name)`: goto `/`, fill `#player-name`, click **Start**, wait for the
"Welcome back, {name}" state. That is the whole session flow — no auth needed for guest play.

A composed `twoPlayersInRoom` fixture (or helper) then does: p1 **Create Room** → read code from
Lobby → p2 **Join Room** with code. With default `autoStart: true` settings, both pages navigate
to `/room/:code/game` automatically the moment p2 joins — game tests start from there.

### 4.2 Dealing is random — compute the arrangement, don't hardcode it

`dealHands` shuffles with `crypto.randomBytes`; there is no seed hook. Tests must not assert on
specific cards. Strategy:

1. `readHand(page)`: read the 13 cards from the hand area. Cards render with
   `data-testid="playing-card"` and `aria-label` like `"A of Spades"` / `"T of Hearts"` — parse
   back to internal ids (`AS`, `TH`).
2. `computeValidArrangement(cards)`: sort descending by `RANK_VALUE` (import from
   `@binh-13/shared`), take Back = strongest 5, Middle = next 5, Front = last 3, then verify with
   `quickFoulCheck(back, middle)`. If it reports a foul (rare — e.g. accidental flush in the
   middle), swap cards between back/middle until it passes. `quickFoulCheck` is heuristic
   ("definitely foul" vs "likely valid") but erring toward the server's authoritative check is
   fine: sorted-descending arrangements that pass it will essentially never foul.
3. Drag each card to its group, then click **Submit Arrangement** (enabled only when groups are
   3/5/5 and not foul).

For tests where the *outcome* doesn't matter (surrender, "opponent submitted" indicator, result
navigation), any valid arrangement works. We intentionally do **not** assert who wins — that's
covered by `compareRound` unit tests server-side. E2E asserts the *flow*: both submit → both land
on `/room/:code/result` → result page shows three group rows + a verdict.

### 4.3 Drag-and-drop with dnd-kit

dnd-kit uses pointer events, **not** HTML5 drag events — Playwright's `locator.dragTo()` /
`page.dragAndDrop()` will not work. The `PointerSensor` has an 8px activation distance, so the
helper must move past that before dnd-kit picks the card up:

```ts
// helpers/arrange.ts
export async function dragCardToGroup(page: Page, cardId: Card, group: 'group1' | 'group2' | 'group3') {
  const card = cardLocator(page, cardId)              // [data-testid=playing-card][aria-label=...]
  const slot = page.getByTestId(`group-slot-${group}`)
  const from = await card.boundingBox()
  const to = await slot.boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 12, from.y)   // pass the 8px activation distance
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect(slot.locator('[data-testid=playing-card]', { hasText: ... })).toBeVisible()
}
```

Fallback if mouse-dragging proves flaky: the `KeyboardSensor` is also registered — focus the card,
`Space` to lift, arrow keys to move between droppables, `Space` to drop. Keep the mouse version as
primary (it matches real usage); note the keyboard path exists.

### 4.4 Conventions

- **Web-first assertions only** (`await expect(locator).toBeVisible()` etc.) — they auto-wait,
  which is how we absorb socket round-trips. **No `waitForTimeout`**, ever; realtime flows are
  exactly where fixed sleeps rot.
- Assert on **URL transitions** (`await expect(page).toHaveURL(/\/room\/[A-Z0-9]{6}\/game/)`) as
  the phase-change signal — the app is page-per-phase, so URLs are the state machine.
- Prefer role/label locators (`getByRole('button', { name: 'Submit Arrangement' })`); fall back to
  the existing `data-testid`s (`hand-area`, `group-slot-group1..3`, `playing-card`, `empty-slot`).
- Specs stay UI-driven: never emit socket events directly from tests — that's what integration
  tests (`.integration.test.ts`) are for. E2E goes through the DOM like a human.

---

## 5. Testability touch-ups in the app (small PR before writing specs)

1. **`data-card-id` on `Card`** — add `data-card-id={card.id}` next to the existing
   `data-testid="playing-card"`. Parsing `aria-label` back into card ids works but is brittle;
   a machine-readable id makes `readHand` and drag targets one attribute read.
2. **testids on flow-critical controls** that currently only have text: the Lobby room-code
   display (`data-testid="room-code"`), the result verdict container (`data-testid="round-result"`),
   and the submit state ("Waiting for opponent…" indicator). Text-based locators work today, but
   these are the anchors every spec will hang on — pin them.
3. Nothing else: forms already have proper `id`/`label` pairs (`#player-name`, `#room-code`,
   `#login-username`, `#login-password`, register fields on Profile), and dialogs are Radix
   (proper roles) — MCP snapshots confirm what's reachable (see §6).

---

## 6. Using playwright-mcp so Claude can see the UI

The `playwright` MCP server is connected in Claude Code (tools named
`mcp__playwright__browser_*`). It drives a real browser that Claude can read. Use it **before
writing every spec** — explore the real DOM, then encode what was found.

### Workflow

1. **You run `pnpm dev`** (server :8080 + web :5173). MCP drives the same dev servers a human
   uses; `reuseExistingServer` means later `playwright test` runs coexist with this.
2. Claude navigates and reads:
   - `browser_navigate` → `http://localhost:5173`
   - `browser_snapshot` → **the primary tool.** Returns the accessibility tree with roles, names,
     and element refs. This is how Claude learns which locators exist (`getByRole('button',
     { name: 'Create Room' })`) without guessing from source. Cheap, textual, always prefer it.
   - `browser_take_screenshot` → only when visual layout matters (card fan, drag highlight,
     result rows). Screenshots cost more context than snapshots; snapshot first.
   - `browser_click` / `browser_type` / `browser_fill_form` / `browser_press_key` → walk the
     actual flows (create session → create room → …) to confirm step order and what each
     transition renders.
   - `browser_console_messages` + `browser_network_requests` → debug socket connection issues,
     spot client errors a snapshot won't show.
   - `browser_drag` → try the card drag interactively; if the MCP drag doesn't trigger dnd-kit,
     that confirms specs need the manual-mouse helper from §4.3.

### The two-player trick for MCP exploration

MCP tabs share one browser context → one `localStorage` → the two "players" would overwrite each
other's `binh13-session`. Workaround: **different origins get different storage**:

- Player 1 tab: `http://localhost:5173`
- Player 2 tab: `http://127.0.0.1:5173`

Same Vite server, two origins, two independent sessions. Use `browser_tabs` to create/switch tabs
and play both sides of a full round interactively. (Real specs don't need this trick — Playwright
tests use two contexts.)

### What Claude should produce from an exploration session

For each page/flow explored: the exact locators observed (role + accessible name, or testid), the
step sequence that worked, and any surprises (disabled states, dialogs, timing). Feed that
directly into `helpers/selectors.ts` and the spec — never invent a locator that wasn't seen in a
snapshot.

---

## 7. The test plan

Ordered by dependency — implement top to bottom, since later specs reuse earlier helpers.

### 7.1 `session.spec.ts` — guest session lifecycle

| # | Scenario | Steps / assertions |
|---|----------|--------------------|
| 1 | Create guest session | `/` → fill name → **Start** → "Welcome back, {name}", Create/Join buttons visible |
| 2 | Session persists across reload | after (1), `page.reload()` → still greeted by name (socket `SESSION_RESTORE` + zustand persist) |
| 3 | Clear session ("Change") | click **Change** → back to the name form; reload → still logged out |
| 4 | Empty name rejected | Start button disabled with blank/whitespace name |

### 7.2 `auth.spec.ts` — claimable accounts (register on Profile, login on Home)

| # | Scenario | Steps / assertions |
|---|----------|--------------------|
| 1 | Register | guest session → `/profile` → fill register username/password (unique per run) → registered state shows username |
| 2 | Login from fresh context | new context → `/` → **Sign in** → submit credentials from (1) → `replaceSession`: greeted by the registered identity |
| 3 | Wrong password | login with bad password → error banner shown, still logged out |
| 4 | Duplicate username | second register with same username → server error surfaced in UI |
| 5 | Login replaces guest identity | guest session A → login as B → greeted as B, room state cleared |

Note: rate limiting exists on login (A-2a). Keep failed-login attempts per test below the limit,
and use unique usernames so parallel workers don't trip it for each other.

### 7.3 `lobby.spec.ts` — rooms

| # | Scenario | Steps / assertions |
|---|----------|--------------------|
| 1 | Create room | p1 **Create Room** → URL `/room/{CODE}`, 6-char code `[A-Z0-9]{6}` displayed, "waiting for opponent" state |
| 2 | Join room | p2 joins with code → both lobbies show both player names |
| 3 | Invalid code | join with nonexistent code → error message on Home, no navigation |
| 4 | Leave room | p2 **Leave** → p2 back on `/`; p1 sees opponent gone |
| 5 | Auto-start | both in room + `autoStart` on → both pages auto-navigate to `/room/{code}/game`, 13 cards each |
| 6 | Manual start | p1 opens room settings, disables auto-start **before** p2 joins → p2 joins → "waiting for owner"; owner clicks **Start Game** → both navigate |

### 7.4 `game.spec.ts` — arrangement & submit

| # | Scenario | Steps / assertions |
|---|----------|--------------------|
| 1 | Deal | both players see `hand-area` with 13 `playing-card`s; three empty group slots (3/5/5 capacity); Submit disabled |
| 2 | Sort | click **Sort** → hand order changes to sorted (assert relative order via `data-card-id`) |
| 3 | Drag to group | drag one card into Front → appears in `group-slot-group3`, hand has 12; drag back out works |
| 4 | Submit gating | Submit stays disabled until all 13 placed (3/5/5) |
| 5 | Full round | both players `computeValidArrangement` + drag all 13 + Submit → each sees "opponent submitted" indicator when the other submits → both auto-navigate to result |
| 6 | Foul warning | arrange a deliberate foul (weakest 5 in Back, strongest 5 in Middle — construct from the dealt hand) → foul indicator visible / submit blocked per UI rules |

(5) is the crown-jewel test and the slowest (~26 drags across two pages). Keep exactly one such
full-round test; every other spec that needs a finished round should reuse it as a helper
(`playFullRound(p1, p2)`), not re-derive it.

### 7.5 `surrender.spec.ts`

| # | Scenario | Steps / assertions |
|---|----------|--------------------|
| 1 | Surrender confirm dialog | in-game, p1 clicks Surrender → Radix alert-dialog appears; **Cancel** → still in game |
| 2 | Surrender ends round | p1 confirms surrender → both players navigate to result; result shows surrender outcome (p1 loses, p2 wins) |
| 3 | Surrender disabled after submit | p1 submits arrangement → Surrender control disabled |

### 7.6 `result.spec.ts` — result & rematch

| # | Scenario | Steps / assertions |
|---|----------|--------------------|
| 1 | Result contents | after `playFullRound` → both on `/room/{code}/result`; three group rows visible for both players; per-group win/loss markers + overall verdict rendered (don't assert *who* won) |
| 2 | Rematch happy path | p1 **Rematch** → p2 sees incoming request → p2 accepts → both auto-navigate back to `/room/{code}/game` with fresh 13-card hands |
| 3 | Rematch declined | p1 requests → p2 declines → p1 sees declined/cancelled reason |
| 4 | Leave from result | p2 leaves → back on Home; p1 sees rematch cancelled/opponent-left state |

### Open items (decide later, not blockers)

- **Timer expiry path** (auto-resolve at 0s) is untestable with a 600s constant. If we want it
  covered, add an env override (e.g. `GAME_TIMER_SECONDS` read from `import.meta.env`/`process.env`
  in shared) — needs a tiny app change; decide when we get there.
- **Reconnect flows** (`PLAYER_DISCONNECTED`/`PLAYER_RECONNECTED`, `ROOM_REJOIN`): valuable but
  fiddly (context close + recreate with copied storage). Phase 2.
- **Foul-loss full round**: submitting a real foul and asserting the all-3 loss. Needs server to
  accept foul submissions through the UI — check whether the UI hard-blocks it first.

---

## 8. CI

Add an `e2e` job to `.github/workflows/ci.yaml`, separate from (and after) the unit-test job:

```yaml
e2e:
  runs-on: ubuntu-latest
  needs: test          # match the existing job name
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with: { node-version: 22, cache: pnpm }
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @binh-13/e2e exec playwright install --with-deps chromium
    - run: pnpm --filter @binh-13/e2e test
    - uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: playwright-report
        path: apps/e2e/playwright-report/
        retention-days: 7
```

Chromium-only in CI to start (webkit/firefox add minutes for little signal on this app). Cache the
Playwright browser dir (`~/.cache/ms-playwright`) keyed on the `@playwright/test` version once the
job is stable.

Also add `apps/e2e/playwright-report/` and `apps/e2e/test-results/` to `.gitignore`.

---

## 9. Implementation order (checklist)

1. [ ] Move `@playwright/test` out of `apps/web` devDeps; create `apps/e2e` package (§1) with the
       exact-pinned `@types/node` (§2); `pnpm install` from root — confirm the trust policy stays
       quiet.
2. [ ] `playwright install chromium` (+ `install-deps` once on WSL2).
3. [ ] `playwright.config.ts` (§3); smoke spec: load `/`, expect "Server ok".
4. [ ] Testability PR: `data-card-id`, `room-code` / `round-result` testids (§5).
5. [ ] MCP exploration session per §6 → fill `helpers/selectors.ts` with observed locators.
6. [ ] Fixtures + helpers: `players.ts`, `session.ts`, `room.ts` → `session.spec.ts`, `auth.spec.ts`.
7. [ ] `lobby.spec.ts`; then `arrange.ts` (drag helper — validate against the real UI early, this
       is the highest-risk piece) → `game.spec.ts`.
8. [ ] `surrender.spec.ts`, `result.spec.ts` (reusing `playFullRound`).
9. [ ] CI job (§8) + `.gitignore` entries + root `test` filter change (§1).
