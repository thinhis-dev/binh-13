# Plan: CI with GitHub Actions

## Goal

Set up Continuous Integration (CI) using GitHub Actions that runs on every push and pull request. The pipeline checks:

1. **Lint + Format** (ESLint with `@antfu/eslint-config` — handles both linting and formatting)
2. **Type check** (TypeScript)
3. **Tests** (Vitest — both frontend and backend)
4. **Build**

Node version: **22.18+**

---

## Current State

- ✅ `pnpm typecheck` — works (runs `tsc --noEmit` in all packages)
- ✅ `pnpm test` — works (runs `vitest run` in all packages)
- ✅ `pnpm build` — works (builds shared → server + web)
- ❌ **No ESLint** configured — no config file, no dependencies
- ❌ **No `.github/workflows/` folder** exists

We'll use [`@antfu/eslint-config`](https://github.com/antfu/eslint-config) which gives us linting + formatting in one tool (no Prettier needed).

---

## Steps

### Step 1: Install ESLint (using @antfu/eslint-config)

We use [Anthony Fu's ESLint config](https://github.com/antfu/eslint-config) — a batteries-included preset that handles **both linting AND formatting** (via ESLint Stylistic). No Prettier needed.

#### 1a. Install dependencies

```bash
pnpm add -Dw eslint @antfu/eslint-config
```

Then install the React peer dependencies (antfu's config doesn't bundle them):

```bash
pnpm add -Dw @eslint-react/eslint-plugin eslint-plugin-react-refresh
```

#### 1b. Create `eslint.config.mjs` in the project root

```js
// eslint.config.mjs
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    // Enable React support
    react: true,

    // TypeScript is auto-detected, but be explicit
    typescript: true,

    // Stylistic formatting rules (replaces Prettier for JS/TS)
    stylistic: {
      indent: 2,
      quotes: 'single',
    },

    // Respect .gitignore + add custom ignores
    ignores: ['**/dist/', '**/coverage/'],
  },

  // Relax some strict rules for this project
  {
    rules: {
      // Allow console.log (we use pino on server, but console in tests/scripts)
      'no-console': 'off',

      // Allow non-null assertions (useful with Zustand stores)
      'ts/no-non-null-assertion': 'off',

      // Don't enforce top-level function style
      'antfu/top-level-function': 'off',
    },
  },

  // Even more relaxed rules for test files
  {
    files: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'ts/no-explicit-any': 'off',
      'ts/no-unsafe-assignment': 'off',
    },
  },
)
```

> **Tip:** You can see all enabled rules by running `npx @eslint/config-inspector` in the project root.

#### 1c. Update root `package.json` scripts

```jsonc
// root package.json → scripts
"lint": "eslint .",
"lint:fix": "eslint . --fix"
```

Remove the existing `"lint": "pnpm -r lint"` — a single root-level ESLint config covers the whole monorepo.

#### 1d. First run — auto-fix formatting

The first time you run ESLint it will likely report many stylistic issues (single quotes, trailing commas, etc.). Auto-fix them all at once:

```bash
pnpm lint:fix
```

Then run `pnpm lint` to check if there are remaining issues that need manual fixing.

#### 1e. (Optional) Disable rules you find too strict

If antfu's config flags things you disagree with, add them to the `rules` object above. Common ones to disable:

| Rule                               | What it does                    | How to disable                           |
| ---------------------------------- | ------------------------------- | ---------------------------------------- |
| `style/brace-style`                | Enforces stroustrup brace style | `'style/brace-style': ['error', '1tbs']` |
| `antfu/if-newline`                 | Forces newline after `if (...)` | `'antfu/if-newline': 'off'`              |
| `perfectionist/sort-imports`       | Auto-sorts imports              | `'perfectionist/sort-imports': 'off'`    |
| `unused-imports/no-unused-imports` | Errors on unused imports        | Already auto-fixed, usually fine         |

**Verify:** Run `pnpm lint` and confirm it passes with no errors.

---

### Step 2: Create the GitHub Actions Workflow

Create the file `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

# Cancel in-progress runs for the same branch/PR
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    name: Lint, Check & Test
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22.18'
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint & Format (ESLint)
        run: pnpm lint

      - name: Type check (TypeScript)
        run: pnpm typecheck

      - name: Test
        run: pnpm test

      - name: Build
        run: pnpm build
```

---

### Step 3: Verify Locally

Before pushing, run all checks locally to make sure they pass:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Fix any issues that appear. Commit everything together.

---

### Step 4: Push and Confirm

1. Commit all new/modified files:
   - `eslint.config.mjs`
   - `.github/workflows/ci.yml`
   - Updated `package.json` (root)
   - Updated `pnpm-lock.yaml`
   - Any files auto-fixed by `pnpm lint:fix`
2. Push to GitHub
3. Open the **Actions** tab in your repo — you should see the "CI" workflow running
4. If it passes ✅ you're done. If it fails, read the logs and fix.

---

## Summary of New Files

| File                       | Purpose                                               |
| -------------------------- | ----------------------------------------------------- |
| `eslint.config.mjs`        | ESLint flat config (antfu preset + React + overrides) |
| `.github/workflows/ci.yml` | GitHub Actions CI pipeline                            |

## Updated Files

| File                  | Change                                                 |
| --------------------- | ------------------------------------------------------ |
| `package.json` (root) | New devDependencies + updated `lint`, added `lint:fix` |

---

## Notes

- **Why one job, not multiple?** For a small project, a single job is simpler and faster (no overhead of spinning up multiple runners). You can split into parallel jobs later if CI gets slow.
- **`pnpm/action-setup@v4`** auto-detects the pnpm version from `package.json` → `packageManager` field. If you don't have that field, add it: `"packageManager": "pnpm@9.15.9"` (use your actual version — run `pnpm --version` to check).
- **`--frozen-lockfile`** ensures CI fails if someone forgot to update `pnpm-lock.yaml` after changing dependencies.
- **`concurrency` block** cancels stale CI runs when you push again quickly, saving Actions minutes.
- **No CD yet** — deployment will be a separate workflow added later.
