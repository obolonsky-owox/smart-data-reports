# Smart Data Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Smart Data Reports ODM plugin: a report builder over a data mart and its joinable data marts, with per-date-column periods, a 2,500-row capped result table, an entity-relationship canvas, saved reports, and a one-click Google Sheets report that also surfaces ODM's SQL.

**Architecture:** A static React SPA served from GitHub Pages and loaded by ODM in its plugin iframe. All data work happens in ODM: the plugin reads the blendable schema and relationship graph, turns the user's selection into an ODM read plan, streams rows through HTTP Data, and creates or updates ODM reports for Google Sheets. Pure logic lives in `ui/lib/*` (no React) and is unit-tested; React features under `ui/features/*` are props-driven and tested against an SDK mock.

**Tech Stack:** React 19, TypeScript 5.9, Vite 6, Tailwind CSS v4 (`@tailwindcss/vite`), vendored ODM UI primitives (shadcn/ui over Radix), lucide-react, Sonner, `@xyflow/react` + `@dagrejs/dagre`, `@dnd-kit`, Vitest 3 + Testing Library + happy-dom, ESLint 9, `@owox/plugin-sdk` 0.36.0.

**Spec:** `docs/superpowers/specs/2026-10-02-smart-data-reports-design.md` — read it before starting any task.

## Global Constraints

- Node `>=22.22`; `@owox/plugin-sdk` pinned exactly at `0.36.0`.
- Vite `root: 'ui'`, `base: '/smart-data-reports/'` on build, `build.outDir: '../dist'`.
- Delivery URL `https://owox.github.io/smart-data-reports/`; never point the production `plugin.json` at a tunnel.
- No `localStorage`, `sessionStorage`, cookies, IndexedDB or service workers. No credentials, API keys or `.env*` files.
- `ui/lib/*` never imports React. `ui/vendor/*` is never edited by hand — only by `npm run sync:ui`.
- Row cap `2500`; HTTP Data `limit: 2501`; page size `100`; default date range *Last 30 days* sent as `last_n_days` with `n: 29` (30 days including today).
- Queries run only on *Apply*; pagination never re-queries.
- The `reports` collection declaration is exactly: `{ "name": "reports", "scope": "project", "entityBinding": { "type": "data-mart", "actions": { "read": "USE", "create": "USE", "update": "USE", "delete": "USE" } } }`. It is final from the first release.
- UI copy: English, sentence case, "you", no emoji, precise numbers ("2,500 rows").
- Styling: semantic tokens only (`bg-background`, `text-muted-foreground`, `bg-warning-bg text-warning`, …); no hex/rgb/oklch, no `text-gray-*`, no `bg-white` without a dark pair; Lucide icons `h-4 w-4` in controls.
- Commits, code comments, PR text: English. Never commit `node_modules/`, `dist/`, `.DS_Store`, `.env*`.
- Before calling any task done: `npm run lint && npm run typecheck && npm test` pass.

## Review Focus

1. **A saved report references a column that no longer exists** (renamed or hidden field) → the editor shows it as "Unavailable" with *Remove*, *Apply* is blocked with a clear message, nothing crashes. Pinned in Task 7 (`validateDraft` unknown-column) and Task 20 (editor integration test).
2. **Apply pressed twice, or the main data mart changed, while a query is still streaming** → the older run is cancelled and its rows never replace the newer result. Pinned in Task 14 (`useQueryRun` race test).
3. **Cells hold `null`, booleans, nested objects or 5,000-character strings** → the table renders `—`, `true`/`false`, compact JSON and a truncated string; no crash. Pinned in Task 11 (`formatCell`).
4. **The collection returns short or empty pages with a non-null cursor, or a document from an unknown schema version** → listing keeps paging until the cursor is null and skips the bad document. Pinned in Task 10 (`listAll`).
5. **The blendable schema of the chosen main data mart fails (403/500) or has no reportable fields** → the editor shows an inline error or empty state with a way back, not a blank screen. Pinned in Task 14 (`useSchema` error) and Task 20 (editor integration test).

## File Structure

```
plugin.json                         manifest (collection declaration is final)
package.json, tsconfig.json, vite.config.ts, vitest.config.ts, eslint.config.js
scripts/sync-ui.mjs                 refreshes ui/vendor/owox-ui from owox-data-marts
.github/workflows/deploy-pages.yml  lint, typecheck, test, build, deploy
AGENTS.md, README.md
docs/verification/host-checks.md    Step 0 results
ui/
  index.html, main.tsx, bootstrap.tsx, App.tsx, services.tsx, probe.tsx (dev only)
  sdk-mock.ts                       SDK stand-in for vite dev and vitest
  styles/app.css                    imports vendored globals.css
  vendor/owox-ui/                   VENDORED — components/, lib/, styles/, VENDORED_FROM
  fixtures/smart-data.ts            Visitor/Contact/User/Session/Pageview/Page model
  test/setup.ts
  lib/                              pure logic, no React
    plugin-runtime.ts  odm-types.ts  schema-index.ts  date-ranges.ts  report-draft.ts
    read-plan.ts  errors.ts  odm-api.ts  report-store.ts  output-columns.ts  format.ts
    sql-highlight.ts  filter-operators.ts  sheets-sync.ts  canvas-model.ts
  features/
    reports-list/ReportsListPage.tsx
    editor/EditorPage.tsx  use-schema.ts  use-query-run.ts  use-report-document.ts
    column-panel/ColumnPanel.tsx  AllFieldsTab.tsx  SelectedTab.tsx  PathDialog.tsx
                 DateChoiceDialog.tsx  DateRangeEditor.tsx  FilterEditor.tsx  TypeBadge.tsx
    data-table/ResultTable.tsx  ColumnHeader.tsx
    canvas/RelationshipCanvas.tsx
    sheets/SheetsReportDialog.tsx
    sql/SqlTab.tsx
```

---
### Task 1: Scaffold the plugin repository

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `plugin.json`
- Create: `ui/index.html`, `ui/main.tsx`, `ui/bootstrap.tsx`, `ui/App.tsx`, `ui/styles/app.css`, `ui/sdk-mock.ts`, `ui/lib/plugin-runtime.ts`, `ui/test/setup.ts`
- Create: `.github/workflows/deploy-pages.yml`, `AGENTS.md`, `README.md`
- Test: `ui/bootstrap.test.tsx`, `ui/plugin-manifest.test.ts`

**Interfaces:**
- Produces: `initializePlugin(): Promise<PluginContext>`, `resetPluginContextForTests(): void` (`ui/lib/plugin-runtime.ts`); `bootstrap(container?: HTMLElement): Promise<Root>` (`ui/bootstrap.tsx`); `App({ context }: { context: PluginContext })` (`ui/App.tsx`, replaced in Task 13); `__resetForTests()`, `__setTheme(theme)` (`ui/sdk-mock.ts`, extended in Task 13).

- [ ] **Step 1: Create `package.json` and install dependencies**

```json
{
  "name": "smart-data-reports",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.22" },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "sync:ui": "node scripts/sync-ui.mjs"
  }
}
```

Run:

```bash
npm install --save-exact @owox/plugin-sdk@0.36.0
npm install react@^19 react-dom@^19 lucide-react@^0.475.0
npm install -D typescript@~5.9.0 vite@^6 @vitejs/plugin-react@^4 tailwindcss@^4 @tailwindcss/vite@^4 \
  vitest@^3 happy-dom@^17 @testing-library/react@^16 @testing-library/user-event@^14 \
  @testing-library/jest-dom@^6 @types/react@^19 @types/react-dom@^19 @types/node@^22 \
  eslint@^9 @eslint/js@^9 typescript-eslint@^8 eslint-plugin-react-hooks@^5 globals@^15
```

Expected: `package-lock.json` created, no `ERR!` lines.

- [ ] **Step 2: Create the TypeScript, Vite, Vitest and ESLint configs**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "types": ["vitest/globals", "@testing-library/jest-dom", "node"],
    "baseUrl": ".",
    "paths": { "@owox/ui/*": ["./ui/vendor/owox-ui/*"] }
  },
  "include": ["ui", "vite.config.ts", "vitest.config.ts"]
}
```

`@owox/plugin-sdk` is deliberately **not** aliased here: typecheck sees the real SDK types. Only Vite dev and Vitest swap in the mock.

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  root: 'ui',
  base: command === 'build' ? '/smart-data-reports/' : '/',
  resolve: {
    alias: {
      '@owox/ui': fromRoot('./ui/vendor/owox-ui'),
      // The real SDK only works inside the ODM iframe. `vite dev` uses the mock unless
      // VITE_REAL_SDK=1, which the tunnel loop on a real host sets.
      ...(command === 'serve' && process.env.VITE_REAL_SDK !== '1'
        ? { '@owox/plugin-sdk': fromRoot('./ui/sdk-mock.ts') }
        : {}),
    },
  },
  server: {
    // The plugin iframe has an opaque origin, so even our own bundle is a cross-origin fetch.
    cors: true,
    allowedHosts: process.env.TUNNEL_HOST ? [process.env.TUNNEL_HOST] : [],
  },
  build: { outDir: '../dist', emptyOutDir: true },
}));
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@owox/ui': fromRoot('./ui/vendor/owox-ui'),
      '@owox/plugin-sdk': fromRoot('./ui/sdk-mock.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    css: false,
    setupFiles: ['./ui/test/setup.ts'],
    include: ['ui/**/*.test.{ts,tsx}'],
  },
});
```

`eslint.config.js`:

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'ui/vendor'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-globals': ['error', 'localStorage', 'sessionStorage', 'indexedDB'],
    },
  },
  {
    files: ['ui/lib/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['react', 'react-dom', 'react/*'], message: 'ui/lib stays free of React.' }] },
      ],
    },
  },
  { files: ['scripts/**/*.mjs', '*.config.{js,ts}'], languageOptions: { globals: { ...globals.node } } },
);
```

- [ ] **Step 3: Create the manifest and its guard test**

`plugin.json`:

```json
{
  "name": "Smart Data Reports",
  "description": "Build ad-hoc reports on your data marts and their joinable data marts, see the result in seconds, and send it to Google Sheets.",
  "delivery": { "type": "remote", "url": "https://owox.github.io/smart-data-reports/" },
  "collections": [
    {
      "name": "reports",
      "scope": "project",
      "entityBinding": {
        "type": "data-mart",
        "actions": { "read": "USE", "create": "USE", "update": "USE", "delete": "USE" }
      }
    }
  ]
}
```

`ui/plugin-manifest.test.ts`:

```ts
import manifest from '../plugin.json';

describe('plugin.json', () => {
  it('serves from GitHub Pages, never from a tunnel', () => {
    expect(manifest.delivery).toEqual({
      type: 'remote',
      url: 'https://owox.github.io/smart-data-reports/',
    });
  });

  it('keeps the released collection declaration unchanged', () => {
    // Released collections can never change name, scope or entityBinding.
    expect(manifest.collections).toEqual([
      {
        name: 'reports',
        scope: 'project',
        entityBinding: {
          type: 'data-mart',
          actions: { read: 'USE', create: 'USE', update: 'USE', delete: 'USE' },
        },
      },
    ]);
  });
});
```

- [ ] **Step 4: Write the failing bootstrap test**

`ui/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';

// happy-dom lacks these; Radix and React Flow need them.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
```

`ui/bootstrap.test.tsx`:

```tsx
import { act, screen } from '@testing-library/react';
import { bootstrap } from './bootstrap';
import { __resetForTests, __setTheme } from './sdk-mock';
import { resetPluginContextForTests } from './lib/plugin-runtime';

beforeEach(() => {
  __resetForTests();
  resetPluginContextForTests();
  document.body.innerHTML = '<div id="root"></div>';
  document.documentElement.className = '';
});

it('renders the app after the handshake and applies the dark theme', async () => {
  __setTheme('dark');
  await act(async () => {
    await bootstrap();
  });
  expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument();
  expect(document.documentElement).toHaveClass('dark');
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run ui/bootstrap.test.tsx`
Expected: FAIL — `Failed to resolve import "./bootstrap"`.

- [ ] **Step 6: Implement runtime, mock, bootstrap and placeholder app**

`ui/lib/plugin-runtime.ts`:

```ts
import { connect, type PluginContext } from '@owox/plugin-sdk';

let contextPromise: Promise<PluginContext> | undefined;

/** Connects once per page; every caller shares the same handshake. */
export function initializePlugin(): Promise<PluginContext> {
  contextPromise ??= connect();
  return contextPromise;
}

export function resetPluginContextForTests(): void {
  contextPromise = undefined;
}
```

`ui/sdk-mock.ts` (minimal; Task 13 replaces it with a fixture-backed version):

```ts
import type { PluginContext } from '@owox/plugin-sdk';

let theme: 'light' | 'dark' = 'light';
let context: PluginContext | undefined;

export async function connect(): Promise<PluginContext> {
  context ??= {
    pluginId: 'smart-data-reports-dev',
    installationId: 'local',
    projectId: 'demo-project',
    userId: 'demo-user',
    theme,
    owox: {},
    credentials: {},
    collections: () => {
      throw new Error('Mock collections are added in Task 13');
    },
    ui: {
      async openExternal(url: string) {
        console.info('[mock] openExternal', url);
      },
      navigate(path: string) {
        console.info('[mock] navigate', path);
      },
    },
    signal: new AbortController().signal,
  } as unknown as PluginContext;
  return context;
}

export function __setTheme(next: 'light' | 'dark'): void {
  theme = next;
}

export function __resetForTests(): void {
  context = undefined;
  theme = 'light';
}
```

`ui/styles/app.css` (Task 2 swaps in the vendored ODM stylesheet):

```css
@import 'tailwindcss';
```

`ui/App.tsx`:

```tsx
import type { PluginContext } from '@owox/plugin-sdk';

export function App(_props: { context: PluginContext }) {
  return (
    <div className='dm-page'>
      <header className='dm-page-header'>
        <h1 className='dm-page-header-title'>Reports</h1>
      </header>
    </div>
  );
}
```

`ui/bootstrap.tsx`:

```tsx
import { Component, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Loader2 } from 'lucide-react';
import { App } from './App';
import { initializePlugin } from './lib/plugin-runtime';
import './styles/app.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className='p-8 text-sm text-destructive'>
        <h1 className='mb-2 text-base font-semibold'>Smart Data Reports stopped unexpectedly</h1>
        <p>{this.state.error.message}</p>
      </main>
    );
  }
}

function Connecting() {
  return (
    <main className='flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground' data-testid='connecting'>
      <Loader2 className='h-4 w-4 animate-spin text-primary' />
      Connecting to OWOX Data Marts…
    </main>
  );
}

export async function bootstrap(container = document.getElementById('root')!): Promise<Root> {
  const root = createRoot(container);
  // Painted before the handshake: connect() can take ten seconds to give up, and an empty
  // root for that long looks like a broken plugin.
  root.render(<Connecting />);
  try {
    const context = await initializePlugin();
    // The host sends the theme once, at mount; there is no change event.
    document.documentElement.classList.toggle('dark', context.theme === 'dark');
    root.render(
      <ErrorBoundary>
        <App context={context} />
      </ErrorBoundary>,
    );
  } catch (error) {
    root.render(
      <main className='p-8 text-sm text-destructive' data-testid='connectError'>
        Could not connect to OWOX Data Marts: {error instanceof Error ? error.message : String(error)}
      </main>,
    );
  }
  return root;
}
```

`ui/main.tsx`:

```tsx
import { bootstrap } from './bootstrap';

void bootstrap();
```

`ui/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Smart Data Reports</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS — 3 tests in `ui/bootstrap.test.tsx` and `ui/plugin-manifest.test.ts`.

- [ ] **Step 8: Add CI, AGENTS.md and README**

`.github/workflows/deploy-pages.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22.22'
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - run: test -f dist/index.html
      - uses: actions/upload-pages-artifact@v3
        if: github.ref == 'refs/heads/main'
        with:
          path: dist

  deploy:
    if: github.ref == 'refs/heads/main'
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/configure-pages@v5
      - id: deployment
        uses: actions/deploy-pages@v4
```

`AGENTS.md`:

```markdown
# AGENTS.md

`Smart Data Reports` — an OWOX Data Marts plugin: build ad-hoc reports on a data mart and its
joinable data marts, see up to 2,500 rows, and send larger results to Google Sheets. React +
TypeScript + Vite SPA on GitHub Pages, loaded by ODM in a sandboxed iframe.

Read first: `docs/superpowers/specs/2026-10-02-smart-data-reports-design.md`, the workspace
`../CLAUDE.md`, and the [plugin authoring guide](https://docs.owox.com/docs/plugins/authoring-guide/).

## Rules

- The plugin is a thin shell over ODM. Never compose SQL or recompute numbers in the plugin.
- `ui/lib/*` has no React imports (ESLint enforces it). Features are props-driven.
- `ui/vendor/owox-ui/` is a verbatim copy of ODM UI; refresh it with
  `npm run sync:ui -- <owox-data-marts checkout> [ref]`, never edit it by hand.
- No `localStorage`/`sessionStorage`/cookies/IndexedDB; persist through the `reports` collection.
- The `reports` collection declaration in `plugin.json` is final. `ui/plugin-manifest.test.ts` guards it.
- Commits, PRs, code comments in English. Never commit `node_modules/`, `dist/`, `.DS_Store`, `.env*`.
- Done means `npm run lint && npm run typecheck && npm test && npm run build` pass and
  `dist/index.html` exists.

## Local loops

- `npm run dev` — standalone page against `ui/sdk-mock.ts` and the fixture model in `ui/fixtures/`.
- Real host — expose `VITE_REAL_SDK=1 TUNNEL_HOST=<host> npm run dev` on a stable HTTPS tunnel,
  point a separate debug-manifest repo at it, publish `--scope member`, install, refresh the frame.
  `VITE_PROBE=1` additionally opens the Step 0 host probe instead of the app.
```

`README.md`:

```markdown
# Smart Data Reports

An [OWOX Data Marts](https://github.com/OWOX/owox-data-marts) plugin. Pick a data mart, tick
columns from it and from its joinable data marts, give each date its own period, and see the
result in seconds. Need more than 2,500 rows or the SQL? Turn the same configuration into a
Google Sheets report in one click.

Install it from your project's plugin gallery: `<instance>/ui/<projectId>/plugins`.

Development notes are in [AGENTS.md](AGENTS.md).
```

- [ ] **Step 9: Run lint, typecheck, tests and build**

Run: `npm run lint && npm run typecheck && npm test && npm run build && test -f dist/index.html && echo OK`
Expected: last line `OK`.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts eslint.config.js \
  plugin.json ui .github AGENTS.md README.md
git commit -m "Scaffold Smart Data Reports plugin"
```

---

### Task 2: Vendor the ODM UI primitives and tokens

**Files:**
- Create: `scripts/sync-ui.mjs`
- Create (generated): `ui/vendor/owox-ui/components/*.tsx`, `ui/vendor/owox-ui/lib/{utils,dismissable-portals}.ts`, `ui/vendor/owox-ui/styles/globals.css`, `ui/vendor/owox-ui/VENDORED_FROM`
- Modify: `ui/styles/app.css`
- Test: `ui/vendor-smoke.test.tsx`

**Interfaces:**
- Produces: imports `@owox/ui/components/{alert,alert-dialog,badge,button,checkbox,dialog,dropdown-menu,empty,input,popover,select,separator,sheet,skeleton,switch,tabs,tooltip}` and `@owox/ui/lib/utils` (`cn`). These are the standard shadcn/ui exports (e.g. `Button`/`buttonVariants`, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, `DropdownMenu*`, `Select*`, `Tooltip*`/`TooltipProvider`, `Sheet*`, `AlertDialog*`, `Empty*`, `Alert`/`AlertTitle`/`AlertDescription`). Alert has only `default` and `destructive` variants.

- [ ] **Step 1: Write the failing smoke test**

`ui/vendor-smoke.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { Button } from '@owox/ui/components/button';
import { Tabs, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import { cn } from '@owox/ui/lib/utils';

it('renders vendored primitives with ODM classes', () => {
  render(
    <>
      <Button>Apply</Button>
      <Tabs defaultValue='a'>
        <TabsList>
          <TabsTrigger value='a'>Data table</TabsTrigger>
        </TabsList>
      </Tabs>
    </>,
  );
  expect(screen.getByRole('button', { name: 'Apply' }).className).toContain('bg-primary');
  expect(screen.getByRole('tab', { name: 'Data table' })).toHaveAttribute('data-state', 'active');
  expect(cn('px-2', 'px-4')).toBe('px-4');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run ui/vendor-smoke.test.tsx`
Expected: FAIL — `Failed to resolve import "@owox/ui/components/button"`.

- [ ] **Step 3: Write the sync script**

`scripts/sync-ui.mjs`:

```js
#!/usr/bin/env node
// Refreshes ui/vendor/owox-ui from OWOX/owox-data-marts. Plugins cannot import @owox/ui as a
// package, so we keep a verbatim copy and alias @owox/ui/* to it. Never edit ui/vendor by hand.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [checkout, ref = 'origin/main'] = process.argv.slice(2);
if (!checkout) {
  console.error('Usage: npm run sync:ui -- <owox-data-marts checkout> [ref]');
  process.exit(1);
}

const COMPONENTS = [
  'alert', 'alert-dialog', 'badge', 'button', 'checkbox', 'dialog', 'dropdown-menu', 'empty',
  'input', 'popover', 'select', 'separator', 'sheet', 'skeleton', 'switch', 'tabs', 'tooltip',
];
const LIB = ['utils.ts', 'dismissable-portals.ts'];
const DEST = 'ui/vendor/owox-ui';

const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8' });
const show = (path) => git('show', `${ref}:${path}`);
const write = (path, content) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
};

rmSync(DEST, { recursive: true, force: true });
for (const name of COMPONENTS) {
  write(join(DEST, 'components', `${name}.tsx`), show(`packages/ui/src/components/${name}.tsx`));
}
for (const name of LIB) {
  write(join(DEST, 'lib', name), show(`packages/ui/src/lib/${name}`));
}

// The monorepo's @source globs point at apps/; ours scan the plugin's ui/ tree instead.
const ANCHOR = "@import 'tw-animate-css';";
const css = show('packages/ui/src/styles/globals.css');
if (!css.includes(ANCHOR)) throw new Error(`globals.css no longer contains ${ANCHOR}`);
const rewritten = css
  .split('\n')
  .filter((line) => !line.startsWith('@source '))
  .join('\n')
  .replace(ANCHOR, `${ANCHOR}\n\n@source '../../../**/*.{ts,tsx}';`);
write(join(DEST, 'styles', 'globals.css'), rewritten);

const commit = git('rev-parse', ref).trim();
write(join(DEST, 'VENDORED_FROM'), `OWOX/owox-data-marts@${commit} (${ref})\n`);
console.log(`Vendored ${COMPONENTS.length} components and globals.css from ${commit}`);
```

- [ ] **Step 4: Install the primitives' dependencies and run the sync**

```bash
npm install @radix-ui/react-slot @radix-ui/react-checkbox @radix-ui/react-dialog \
  @radix-ui/react-alert-dialog @radix-ui/react-dropdown-menu @radix-ui/react-popover \
  @radix-ui/react-tabs @radix-ui/react-tooltip @radix-ui/react-select @radix-ui/react-switch \
  @radix-ui/react-separator class-variance-authority clsx tailwind-merge tw-animate-css sonner
git -C ../../owox-data-marts fetch origin
npm run sync:ui -- ../../owox-data-marts origin/main
```

Adjust `../../owox-data-marts` to wherever the `OWOX/owox-data-marts` clone lives (in this workspace: `~/Claude_Workspace/Projects/owox-data-marts`). The script reads `origin/main` through `git show`, so a dirty working copy there does not matter.
Expected: `Vendored 17 components and globals.css from <sha>`. If a vendored component imports a package not installed above, `npm run typecheck` names it — install it and re-run.

- [ ] **Step 5: Switch the app stylesheet to the vendored tokens**

`ui/styles/app.css`:

```css
@import '../vendor/owox-ui/styles/globals.css';

html,
body,
#root {
  height: 100%;
}
```

- [ ] **Step 6: Run the tests, typecheck and build**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: all PASS; `dist/assets/*.css` contains `--primary`.

- [ ] **Step 7: Commit**

```bash
git add scripts ui/vendor ui/styles ui/vendor-smoke.test.tsx package.json package-lock.json
git commit -m "Vendor ODM UI primitives and design tokens"
```

---

### Task 3: Step 0 — verify platform assumptions on a real host

This task produces findings, not product code. It needs a real ODM cloud project, a member
install and a public HTTPS tunnel. **Creating the debug-manifest GitHub repository, cutting its
release and publishing it are outward-facing: ask the user before each of them.**

**Files:**
- Create: `ui/probe.tsx` (dev-only), `docs/verification/host-checks.md`
- Modify: `ui/main.tsx`

**Interfaces:**
- Consumes: the real `@owox/plugin-sdk` (`VITE_REAL_SDK=1`).
- Produces: `docs/verification/host-checks.md` with a yes/no per check. A "no" stops the plan until the matching spec section is updated.

- [ ] **Step 1: Add the probe page**

`ui/probe.tsx`:

```tsx
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { initializePlugin } from './lib/plugin-runtime';
import './styles/app.css';

type Log = Record<string, unknown>;

function Probe() {
  const [dataMartId, setDataMartId] = useState('');
  const [dimension, setDimension] = useState('');
  const [metric, setMetric] = useState('');
  const [timestampColumn, setTimestampColumn] = useState('');
  const [log, setLog] = useState<Log>({});
  const note = (key: string, value: unknown) => setLog((prev) => ({ ...prev, [key]: value }));

  async function run() {
    const ctx = await initializePlugin();
    const owox = ctx.owox;
    // 1 + 3: automatic aggregation and run id on an ad-hoc query
    const traversal = await owox.dataMarts.traverseData(dataMartId, { column: [dimension, metric], limit: 5 });
    note('3_runId', traversal.runId ?? null);
    const rows: Record<string, unknown>[] = [];
    for await (const chunk of traversal.rowChunks()) rows.push(...chunk);
    note('1_rowKeys', rows[0] ? Object.keys(rows[0]) : []);
    // 2: totals on the run, immediately and after 3 s
    if (traversal.runId) {
      const path = `/api/data-marts/${dataMartId}/runs/${traversal.runId}`;
      note('2_totals_now', (await owox.getJson<{ totals?: unknown }>(path)).totals ?? null);
      await new Promise((r) => setTimeout(r, 3000));
      note('2_totals_3s', (await owox.getJson<{ totals?: unknown }>(path)).totals ?? null);
    }
    // 6: Google Sheets destinations visible to this member
    note('6_destinations', await owox.getJson('/api/data-destinations/by-type/GOOGLE_SHEETS'));
    // 7: between with date bounds on a TIMESTAMP column vs relative "today"
    if (timestampColumn) {
      const today = new Date().toISOString().slice(0, 10);
      const count = async (filter: unknown[]) => {
        const t = await owox.dataMarts.traverseData(dataMartId, {
          column: [timestampColumn],
          aggregation: [{ column: timestampColumn, function: 'COUNT' }],
          filter: filter as never,
          limit: 1,
        });
        const out: Record<string, unknown>[] = [];
        for await (const chunk of t.rowChunks()) out.push(...chunk);
        return out[0] ?? null;
      };
      note('7_between_today', await count([{ column: timestampColumn, operator: 'between', value: { from: today, to: today } }]));
      note('7_relative_today', await count([{ column: timestampColumn, operator: 'relative_date', value: { kind: 'today' } }]));
    }
    // 8: graph aliasPath values equal blendable-schema aliasPath values
    const schema = await owox.getJson<{ availableSources: { aliasPath: string }[] }>(`/api/data-marts/${dataMartId}/blendable-schema`);
    const graph = await owox.getJson<{ nodes: { aliasPath: string }[] }>(`/api/data-marts/${dataMartId}/relationships/graph`);
    note('8_schemaPaths', schema.availableSources.map((s) => s.aliasPath).sort());
    note('8_graphPaths', graph.nodes.map((n) => n.aliasPath).sort());
  }

  function testCopy() {
    // 5: Clipboard API is blocked (allow=''); does the legacy path work?
    const area = document.createElement('textarea');
    area.value = 'smart-data-reports copy probe';
    document.body.append(area);
    area.select();
    note('5_execCommandCopy', document.execCommand('copy'));
    area.remove();
  }

  return (
    <main className='flex flex-col gap-2 p-6 text-sm'>
      <h1 className='text-xl font-medium'>Host probe</h1>
      {[
        ['Data mart id', dataMartId, setDataMartId],
        ['Dimension column', dimension, setDimension],
        ['Metric column', metric, setMetric],
        ['TIMESTAMP column (optional)', timestampColumn, setTimestampColumn],
      ].map(([label, value, set]) => (
        <label key={label as string} className='flex flex-col gap-1'>
          {label as string}
          <input className='rounded-md border px-2 py-1' value={value as string} onChange={(e) => (set as (v: string) => void)(e.target.value)} />
        </label>
      ))}
      <div className='flex gap-2'>
        <button className='rounded-md border px-3 py-1' onClick={() => void run().catch((e) => note('error', String(e)))}>Run checks</button>
        <button className='rounded-md border px-3 py-1' onClick={testCopy}>Test copy</button>
      </div>
      <pre className='overflow-auto rounded-md bg-muted p-3 text-xs'>{JSON.stringify(log, null, 2)}</pre>
    </main>
  );
}

export function runProbe() {
  createRoot(document.getElementById('root')!).render(<Probe />);
}
```

`ui/main.tsx`:

```tsx
import { bootstrap } from './bootstrap';

if (import.meta.env.DEV && import.meta.env.VITE_PROBE === '1') {
  void import('./probe').then((m) => m.runProbe());
} else {
  void bootstrap();
}
```

- [ ] **Step 2: Typecheck and confirm the production bundle excludes the probe**

Run: `npm run typecheck && npm run build && ! grep -rl "Host probe" dist && echo EXCLUDED`
Expected: `EXCLUDED`.

- [ ] **Step 3: Run the tunnel loop (ask the user before creating or publishing anything)**

1. Start a stable public HTTPS tunnel to port 5173 (cloudflared named tunnel or ngrok static domain).
2. Run `VITE_REAL_SDK=1 VITE_PROBE=1 TUNNEL_HOST=<tunnel host> npm run dev`.
3. With the user's go-ahead: create a separate public repo `<owner>/smart-data-reports-dev` containing only a `plugin.json` that is a copy of this repo's manifest with `"name": "Smart Data Reports (dev)"` and `delivery.url` set to `https://<tunnel host>/`.
4. With the user's go-ahead: `gh release create v0.1.0 --repo <owner>/smart-data-reports-dev --generate-notes`, then `owox-ctl plugins publish <owner>/smart-data-reports-dev --scope member`.
5. Install it from `<instance>/ui/<projectId>/plugins`, open it, and fill the probe with a published BigQuery data mart that has a dimension, a metric and (if any) a TIMESTAMP column and at least one relationship.
6. Press *Run checks*, then *Test copy* and paste into any text field.

- [ ] **Step 4: Record the findings**

`docs/verification/host-checks.md` (fill every Result cell from the probe output):

```markdown
# Host checks (spec §10)

Instance: <cloud instance URL> · Date: <YYYY-MM-DD> · SDK 0.36.0

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | HTTP Data auto-aggregates a metric with an explicit column list (`1_rowKeys` has `<metric> \| SUM`) | yes / no | |
| 2 | `totals` present on the HTTP Data run (`2_totals_now` / `2_totals_3s`) | now / after 3 s / no | |
| 3 | `x-owox-run-id` reaches the plugin (`3_runId` not null) | yes / no | |
| 4 | `PUT /api/reports/:id` keeps the spreadsheet (verified in code) | yes | `report.controller.ts` `@Put(':id')` |
| 5 | `document.execCommand('copy')` works in the iframe | yes / no | |
| 6 | Sheets destinations list only those the member can use | yes / no | |
| 7 | `between` with date bounds on TIMESTAMP includes the whole day (`7_between_today` equals `7_relative_today`) | yes / no | |
| 8 | Graph `aliasPath` values equal blendable-schema `aliasPath` values | yes / no | |
```

Consequences to apply before continuing:
- **2 = after 3 s** → Task 14 Step 3: retry `getRunTotals` once after 3 s when the first read is `null` (the plan already does this).
- **2 = no** → drop the totals row from Task 17 and note it in the spec.
- **3 = no** → totals cannot be read; same as 2 = no.
- **5 = no** → Task 19 ships *Download .sql* only (the plan's default). **5 = yes** → add *Copy* next to it.
- **7 = no** → Task 5: send custom ranges and *Last year* as `gte from` + `lt (to + 1 day)` instead of `between`.
- **8 = no** → Task 18: match graph nodes to instances by `relationship.id` = `AvailableSource.relationshipId` instead of `aliasPath`.

- [ ] **Step 5: Commit**

```bash
git add ui/probe.tsx ui/main.tsx docs/verification/host-checks.md
git commit -m "Add host probe and record Step 0 platform checks"
```

---
### Task 4: ODM types, fixture model and schema index

**Files:**
- Create: `ui/lib/odm-types.ts`, `ui/fixtures/smart-data.ts`, `ui/lib/schema-index.ts`
- Test: `ui/lib/schema-index.test.ts`

**Interfaces:**
- Produces (`odm-types.ts`): `AggregateFunction`, `RelativeDatePreset`, `FilterPlacement`, `FilterRule`, `SortRule`, `AggregationRule`, `DateTruncUnit`, `DateTruncRule`, `NativeField`, `BlendedField`, `MainGrainMultiplication`, `AvailableSource`, `BlendableSchema`, `JoinCondition`, `Relationship`, `RelationshipGraphNode`, `RelationshipGraph`, `DataMartSummary`, `Row`, `Totals`, `ReportRunStatus`, `ReportSummary`, `SheetsDestination`, `SpreadsheetRef`.
- Produces (`schema-index.ts`): `AliasPath`, `FieldKind`, `FieldInfo`, `InstanceInfo`, `MartGroup`, `SchemaIndex`, `fieldKind(type)`, `parentPath(path)`, `isSameOrDescendant(path, ancestor)`, `buildSchemaIndex(main: {id, title}, schema)`, `chain(index, path)`, `chainLabel(index, path)`, `childInstances(index, path)`, `instancesOf(index, dataMartId)`, `dateFields(instance)`.
- Produces (`fixtures/smart-data.ts`): `DM`, `DATA_MARTS`, `SCHEMAS`, `GRAPHS`, `VISITOR_SCHEMA`, `SESSION_SCHEMA`, `VISITOR_GRAPH`, `sampleRows(columns, count)`.

- [ ] **Step 1: Create the ODM type mirrors**

`ui/lib/odm-types.ts`:

```ts
// Mirrors of the ODM API shapes this plugin reads and writes. Sources in OWOX/owox-data-marts:
// packages/api-client/src/data-marts.ts and apps/backend/src/data-marts/dto/**.

export type AggregateFunction =
  | 'STRING_AGG' | 'MAX' | 'MIN' | 'SUM' | 'AVG' | 'COUNT' | 'COUNT_DISTINCT' | 'ANY_VALUE'
  | 'P25' | 'P50' | 'P75' | 'P95';

export type RelativeDatePreset =
  | { kind: 'today' }
  | { kind: 'yesterday' }
  | { kind: 'this_week' }
  | { kind: 'last_week' }
  | { kind: 'this_month' }
  | { kind: 'last_month' }
  | { kind: 'this_quarter' }
  | { kind: 'last_quarter' }
  | { kind: 'this_year' }
  | { kind: 'last_n_days'; n: number }
  | { kind: 'last_n_months'; n: number }
  | { kind: 'next_n_days'; n: number };

export type FilterPlacement = 'pre-join' | 'post-join';
export type ScalarOperator =
  | 'eq' | 'neq' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'gt' | 'lt' | 'gte' | 'lte';
export type ValuelessOperator = 'is_blank' | 'is_not_blank' | 'is_true' | 'is_false';

export type FilterRule = { column: string; placement?: FilterPlacement } & (
  | { operator: ScalarOperator; value: string | number | boolean }
  | { operator: ValuelessOperator }
  | { operator: 'in' | 'not_in'; value: string[] | number[] }
  | { operator: 'between'; value: { from: string; to: string } | { from: number; to: number } }
  | { operator: 'relative_date'; value: RelativeDatePreset }
);

export interface SortRule { column: string; direction: 'asc' | 'desc' }
export interface AggregationRule { column: string; function: AggregateFunction }
export type DateTruncUnit = 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';
export interface DateTruncRule { column: string; unit: DateTruncUnit }

export interface NativeField {
  name: string;
  type: string;
  alias?: string;
  description?: string;
  isPrimaryKey?: boolean;
  isHiddenForReporting?: boolean;
  aggregationRole?: 'dimension' | 'metric';
  allowedAggregations?: AggregateFunction[];
  fields?: NativeField[];
}

export interface BlendedField {
  name: string;
  sourceRelationshipId: string;
  sourceDataMartId: string;
  sourceDataMartTitle: string;
  targetAlias: string;
  originalFieldName: string;
  type: string;
  sourceFieldType: string;
  alias: string;
  description: string;
  isHidden: boolean;
  isCalculated: boolean;
  aggregateFunction: AggregateFunction;
  postJoinAggregations?: AggregateFunction[];
  transitiveDepth: number;
  aliasPath: string;
  outputPrefix: string;
}

export type MainGrainMultiplication = 'none' | 'multiplies' | 'unknown';

export interface AvailableSource {
  aliasPath: string;
  title: string;
  description?: string;
  joinDescription?: string;
  defaultAlias: string;
  depth: number;
  fieldCount: number;
  isIncluded: boolean;
  relationshipId: string;
  dataMartId: string;
  isAccessibleForReporting: boolean;
  /** Absent must be read as 'unknown', never 'none'. */
  mainGrainMultiplication?: MainGrainMultiplication;
}

export interface BlendableSchema {
  nativeFields: NativeField[];
  nativeDescription?: string;
  blendedFields: BlendedField[];
  availableSources: AvailableSource[];
  hiddenFieldNames: string[];
}

export interface JoinCondition { sourceFieldName: string; targetFieldName: string }
export interface DataMartRef { id: string; title: string }

export interface Relationship {
  id: string;
  sourceDataMart: DataMartRef;
  targetDataMart: DataMartRef;
  targetAlias: string;
  joinConditions: JoinCondition[];
  description?: string;
}

export interface RelationshipGraphNode {
  relationship: Relationship;
  aliasPath: string;
  depth: number;
  isCycleStub: boolean;
  isBlocked: boolean;
}

export interface RelationshipGraph { rootDataMartId: string; nodes: RelationshipGraphNode[] }

export interface DataMartSummary {
  id: string;
  title: string;
  description: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  availableForReporting: boolean;
  storage: { type: string };
}

export type Row = Record<string, unknown>;
/** Keys are `<column> | <FUNCTION>`, e.g. `visits | SUM`. */
export type Totals = Record<string, number | string | boolean | null>;

export type ReportRunStatus = 'SUCCESS' | 'ERROR' | 'RUNNING' | 'CANCELLED' | 'RESTRICTED';
export interface ReportSummary {
  id: string;
  title: string;
  lastRunAt?: string;
  lastRunStatus?: ReportRunStatus;
  lastRunError?: string;
}
export interface SheetsDestination { id: string; title: string }
export interface SpreadsheetRef { spreadsheetId: string; sheetId: number }
```

- [ ] **Step 2: Create the fixture model**

`ui/fixtures/smart-data.ts` — a Smart Data-like model: Visitor joins Contact → User and Session → Pageview → Page, plus a second path Visitor → Page (landing page). User has two dates; Invoice lives on another storage and is unreachable.

```ts
import type {
  AvailableSource, BlendableSchema, BlendedField, DataMartSummary, MainGrainMultiplication,
  NativeField, RelationshipGraph, Row,
} from '../lib/odm-types';

export const DM = {
  visitor: 'dm-visitor',
  contact: 'dm-contact',
  user: 'dm-user',
  session: 'dm-session',
  pageview: 'dm-pageview',
  page: 'dm-page',
  invoice: 'dm-invoice',
} as const;
type MartId = (typeof DM)[keyof typeof DM];

const TITLES: Record<MartId, string> = {
  [DM.visitor]: 'Visitor',
  [DM.contact]: 'Contact',
  [DM.user]: 'User',
  [DM.session]: 'Session',
  [DM.pageview]: 'Pageview',
  [DM.page]: 'Page',
  [DM.invoice]: 'Invoice',
};

const NATIVE: Record<MartId, NativeField[]> = {
  [DM.visitor]: [
    { name: 'creation_date', type: 'DATE', alias: 'Creation Date' },
    { name: 'email', type: 'STRING', alias: 'Email', description: 'Visitor email, when known.' },
    { name: 'client_id', type: 'STRING', alias: 'Client ID' },
    { name: 'visits', type: 'INTEGER', alias: 'Visits', aggregationRole: 'metric', allowedAggregations: ['SUM', 'AVG', 'MIN', 'MAX'] },
    { name: 'geo', type: 'RECORD', alias: 'Geo', fields: [{ name: 'country', type: 'STRING', alias: 'Country' }] },
    { name: 'internal_flag', type: 'BOOLEAN', alias: 'Internal', isHiddenForReporting: true },
  ],
  [DM.contact]: [
    { name: 'creation_date', type: 'DATE', alias: 'Creation Date' },
    { name: 'name', type: 'STRING', alias: 'Name' },
  ],
  [DM.user]: [
    { name: 'creation_date', type: 'DATE', alias: 'Creation Date' },
    { name: 'first_login_date', type: 'DATE', alias: 'First Log In to OWOX Data Marts' },
    { name: 'creation_source', type: 'STRING', alias: 'Creation Source' },
  ],
  [DM.session]: [
    { name: 'date', type: 'DATE', alias: 'Date' },
    { name: 'source', type: 'STRING', alias: 'Source' },
    { name: 'duration_sec', type: 'INTEGER', alias: 'Duration', aggregationRole: 'metric', allowedAggregations: ['SUM', 'AVG'] },
  ],
  [DM.pageview]: [
    { name: 'date_time', type: 'TIMESTAMP', alias: 'Date and Time' },
    { name: 'page_id', type: 'STRING', alias: 'Page ID' },
  ],
  [DM.page]: [
    { name: 'creation_date', type: 'DATE', alias: 'Creation Date' },
    { name: 'title', type: 'STRING', alias: 'Title' },
    { name: 'url', type: 'STRING', alias: 'URL' },
  ],
  [DM.invoice]: [
    { name: 'issued_on', type: 'DATE', alias: 'Issued On' },
    { name: 'amount', type: 'NUMERIC', alias: 'Amount', aggregationRole: 'metric' },
  ],
};

export const DATA_MARTS: DataMartSummary[] = (Object.values(DM) as MartId[]).map((id) => ({
  id,
  title: TITLES[id],
  description: `${TITLES[id]} data mart.`,
  status: 'PUBLISHED' as const,
  availableForReporting: true,
  storage: { type: id === DM.invoice ? 'SNOWFLAKE' : 'GOOGLE_BIGQUERY' },
}));

interface Join {
  aliasPath: string;
  martId: MartId;
  label?: string;
  description: string;
  grain: MainGrainMultiplication;
  keys: [string, string][];
}

const lastSegment = (path: string) => path.split('.').at(-1)!;
const depthOf = (path: string) => path.split('.').length;

function blendedFor(join: Join): BlendedField[] {
  return NATIVE[join.martId]
    .filter((f) => !f.isHiddenForReporting && !f.fields)
    .map((f) => ({
      name: `${join.aliasPath.replaceAll('.', '_')}__${f.name}`,
      sourceRelationshipId: `rel-${join.aliasPath}`,
      sourceDataMartId: join.martId,
      sourceDataMartTitle: TITLES[join.martId],
      targetAlias: lastSegment(join.aliasPath),
      originalFieldName: f.name,
      type: f.type,
      sourceFieldType: f.type,
      alias: f.alias ?? '',
      description: f.description ?? '',
      isHidden: false,
      isCalculated: false,
      aggregateFunction: 'ANY_VALUE',
      postJoinAggregations: f.allowedAggregations,
      transitiveDepth: depthOf(join.aliasPath),
      aliasPath: join.aliasPath,
      outputPrefix: join.label ?? TITLES[join.martId],
    }));
}

function sourceFor(join: Join): AvailableSource {
  return {
    aliasPath: join.aliasPath,
    title: TITLES[join.martId],
    description: `${TITLES[join.martId]} data mart.`,
    joinDescription: join.description,
    defaultAlias: join.label ?? TITLES[join.martId],
    depth: depthOf(join.aliasPath),
    fieldCount: blendedFor(join).length,
    isIncluded: true,
    relationshipId: `rel-${join.aliasPath}`,
    dataMartId: join.martId,
    isAccessibleForReporting: true,
    mainGrainMultiplication: join.grain,
  };
}

function schemaFor(mainId: MartId, joins: Join[], extra: BlendedField[] = []): BlendableSchema {
  return {
    nativeFields: NATIVE[mainId],
    nativeDescription: `${TITLES[mainId]} data mart.`,
    blendedFields: [...joins.flatMap(blendedFor), ...extra],
    availableSources: joins.map(sourceFor),
    hiddenFieldNames: [],
  };
}

function graphFor(mainId: MartId, joins: Join[]): RelationshipGraph {
  const ref = (id: MartId) => ({ id, title: TITLES[id] });
  return {
    rootDataMartId: mainId,
    nodes: joins.map((join) => {
      const parentAlias = join.aliasPath.includes('.') ? join.aliasPath.slice(0, join.aliasPath.lastIndexOf('.')) : '';
      const parentMart = joins.find((j) => j.aliasPath === parentAlias)?.martId ?? mainId;
      return {
        aliasPath: join.aliasPath,
        depth: depthOf(join.aliasPath),
        isCycleStub: false,
        isBlocked: false,
        relationship: {
          id: `rel-${join.aliasPath}`,
          sourceDataMart: ref(parentMart),
          targetDataMart: ref(join.martId),
          targetAlias: lastSegment(join.aliasPath),
          joinConditions: join.keys.map(([sourceFieldName, targetFieldName]) => ({ sourceFieldName, targetFieldName })),
          description: join.description,
        },
      };
    }),
  };
}

const VISITOR_JOINS: Join[] = [
  { aliasPath: 'contact', martId: DM.contact, description: 'The contact this visitor was identified as.', grain: 'none', keys: [['contact_id', 'id']] },
  { aliasPath: 'contact.user', martId: DM.user, description: 'The product user behind the contact.', grain: 'none', keys: [['user_id', 'id']] },
  { aliasPath: 'sessions', martId: DM.session, description: 'Sessions of the visitor.', grain: 'multiplies', keys: [['client_id', 'client_id']] },
  { aliasPath: 'sessions.pageviews', martId: DM.pageview, description: 'Pages viewed in the session.', grain: 'multiplies', keys: [['session_id', 'session_id'], ['client_id', 'client_id']] },
  { aliasPath: 'sessions.pageviews.page', martId: DM.page, description: 'The page that was viewed.', grain: 'multiplies', keys: [['page_id', 'id']] },
  { aliasPath: 'landing_page', martId: DM.page, label: 'Landing page', description: 'The first page the visitor landed on.', grain: 'none', keys: [['landing_page_id', 'id']] },
];

const SESSION_JOINS: Join[] = [
  { aliasPath: 'pageviews', martId: DM.pageview, description: 'Pages viewed in the session.', grain: 'multiplies', keys: [['session_id', 'session_id']] },
  { aliasPath: 'pageviews.page', martId: DM.page, description: 'The page that was viewed.', grain: 'multiplies', keys: [['page_id', 'id']] },
];

const [hiddenTemplate] = blendedFor(VISITOR_JOINS[0]!);
const VISITOR_EXTRA: BlendedField[] = [
  { ...hiddenTemplate!, name: 'contact__hidden_note', originalFieldName: 'hidden_note', alias: 'Hidden note', isHidden: true },
  { ...hiddenTemplate!, name: 'contact__score_formula', originalFieldName: 'score_formula', alias: 'Score', isCalculated: true, type: 'FLOAT', sourceFieldType: 'FLOAT' },
];

export const VISITOR_SCHEMA = schemaFor(DM.visitor, VISITOR_JOINS, VISITOR_EXTRA);
export const SESSION_SCHEMA = schemaFor(DM.session, SESSION_JOINS);
export const VISITOR_GRAPH = graphFor(DM.visitor, VISITOR_JOINS);

export const SCHEMAS: Record<string, BlendableSchema> = Object.fromEntries(
  (Object.values(DM) as MartId[]).map((id) => [
    id,
    id === DM.visitor ? VISITOR_SCHEMA : id === DM.session ? SESSION_SCHEMA : schemaFor(id, []),
  ]),
);

export const GRAPHS: Record<string, RelationshipGraph> = Object.fromEntries(
  (Object.values(DM) as MartId[]).map((id) => [
    id,
    id === DM.visitor ? VISITOR_GRAPH : id === DM.session ? graphFor(DM.session, SESSION_JOINS) : graphFor(id, []),
  ]),
);

const TYPES = new Map<string, string>([
  ...Object.values(SCHEMAS).flatMap((s) => s.blendedFields.map((f) => [f.name, f.type] as [string, string])),
  ...Object.values(NATIVE).flatMap((fields) => fields.map((f) => [f.name, f.type] as [string, string])),
  ['geo.country', 'STRING'],
]);

/** Deterministic rows for dev and tests; keys follow the requested column order. */
export function sampleRows(columns: string[], count: number): Row[] {
  return Array.from({ length: count }, (_, i) =>
    Object.fromEntries(
      columns.map((column) => {
        const type = TYPES.get(column) ?? 'STRING';
        const day = String((i % 28) + 1).padStart(2, '0');
        if (type === 'DATE') return [column, `2026-09-${day}`];
        if (type === 'TIMESTAMP') return [column, `2026-09-${day}T10:00:00Z`];
        if (type === 'INTEGER' || type === 'NUMERIC') return [column, (i * 7) % 100];
        if (type === 'BOOLEAN') return [column, i % 2 === 0];
        return [column, `${column}-${i + 1}`];
      }),
    ),
  );
}
```

- [ ] **Step 3: Write the failing schema-index tests**

`ui/lib/schema-index.test.ts`:

```ts
import { DM, VISITOR_SCHEMA } from '../fixtures/smart-data';
import {
  buildSchemaIndex, chain, chainLabel, childInstances, dateFields, fieldKind, instancesOf,
  isSameOrDescendant, parentPath,
} from './schema-index';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);

describe('fieldKind', () => {
  it.each([
    ['DATE', 'date'], ['DATETIME', 'date'], ['TIMESTAMP_NTZ', 'date'], ['INTEGER', 'number'],
    ['FLOAT64', 'number'], ['NUMERIC', 'number'], ['BOOLEAN', 'boolean'], ['STRING', 'text'],
    ['VARCHAR(255)', 'text'], ['ARRAY<STRING>', 'other'], ['TIME', 'other'],
  ])('%s → %s', (type, kind) => expect(fieldKind(type)).toBe(kind));
});

describe('paths', () => {
  it('derives parents and descendants', () => {
    expect(parentPath('sessions.pageviews')).toBe('sessions');
    expect(parentPath('sessions')).toBe('');
    expect(isSameOrDescendant('sessions.pageviews', 'sessions')).toBe(true);
    expect(isSameOrDescendant('sessions_x', 'sessions')).toBe(false);
    expect(isSameOrDescendant('anything', '')).toBe(true);
  });
});

describe('buildSchemaIndex', () => {
  it('groups instances by data mart with the main mart first', () => {
    expect(index.groups.map((g) => g.title)).toEqual(['Visitor', 'Contact', 'Page', 'Pageview', 'Session', 'User']);
  });

  it('keeps one data mart reachable through several paths as separate instances', () => {
    const page = index.groups.find((g) => g.dataMartId === DM.page)!;
    expect(page.instances.map((i) => i.aliasPath)).toEqual(['landing_page', 'sessions.pageviews.page']);
    expect(instancesOf(index, DM.page).map((i) => i.label)).toEqual(['Landing page', 'Page']);
  });

  it('flattens nested native fields and drops hidden ones', () => {
    const main = index.instances.get('')!;
    expect(main.fields.map((f) => f.name)).toEqual(['creation_date', 'email', 'client_id', 'visits', 'geo.country']);
    expect(index.fields.get('geo.country')?.label).toBe('Geo › Country');
  });

  it('drops hidden and calculated joined fields', () => {
    expect(index.fields.has('contact__hidden_note')).toBe(false);
    expect(index.fields.has('contact__score_formula')).toBe(false);
    expect(index.fields.get('contact__name')).toMatchObject({ aliasPath: 'contact', originalName: 'name', label: 'Name' });
  });

  it('skips inaccessible or excluded sources together with everything below them', () => {
    const schema = {
      ...VISITOR_SCHEMA,
      availableSources: VISITOR_SCHEMA.availableSources.map((s) =>
        s.aliasPath === 'contact' ? { ...s, isAccessibleForReporting: false } : s,
      ),
    };
    const restricted = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, schema);
    expect(restricted.instances.has('contact')).toBe(false);
    expect(restricted.instances.has('contact.user')).toBe(false);
    expect(restricted.fields.has('contact_user__creation_source')).toBe(false);
  });

  it('reads a missing grain verdict as unknown', () => {
    const schema = {
      ...VISITOR_SCHEMA,
      availableSources: VISITOR_SCHEMA.availableSources.map(({ mainGrainMultiplication: _drop, ...s }) => s),
    };
    expect(buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, schema).instances.get('contact')?.grain).toBe('unknown');
  });
});

describe('navigation helpers', () => {
  it('walks the chain from the main mart to an instance', () => {
    expect(chain(index, 'sessions.pageviews.page').map((i) => i.title)).toEqual(['Session', 'Pageview', 'Page']);
    expect(chainLabel(index, 'sessions.pageviews.page')).toBe('Session › Pageview › Page');
    expect(chain(index, '')).toEqual([]);
  });

  it('lists direct targets of an instance', () => {
    expect(childInstances(index, '').map((i) => i.aliasPath)).toEqual(['contact', 'sessions', 'landing_page']);
    expect(childInstances(index, 'sessions').map((i) => i.aliasPath)).toEqual(['sessions.pageviews']);
  });

  it('finds date fields of an instance', () => {
    expect(dateFields(index.instances.get('contact.user')!).map((f) => f.name)).toEqual([
      'contact_user__creation_date',
      'contact_user__first_login_date',
    ]);
  });
});
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run ui/lib/schema-index.test.ts`
Expected: FAIL — `Failed to resolve import "./schema-index"`.

- [ ] **Step 5: Implement the schema index**

`ui/lib/schema-index.ts`:

```ts
import type { AggregateFunction, BlendableSchema, MainGrainMultiplication, NativeField } from './odm-types';

/** '' is the main data mart; otherwise ODM's dotted relationship-alias path, e.g. 'sessions.pageviews'. */
export type AliasPath = string;
export type FieldKind = 'text' | 'number' | 'date' | 'boolean' | 'other';

export interface FieldInfo {
  /** The name ODM expects in read plans: native name or unified blended name. */
  name: string;
  label: string;
  description: string;
  type: string;
  kind: FieldKind;
  aliasPath: AliasPath;
  /** The field's name inside its own data mart; stable across paths. */
  originalName: string;
  aggregationRole?: 'dimension' | 'metric';
  allowedAggregations?: AggregateFunction[];
}

/** One way a data mart takes part in the report. The same mart can have several instances. */
export interface InstanceInfo {
  aliasPath: AliasPath;
  dataMartId: string;
  title: string;
  label: string;
  description: string;
  joinDescription: string;
  depth: number;
  grain: MainGrainMultiplication;
  fields: FieldInfo[];
}

export interface MartGroup {
  dataMartId: string;
  title: string;
  description: string;
  instances: InstanceInfo[];
}

export interface SchemaIndex {
  mainDataMartId: string;
  instances: ReadonlyMap<AliasPath, InstanceInfo>;
  groups: MartGroup[];
  fields: ReadonlyMap<string, FieldInfo>;
}

const RECORD_TYPE = /^(RECORD|STRUCT)$/i;

export function fieldKind(type: string): FieldKind {
  const t = type.toUpperCase();
  if (/^(DATE|DATETIME|TIMESTAMP)/.test(t)) return 'date';
  if (/^(BOOL|BOOLEAN)$/.test(t)) return 'boolean';
  if (/^(INT|INTEGER|INT64|BIGINT|SMALLINT|TINYINT|BYTEINT|FLOAT|FLOAT64|DOUBLE|REAL|NUMERIC|BIGNUMERIC|DECIMAL|NUMBER)\b/.test(t)) return 'number';
  if (/^(STRING|VARCHAR|CHAR|CHARACTER|TEXT)\b/.test(t)) return 'text';
  return 'other';
}

export function parentPath(path: AliasPath): AliasPath {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(0, dot);
}

export function isSameOrDescendant(path: AliasPath, ancestor: AliasPath): boolean {
  return ancestor === '' || path === ancestor || path.startsWith(`${ancestor}.`);
}

function flattenNative(fields: NativeField[], prefix = '', labelPrefix = ''): FieldInfo[] {
  return fields.flatMap((f) => {
    if (f.isHiddenForReporting) return [];
    const name = prefix ? `${prefix}.${f.name}` : f.name;
    const ownLabel = f.alias || f.name;
    const label = labelPrefix ? `${labelPrefix} › ${ownLabel}` : ownLabel;
    if (f.fields?.length && RECORD_TYPE.test(f.type)) return flattenNative(f.fields, name, label);
    return [{
      name,
      label,
      description: f.description ?? '',
      type: f.type,
      kind: fieldKind(f.type),
      aliasPath: '',
      originalName: name,
      aggregationRole: f.aggregationRole,
      allowedAggregations: f.allowedAggregations,
    }];
  });
}

export function buildSchemaIndex(main: { id: string; title: string }, schema: BlendableSchema): SchemaIndex {
  const instances = new Map<AliasPath, InstanceInfo>();
  instances.set('', {
    aliasPath: '',
    dataMartId: main.id,
    title: main.title,
    label: main.title,
    description: schema.nativeDescription ?? '',
    joinDescription: '',
    depth: 0,
    grain: 'none',
    fields: flattenNative(schema.nativeFields),
  });

  const blocked: AliasPath[] = [];
  for (const source of [...schema.availableSources].sort((a, b) => a.depth - b.depth)) {
    const unusable =
      !source.isIncluded ||
      !source.isAccessibleForReporting ||
      blocked.some((p) => isSameOrDescendant(source.aliasPath, p)) ||
      !instances.has(parentPath(source.aliasPath));
    if (unusable) {
      blocked.push(source.aliasPath);
      continue;
    }
    instances.set(source.aliasPath, {
      aliasPath: source.aliasPath,
      dataMartId: source.dataMartId,
      title: source.title,
      label: source.defaultAlias || source.title,
      description: source.description ?? '',
      joinDescription: source.joinDescription ?? '',
      depth: source.depth,
      grain: source.mainGrainMultiplication ?? 'unknown',
      fields: [],
    });
  }

  for (const f of schema.blendedFields) {
    const instance = instances.get(f.aliasPath);
    if (!instance || instance.aliasPath === '' || f.isHidden || f.isCalculated) continue;
    instance.fields.push({
      name: f.name,
      label: f.alias || f.originalFieldName,
      description: f.description,
      type: f.type,
      kind: fieldKind(f.type),
      aliasPath: f.aliasPath,
      originalName: f.originalFieldName,
      allowedAggregations: f.postJoinAggregations,
    });
  }

  const byMart = new Map<string, MartGroup>();
  for (const instance of instances.values()) {
    let group = byMart.get(instance.dataMartId);
    if (!group) {
      group = { dataMartId: instance.dataMartId, title: instance.title, description: instance.description, instances: [] };
      byMart.set(instance.dataMartId, group);
    }
    group.instances.push(instance);
  }
  const groups = [...byMart.values()];
  for (const group of groups) {
    group.instances.sort((a, b) => a.depth - b.depth || a.aliasPath.localeCompare(b.aliasPath));
  }
  groups.sort((a, b) =>
    a.dataMartId === main.id ? -1 : b.dataMartId === main.id ? 1 : a.title.localeCompare(b.title),
  );

  const fields = new Map<string, FieldInfo>();
  for (const instance of instances.values()) for (const f of instance.fields) fields.set(f.name, f);

  return { mainDataMartId: main.id, instances, groups, fields };
}

/** Instances on the way from the main mart to `path`, excluding the main mart. */
export function chain(index: SchemaIndex, path: AliasPath): InstanceInfo[] {
  if (!path) return [];
  const segments = path.split('.');
  return segments
    .map((_, i) => index.instances.get(segments.slice(0, i + 1).join('.')))
    .filter((i): i is InstanceInfo => i !== undefined);
}

export function chainLabel(index: SchemaIndex, path: AliasPath): string {
  return chain(index, path).map((i) => i.label).join(' › ');
}

export function childInstances(index: SchemaIndex, path: AliasPath): InstanceInfo[] {
  return [...index.instances.values()].filter((i) => i.aliasPath !== '' && parentPath(i.aliasPath) === path);
}

export function instancesOf(index: SchemaIndex, dataMartId: string): InstanceInfo[] {
  return [...index.instances.values()]
    .filter((i) => i.dataMartId === dataMartId)
    .sort((a, b) => a.depth - b.depth || a.aliasPath.localeCompare(b.aliasPath));
}

export function dateFields(instance: InstanceInfo): FieldInfo[] {
  return instance.fields.filter((f) => f.kind === 'date');
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run ui/lib/schema-index.test.ts`
Expected: PASS (all tests).

- [ ] **Step 7: Commit**

```bash
git add ui/lib/odm-types.ts ui/lib/schema-index.ts ui/lib/schema-index.test.ts ui/fixtures
git commit -m "Add ODM type mirrors, fixture model and schema index"
```

---

### Task 5: Date ranges

**Files:**
- Create: `ui/lib/date-ranges.ts`
- Test: `ui/lib/date-ranges.test.ts`

**Interfaces:**
- Consumes: `FilterRule`, `RelativeDatePreset` (Task 4).
- Produces: `DateRangePreset`, `DateRangeValue`, `DATE_RANGE_PRESETS`, `describeDateRange(value): string`, `dateRangeToRule(column, value, today: Date): FilterRule | null`.

- [ ] **Step 1: Write the failing tests**

`ui/lib/date-ranges.test.ts`:

```ts
import { DATE_RANGE_PRESETS, dateRangeToRule, describeDateRange } from './date-ranges';

const today = new Date(2026, 9, 2); // 2 Oct 2026, local time

describe('dateRangeToRule', () => {
  it('sends Last N days as N days including today', () => {
    expect(dateRangeToRule('d', { kind: 'preset', preset: 'last_30_days' }, today)).toEqual({
      column: 'd', operator: 'relative_date', value: { kind: 'last_n_days', n: 29 },
    });
    expect(dateRangeToRule('d', { kind: 'preset', preset: 'last_7_days' }, today)).toMatchObject({ value: { n: 6 } });
  });

  it('maps calendar presets to ODM relative kinds', () => {
    expect(dateRangeToRule('d', { kind: 'preset', preset: 'last_month' }, today)).toEqual({
      column: 'd', operator: 'relative_date', value: { kind: 'last_month' },
    });
    expect(dateRangeToRule('d', { kind: 'preset', preset: 'today' }, today)).toMatchObject({ value: { kind: 'today' } });
  });

  it('computes Last year as an explicit range, because ODM has no last_year kind', () => {
    expect(dateRangeToRule('d', { kind: 'preset', preset: 'last_year' }, today)).toEqual({
      column: 'd', operator: 'between', value: { from: '2025-01-01', to: '2025-12-31' },
    });
  });

  it('sends custom ranges as between and All time as no rule', () => {
    expect(dateRangeToRule('d', { kind: 'custom', from: '2026-01-01', to: '2026-01-31' }, today)).toEqual({
      column: 'd', operator: 'between', value: { from: '2026-01-01', to: '2026-01-31' },
    });
    expect(dateRangeToRule('d', { kind: 'all-time' }, today)).toBeNull();
  });

  it('maps every preset to a rule', () => {
    for (const { preset } of DATE_RANGE_PRESETS) {
      expect(dateRangeToRule('d', { kind: 'preset', preset }, today)).not.toBeNull();
    }
  });
});

describe('describeDateRange', () => {
  it('labels presets, custom ranges and All time', () => {
    expect(describeDateRange({ kind: 'preset', preset: 'last_30_days' })).toBe('Last 30 days');
    expect(describeDateRange({ kind: 'custom', from: '2026-01-01', to: '2026-01-31' })).toBe('2026-01-01 – 2026-01-31');
    expect(describeDateRange({ kind: 'all-time' })).toBe('All time');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run ui/lib/date-ranges.test.ts`
Expected: FAIL — `Failed to resolve import "./date-ranges"`.

- [ ] **Step 3: Implement**

`ui/lib/date-ranges.ts`:

```ts
import type { FilterRule, RelativeDatePreset } from './odm-types';

export type DateRangePreset =
  | 'today' | 'yesterday' | 'last_7_days' | 'last_14_days' | 'last_30_days' | 'last_90_days'
  | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter'
  | 'this_year' | 'last_year';

export type DateRangeValue =
  | { kind: 'preset'; preset: DateRangePreset }
  | { kind: 'custom'; from: string; to: string }
  | { kind: 'all-time' };

export const DATE_RANGE_PRESETS: ReadonlyArray<{ preset: DateRangePreset; label: string }> = [
  { preset: 'today', label: 'Today' },
  { preset: 'yesterday', label: 'Yesterday' },
  { preset: 'last_7_days', label: 'Last 7 days' },
  { preset: 'last_14_days', label: 'Last 14 days' },
  { preset: 'last_30_days', label: 'Last 30 days' },
  { preset: 'last_90_days', label: 'Last 90 days' },
  { preset: 'this_week', label: 'This week' },
  { preset: 'last_week', label: 'Last week' },
  { preset: 'this_month', label: 'This month' },
  { preset: 'last_month', label: 'Last month' },
  { preset: 'this_quarter', label: 'This quarter' },
  { preset: 'last_quarter', label: 'Last quarter' },
  { preset: 'this_year', label: 'This year' },
  { preset: 'last_year', label: 'Last year' },
];

const LAST_N_DAYS: Partial<Record<DateRangePreset, number>> = {
  last_7_days: 7,
  last_14_days: 14,
  last_30_days: 30,
  last_90_days: 90,
};

const RELATIVE: Partial<Record<DateRangePreset, RelativeDatePreset>> = {
  today: { kind: 'today' },
  yesterday: { kind: 'yesterday' },
  this_week: { kind: 'this_week' },
  last_week: { kind: 'last_week' },
  this_month: { kind: 'this_month' },
  last_month: { kind: 'last_month' },
  this_quarter: { kind: 'this_quarter' },
  last_quarter: { kind: 'last_quarter' },
  this_year: { kind: 'this_year' },
};

export function describeDateRange(value: DateRangeValue): string {
  if (value.kind === 'all-time') return 'All time';
  if (value.kind === 'custom') return `${value.from} – ${value.to}`;
  return DATE_RANGE_PRESETS.find((p) => p.preset === value.preset)?.label ?? value.preset;
}

export function dateRangeToRule(column: string, value: DateRangeValue, today: Date): FilterRule | null {
  if (value.kind === 'all-time') return null;
  if (value.kind === 'custom') return { column, operator: 'between', value: { from: value.from, to: value.to } };
  const days = LAST_N_DAYS[value.preset];
  // ODM's last_n_days spans n + 1 days including today, so "Last 30 days" is n = 29.
  if (days !== undefined) return { column, operator: 'relative_date', value: { kind: 'last_n_days', n: days - 1 } };
  if (value.preset === 'last_year') {
    const year = today.getFullYear() - 1;
    return { column, operator: 'between', value: { from: `${year}-01-01`, to: `${year}-12-31` } };
  }
  const relative = RELATIVE[value.preset];
  return relative ? { column, operator: 'relative_date', value: relative } : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run ui/lib/date-ranges.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/lib/date-ranges.ts ui/lib/date-ranges.test.ts
git commit -m "Add date range presets and their ODM filter rules"
```

---

### Task 6: Report draft and its rules

**Files:**
- Create: `ui/lib/report-draft.ts`
- Test: `ui/lib/report-draft.test.ts`

**Interfaces:**
- Consumes: `SchemaIndex`, `FieldInfo`, `AliasPath`, `dateFields`, `instancesOf`, `isSameOrDescendant` (Task 4); `DateRangeValue` (Task 5); `AggregateFunction`, `DateTruncUnit` (Task 4).
- Produces: `FilterOperator`, `DraftColumn`, `DraftDateRange`, `DraftFilter`, `DraftSort`, `ReportDraft`, `AUTO_DATE_RANGE`, `DateChoice`, `AddColumnResult`, `RemapResult`, and pure functions `emptyDraft(mainId)`, `includePath(draft, path)`, `addColumn(draft, index, name): AddColumnResult`, `chooseAutoDate(draft, index, path, column | null)`, `removeColumn(draft, name)`, `moveColumn(draft, from, to)`, `setDateRange(draft, index, column, range)`, `removeDateRange(draft, column)`, `upsertFilter(draft, filter)`, `removeFilter(draft, id)`, `setSort(draft, column, direction | null)`, `setAggregations(draft, column, fns | undefined)`, `setDateTrunc(draft, column, unit | undefined)`, `removeInstance(draft, path)`, `changeInstancePath(draft, index, from, to): RemapResult`, `rebaseOnMain(draft, oldIndex, newIndex): RemapResult`, `usedInstances(draft): AliasPath[]`.

- [ ] **Step 1: Write the failing tests**

`ui/lib/report-draft.test.ts`:

```ts
import { DM, SESSION_SCHEMA, VISITOR_SCHEMA } from '../fixtures/smart-data';
import { buildSchemaIndex } from './schema-index';
import {
  addColumn, changeInstancePath, chooseAutoDate, emptyDraft, moveColumn, rebaseOnMain,
  removeDateRange, removeInstance, setDateRange, setSort, upsertFilter, usedInstances,
  type ReportDraft,
} from './report-draft';

const visitor = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);
const session = buildSchemaIndex({ id: DM.session, title: 'Session' }, SESSION_SCHEMA);

function add(draft: ReportDraft, ...names: string[]): ReportDraft {
  return names.reduce((d, name) => addColumn(d, visitor, name).draft, draft);
}

describe('addColumn', () => {
  it('auto-adds the only date of the main mart as Last 30 days', () => {
    const draft = add(emptyDraft(DM.visitor), 'email', 'client_id');
    expect(draft.columns.map((c) => c.name)).toEqual(['email', 'client_id']);
    expect(draft.dateRanges).toEqual([
      { column: 'creation_date', aliasPath: '', range: { kind: 'preset', preset: 'last_30_days' }, autoAdded: true },
    ]);
  });

  it('auto-adds the date of a joined instance and includes its path', () => {
    const draft = add(emptyDraft(DM.visitor), 'contact__name');
    expect(draft.includedPaths).toEqual(['contact']);
    expect(draft.dateRanges.map((r) => [r.column, r.aliasPath])).toEqual([['contact__creation_date', 'contact']]);
  });

  it('asks which date to use when the instance has several, without adding one yet', () => {
    const result = addColumn(emptyDraft(DM.visitor), visitor, 'contact_user__creation_source');
    expect(result.draft.includedPaths).toEqual(['contact', 'contact.user']);
    expect(result.draft.dateRanges).toEqual([]);
    expect(result.dateChoice?.aliasPath).toBe('contact.user');
    expect(result.dateChoice?.candidates.map((f) => f.name)).toEqual([
      'contact_user__creation_date', 'contact_user__first_login_date',
    ]);
  });

  it('puts the picked date first among the candidates', () => {
    const result = addColumn(emptyDraft(DM.visitor), visitor, 'contact_user__first_login_date');
    expect(result.dateChoice?.candidates[0]?.name).toBe('contact_user__first_login_date');
  });

  it('ignores unknown and duplicate columns', () => {
    const draft = add(emptyDraft(DM.visitor), 'email');
    expect(addColumn(draft, visitor, 'email').draft).toBe(draft);
    expect(addColumn(draft, visitor, 'nope').draft).toBe(draft);
  });
});

describe('auto date opt-out', () => {
  it('respects "Don\'t add a date"', () => {
    const { draft } = addColumn(emptyDraft(DM.visitor), visitor, 'contact_user__creation_source');
    const declined = chooseAutoDate(draft, visitor, 'contact.user', null);
    expect(declined.dateRangeOptOut).toEqual(['contact.user']);
    const again = addColumn({ ...declined, columns: [] }, visitor, 'contact_user__creation_source');
    expect(again.dateChoice).toBeUndefined();
  });

  it('adds the chosen date', () => {
    const { draft } = addColumn(emptyDraft(DM.visitor), visitor, 'contact_user__creation_source');
    const chosen = chooseAutoDate(draft, visitor, 'contact.user', 'contact_user__first_login_date');
    expect(chosen.dateRanges.map((r) => r.column)).toEqual(['contact_user__first_login_date']);
  });

  it('does not re-add a removed auto date', () => {
    const draft = removeDateRange(add(emptyDraft(DM.visitor), 'email'), 'creation_date');
    expect(draft.dateRanges).toEqual([]);
    expect(add({ ...draft, columns: [] }, 'email').dateRanges).toEqual([]);
  });
});

describe('editing', () => {
  it('updates a date range and marks it as chosen by the user', () => {
    const draft = setDateRange(add(emptyDraft(DM.visitor), 'email'), visitor, 'creation_date', { kind: 'preset', preset: 'last_7_days' });
    expect(draft.dateRanges).toEqual([
      { column: 'creation_date', aliasPath: '', range: { kind: 'preset', preset: 'last_7_days' }, autoAdded: false },
    ]);
  });

  it('adds, updates and removes sorts in priority order', () => {
    let draft = add(emptyDraft(DM.visitor), 'email', 'client_id');
    draft = setSort(draft, 'email', 'asc');
    draft = setSort(draft, 'client_id', 'desc');
    draft = setSort(draft, 'email', 'desc');
    expect(draft.sorts).toEqual([{ column: 'email', direction: 'desc' }, { column: 'client_id', direction: 'desc' }]);
    expect(setSort(draft, 'email', null).sorts).toEqual([{ column: 'client_id', direction: 'desc' }]);
  });

  it('moves columns', () => {
    const draft = moveColumn(add(emptyDraft(DM.visitor), 'email', 'client_id', 'visits'), 2, 0);
    expect(draft.columns.map((c) => c.name)).toEqual(['visits', 'email', 'client_id']);
  });
});

describe('removeInstance', () => {
  it('removes the instance, everything below it and what refers to them', () => {
    let draft = add(emptyDraft(DM.visitor), 'email', 'sessions__source', 'sessions_pageviews_page__title');
    draft = upsertFilter(draft, { id: 'f1', column: 'sessions__source', aliasPath: 'sessions', operator: 'eq', value: 'google', sliceOnly: false });
    draft = setSort(draft, 'sessions_pageviews_page__title', 'asc');
    const next = removeInstance(draft, 'sessions');
    expect(next.columns.map((c) => c.name)).toEqual(['email']);
    expect(next.includedPaths).toEqual([]);
    expect(next.filters).toEqual([]);
    expect(next.sorts).toEqual([]);
    expect(next.dateRanges.map((r) => r.column)).toEqual(['creation_date']);
    expect(removeInstance(draft, '')).toBe(draft);
  });
});

describe('changeInstancePath', () => {
  it('moves columns and dates to the same fields on another path', () => {
    const draft = add(emptyDraft(DM.visitor), 'landing_page__title');
    const { draft: next, dropped } = changeInstancePath(draft, visitor, 'landing_page', 'sessions.pageviews.page');
    expect(dropped).toEqual([]);
    expect(next.columns).toEqual([{ name: 'sessions_pageviews_page__title', aliasPath: 'sessions.pageviews.page' }]);
    expect(next.dateRanges.map((r) => r.column)).toEqual(['sessions_pageviews_page__creation_date']);
    expect(next.includedPaths).toEqual(['sessions', 'sessions.pageviews', 'sessions.pageviews.page']);
  });
});

describe('rebaseOnMain', () => {
  it('keeps what the new main mart reaches and reports the rest as dropped', () => {
    const draft = add(
      emptyDraft(DM.visitor),
      'email', 'sessions__source', 'sessions_pageviews_page__title', 'landing_page__title', 'contact__name',
    );
    const { draft: next, dropped } = rebaseOnMain(draft, visitor, session);
    expect(next.mainDataMartId).toBe(DM.session);
    expect(next.columns.map((c) => c.name)).toEqual(['source', 'pageviews_page__title']);
    expect(dropped).toEqual(
      expect.arrayContaining(['email', 'landing_page__title', 'contact__name', 'creation_date', 'contact__creation_date']),
    );
    // A joined date becomes a main-mart date, i.e. a filter instead of a slice.
    expect(next.dateRanges.map((r) => [r.column, r.aliasPath])).toEqual(
      expect.arrayContaining([['date', ''], ['pageviews_page__creation_date', 'pageviews.page']]),
    );
  });
});

describe('usedInstances', () => {
  it('collects included paths and paths referenced by columns', () => {
    const draft = add(emptyDraft(DM.visitor), 'email', 'contact_user__creation_source');
    expect(usedInstances(draft).sort()).toEqual(['', 'contact', 'contact.user']);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run ui/lib/report-draft.test.ts`
Expected: FAIL — `Failed to resolve import "./report-draft"`.

- [ ] **Step 3: Implement**

`ui/lib/report-draft.ts`:

```ts
import type { AggregateFunction, DateTruncUnit } from './odm-types';
import type { DateRangeValue } from './date-ranges';
import {
  dateFields, instancesOf, isSameOrDescendant,
  type AliasPath, type FieldInfo, type SchemaIndex,
} from './schema-index';

export type FilterOperator =
  | 'eq' | 'neq' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with'
  | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'between'
  | 'is_blank' | 'is_not_blank' | 'is_true' | 'is_false';

export interface DraftColumn {
  name: string;
  aliasPath: AliasPath;
  /** Absent = let ODM decide (it may aggregate a metric automatically). */
  aggregations?: AggregateFunction[];
  dateTrunc?: DateTruncUnit;
}

export interface DraftDateRange {
  column: string;
  aliasPath: AliasPath;
  range: DateRangeValue;
  autoAdded: boolean;
}

export interface DraftFilter {
  id: string;
  column: string;
  aliasPath: AliasPath;
  operator: FilterOperator;
  value?: unknown;
  /** Joined instances only: narrow that mart before the join (ODM placement 'pre-join'). */
  sliceOnly: boolean;
}

export interface DraftSort { column: string; direction: 'asc' | 'desc' }

export interface ReportDraft {
  mainDataMartId: string;
  includedPaths: AliasPath[];
  columns: DraftColumn[];
  dateRanges: DraftDateRange[];
  filters: DraftFilter[];
  sorts: DraftSort[];
  /** Instances whose auto-added date the user declined or removed. */
  dateRangeOptOut: AliasPath[];
}

export interface DateChoice { aliasPath: AliasPath; candidates: FieldInfo[] }
export interface AddColumnResult { draft: ReportDraft; dateChoice?: DateChoice }
/** `dropped` lists the names of columns, date ranges and filters that could not be kept. */
export interface RemapResult { draft: ReportDraft; dropped: string[] }

export const AUTO_DATE_RANGE: DateRangeValue = { kind: 'preset', preset: 'last_30_days' };

export function emptyDraft(mainDataMartId: string): ReportDraft {
  return { mainDataMartId, includedPaths: [], columns: [], dateRanges: [], filters: [], sorts: [], dateRangeOptOut: [] };
}

function ancestorsAndSelf(path: AliasPath): AliasPath[] {
  if (!path) return [];
  const segments = path.split('.');
  return segments.map((_, i) => segments.slice(0, i + 1).join('.'));
}

export function includePath(draft: ReportDraft, path: AliasPath): ReportDraft {
  const next = [...new Set([...draft.includedPaths, ...ancestorsAndSelf(path)])];
  return next.length === draft.includedPaths.length ? draft : { ...draft, includedPaths: next };
}

function withAutoRange(draft: ReportDraft, field: FieldInfo): ReportDraft {
  return {
    ...draft,
    dateRanges: [...draft.dateRanges, { column: field.name, aliasPath: field.aliasPath, range: AUTO_DATE_RANGE, autoAdded: true }],
  };
}

export function addColumn(draft: ReportDraft, index: SchemaIndex, name: string): AddColumnResult {
  const field = index.fields.get(name);
  if (!field || draft.columns.some((c) => c.name === name)) return { draft };
  const firstInInstance = !draft.columns.some((c) => c.aliasPath === field.aliasPath);
  const next = includePath({ ...draft, columns: [...draft.columns, { name, aliasPath: field.aliasPath }] }, field.aliasPath);
  if (
    !firstInInstance ||
    next.dateRangeOptOut.includes(field.aliasPath) ||
    next.dateRanges.some((r) => r.aliasPath === field.aliasPath)
  ) {
    return { draft: next };
  }
  const instance = index.instances.get(field.aliasPath);
  const dates = instance ? dateFields(instance) : [];
  if (dates.length === 0) return { draft: next };
  if (dates.length === 1) return { draft: withAutoRange(next, dates[0]!) };
  const candidates = field.kind === 'date' ? [field, ...dates.filter((d) => d.name !== field.name)] : dates;
  return { draft: next, dateChoice: { aliasPath: field.aliasPath, candidates } };
}

export function chooseAutoDate(draft: ReportDraft, index: SchemaIndex, path: AliasPath, column: string | null): ReportDraft {
  if (column === null) {
    return draft.dateRangeOptOut.includes(path) ? draft : { ...draft, dateRangeOptOut: [...draft.dateRangeOptOut, path] };
  }
  const field = index.fields.get(column);
  if (!field || field.aliasPath !== path || draft.dateRanges.some((r) => r.column === column)) return draft;
  return withAutoRange(draft, field);
}

export function removeColumn(draft: ReportDraft, name: string): ReportDraft {
  return {
    ...draft,
    columns: draft.columns.filter((c) => c.name !== name),
    sorts: draft.sorts.filter((s) => s.column !== name),
  };
}

export function moveColumn(draft: ReportDraft, from: number, to: number): ReportDraft {
  const columns = [...draft.columns];
  const [moved] = columns.splice(from, 1);
  if (!moved) return draft;
  columns.splice(Math.max(0, Math.min(to, columns.length)), 0, moved);
  return { ...draft, columns };
}

export function setDateRange(draft: ReportDraft, index: SchemaIndex, column: string, range: DateRangeValue): ReportDraft {
  if (draft.dateRanges.some((r) => r.column === column)) {
    return {
      ...draft,
      dateRanges: draft.dateRanges.map((r) => (r.column === column ? { ...r, range, autoAdded: false } : r)),
    };
  }
  const field = index.fields.get(column);
  if (!field) return draft;
  return includePath(
    { ...draft, dateRanges: [...draft.dateRanges, { column, aliasPath: field.aliasPath, range, autoAdded: false }] },
    field.aliasPath,
  );
}

export function removeDateRange(draft: ReportDraft, column: string): ReportDraft {
  const range = draft.dateRanges.find((r) => r.column === column);
  if (!range) return draft;
  return {
    ...draft,
    dateRanges: draft.dateRanges.filter((r) => r.column !== column),
    dateRangeOptOut: draft.dateRangeOptOut.includes(range.aliasPath)
      ? draft.dateRangeOptOut
      : [...draft.dateRangeOptOut, range.aliasPath],
  };
}

export function upsertFilter(draft: ReportDraft, filter: DraftFilter): ReportDraft {
  const exists = draft.filters.some((f) => f.id === filter.id);
  const filters = exists ? draft.filters.map((f) => (f.id === filter.id ? filter : f)) : [...draft.filters, filter];
  return includePath({ ...draft, filters }, filter.aliasPath);
}

export function removeFilter(draft: ReportDraft, id: string): ReportDraft {
  return { ...draft, filters: draft.filters.filter((f) => f.id !== id) };
}

export function setSort(draft: ReportDraft, column: string, direction: 'asc' | 'desc' | null): ReportDraft {
  if (direction === null) return { ...draft, sorts: draft.sorts.filter((s) => s.column !== column) };
  if (draft.sorts.some((s) => s.column === column)) {
    return { ...draft, sorts: draft.sorts.map((s) => (s.column === column ? { column, direction } : s)) };
  }
  return { ...draft, sorts: [...draft.sorts, { column, direction }] };
}

export function setAggregations(draft: ReportDraft, column: string, fns: AggregateFunction[] | undefined): ReportDraft {
  return {
    ...draft,
    columns: draft.columns.map((c) => (c.name === column ? { ...c, aggregations: fns?.length ? fns : undefined } : c)),
  };
}

export function setDateTrunc(draft: ReportDraft, column: string, unit: DateTruncUnit | undefined): ReportDraft {
  return { ...draft, columns: draft.columns.map((c) => (c.name === column ? { ...c, dateTrunc: unit } : c)) };
}

export function removeInstance(draft: ReportDraft, path: AliasPath): ReportDraft {
  if (path === '') return draft;
  const keep = (p: AliasPath) => !isSameOrDescendant(p, path);
  const columns = draft.columns.filter((c) => keep(c.aliasPath));
  const kept = new Set(columns.map((c) => c.name));
  return {
    ...draft,
    includedPaths: draft.includedPaths.filter(keep),
    columns,
    dateRanges: draft.dateRanges.filter((r) => keep(r.aliasPath)),
    filters: draft.filters.filter((f) => keep(f.aliasPath)),
    sorts: draft.sorts.filter((s) => kept.has(s.column)),
    dateRangeOptOut: draft.dateRangeOptOut.filter(keep),
  };
}

function remap(
  draft: ReportDraft,
  from: SchemaIndex,
  to: SchemaIndex,
  mapPath: (oldPath: AliasPath) => AliasPath | null,
): RemapResult {
  const dropped: string[] = [];
  const renamed = new Map<string, string>();
  const mapName = (name: string, oldPath: AliasPath): { name: string; aliasPath: AliasPath } | null => {
    const newPath = mapPath(oldPath);
    const field = from.fields.get(name);
    const instance = newPath === null ? undefined : to.instances.get(newPath);
    const match = field && instance?.fields.find((f) => f.originalName === field.originalName);
    return match && newPath !== null ? { name: match.name, aliasPath: newPath } : null;
  };

  const columns: DraftColumn[] = [];
  for (const column of draft.columns) {
    const mapped = mapName(column.name, column.aliasPath);
    if (!mapped || columns.some((c) => c.name === mapped.name)) {
      dropped.push(column.name);
      continue;
    }
    renamed.set(column.name, mapped.name);
    columns.push({ ...column, ...mapped });
  }

  const dateRanges: DraftDateRange[] = [];
  for (const range of draft.dateRanges) {
    const mapped = mapName(range.column, range.aliasPath);
    if (!mapped || dateRanges.some((r) => r.column === mapped.name)) {
      dropped.push(range.column);
      continue;
    }
    dateRanges.push({ ...range, column: mapped.name, aliasPath: mapped.aliasPath });
  }

  const filters: DraftFilter[] = [];
  for (const filter of draft.filters) {
    const mapped = mapName(filter.column, filter.aliasPath);
    if (!mapped) {
      dropped.push(filter.column);
      continue;
    }
    filters.push({ ...filter, column: mapped.name, aliasPath: mapped.aliasPath });
  }

  const sorts = draft.sorts.flatMap((s) => {
    const name = renamed.get(s.column);
    return name ? [{ ...s, column: name }] : [];
  });
  const mappedPaths = (paths: AliasPath[]) =>
    [...new Set(paths.map(mapPath).filter((p): p is AliasPath => p !== null && p !== ''))];

  let next: ReportDraft = {
    mainDataMartId: to.mainDataMartId,
    includedPaths: [],
    columns,
    dateRanges,
    filters,
    sorts,
    dateRangeOptOut: [...new Set(draft.dateRangeOptOut.map(mapPath).filter((p): p is AliasPath => p !== null))],
  };
  for (const path of [...mappedPaths(draft.includedPaths), ...columns.map((c) => c.aliasPath)]) {
    next = includePath(next, path);
  }
  return { draft: next, dropped: [...new Set(dropped)] };
}

export function changeInstancePath(draft: ReportDraft, index: SchemaIndex, from: AliasPath, to: AliasPath): RemapResult {
  return remap(draft, index, index, (p) => (p === from ? to : isSameOrDescendant(p, from) && from !== '' ? null : p));
}

export function rebaseOnMain(draft: ReportDraft, oldIndex: SchemaIndex, newIndex: SchemaIndex): RemapResult {
  return remap(draft, oldIndex, newIndex, (p) => {
    const instance = oldIndex.instances.get(p);
    if (!instance) return null;
    return instancesOf(newIndex, instance.dataMartId)[0]?.aliasPath ?? null;
  });
}

export function usedInstances(draft: ReportDraft): AliasPath[] {
  return [
    ...new Set([
      '',
      ...draft.includedPaths,
      ...draft.columns.map((c) => c.aliasPath),
      ...draft.dateRanges.map((r) => r.aliasPath),
      ...draft.filters.map((f) => f.aliasPath),
    ]),
  ];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run ui/lib/report-draft.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/lib/report-draft.ts ui/lib/report-draft.test.ts
git commit -m "Add report draft model with auto dates, path changes and rebasing"
```

---
### Task 7: Read plan and draft validation

**Files:**
- Create: `ui/lib/read-plan.ts`
- Test: `ui/lib/read-plan.test.ts`

**Interfaces:**
- Consumes: `ReportDraft`, `DraftFilter` (Task 6); `dateRangeToRule` (Task 5); `SchemaIndex` (Task 4); rule types (Task 4).
- Produces: `ROW_CAP = 2500`, `QUERY_LIMIT = 2501`, `MAX_PARAM_LENGTH = 8192`, `MAX_IN_VALUES = 500`, `ReadPlan`, `TraverseOptions`, `ReportConfig`, `DraftIssue`, `filterToRule(filter)`, `toReadPlan(draft, today?)`, `toTraverseOptions(plan)`, `toReportConfig(plan)`, `encodedLength(value)`, `validateDraft(draft, index, today?)`, `describeIssue(issue, index)`.

- [ ] **Step 1: Write the failing tests**

`ui/lib/read-plan.test.ts`:

```ts
import { DM, VISITOR_SCHEMA } from '../fixtures/smart-data';
import { buildSchemaIndex } from './schema-index';
import { addColumn, emptyDraft, setAggregations, setDateTrunc, setSort, upsertFilter, type ReportDraft } from './report-draft';
import {
  MAX_IN_VALUES, QUERY_LIMIT, describeIssue, toReadPlan, toReportConfig, toTraverseOptions, validateDraft,
} from './read-plan';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);
const today = new Date(2026, 9, 2);
const add = (draft: ReportDraft, ...names: string[]) => names.reduce((d, n) => addColumn(d, index, n).draft, draft);

describe('toReadPlan', () => {
  it('sends main-mart dates as filters and joined dates as slices', () => {
    const plan = toReadPlan(add(emptyDraft(DM.visitor), 'email', 'sessions__source'), today);
    expect(plan.column).toEqual(['email', 'sessions__source']);
    expect(plan.filter).toEqual([
      { column: 'creation_date', operator: 'relative_date', value: { kind: 'last_n_days', n: 29 } },
      { column: 'sessions__date', operator: 'relative_date', value: { kind: 'last_n_days', n: 29 }, placement: 'pre-join' },
    ]);
  });

  it('turns "only narrow" filters on joined marts into slices and ignores it on the main mart', () => {
    let draft = add(emptyDraft(DM.visitor), 'email', 'sessions__source');
    draft = upsertFilter(draft, { id: 'a', column: 'sessions__source', aliasPath: 'sessions', operator: 'eq', value: 'google', sliceOnly: true });
    draft = upsertFilter(draft, { id: 'b', column: 'email', aliasPath: '', operator: 'is_not_blank', sliceOnly: true });
    const filters = toReadPlan(draft, today).filter.slice(2);
    expect(filters).toEqual([
      { column: 'sessions__source', operator: 'eq', value: 'google', placement: 'pre-join' },
      { column: 'email', operator: 'is_not_blank' },
    ]);
  });

  it('maps sorts, aggregations and date buckets', () => {
    let draft = add(emptyDraft(DM.visitor), 'creation_date', 'visits');
    draft = setSort(draft, 'visits', 'desc');
    draft = setAggregations(draft, 'visits', ['SUM', 'AVG']);
    draft = setDateTrunc(draft, 'creation_date', 'MONTH');
    const plan = toReadPlan(draft, today);
    expect(plan.sort).toEqual([{ column: 'visits', direction: 'desc' }]);
    expect(plan.aggregation).toEqual([{ column: 'visits', function: 'SUM' }, { column: 'visits', function: 'AVG' }]);
    expect(plan.dateTrunc).toEqual([{ column: 'creation_date', unit: 'MONTH' }]);
  });
});

describe('request shapes', () => {
  const plan = toReadPlan(add(emptyDraft(DM.visitor), 'email'), today);

  it('asks HTTP Data for one row more than the cap and sends empty parts as null', () => {
    expect(toTraverseOptions(plan)).toEqual({
      column: ['email'], filter: plan.filter, sort: null, aggregation: null, dateTrunc: null, limit: QUERY_LIMIT,
    });
    expect(QUERY_LIMIT).toBe(2501);
  });

  it('builds a report configuration without any row limit', () => {
    expect(toReportConfig(plan)).toEqual({
      columnConfig: ['email'], filterConfig: plan.filter, sortConfig: null, aggregationConfig: null, dateTruncConfig: null,
    });
  });
});

describe('validateDraft', () => {
  it('requires at least one column', () => {
    expect(validateDraft(emptyDraft(DM.visitor), index, today)).toEqual([{ kind: 'no-columns' }]);
  });

  it('flags columns that are no longer in the schema', () => {
    const draft = { ...add(emptyDraft(DM.visitor), 'email'), columns: [{ name: 'gone_field', aliasPath: '' }] };
    const issues = validateDraft(draft, index, today);
    expect(issues).toContainEqual({ kind: 'unknown-column', column: 'gone_field' });
    expect(describeIssue({ kind: 'unknown-column', column: 'gone_field' }, index)).toBe(
      '"gone_field" is no longer available. Remove it to run the report.',
    );
  });

  it('requires filter values and caps list sizes', () => {
    let draft = add(emptyDraft(DM.visitor), 'email');
    draft = upsertFilter(draft, { id: 'empty', column: 'email', aliasPath: '', operator: 'eq', value: '', sliceOnly: false });
    draft = upsertFilter(draft, {
      id: 'big', column: 'email', aliasPath: '', operator: 'in',
      value: Array.from({ length: MAX_IN_VALUES + 1 }, (_, i) => `v${i}`), sliceOnly: false,
    });
    expect(validateDraft(draft, index, today)).toEqual(
      expect.arrayContaining([{ kind: 'filter-needs-value', filterId: 'empty' }, { kind: 'too-many-values', filterId: 'big' }]),
    );
  });

  it('flags a filter parameter longer than ODM accepts', () => {
    const draft = upsertFilter(add(emptyDraft(DM.visitor), 'email'), {
      id: 'long', column: 'email', aliasPath: '', operator: 'in',
      value: Array.from({ length: 400 }, (_, i) => `someone.with.a.long.address.${i}@example.com`), sliceOnly: false,
    });
    expect(validateDraft(draft, index, today)).toContainEqual({ kind: 'too-long', param: 'filter' });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run ui/lib/read-plan.test.ts`
Expected: FAIL — `Failed to resolve import "./read-plan"`.

- [ ] **Step 3: Implement**

`ui/lib/read-plan.ts`:

```ts
import type { AggregationRule, DateTruncRule, FilterRule, SortRule } from './odm-types';
import { dateRangeToRule } from './date-ranges';
import type { DraftFilter, ReportDraft } from './report-draft';
import type { SchemaIndex } from './schema-index';

export const ROW_CAP = 2500;
/** One more than the cap: if it arrives, the result was truncated. */
export const QUERY_LIMIT = ROW_CAP + 1;
/** HTTP Data accepts at most this many characters per encoded parameter. */
export const MAX_PARAM_LENGTH = 8192;
export const MAX_IN_VALUES = 500;

export interface ReadPlan {
  column: string[];
  filter: FilterRule[];
  sort: SortRule[];
  aggregation: AggregationRule[];
  dateTrunc: DateTruncRule[];
}

export interface TraverseOptions {
  column: string[];
  filter: FilterRule[] | null;
  sort: SortRule[] | null;
  aggregation: AggregationRule[] | null;
  dateTrunc: DateTruncRule[] | null;
  limit: number;
}

export interface ReportConfig {
  columnConfig: string[];
  filterConfig: FilterRule[] | null;
  sortConfig: SortRule[] | null;
  aggregationConfig: AggregationRule[] | null;
  dateTruncConfig: DateTruncRule[] | null;
}

export type DraftIssue =
  | { kind: 'no-columns' }
  | { kind: 'unknown-column'; column: string }
  | { kind: 'filter-needs-value'; filterId: string }
  | { kind: 'too-many-values'; filterId: string }
  | { kind: 'too-long'; param: 'filter' | 'sort' | 'aggregation' | 'dateTrunc' };

const VALUELESS = new Set(['is_blank', 'is_not_blank', 'is_true', 'is_false']);

export function filterToRule(filter: DraftFilter): FilterRule {
  const placement = filter.sliceOnly && filter.aliasPath !== '' ? { placement: 'pre-join' as const } : {};
  if (VALUELESS.has(filter.operator)) {
    return { column: filter.column, operator: filter.operator, ...placement } as FilterRule;
  }
  return { column: filter.column, operator: filter.operator, value: filter.value, ...placement } as FilterRule;
}

export function toReadPlan(draft: ReportDraft, today = new Date()): ReadPlan {
  const dateRules = draft.dateRanges.flatMap((range) => {
    const rule = dateRangeToRule(range.column, range.range, today);
    if (!rule) return [];
    // A period on a joined mart narrows that mart only; on the main mart it bounds the report.
    return [range.aliasPath === '' ? rule : { ...rule, placement: 'pre-join' as const }];
  });
  return {
    column: draft.columns.map((c) => c.name),
    filter: [...dateRules, ...draft.filters.map(filterToRule)],
    sort: draft.sorts.map((s) => ({ column: s.column, direction: s.direction })),
    aggregation: draft.columns.flatMap((c) => (c.aggregations ?? []).map((fn) => ({ column: c.name, function: fn }))),
    dateTrunc: draft.columns.flatMap((c) => (c.dateTrunc ? [{ column: c.name, unit: c.dateTrunc }] : [])),
  };
}

const orNull = <T>(items: T[]): T[] | null => (items.length ? items : null);

export function toTraverseOptions(plan: ReadPlan): TraverseOptions {
  return {
    column: plan.column,
    filter: orNull(plan.filter),
    sort: orNull(plan.sort),
    aggregation: orNull(plan.aggregation),
    dateTrunc: orNull(plan.dateTrunc),
    limit: QUERY_LIMIT,
  };
}

export function toReportConfig(plan: ReadPlan): ReportConfig {
  return {
    columnConfig: plan.column,
    filterConfig: orNull(plan.filter),
    sortConfig: orNull(plan.sort),
    aggregationConfig: orNull(plan.aggregation),
    dateTruncConfig: orNull(plan.dateTrunc),
  };
}

/** Length of base64url(JSON) — what HTTP Data receives per parameter. */
export function encodedLength(value: unknown): number {
  const bytes = new TextEncoder().encode(JSON.stringify(value)).length;
  return Math.ceil((bytes * 4) / 3);
}

function hasValue(filter: DraftFilter): boolean {
  const value = filter.value;
  if (filter.operator === 'in') return Array.isArray(value) && value.length > 0;
  if (filter.operator === 'between') {
    const range = value as { from?: unknown; to?: unknown } | undefined;
    return !!range && range.from !== undefined && range.from !== '' && range.to !== undefined && range.to !== '';
  }
  return value !== undefined && value !== null && value !== '' && !Number.isNaN(value);
}

export function validateDraft(draft: ReportDraft, index: SchemaIndex, today = new Date()): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (draft.columns.length === 0) issues.push({ kind: 'no-columns' });
  const referenced = new Set([
    ...draft.columns.map((c) => c.name),
    ...draft.dateRanges.map((r) => r.column),
    ...draft.filters.map((f) => f.column),
  ]);
  for (const column of referenced) {
    if (!index.fields.has(column)) issues.push({ kind: 'unknown-column', column });
  }
  for (const filter of draft.filters) {
    if (VALUELESS.has(filter.operator)) continue;
    if (!hasValue(filter)) issues.push({ kind: 'filter-needs-value', filterId: filter.id });
    else if (filter.operator === 'in' && (filter.value as unknown[]).length > MAX_IN_VALUES) {
      issues.push({ kind: 'too-many-values', filterId: filter.id });
    }
  }
  const plan = toReadPlan(draft, today);
  for (const param of ['filter', 'sort', 'aggregation', 'dateTrunc'] as const) {
    if (plan[param].length && encodedLength(plan[param]) > MAX_PARAM_LENGTH) issues.push({ kind: 'too-long', param });
  }
  return issues;
}

export function describeIssue(issue: DraftIssue, index: SchemaIndex): string {
  switch (issue.kind) {
    case 'no-columns':
      return 'Pick at least one column.';
    case 'unknown-column': {
      const label = index.fields.get(issue.column)?.label ?? issue.column;
      return `"${label}" is no longer available. Remove it to run the report.`;
    }
    case 'filter-needs-value':
      return 'Fill in a value for every filter.';
    case 'too-many-values':
      return `A filter can match at most ${MAX_IN_VALUES} values.`;
    case 'too-long':
      return 'Too many filters for one query. Remove some or create a Google Sheets report.';
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run ui/lib/read-plan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/lib/read-plan.ts ui/lib/read-plan.test.ts
git commit -m "Build ODM read plans from report drafts and validate them"
```

---

### Task 8: User-facing errors

**Files:**
- Create: `ui/lib/errors.ts`
- Test: `ui/lib/errors.test.ts`

**Interfaces:**
- Produces: `UserFacingError { message; detail?; retryable; status?; code? }`, `describeError(error, subject?)`, `errorStatus(error): number | undefined`, `isAbortError(error): boolean`.

The SDK does not export its error class. Transport failures arrive as an `Error` with `name === 'PluginTransportError'` and a `payload { code, status?, message, details? }`; the API client sometimes wraps them in an `OWOXApiError` whose `cause` is the transport error.

- [ ] **Step 1: Write the failing tests**

`ui/lib/errors.test.ts`:

```ts
import { describeError, errorStatus, isAbortError } from './errors';

function transportError(payload: { code: string; status?: number; message: string; details?: unknown }) {
  return Object.assign(new Error(payload.message), { name: 'PluginTransportError', payload });
}

it('explains missing access', () => {
  expect(describeError(transportError({ code: 'HTTP_ERROR', status: 403, message: 'Forbidden' }), 'Session').message)
    .toBe("You don't have access to Session.");
  expect(describeError(transportError({ code: 'FORBIDDEN', message: 'Refused' })).retryable).toBe(false);
});

it('shows ODM validation messages as they are', () => {
  const error = transportError({
    code: 'HTTP_ERROR', status: 400, message: 'Bad Request',
    details: { message: 'HAVING is not supported on a joined metric.' },
  });
  expect(describeError(error)).toMatchObject({ message: 'HAVING is not supported on a joined metric.', retryable: false });
});

it('finds the transport error behind an API client wrapper', () => {
  const wrapped = Object.assign(new Error('Failed to open OWOX Data Mart data stream'), {
    name: 'OWOXApiError',
    cause: transportError({ code: 'NETWORK_ERROR', message: 'offline' }),
  });
  expect(describeError(wrapped)).toMatchObject({ message: "Couldn't reach OWOX Data Marts.", retryable: true });
});

it('handles suspension, not-found, aborts and unknown failures', () => {
  expect(describeError(transportError({ code: 'SUSPENDED', message: 'x' })).message).toBe('This plugin was suspended by an administrator.');
  expect(errorStatus(transportError({ code: 'HTTP_ERROR', status: 404, message: 'Not Found' }))).toBe(404);
  const abort = Object.assign(new Error('Aborted'), { name: 'AbortError' });
  expect(isAbortError(abort)).toBe(true);
  expect(describeError(new Error('boom'))).toEqual({ message: 'Something went wrong.', detail: 'boom', retryable: true, code: undefined, status: undefined });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run ui/lib/errors.test.ts`
Expected: FAIL — `Failed to resolve import "./errors"`.

- [ ] **Step 3: Implement**

`ui/lib/errors.ts`:

```ts
export interface UserFacingError {
  message: string;
  detail?: string;
  retryable: boolean;
  status?: number;
  code?: string;
}

interface TransportPayload { code: string; status?: number; message: string; details?: unknown }

function transportPayload(error: unknown): TransportPayload | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const candidate = current as { name?: unknown; payload?: unknown; cause?: unknown };
    if (candidate.name === 'PluginTransportError' && candidate.payload && typeof candidate.payload === 'object') {
      return candidate.payload as TransportPayload;
    }
    current = candidate.cause;
  }
  return undefined;
}

function backendMessage(details: unknown): string | undefined {
  if (typeof details === 'string') return details;
  if (!details || typeof details !== 'object') return undefined;
  const message = (details as { message?: unknown }).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.filter((m): m is string => typeof m === 'string').join(' ');
  return undefined;
}

export function errorStatus(error: unknown): number | undefined {
  const status = transportPayload(error)?.status ?? (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

export function isAbortError(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === 'AbortError';
}

export function describeError(error: unknown, subject = 'this data'): UserFacingError {
  if (isAbortError(error)) return { message: 'The query was cancelled.', retryable: false, code: 'ABORTED' };
  const payload = transportPayload(error);
  const status = errorStatus(error);
  const code = payload?.code ?? ((error as { code?: unknown } | null)?.code as string | undefined);
  const raw = backendMessage(payload?.details) ?? payload?.message ?? (error instanceof Error ? error.message : String(error));

  if (code === 'SUSPENDED') return { message: 'This plugin was suspended by an administrator.', retryable: false, code, status };
  if (code === 'FORBIDDEN' || status === 403) return { message: `You don't have access to ${subject}.`, retryable: false, code, status };
  if (code === 'NETWORK_ERROR' || code === 'TIMEOUT') return { message: "Couldn't reach OWOX Data Marts.", retryable: true, code, status };
  if (status === 404) return { message: 'Not found. It may have been deleted.', retryable: false, code, status };
  if (status !== undefined && status >= 400 && status < 500) return { message: raw, retryable: false, code, status };
  return { message: 'Something went wrong.', detail: raw, retryable: true, code, status };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run ui/lib/errors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/lib/errors.ts ui/lib/errors.test.ts
git commit -m "Translate SDK and ODM failures into user-facing errors"
```

---

### Task 9: ODM API wrappers

**Files:**
- Create: `ui/lib/odm-api.ts`
- Test: `ui/lib/odm-api.test.ts`

**Interfaces:**
- Consumes: types (Task 4); `ROW_CAP`, `TraverseOptions`, `ReportConfig` (Task 7).
- Produces: `Traversal`, `OwoxClient`, `QueryResult { rows; truncated; runId? }`, `ReportTarget { title; destinationId; spreadsheetId; sheetId; config }`, `WaitOptions { signal?; sleep?; intervalMs?; timeoutMs? }`, `abortError()`, `createOdmApi(owox)`, `OdmApi` with methods `listDataMarts()`, `getBlendableSchema(id)`, `getRelationshipGraph(id)`, `runQuery(dataMartId, options, signal?)`, `getRunTotals(dataMartId, runId)`, `listSheetsDestinations()`, `createSpreadsheet(destinationId, title)`, `createReport(dataMartId, target)`, `updateReport(reportId, target)`, `getReport(reportId)`, `runReportAndWait(reportId, options?)`, `getReportSql(reportId)`.

- [ ] **Step 1: Write the failing tests**

`ui/lib/odm-api.test.ts`:

```ts
import { DATA_MARTS, DM, sampleRows } from '../fixtures/smart-data';
import { createOdmApi, type OwoxClient, type Traversal } from './odm-api';
import { QUERY_LIMIT, type ReportConfig } from './read-plan';
import type { Row } from './odm-types';

function traversal(rows: Row[], chunk = 500): Traversal & { cancelled: boolean } {
  const t = {
    runId: 'run-1',
    cancelled: false,
    async *rowChunks() {
      for (let i = 0; i < rows.length; i += chunk) {
        if (t.cancelled) return;
        yield rows.slice(i, i + chunk);
      }
    },
    async cancel() {
      t.cancelled = true;
    },
  };
  return t;
}

function fakeOwox(overrides: Partial<OwoxClient> = {}) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const owox: OwoxClient = {
    dataMarts: { list: async () => DATA_MARTS, traverseData: async () => traversal([]) },
    getJson: async <T,>(path: string) => {
      calls.push({ method: 'GET', path });
      return {} as T;
    },
    postJson: async <T,>(path: string, body: unknown) => {
      calls.push({ method: 'POST', path, body });
      return { id: 'report-1' } as T;
    },
    putJson: async <T,>(path: string, body: unknown) => {
      calls.push({ method: 'PUT', path, body });
      return {} as T;
    },
    ...overrides,
  };
  return { owox, calls };
}

const options = { column: ['email'], filter: null, sort: null, aggregation: null, dateTrunc: null, limit: QUERY_LIMIT };
const config: ReportConfig = { columnConfig: ['email'], filterConfig: null, sortConfig: null, aggregationConfig: null, dateTruncConfig: null };

describe('runQuery', () => {
  it('collects all rows when under the cap', async () => {
    const { owox } = fakeOwox({ dataMarts: { list: async () => [], traverseData: async () => traversal(sampleRows(['email'], 120)) } });
    const result = await createOdmApi(owox).runQuery(DM.visitor, options);
    expect(result).toMatchObject({ truncated: false, runId: 'run-1' });
    expect(result.rows).toHaveLength(120);
  });

  it('stops at 2,500 rows and reports truncation when row 2,501 arrives', async () => {
    const t = traversal(sampleRows(['email'], 3000));
    const { owox } = fakeOwox({ dataMarts: { list: async () => [], traverseData: async () => t } });
    const result = await createOdmApi(owox).runQuery(DM.visitor, options);
    expect(result.truncated).toBe(true);
    expect(result.rows).toHaveLength(2500);
    expect(t.cancelled).toBe(true);
  });

  it('cancels the stream and rejects with AbortError when aborted', async () => {
    const t = traversal(sampleRows(['email'], 3000), 10);
    const { owox } = fakeOwox({ dataMarts: { list: async () => [], traverseData: async () => t } });
    const controller = new AbortController();
    controller.abort();
    await expect(createOdmApi(owox).runQuery(DM.visitor, options, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(t.cancelled).toBe(true);
  });
});

it('lists only published data marts available for reporting, by title', async () => {
  const marts = [
    { ...DATA_MARTS[0]!, title: 'Zeta' },
    { ...DATA_MARTS[1]!, title: 'Alpha' },
    { ...DATA_MARTS[2]!, status: 'DRAFT' as const },
    { ...DATA_MARTS[3]!, availableForReporting: false },
  ];
  const { owox } = fakeOwox({ dataMarts: { list: async () => marts, traverseData: async () => traversal([]) } });
  expect((await createOdmApi(owox).listDataMarts()).map((m) => m.title)).toEqual(['Alpha', 'Zeta']);
});

it('creates and updates Google Sheets reports with the read plan', async () => {
  const { owox, calls } = fakeOwox();
  const api = createOdmApi(owox);
  const target = { title: 'Visitors', destinationId: 'dest/1', spreadsheetId: 'sheet-1', sheetId: 0, config };
  await api.createReport(DM.visitor, target);
  await api.updateReport('report-1', target);
  expect(calls[0]).toEqual({
    method: 'POST', path: '/api/reports',
    body: {
      dataMartId: DM.visitor, title: 'Visitors', dataDestinationId: 'dest/1',
      destinationConfig: { type: 'google-sheets-config', spreadsheetId: 'sheet-1', sheetId: 0 }, ...config,
    },
  });
  expect(calls[1]?.path).toBe('/api/reports/report-1');
  expect(calls[1]?.body).not.toHaveProperty('dataMartId');
});

it('encodes ids in paths', async () => {
  const { owox, calls } = fakeOwox();
  await createOdmApi(owox).getBlendableSchema('a/b');
  expect(calls[0]?.path).toBe('/api/data-marts/a%2Fb/blendable-schema');
});

it('waits for a new finished run of a report', async () => {
  const states = [
    { id: 'r', title: 'R', lastRunAt: '2026-10-01T00:00:00Z', lastRunStatus: 'SUCCESS' },
    { id: 'r', title: 'R', lastRunAt: '2026-10-01T00:00:00Z', lastRunStatus: 'SUCCESS' },
    { id: 'r', title: 'R', lastRunAt: '2026-10-02T00:00:00Z', lastRunStatus: 'RUNNING' },
    { id: 'r', title: 'R', lastRunAt: '2026-10-02T00:00:00Z', lastRunStatus: 'SUCCESS' },
  ];
  const { owox, calls } = fakeOwox({ getJson: async <T,>() => states.shift() as T });
  const sleeps: number[] = [];
  const result = await createOdmApi(owox).runReportAndWait('r', { sleep: async (ms) => void sleeps.push(ms) });
  expect(result).toEqual({ status: 'SUCCESS', error: undefined });
  expect(calls).toContainEqual({ method: 'POST', path: '/api/reports/r/run', body: {} });
  expect(sleeps).toEqual([2000, 2000, 2000]);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run ui/lib/odm-api.test.ts`
Expected: FAIL — `Failed to resolve import "./odm-api"`.

- [ ] **Step 3: Implement**

`ui/lib/odm-api.ts`:

```ts
import type {
  BlendableSchema, DataMartSummary, RelationshipGraph, ReportRunStatus, ReportSummary, Row,
  SheetsDestination, SpreadsheetRef, Totals,
} from './odm-types';
import { ROW_CAP, type ReportConfig, type TraverseOptions } from './read-plan';

export interface Traversal {
  readonly runId: string | undefined;
  rowChunks(): AsyncIterable<Row[]>;
  cancel(): Promise<void>;
}

/** The subset of `ctx.owox` this plugin uses. */
export interface OwoxClient {
  dataMarts: {
    list(): Promise<DataMartSummary[]>;
    traverseData(dataMartId: string, options: TraverseOptions): Promise<Traversal>;
  };
  getJson<T>(path: string, query?: Record<string, string>): Promise<T>;
  postJson<T>(path: string, body: unknown): Promise<T>;
  putJson<T>(path: string, body: unknown): Promise<T>;
}

export interface QueryResult { rows: Row[]; truncated: boolean; runId?: string }

export interface ReportTarget {
  title: string;
  destinationId: string;
  spreadsheetId: string;
  sheetId: number;
  config: ReportConfig;
}

export interface WaitOptions {
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  intervalMs?: number;
  timeoutMs?: number;
}

const enc = encodeURIComponent;
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function reportBody(target: ReportTarget) {
  return {
    title: target.title,
    dataDestinationId: target.destinationId,
    destinationConfig: { type: 'google-sheets-config', spreadsheetId: target.spreadsheetId, sheetId: target.sheetId },
    ...target.config,
  };
}

export function createOdmApi(owox: OwoxClient) {
  const getReport = (reportId: string) => owox.getJson<ReportSummary>(`/api/reports/${enc(reportId)}`);

  return {
    async listDataMarts(): Promise<DataMartSummary[]> {
      const all = await owox.dataMarts.list();
      return all
        .filter((m) => m.status === 'PUBLISHED' && m.availableForReporting)
        .sort((a, b) => a.title.localeCompare(b.title));
    },

    getBlendableSchema: (dataMartId: string) =>
      owox.getJson<BlendableSchema>(`/api/data-marts/${enc(dataMartId)}/blendable-schema`),

    getRelationshipGraph: (dataMartId: string) =>
      owox.getJson<RelationshipGraph>(`/api/data-marts/${enc(dataMartId)}/relationships/graph`),

    /** Streams at most ROW_CAP rows; every call is a billed HTTP_DATA run in ODM. */
    async runQuery(dataMartId: string, options: TraverseOptions, signal?: AbortSignal): Promise<QueryResult> {
      const traversal = await owox.dataMarts.traverseData(dataMartId, options);
      const rows: Row[] = [];
      let truncated = false;
      const onAbort = () => void traversal.cancel();
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        if (signal?.aborted) throw abortError();
        for await (const chunk of traversal.rowChunks()) {
          if (signal?.aborted) throw abortError();
          rows.push(...chunk);
          if (rows.length > ROW_CAP) {
            truncated = true;
            await traversal.cancel();
            break;
          }
        }
        if (signal?.aborted) throw abortError();
      } catch (error) {
        if (signal?.aborted) {
          await traversal.cancel();
          throw abortError();
        }
        throw error;
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
      return { rows: rows.slice(0, ROW_CAP), truncated, runId: traversal.runId };
    },

    async getRunTotals(dataMartId: string, runId: string): Promise<Totals | null> {
      const run = await owox.getJson<{ totals?: Totals | null }>(`/api/data-marts/${enc(dataMartId)}/runs/${enc(runId)}`);
      return run.totals ?? null;
    },

    async listSheetsDestinations(): Promise<SheetsDestination[]> {
      const list = await owox.getJson<SheetsDestination[]>('/api/data-destinations/by-type/GOOGLE_SHEETS');
      return list.map((d) => ({ id: d.id, title: d.title }));
    },

    createSpreadsheet: (destinationId: string, title: string) =>
      owox.postJson<SpreadsheetRef>(`/api/data-destinations/${enc(destinationId)}/google-sheets/documents`, { title }),

    createReport: (dataMartId: string, target: ReportTarget) =>
      owox.postJson<{ id: string }>('/api/reports', { dataMartId, ...reportBody(target) }),

    updateReport: (reportId: string, target: ReportTarget) =>
      owox.putJson<ReportSummary>(`/api/reports/${enc(reportId)}`, reportBody(target)),

    getReport,

    /** Starts a run and polls until a run newer than the previous one finishes. */
    async runReportAndWait(
      reportId: string,
      { signal, sleep = defaultSleep, intervalMs = 2000, timeoutMs = 600_000 }: WaitOptions = {},
    ): Promise<{ status: ReportRunStatus; error?: string }> {
      const before = await getReport(reportId);
      await owox.postJson(`/api/reports/${enc(reportId)}/run`, {});
      const startedAt = Date.now();
      for (;;) {
        if (signal?.aborted) throw abortError();
        await sleep(intervalMs);
        const report = await getReport(reportId);
        if (report.lastRunStatus && report.lastRunStatus !== 'RUNNING' && report.lastRunAt !== before.lastRunAt) {
          return { status: report.lastRunStatus, error: report.lastRunError };
        }
        if (Date.now() - startedAt > timeoutMs) return { status: 'RUNNING' };
      }
    },

    async getReportSql(reportId: string): Promise<string> {
      return (await owox.getJson<{ sql: string }>(`/api/reports/${enc(reportId)}/generated-sql`)).sql;
    },
  };
}

export type OdmApi = ReturnType<typeof createOdmApi>;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run ui/lib/odm-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/lib/odm-api.ts ui/lib/odm-api.test.ts
git commit -m "Add typed wrappers over the ODM API"
```

---

### Task 10: Saved reports store

**Files:**
- Create: `ui/lib/report-store.ts`
- Test: `ui/lib/report-store.test.ts`

**Interfaces:**
- Consumes: `ReportDraft` (Task 6).
- Produces: `REPORTS_COLLECTION = 'reports'`, `LinkedReport`, `StoredReport`, `SavedReport { id; report; updatedAt }`, `CollectionDoc<T>`, `CollectionLike<T>`, `stableStringify(value)`, `stableHash(value)`, `configHash(draft)`, `parseStoredReport(value)`, `createReportStore(collection, newId?)`, `ReportStore` with `listAll()`, `get(id)`, `save({ id?, report, previousParentId? })`, `remove(id)`.

- [ ] **Step 1: Write the failing tests**

`ui/lib/report-store.test.ts`:

```ts
import { DM } from '../fixtures/smart-data';
import { emptyDraft } from './report-draft';
import {
  configHash, createReportStore, parseStoredReport,
  type CollectionDoc, type CollectionLike, type StoredReport,
} from './report-store';

function report(title: string, main: string = DM.visitor): StoredReport {
  return { schemaVersion: 1, title, draft: emptyDraft(main), createdBy: 'u1', updatedBy: 'u1' };
}

function doc<T>(id: string, document: T, updatedAt: string): CollectionDoc<T> {
  return { id, document, createdAt: updatedAt, updatedAt };
}

function fakeCollection(pages: { items: CollectionDoc<unknown>[]; nextCursor: string | null }[] = []) {
  const log: string[] = [];
  const collection: CollectionLike<StoredReport> = {
    list: async (o) => {
      log.push(`list:${o?.cursor ?? ''}`);
      return (pages.shift() ?? { items: [], nextCursor: null }) as { items: CollectionDoc<StoredReport>[]; nextCursor: string | null };
    },
    get: async () => null,
    put: async (id, document, o) => {
      log.push(`put:${id}:${o?.parentId}`);
      return { id, parentId: o?.parentId, document, createdAt: 't', updatedAt: 't' };
    },
    delete: async (id) => void log.push(`delete:${id}`),
  };
  return { collection, log };
}

describe('listAll', () => {
  it('keeps paging through short and empty pages and skips unreadable documents', async () => {
    const { collection, log } = fakeCollection([
      { items: [doc('a', report('Older'), '2026-09-01')], nextCursor: 'c1' },
      { items: [], nextCursor: 'c2' },
      { items: [doc('bad', { schemaVersion: 7 }, '2026-09-03'), doc('b', report('Newer'), '2026-09-02')], nextCursor: null },
    ]);
    const reports = await createReportStore(collection).listAll();
    expect(reports.map((r) => r.report.title)).toEqual(['Newer', 'Older']);
    expect(log).toEqual(['list:', 'list:c1', 'list:c2']);
  });

  it('stops on a repeated cursor instead of looping forever', async () => {
    const { collection } = fakeCollection([
      { items: [], nextCursor: 'same' },
      { items: [], nextCursor: 'same' },
    ]);
    await expect(createReportStore(collection).listAll()).rejects.toThrow('repeated cursor');
  });
});

describe('save', () => {
  it('creates a document under the main data mart', async () => {
    const { collection, log } = fakeCollection();
    const saved = await createReportStore(collection, () => 'new-id').save({ report: report('R') });
    expect(saved.id).toBe('new-id');
    expect(log).toEqual([`put:new-id:${DM.visitor}`]);
  });

  it('overwrites in place when the main data mart is unchanged', async () => {
    const { collection, log } = fakeCollection();
    await createReportStore(collection, () => 'unused').save({ id: 'r1', report: report('R'), previousParentId: DM.visitor });
    expect(log).toEqual([`put:r1:${DM.visitor}`]);
  });

  it('moves to a new document when the main data mart changes, writing before deleting', async () => {
    const { collection, log } = fakeCollection();
    const saved = await createReportStore(collection, () => 'moved').save({
      id: 'r1', report: report('R', DM.session), previousParentId: DM.visitor,
    });
    expect(saved.id).toBe('moved');
    expect(log).toEqual([`put:moved:${DM.session}`, 'delete:r1']);
  });
});

describe('parseStoredReport', () => {
  it('fills missing draft arrays so older documents still open', () => {
    const parsed = parseStoredReport({ schemaVersion: 1, title: 'T', draft: { mainDataMartId: DM.visitor }, createdBy: 'u', updatedBy: 'u' });
    expect(parsed?.draft).toEqual(emptyDraft(DM.visitor));
    expect(parseStoredReport({ schemaVersion: 2 })).toBeNull();
    expect(parseStoredReport('nope')).toBeNull();
  });
});

describe('configHash', () => {
  it('ignores what does not change the query', () => {
    const base = emptyDraft(DM.visitor);
    const a = { ...base, columns: [{ name: 'email', aliasPath: '' }], filters: [{ id: 'x', column: 'email', aliasPath: '', operator: 'is_not_blank' as const, sliceOnly: false }] };
    const b = { ...a, includedPaths: ['contact'], filters: [{ ...a.filters[0]!, id: 'y' }] };
    expect(configHash(a)).toBe(configHash(b));
    expect(configHash(a)).not.toBe(configHash({ ...a, columns: [] }));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run ui/lib/report-store.test.ts`
Expected: FAIL — `Failed to resolve import "./report-store"`.

- [ ] **Step 3: Implement**

`ui/lib/report-store.ts`:

```ts
import type { ReportDraft } from './report-draft';

export const REPORTS_COLLECTION = 'reports';

export interface LinkedReport {
  reportId: string;
  destinationId: string;
  spreadsheetId: string;
  sheetId: number;
  /** configHash of the draft the ODM report was last updated with. */
  syncedDraftHash: string;
}

export interface StoredReport {
  schemaVersion: 1;
  title: string;
  draft: ReportDraft;
  createdBy: string;
  updatedBy: string;
  linkedReport?: LinkedReport;
}

export interface SavedReport { id: string; report: StoredReport; updatedAt: string }

export interface CollectionDoc<T> {
  id: string;
  parentId?: string;
  document: T;
  createdAt: string;
  updatedAt: string;
}

/** The subset of the SDK's PluginCollection this store uses. */
export interface CollectionLike<T> {
  list(options?: { limit?: number; cursor?: string }): Promise<{ items: CollectionDoc<T>[]; nextCursor: string | null }>;
  get(id: string): Promise<CollectionDoc<T> | null>;
  put(id: string, document: T, options?: { parentId?: string }): Promise<CollectionDoc<T>>;
  delete(id: string): Promise<void>;
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((k) => record[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** FNV-1a over the stable JSON form. Enough to detect change, not a security hash. */
export function stableHash(value: unknown): string {
  const text = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Changes only when the query ODM would run changes. */
export function configHash(draft: ReportDraft): string {
  return stableHash({
    mainDataMartId: draft.mainDataMartId,
    columns: draft.columns,
    dateRanges: draft.dateRanges.map(({ column, range }) => ({ column, range })),
    filters: draft.filters.map(({ id: _id, ...rest }) => rest),
    sorts: draft.sorts,
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

function isLinkedReport(value: unknown): value is LinkedReport {
  return (
    isRecord(value) &&
    typeof value.reportId === 'string' &&
    typeof value.destinationId === 'string' &&
    typeof value.spreadsheetId === 'string' &&
    typeof value.sheetId === 'number' &&
    typeof value.syncedDraftHash === 'string'
  );
}

export function parseStoredReport(value: unknown): StoredReport | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.title !== 'string') return null;
  const draft = value.draft;
  if (!isRecord(draft) || typeof draft.mainDataMartId !== 'string') return null;
  return {
    schemaVersion: 1,
    title: value.title,
    createdBy: typeof value.createdBy === 'string' ? value.createdBy : '',
    updatedBy: typeof value.updatedBy === 'string' ? value.updatedBy : '',
    linkedReport: isLinkedReport(value.linkedReport) ? value.linkedReport : undefined,
    draft: {
      mainDataMartId: draft.mainDataMartId,
      includedPaths: asArray(draft.includedPaths),
      columns: asArray(draft.columns),
      dateRanges: asArray(draft.dateRanges),
      filters: asArray(draft.filters),
      sorts: asArray(draft.sorts),
      dateRangeOptOut: asArray(draft.dateRangeOptOut),
    },
  };
}

function defaultId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createReportStore(collection: CollectionLike<StoredReport>, newId: () => string = defaultId) {
  return {
    /** Entity-bound pages can be short or empty while a cursor remains; page until it is null. */
    async listAll(): Promise<SavedReport[]> {
      const reports: SavedReport[] = [];
      const seen = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await collection.list({ limit: 100, ...(cursor ? { cursor } : {}) });
        for (const item of page.items) {
          const report = parseStoredReport(item.document);
          if (report) reports.push({ id: item.id, report, updatedAt: item.updatedAt });
        }
        cursor = page.nextCursor ?? undefined;
        if (cursor && seen.has(cursor)) throw new Error('The reports collection returned a repeated cursor.');
        if (cursor) seen.add(cursor);
      } while (cursor);
      return reports.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async get(id: string): Promise<SavedReport | null> {
      const doc = await collection.get(id);
      const report = doc ? parseStoredReport(doc.document) : null;
      return doc && report ? { id: doc.id, report, updatedAt: doc.updatedAt } : null;
    },

    async save({ id, report, previousParentId }: { id?: string; report: StoredReport; previousParentId?: string }): Promise<SavedReport> {
      const parentId = report.draft.mainDataMartId;
      const moving = id !== undefined && previousParentId !== undefined && previousParentId !== parentId;
      const targetId = id === undefined || moving ? newId() : id;
      const doc = await collection.put(targetId, report, { parentId });
      // Write under the new parent first, then drop the old document, so a failure never loses the report.
      if (moving && id !== undefined) await collection.delete(id);
      return { id: doc.id, report, updatedAt: doc.updatedAt };
    },

    remove: (id: string) => collection.delete(id),
  };
}

export type ReportStore = ReturnType<typeof createReportStore>;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run ui/lib/report-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/lib/report-store.ts ui/lib/report-store.test.ts
git commit -m "Persist saved reports in the reports collection"
```

---

### Task 11: Table, filter and SQL helpers

**Files:**
- Create: `ui/lib/output-columns.ts`, `ui/lib/format.ts`, `ui/lib/filter-operators.ts`, `ui/lib/sql-highlight.ts`
- Test: `ui/lib/output-columns.test.ts`, `ui/lib/format.test.ts`, `ui/lib/filter-operators.test.ts`, `ui/lib/sql-highlight.test.ts`

**Interfaces:**
- Consumes: `Row`, `Totals`, `AggregateFunction` (Task 4); `ReportDraft`, `DraftColumn`, `DraftFilter`, `FilterOperator` (Task 6); `FieldKind` (Task 4).
- Produces:
  - `output-columns.ts`: `PAGE_SIZE = 100`, `OutputColumn { key; column?; fn?; automatic }`, `splitOutputKey(key)`, `outputColumns(rows, draft)`, `TotalCell`, `totalFor(totals, out)`, `pageOf(items, page, size?)`, `pageCount(total, size?)`.
  - `format.ts`: `formatCell(value)`, `formatCount(n)`, `formatRelativeTime(iso, now?)`.
  - `filter-operators.ts`: `OperatorOption { operator; label; input: 'none' | 'single' | 'list' | 'range' }`, `operatorsFor(kind)`, `operatorOption(operator)`, `coerceFilterValue(kind, input, raw)`, `describeFilter(filter)`.
  - `sql-highlight.ts`: `SqlToken { text; kind }`, `tokenizeSql(sql)`.

- [ ] **Step 1: Write the failing tests**

`ui/lib/output-columns.test.ts`:

```ts
import { DM } from '../fixtures/smart-data';
import { emptyDraft, type ReportDraft } from './report-draft';
import { outputColumns, pageCount, pageOf, splitOutputKey, totalFor } from './output-columns';

const draft: ReportDraft = {
  ...emptyDraft(DM.visitor),
  columns: [{ name: 'email', aliasPath: '' }, { name: 'visits', aliasPath: '', aggregations: ['AVG'] }, { name: 'sessions__duration_sec', aliasPath: 'sessions' }],
};

it('splits ODM output keys into column and function', () => {
  expect(splitOutputKey('visits | SUM')).toEqual({ base: 'visits', fn: 'SUM' });
  expect(splitOutputKey('email')).toEqual({ base: 'email' });
});

it('maps output keys to draft columns and marks automatic aggregations', () => {
  const rows = [{ email: 'a', 'visits | AVG': 2, 'sessions__duration_sec | SUM': 9 }];
  expect(outputColumns(rows, draft)).toEqual([
    { key: 'email', column: draft.columns[0], fn: undefined, automatic: false },
    { key: 'visits | AVG', column: draft.columns[1], fn: 'AVG', automatic: false },
    { key: 'sessions__duration_sec | SUM', column: draft.columns[2], fn: 'SUM', automatic: true },
  ]);
  expect(outputColumns([], draft).map((c) => c.key)).toEqual(['email', 'visits', 'sessions__duration_sec']);
});

it('picks the total for the column function, else SUM first', () => {
  const totals = { 'visits | SUM': 10, 'visits | AVG': 2.5, 'visits | MAX': 4 };
  const [, visits] = outputColumns([{ email: 'a', 'visits | AVG': 1 }], draft);
  expect(totalFor(totals, visits!)).toEqual({ fn: 'AVG', value: 2.5, others: [{ fn: 'SUM', value: 10 }, { fn: 'MAX', value: 4 }] });
  const plain = { key: 'visits', column: draft.columns[1], automatic: false };
  expect(totalFor(totals, plain)?.fn).toBe('SUM');
  expect(totalFor(null, plain)).toBeNull();
});

it('pages rows in hundreds', () => {
  const items = Array.from({ length: 250 }, (_, i) => i);
  expect(pageOf(items, 2)).toEqual(items.slice(200, 250));
  expect(pageCount(250)).toBe(3);
  expect(pageCount(0)).toBe(1);
});
```

`ui/lib/format.test.ts`:

```ts
import { formatCell, formatCount, formatRelativeTime } from './format';

it('renders any cell value without crashing', () => {
  expect(formatCell(null)).toBe('—');
  expect(formatCell(undefined)).toBe('—');
  expect(formatCell(true)).toBe('true');
  expect(formatCell(1234567)).toBe('1,234,567');
  expect(formatCell(0.1234567891)).toBe('0.123457');
  expect(formatCell({ a: [1, 2] })).toBe('{"a":[1,2]}');
  const long = 'x'.repeat(5000);
  expect(formatCell(long)).toBe(long);
});

it('formats counts and relative times', () => {
  expect(formatCount(2500)).toBe('2,500');
  const now = new Date('2026-10-02T12:00:00Z');
  expect(formatRelativeTime('2026-10-02T11:59:30Z', now)).toBe('just now');
  expect(formatRelativeTime('2026-10-02T11:00:00Z', now)).toBe('1 h ago');
  expect(formatRelativeTime('2026-09-30T12:00:00Z', now)).toBe('2 d ago');
  expect(formatRelativeTime('2026-08-01T12:00:00Z', now)).toBe('2026-08-01');
});
```

`ui/lib/filter-operators.test.ts`:

```ts
import { coerceFilterValue, describeFilter, operatorsFor } from './filter-operators';

it('offers operators by field kind', () => {
  expect(operatorsFor('text').map((o) => o.label)).toEqual([
    'is', 'is not', 'contains', "doesn't contain", 'starts with', 'ends with', 'is any of', 'is empty', 'is not empty',
  ]);
  expect(operatorsFor('number').map((o) => o.operator)).toContain('between');
  expect(operatorsFor('boolean').map((o) => o.operator)).toEqual(['is_true', 'is_false']);
  expect(operatorsFor('date')).toEqual([]);
});

it('coerces raw input into ODM filter values', () => {
  expect(coerceFilterValue('number', 'single', '42')).toBe(42);
  expect(coerceFilterValue('text', 'list', 'a, b\nc')).toEqual(['a', 'b', 'c']);
  expect(coerceFilterValue('number', 'list', '1,2')).toEqual([1, 2]);
  expect(coerceFilterValue('number', 'range', { from: '1', to: '5' })).toEqual({ from: 1, to: 5 });
});

it('summarises a filter for chips', () => {
  const base = { id: 'f', column: 'c', aliasPath: '', sliceOnly: false };
  expect(describeFilter({ ...base, operator: 'is_not_blank' })).toBe('is not empty');
  expect(describeFilter({ ...base, operator: 'eq', value: 'google' })).toBe('is google');
  expect(describeFilter({ ...base, operator: 'in', value: ['a', 'b', 'c', 'd'] })).toBe('is any of 4 values');
  expect(describeFilter({ ...base, operator: 'between', value: { from: 1, to: 5 } })).toBe('between 1 – 5');
});
```

`ui/lib/sql-highlight.test.ts`:

```ts
import { tokenizeSql } from './sql-highlight';

it('marks keywords, strings, numbers and comments and keeps the text intact', () => {
  const sql = "SELECT a, 'x y' -- note\nFROM t WHERE n > 10";
  const tokens = tokenizeSql(sql);
  expect(tokens.map((t) => t.text).join('')).toBe(sql);
  expect(tokens.filter((t) => t.kind === 'keyword').map((t) => t.text)).toEqual(['SELECT', 'FROM', 'WHERE']);
  expect(tokens.find((t) => t.kind === 'string')?.text).toBe("'x y'");
  expect(tokens.find((t) => t.kind === 'comment')?.text).toBe('-- note');
  expect(tokens.find((t) => t.kind === 'number')?.text).toBe('10');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run ui/lib/output-columns.test.ts ui/lib/format.test.ts ui/lib/filter-operators.test.ts ui/lib/sql-highlight.test.ts`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Implement**

`ui/lib/output-columns.ts`:

```ts
import type { AggregateFunction, Row, Totals } from './odm-types';
import type { DraftColumn, ReportDraft } from './report-draft';

export const PAGE_SIZE = 100;

export interface OutputColumn {
  /** The key in each row, e.g. `visits | SUM`. */
  key: string;
  column?: DraftColumn;
  fn?: string;
  /** ODM chose this aggregation; the user did not. */
  automatic: boolean;
}

export function splitOutputKey(key: string): { base: string; fn?: string } {
  const at = key.lastIndexOf(' | ');
  return at === -1 ? { base: key } : { base: key.slice(0, at), fn: key.slice(at + 3) };
}

export function outputColumns(rows: Row[], draft: ReportDraft): OutputColumn[] {
  const keys = rows[0] ? Object.keys(rows[0]) : draft.columns.map((c) => c.name);
  return keys.map((key) => {
    const { base, fn } = splitOutputKey(key);
    const column = draft.columns.find((c) => c.name === base);
    const chosen = (column?.aggregations ?? []) as string[];
    return { key, column, fn, automatic: fn !== undefined && !chosen.includes(fn as AggregateFunction) };
  });
}

export interface TotalCell {
  fn: string;
  value: Totals[string];
  others: { fn: string; value: Totals[string] }[];
}

const TOTAL_PRIORITY = ['SUM', 'COUNT', 'COUNT_DISTINCT', 'COUNTUNIQUE', 'AVG', 'MAX', 'MIN'];
const rank = (fn: string) => {
  const i = TOTAL_PRIORITY.indexOf(fn);
  return i === -1 ? TOTAL_PRIORITY.length : i;
};

export function totalFor(totals: Totals | null, out: OutputColumn): TotalCell | null {
  if (!totals) return null;
  const base = out.column?.name ?? splitOutputKey(out.key).base;
  const entries = Object.entries(totals).flatMap(([key, value]) => {
    const split = splitOutputKey(key);
    return split.base === base && split.fn ? [{ fn: split.fn, value }] : [];
  });
  if (entries.length === 0) return null;
  const primary = (out.fn && entries.find((e) => e.fn === out.fn)) || [...entries].sort((a, b) => rank(a.fn) - rank(b.fn))[0]!;
  return { fn: primary.fn, value: primary.value, others: entries.filter((e) => e !== primary) };
}

export function pageOf<T>(items: T[], page: number, size = PAGE_SIZE): T[] {
  return items.slice(page * size, page * size + size);
}

export function pageCount(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}
```

`ui/lib/format.ts`:

```ts
const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return NUMBER.format(value);
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

export function formatRelativeTime(iso: string, now = new Date()): string {
  const seconds = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 7 * 86_400) return `${Math.floor(seconds / 86_400)} d ago`;
  return iso.slice(0, 10);
}
```

`ui/lib/filter-operators.ts`:

```ts
import type { DraftFilter, FilterOperator } from './report-draft';
import type { FieldKind } from './schema-index';

export interface OperatorOption {
  operator: FilterOperator;
  label: string;
  input: 'none' | 'single' | 'list' | 'range';
}

const TEXT: OperatorOption[] = [
  { operator: 'eq', label: 'is', input: 'single' },
  { operator: 'neq', label: 'is not', input: 'single' },
  { operator: 'contains', label: 'contains', input: 'single' },
  { operator: 'not_contains', label: "doesn't contain", input: 'single' },
  { operator: 'starts_with', label: 'starts with', input: 'single' },
  { operator: 'ends_with', label: 'ends with', input: 'single' },
  { operator: 'in', label: 'is any of', input: 'list' },
  { operator: 'is_blank', label: 'is empty', input: 'none' },
  { operator: 'is_not_blank', label: 'is not empty', input: 'none' },
];

const NUMBER: OperatorOption[] = [
  { operator: 'eq', label: '=', input: 'single' },
  { operator: 'neq', label: '≠', input: 'single' },
  { operator: 'gt', label: '>', input: 'single' },
  { operator: 'gte', label: '≥', input: 'single' },
  { operator: 'lt', label: '<', input: 'single' },
  { operator: 'lte', label: '≤', input: 'single' },
  { operator: 'between', label: 'between', input: 'range' },
  { operator: 'is_blank', label: 'is empty', input: 'none' },
  { operator: 'is_not_blank', label: 'is not empty', input: 'none' },
];

const BOOLEAN: OperatorOption[] = [
  { operator: 'is_true', label: 'is true', input: 'none' },
  { operator: 'is_false', label: 'is false', input: 'none' },
];

const OTHER: OperatorOption[] = TEXT.filter((o) => o.input === 'none');

/** Dates are filtered through Date ranges only, so they get no operators here. */
export function operatorsFor(kind: FieldKind): OperatorOption[] {
  switch (kind) {
    case 'text': return TEXT;
    case 'number': return NUMBER;
    case 'boolean': return BOOLEAN;
    case 'other': return OTHER;
    case 'date': return [];
  }
}

export function operatorOption(operator: FilterOperator): OperatorOption | undefined {
  return [...TEXT, ...NUMBER, ...BOOLEAN].find((o) => o.operator === operator);
}

export function coerceFilterValue(
  kind: FieldKind,
  input: OperatorOption['input'],
  raw: string | { from: string; to: string },
): unknown {
  const cast = (s: string) => (kind === 'number' ? Number(s) : s);
  if (input === 'none') return undefined;
  if (input === 'range') {
    const range = raw as { from: string; to: string };
    return { from: cast(range.from.trim()), to: cast(range.to.trim()) };
  }
  if (input === 'list') {
    return String(raw).split(/[\n,]/).map((s) => s.trim()).filter(Boolean).map(cast);
  }
  return cast(String(raw).trim());
}

export function describeFilter(filter: DraftFilter): string {
  const option = operatorOption(filter.operator);
  const label = option?.label ?? filter.operator;
  if (!option || option.input === 'none') return label;
  if (option.input === 'list') {
    const values = (filter.value as unknown[] | undefined) ?? [];
    return values.length > 3 ? `${label} ${values.length} values` : `${label} ${values.join(', ')}`;
  }
  if (option.input === 'range') {
    const range = (filter.value as { from: unknown; to: unknown } | undefined) ?? { from: '', to: '' };
    return `${label} ${String(range.from)} – ${String(range.to)}`;
  }
  return `${label} ${String(filter.value ?? '')}`;
}
```

`ui/lib/sql-highlight.ts`:

```ts
export interface SqlToken { text: string; kind: 'keyword' | 'string' | 'comment' | 'number' | 'plain' }

const KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'AS', 'ON', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL',
  'CROSS', 'JOIN', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'WITH', 'DISTINCT', 'CASE', 'WHEN', 'THEN',
  'ELSE', 'END', 'IN', 'IS', 'NULL', 'BETWEEN', 'LIKE', 'UNION', 'ALL', 'ASC', 'DESC', 'CAST', 'OVER',
  'PARTITION', 'QUALIFY', 'EXCEPT', 'INTERVAL', 'TRUE', 'FALSE', 'USING',
]);

const TOKEN = /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_][A-Za-z0-9_]*\b)/g;

export function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let last = 0;
  for (const match of sql.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) tokens.push({ text: sql.slice(last, at), kind: 'plain' });
    const [text, comment, string, number, word] = match;
    const kind: SqlToken['kind'] = comment
      ? 'comment'
      : string
        ? 'string'
        : number
          ? 'number'
          : word && KEYWORDS.has(word.toUpperCase())
            ? 'keyword'
            : 'plain';
    tokens.push({ text, kind });
    last = at + text.length;
  }
  if (last < sql.length) tokens.push({ text: sql.slice(last), kind: 'plain' });
  return tokens;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run ui/lib/output-columns.test.ts ui/lib/format.test.ts ui/lib/filter-operators.test.ts ui/lib/sql-highlight.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/lib/output-columns.ts ui/lib/format.ts ui/lib/filter-operators.ts ui/lib/sql-highlight.ts ui/lib/*.test.ts
git commit -m "Add output column, formatting, filter operator and SQL token helpers"
```

---

### Task 12: Google Sheets report sync

**Files:**
- Create: `ui/lib/sheets-sync.ts`
- Test: `ui/lib/sheets-sync.test.ts`

**Interfaces:**
- Consumes: `OdmApi`, `WaitOptions` (Task 9); `toReadPlan`, `toReportConfig` (Task 7); `configHash`, `LinkedReport` (Task 10); `errorStatus` (Task 8); `ReportDraft` (Task 6).
- Produces: `SheetsApi`, `SyncOutcome { linked; runStatus; runError? }`, `createLinkedReport(api, { title, destinationId, draft, today? }, wait?)`, `updateLinkedReport(api, linked, { title, draft, today? }, wait?)` → `SyncOutcome | { missing: true }`, `spreadsheetUrl(linked)`, `odmReportsPath(projectId, dataMartId)`, `odmDestinationsPath(projectId)`.

- [ ] **Step 1: Write the failing tests**

`ui/lib/sheets-sync.test.ts`:

```ts
import { DM } from '../fixtures/smart-data';
import { emptyDraft, type ReportDraft } from './report-draft';
import { configHash } from './report-store';
import {
  createLinkedReport, odmReportsPath, spreadsheetUrl, updateLinkedReport, type SheetsApi,
} from './sheets-sync';

const draft: ReportDraft = { ...emptyDraft(DM.visitor), columns: [{ name: 'email', aliasPath: '' }] };

function fakeApi(overrides: Partial<SheetsApi> = {}) {
  const calls: unknown[][] = [];
  const api: SheetsApi = {
    createSpreadsheet: async (...args) => (calls.push(['createSpreadsheet', ...args]), { spreadsheetId: 'sheet-1', sheetId: 7 }),
    createReport: async (...args) => (calls.push(['createReport', ...args]), { id: 'report-1' }),
    updateReport: async (...args) => (calls.push(['updateReport', ...args]), { id: 'report-1', title: 'T' }),
    runReportAndWait: async (...args) => (calls.push(['run', args[0]]), { status: 'SUCCESS' as const }),
    ...overrides,
  };
  return { api, calls };
}

it('creates a spreadsheet, a report with the read plan, and runs it', async () => {
  const { api, calls } = fakeApi();
  const outcome = await createLinkedReport(api, { title: 'Visitors', destinationId: 'dest-1', draft });
  expect(outcome).toEqual({
    linked: { reportId: 'report-1', destinationId: 'dest-1', spreadsheetId: 'sheet-1', sheetId: 7, syncedDraftHash: configHash(draft) },
    runStatus: 'SUCCESS',
    runError: undefined,
  });
  expect(calls.map((c) => c[0])).toEqual(['createSpreadsheet', 'createReport', 'run']);
  expect(calls[1]?.[2]).toMatchObject({ title: 'Visitors', spreadsheetId: 'sheet-1', sheetId: 7, config: { columnConfig: ['email'] } });
});

it('updates the same report and spreadsheet', async () => {
  const { api, calls } = fakeApi();
  const linked = { reportId: 'report-1', destinationId: 'dest-1', spreadsheetId: 'sheet-1', sheetId: 7, syncedDraftHash: 'old' };
  const outcome = await updateLinkedReport(api, linked, { title: 'Visitors', draft });
  expect(outcome).toMatchObject({ linked: { ...linked, syncedDraftHash: configHash(draft) }, runStatus: 'SUCCESS' });
  expect(calls[0]?.[1]).toBe('report-1');
  expect(calls[0]?.[2]).toMatchObject({ spreadsheetId: 'sheet-1', sheetId: 7 });
});

it('reports a deleted ODM report as missing', async () => {
  const notFound = Object.assign(new Error('Not Found'), { name: 'PluginTransportError', payload: { code: 'HTTP_ERROR', status: 404, message: 'Not Found' } });
  const { api } = fakeApi({ updateReport: async () => { throw notFound; } });
  const linked = { reportId: 'gone', destinationId: 'd', spreadsheetId: 's', sheetId: 0, syncedDraftHash: 'h' };
  expect(await updateLinkedReport(api, linked, { title: 'T', draft })).toEqual({ missing: true });
});

it('builds links into Google Sheets and ODM', () => {
  expect(spreadsheetUrl({ spreadsheetId: 'abc', sheetId: 7 })).toBe('https://docs.google.com/spreadsheets/d/abc/edit#gid=7');
  expect(odmReportsPath('p1', DM.visitor)).toBe(`/ui/p1/data-marts/${DM.visitor}/reports`);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run ui/lib/sheets-sync.test.ts`
Expected: FAIL — `Failed to resolve import "./sheets-sync"`.

- [ ] **Step 3: Implement**

`ui/lib/sheets-sync.ts`:

```ts
import type { ReportRunStatus } from './odm-types';
import type { OdmApi, WaitOptions } from './odm-api';
import { toReadPlan, toReportConfig } from './read-plan';
import type { ReportDraft } from './report-draft';
import { configHash, type LinkedReport } from './report-store';
import { errorStatus } from './errors';

export type SheetsApi = Pick<OdmApi, 'createSpreadsheet' | 'createReport' | 'updateReport' | 'runReportAndWait'>;

export interface SyncOutcome { linked: LinkedReport; runStatus: ReportRunStatus; runError?: string }

export async function createLinkedReport(
  api: SheetsApi,
  input: { title: string; destinationId: string; draft: ReportDraft; today?: Date },
  wait: WaitOptions = {},
): Promise<SyncOutcome> {
  const sheet = await api.createSpreadsheet(input.destinationId, input.title);
  const config = toReportConfig(toReadPlan(input.draft, input.today));
  const { id } = await api.createReport(input.draft.mainDataMartId, {
    title: input.title,
    destinationId: input.destinationId,
    spreadsheetId: sheet.spreadsheetId,
    sheetId: sheet.sheetId,
    config,
  });
  const run = await api.runReportAndWait(id, wait);
  return {
    linked: {
      reportId: id,
      destinationId: input.destinationId,
      spreadsheetId: sheet.spreadsheetId,
      sheetId: sheet.sheetId,
      syncedDraftHash: configHash(input.draft),
    },
    runStatus: run.status,
    runError: run.error,
  };
}

/** Pushes the current configuration into the same ODM report and spreadsheet, then runs it. */
export async function updateLinkedReport(
  api: SheetsApi,
  linked: LinkedReport,
  input: { title: string; draft: ReportDraft; today?: Date },
  wait: WaitOptions = {},
): Promise<SyncOutcome | { missing: true }> {
  try {
    await api.updateReport(linked.reportId, {
      title: input.title,
      destinationId: linked.destinationId,
      spreadsheetId: linked.spreadsheetId,
      sheetId: linked.sheetId,
      config: toReportConfig(toReadPlan(input.draft, input.today)),
    });
  } catch (error) {
    if (errorStatus(error) === 404) return { missing: true };
    throw error;
  }
  const run = await api.runReportAndWait(linked.reportId, wait);
  return { linked: { ...linked, syncedDraftHash: configHash(input.draft) }, runStatus: run.status, runError: run.error };
}

export function spreadsheetUrl(linked: Pick<LinkedReport, 'spreadsheetId' | 'sheetId'>): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(linked.spreadsheetId)}/edit#gid=${linked.sheetId}`;
}

export function odmReportsPath(projectId: string, dataMartId: string): string {
  return `/ui/${encodeURIComponent(projectId)}/data-marts/${encodeURIComponent(dataMartId)}/reports`;
}

export function odmDestinationsPath(projectId: string): string {
  return `/ui/${encodeURIComponent(projectId)}/data-destinations`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run ui/lib/sheets-sync.test.ts && npm run lint && npm run typecheck`
Expected: PASS, no lint or type errors.

- [ ] **Step 5: Commit**

```bash
git add ui/lib/sheets-sync.ts ui/lib/sheets-sync.test.ts
git commit -m "Create and update linked Google Sheets reports"
```

---
### Task 13: SDK mock, services, app shell and the reports list

**Files:**
- Modify: `ui/sdk-mock.ts` (full replacement), `ui/App.tsx` (full replacement), `ui/bootstrap.test.tsx`
- Create: `ui/services.tsx`, `ui/test/render.tsx`, `ui/features/reports-list/ReportsListPage.tsx`, `ui/features/editor/EditorPage.tsx` (stub; Task 20 replaces it)
- Test: `ui/features/reports-list/ReportsListPage.test.tsx`, `ui/App.test.tsx`

**Interfaces:**
- Consumes: `createOdmApi`, `OdmApi`, `OwoxClient` (Task 9); `createReportStore`, `REPORTS_COLLECTION`, `StoredReport`, `SavedReport`, `ReportStore` (Task 10); `describeError` (Task 8); `formatRelativeTime` (Task 11); fixtures (Task 4).
- Produces:
  - `ui/services.tsx`: `Services { api; store; projectId; userId; theme; pollIntervalMs; openExternal(url); navigate(path) }`, `ServicesProvider`, `useServices()`, `servicesFromContext(ctx)`.
  - `ui/sdk-mock.ts`: `connect()`, `__setTheme(theme)`, `__resetForTests()`, `__mock` with `state`, `fail(prefix, payload)`, `clearFailures()`, `setRows(fn)`, `seedReport(id, report)`, `MockTransportError`.
  - `ui/test/render.tsx`: `mockServices(): Promise<Services>`, `renderWithServices(ui, services)`.
  - `ReportsListPage({ onOpen(id), onCreate() })`; `EditorPage({ reportId?, onBack() })`; `App({ context })`.

- [ ] **Step 1: Replace the SDK mock with a fixture-backed one**

`ui/sdk-mock.ts`:

```ts
import type { PluginContext } from '@owox/plugin-sdk';
import { DATA_MARTS, GRAPHS, SCHEMAS, sampleRows } from './fixtures/smart-data';
import type { ReportSummary, Row } from './lib/odm-types';
import type { CollectionDoc, StoredReport } from './lib/report-store';

// Stand-in for @owox/plugin-sdk in `vite dev` and Vitest. It serves the fixture model in
// ui/fixtures and keeps reports and collections in memory.

type Payload = { code: string; status?: number; message: string };

export class MockTransportError extends Error {
  constructor(readonly payload: Payload) {
    super(payload.message);
    this.name = 'PluginTransportError';
  }
}

export interface MockRequest { method: string; path: string; body?: unknown }

function freshState() {
  return {
    theme: 'light' as 'light' | 'dark',
    requests: [] as MockRequest[],
    navigations: [] as string[],
    opened: [] as string[],
    rows: (columns: string[]): Row[] => sampleRows(columns, 120),
    lastRows: [] as Row[],
    failures: new Map<string, Payload>(),
    collections: new Map<string, Map<string, CollectionDoc<unknown>>>(),
    reports: new Map<string, ReportSummary & { body: unknown }>(),
    destinations: [{ id: 'dest-sheets', title: 'Marketing Google Sheets' }],
    clock: 0,
    counter: 0,
  };
}

let state = freshState();
let context: PluginContext | undefined;

function tick(): string {
  state.clock += 1;
  return new Date(Date.UTC(2026, 9, 2, 12, 0, state.clock)).toISOString();
}

function maybeFail(key: string) {
  for (const [prefix, payload] of state.failures) {
    if (key.startsWith(prefix)) throw new MockTransportError(payload);
  }
}

const notFound = () => new MockTransportError({ code: 'HTTP_ERROR', status: 404, message: 'Not Found' });

function traversal(rows: Row[], runId: string) {
  let cancelled = false;
  return {
    runId,
    async *rowChunks() {
      for (let i = 0; i < rows.length; i += 500) {
        if (cancelled) return;
        await Promise.resolve();
        yield rows.slice(i, i + 500);
      }
    },
    async cancel() {
      cancelled = true;
    },
  };
}

function totalsOf(rows: Row[]) {
  const first = rows[0] ?? {};
  return Object.fromEntries(
    Object.keys(first)
      .filter((key) => typeof first[key] === 'number')
      .map((key) => {
        const base = key.includes(' | ') ? key.slice(0, key.lastIndexOf(' | ')) : key;
        return [`${base} | SUM`, rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0)];
      }),
  );
}

const owox = {
  dataMarts: {
    async list() {
      maybeFail('/api/data-marts');
      return DATA_MARTS;
    },
    async traverseData(
      id: string,
      options: { column?: string[]; aggregation?: { column: string; function: string }[] | null; limit?: number },
    ) {
      const path = `/api/external/http-data/data-marts/${id}.ndjson`;
      state.requests.push({ method: 'GET', path, body: options });
      maybeFail(path);
      tick();
      let rows = state.rows(options.column ?? []);
      for (const rule of options.aggregation ?? []) {
        rows = rows.map((row) => {
          const { [rule.column]: value, ...rest } = row;
          return { ...rest, [`${rule.column} | ${rule.function}`]: value };
        });
      }
      rows = rows.slice(0, options.limit ?? rows.length);
      state.lastRows = rows;
      return traversal(rows, `run-${state.clock}`);
    },
  },

  async getJson<T>(path: string): Promise<T> {
    state.requests.push({ method: 'GET', path });
    maybeFail(path);
    const id = (re: RegExp) => decodeURIComponent(path.match(re)?.[1] ?? '');
    if (/\/blendable-schema$/.test(path)) {
      const schema = SCHEMAS[id(/^\/api\/data-marts\/([^/]+)\//)];
      if (!schema) throw notFound();
      return schema as T;
    }
    if (/\/relationships\/graph$/.test(path)) {
      const graph = GRAPHS[id(/^\/api\/data-marts\/([^/]+)\//)];
      if (!graph) throw notFound();
      return graph as T;
    }
    if (/^\/api\/data-marts\/[^/]+\/runs\/[^/]+$/.test(path)) return { totals: totalsOf(state.lastRows) } as T;
    if (path === '/api/data-destinations/by-type/GOOGLE_SHEETS') return state.destinations as T;
    if (/\/generated-sql$/.test(path)) {
      const report = state.reports.get(id(/^\/api\/reports\/([^/]+)\//));
      if (!report) throw notFound();
      const columns = ((report.body as { columnConfig?: string[] }).columnConfig ?? []).join(',\n  ');
      return { sql: `SELECT\n  ${columns}\nFROM \`demo.data_mart\`\nWHERE TRUE`, canModifySource: false } as T;
    }
    if (/^\/api\/reports\/[^/]+$/.test(path)) {
      const report = state.reports.get(id(/^\/api\/reports\/([^/]+)$/));
      if (!report) throw notFound();
      const { body: _body, ...summary } = report;
      return summary as T;
    }
    throw notFound();
  },

  async postJson<T>(path: string, body: unknown): Promise<T> {
    state.requests.push({ method: 'POST', path, body });
    maybeFail(path);
    if (/\/google-sheets\/documents$/.test(path)) {
      state.counter += 1;
      return { spreadsheetId: `sheet-${state.counter}`, sheetId: 0 } as T;
    }
    if (path === '/api/reports') {
      state.counter += 1;
      const reportId = `report-${state.counter}`;
      state.reports.set(reportId, { id: reportId, title: (body as { title: string }).title, body });
      return { id: reportId } as T;
    }
    const run = path.match(/^\/api\/reports\/([^/]+)\/run$/);
    if (run) {
      const report = state.reports.get(decodeURIComponent(run[1]!));
      if (!report) throw notFound();
      report.lastRunStatus = 'SUCCESS';
      report.lastRunAt = tick();
      return undefined as T;
    }
    throw notFound();
  },

  async putJson<T>(path: string, body: unknown): Promise<T> {
    state.requests.push({ method: 'PUT', path, body });
    maybeFail(path);
    const match = path.match(/^\/api\/reports\/([^/]+)$/);
    const report = match ? state.reports.get(decodeURIComponent(match[1]!)) : undefined;
    if (!report) throw notFound();
    report.title = (body as { title: string }).title;
    report.body = body;
    const { body: _body, ...summary } = report;
    return summary as T;
  },
};

function collection(name: string) {
  const docs = state.collections.get(name) ?? new Map<string, CollectionDoc<unknown>>();
  state.collections.set(name, docs);
  return {
    async list({ limit = 50, cursor }: { limit?: number; cursor?: string } = {}) {
      maybeFail(`collection:${name}`);
      const all = [...docs.values()];
      const start = cursor ? Number(cursor) : 0;
      return { items: all.slice(start, start + limit), nextCursor: start + limit < all.length ? String(start + limit) : null };
    },
    async get(id: string) {
      maybeFail(`collection:${name}`);
      return docs.get(id) ?? null;
    },
    async put(id: string, document: unknown, options: { parentId?: string } = {}) {
      maybeFail(`collection:${name}`);
      const now = tick();
      const doc = { id, parentId: options.parentId, document, createdAt: docs.get(id)?.createdAt ?? now, updatedAt: now };
      docs.set(id, doc);
      return doc;
    },
    async delete(id: string) {
      maybeFail(`collection:${name}`);
      docs.delete(id);
    },
  };
}

export async function connect(): Promise<PluginContext> {
  context ??= {
    pluginId: 'smart-data-reports-dev',
    installationId: 'local',
    projectId: 'demo-project',
    userId: 'demo-user',
    theme: state.theme,
    owox,
    credentials: {},
    collections: (name: string) => collection(name),
    ui: {
      async openExternal(url: string) {
        state.opened.push(url);
      },
      navigate(path: string) {
        state.navigations.push(path);
      },
    },
    signal: new AbortController().signal,
  } as unknown as PluginContext;
  return context;
}

export function __setTheme(theme: 'light' | 'dark'): void {
  state.theme = theme;
}

export function __resetForTests(): void {
  state = freshState();
  context = undefined;
}

export const __mock = {
  get state() {
    return state;
  },
  MockTransportError,
  fail(prefix: string, payload: Payload) {
    state.failures.set(prefix, payload);
  },
  clearFailures() {
    state.failures.clear();
  },
  setRows(fn: (columns: string[]) => Row[]) {
    state.rows = fn;
  },
  seedReport(id: string, report: StoredReport) {
    const docs = state.collections.get('reports') ?? new Map<string, CollectionDoc<unknown>>();
    state.collections.set('reports', docs);
    const now = tick();
    docs.set(id, { id, parentId: report.draft.mainDataMartId, document: report, createdAt: now, updatedAt: now });
  },
};
```

- [ ] **Step 2: Add services and test helpers**

`ui/services.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from 'react';
import type { PluginContext } from '@owox/plugin-sdk';
import { createOdmApi, type OdmApi, type OwoxClient } from './lib/odm-api';
import { createReportStore, REPORTS_COLLECTION, type ReportStore, type StoredReport } from './lib/report-store';

export interface Services {
  api: OdmApi;
  store: ReportStore;
  projectId: string;
  userId: string;
  theme: 'light' | 'dark';
  /** How often report runs are polled; tests set 0. */
  pollIntervalMs: number;
  openExternal(url: string): void;
  navigate(path: string): void;
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used inside ServicesProvider');
  return services;
}

export function servicesFromContext(ctx: PluginContext): Services {
  return {
    // ctx.owox is the full OWOX API client; OwoxClient is the structural subset we call.
    api: createOdmApi(ctx.owox as unknown as OwoxClient),
    store: createReportStore(ctx.collections<StoredReport>(REPORTS_COLLECTION)),
    projectId: ctx.projectId,
    userId: ctx.userId,
    theme: ctx.theme,
    pollIntervalMs: 2000,
    openExternal: (url) => void ctx.ui.openExternal(url),
    navigate: (path) => ctx.ui.navigate(path),
  };
}
```

`ui/test/render.tsx`:

```tsx
import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { TooltipProvider } from '@owox/ui/components/tooltip';
import { connect } from '../sdk-mock';
import { ServicesProvider, servicesFromContext, type Services } from '../services';

export async function mockServices(): Promise<Services> {
  return { ...servicesFromContext(await connect()), pollIntervalMs: 0 };
}

export function renderWithServices(ui: ReactElement, services: Services) {
  return render(
    <ServicesProvider services={services}>
      <TooltipProvider>{ui}</TooltipProvider>
    </ServicesProvider>,
  );
}
```

- [ ] **Step 3: Write the failing reports-list and app tests**

`ui/features/reports-list/ReportsListPage.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM } from '../../fixtures/smart-data';
import { emptyDraft } from '../../lib/report-draft';
import { __mock, __resetForTests } from '../../sdk-mock';
import { mockServices, renderWithServices } from '../../test/render';
import { ReportsListPage } from './ReportsListPage';

beforeEach(() => __resetForTests());

it('invites to build the first report when there are none', async () => {
  const onCreate = vi.fn();
  renderWithServices(<ReportsListPage onOpen={vi.fn()} onCreate={onCreate} />, await mockServices());
  expect(await screen.findByText('Build your first report')).toBeInTheDocument();
  await userEvent.click(screen.getAllByRole('button', { name: /new report/i })[1]!);
  expect(onCreate).toHaveBeenCalled();
});

it('lists saved reports with their data mart and author', async () => {
  __mock.seedReport('r1', { schemaVersion: 1, title: 'Visitors by source', draft: emptyDraft(DM.visitor), createdBy: 'demo-user', updatedBy: 'demo-user' });
  __mock.seedReport('r2', { schemaVersion: 1, title: 'Sessions', draft: emptyDraft(DM.session), createdBy: 'someone', updatedBy: 'someone' });
  const onOpen = vi.fn();
  renderWithServices(<ReportsListPage onOpen={onOpen} onCreate={vi.fn()} />, await mockServices());
  expect(await screen.findByText('Visitors by source')).toBeInTheDocument();
  expect(screen.getByText('Visitor')).toBeInTheDocument();
  expect(screen.getByText('You')).toBeInTheDocument();
  expect(screen.getByText('Another member')).toBeInTheDocument();
  await userEvent.click(screen.getByText('Sessions'));
  expect(onOpen).toHaveBeenCalledWith('r2');
});

it('shows an error with a working retry', async () => {
  __mock.fail('collection:reports', { code: 'HTTP_ERROR', status: 500, message: 'boom' });
  renderWithServices(<ReportsListPage onOpen={vi.fn()} onCreate={vi.fn()} />, await mockServices());
  expect(await screen.findByText("Couldn't load your reports")).toBeInTheDocument();
  __mock.clearFailures();
  await userEvent.click(screen.getByRole('button', { name: /retry/i }));
  expect(await screen.findByText('Build your first report')).toBeInTheDocument();
});
```

`ui/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { __resetForTests, connect } from './sdk-mock';

beforeEach(() => __resetForTests());

it('opens the editor from the reports list and comes back', async () => {
  render(<App context={await connect()} />);
  await userEvent.click(await screen.findByTestId('newReport'));
  expect(await screen.findByTestId('editorPage')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /back to reports/i }));
  expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument();
});
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run ui/features/reports-list ui/App.test.tsx`
Expected: FAIL — `Failed to resolve import "./ReportsListPage"`.

- [ ] **Step 5: Implement the list page, the editor stub and the app shell**

`ui/features/reports-list/ReportsListPage.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { FileText, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { Skeleton } from '@owox/ui/components/skeleton';
import { useServices } from '../../services';
import { describeError, type UserFacingError } from '../../lib/errors';
import { formatRelativeTime } from '../../lib/format';
import type { SavedReport } from '../../lib/report-store';

type State =
  | { status: 'loading' }
  | { status: 'error'; error: UserFacingError }
  | { status: 'ready'; reports: SavedReport[]; martTitles: Map<string, string> };

export function ReportsListPage({ onOpen, onCreate }: { onOpen(id: string): void; onCreate(): void }) {
  const { store, api, userId } = useServices();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const [reports, marts] = await Promise.all([store.listAll(), api.listDataMarts()]);
      setState({ status: 'ready', reports, martTitles: new Map(marts.map((m) => [m.id, m.title])) });
    } catch (error) {
      setState({ status: 'error', error: describeError(error, 'saved reports') });
    }
  }, [store, api]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className='dm-page'>
      <header className='dm-page-header'>
        <div className='flex items-center justify-between gap-4'>
          <h1 className='dm-page-header-title'>Reports</h1>
          <Button onClick={onCreate} data-testid='newReport'>
            <Plus className='h-4 w-4' />
            New report
          </Button>
        </div>
      </header>
      <div className='dm-page-content'>
        {state.status === 'loading' && (
          <div className='dm-card flex flex-col gap-2' data-testid='reportsLoading'>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className='h-10 w-full' />
            ))}
          </div>
        )}

        {state.status === 'error' && (
          <Alert variant='destructive'>
            <AlertTitle>Couldn't load your reports</AlertTitle>
            <AlertDescription>
              <p>{state.error.message}</p>
              <Button variant='outline' size='sm' className='mt-2' onClick={() => void load()}>
                <RefreshCw className='h-4 w-4' />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {state.status === 'ready' && state.reports.length === 0 && (
          <div className='dm-empty-state'>
            <FileText className='dm-empty-state-ico' />
            <h2 className='dm-empty-state-title'>Build your first report</h2>
            <p className='dm-empty-state-subtitle'>Pick a data mart, tick the columns you need and see the result in seconds.</p>
            <Button onClick={onCreate}>
              <Plus className='h-4 w-4' />
              New report
            </Button>
          </div>
        )}

        {state.status === 'ready' && state.reports.length > 0 && (
          <div className='dm-card' data-testid='reportsTable'>
            <table className='w-full text-sm'>
              <thead className='text-left text-muted-foreground'>
                <tr>
                  <th className='px-3 py-2 font-medium'>Title</th>
                  <th className='px-3 py-2 font-medium'>Data mart</th>
                  <th className='px-3 py-2 font-medium'>Author</th>
                  <th className='px-3 py-2 font-medium'>Updated</th>
                </tr>
              </thead>
              <tbody>
                {state.reports.map((r) => (
                  <tr key={r.id} className='cursor-pointer border-t border-border hover:bg-accent' onClick={() => onOpen(r.id)}>
                    <td className='px-3 py-2 font-medium text-foreground'>{r.report.title}</td>
                    <td className='px-3 py-2 text-muted-foreground'>
                      {state.martTitles.get(r.report.draft.mainDataMartId) ?? 'Unavailable data mart'}
                    </td>
                    <td className='px-3 py-2 text-muted-foreground'>{r.report.createdBy === userId ? 'You' : 'Another member'}</td>
                    <td className='px-3 py-2 text-muted-foreground' title={r.updatedAt}>{formatRelativeTime(r.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

`ui/features/editor/EditorPage.tsx` (stub, replaced in Task 20):

```tsx
import { ArrowLeft } from 'lucide-react';
import { Button } from '@owox/ui/components/button';

export function EditorPage({ onBack }: { reportId?: string; onBack(): void }) {
  return (
    <div className='dm-page' data-testid='editorPage'>
      <header className='dm-page-header flex items-center gap-2'>
        <Button variant='ghost' size='icon' onClick={onBack} aria-label='Back to reports'>
          <ArrowLeft className='h-4 w-4' />
        </Button>
        <h1 className='dm-page-header-title'>New report</h1>
      </header>
    </div>
  );
}
```

`ui/App.tsx`:

```tsx
import { useMemo, useState } from 'react';
import type { PluginContext } from '@owox/plugin-sdk';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@owox/ui/components/tooltip';
import { ServicesProvider, servicesFromContext } from './services';
import { ReportsListPage } from './features/reports-list/ReportsListPage';
import { EditorPage } from './features/editor/EditorPage';

type Screen = { kind: 'list' } | { kind: 'editor'; reportId?: string };

export function App({ context }: { context: PluginContext }) {
  const services = useMemo(() => servicesFromContext(context), [context]);
  const [screen, setScreen] = useState<Screen>({ kind: 'list' });

  return (
    <ServicesProvider services={services}>
      <TooltipProvider>
        <Toaster position='bottom-right' theme={services.theme} />
        {screen.kind === 'list' ? (
          <ReportsListPage
            onOpen={(reportId) => setScreen({ kind: 'editor', reportId })}
            onCreate={() => setScreen({ kind: 'editor' })}
          />
        ) : (
          <EditorPage key={screen.reportId ?? 'new'} reportId={screen.reportId} onBack={() => setScreen({ kind: 'list' })} />
        )}
      </TooltipProvider>
    </ServicesProvider>
  );
}
```

In `ui/bootstrap.test.tsx`, the heading assertion stays valid: the list page renders the `Reports` heading.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add ui/sdk-mock.ts ui/services.tsx ui/test/render.tsx ui/App.tsx ui/App.test.tsx ui/features
git commit -m "Add fixture-backed SDK mock, services and the saved reports list"
```

---

### Task 14: Editor state hooks

**Files:**
- Create: `ui/features/editor/use-schema.ts`, `ui/features/editor/use-query-run.ts`, `ui/features/editor/use-report-document.ts`
- Test: `ui/features/editor/use-schema.test.tsx`, `ui/features/editor/use-query-run.test.tsx`, `ui/features/editor/use-report-document.test.tsx`

**Interfaces:**
- Consumes: `OdmApi`, `QueryResult` (Task 9); `buildSchemaIndex`, `SchemaIndex` (Task 4); `RelationshipGraph`, `DataMartSummary`, `Totals`, `ReportRunStatus` (Task 4); `toReadPlan`, `toTraverseOptions` (Task 7); `describeError`, `UserFacingError` (Task 8); `configHash`, `stableHash`, `StoredReport`, `SavedReport`, `LinkedReport` (Task 10); `createLinkedReport`, `updateLinkedReport`, `SyncOutcome` (Task 12); `useServices` (Task 13).
- Produces:
  - `use-schema.ts`: `LoadedSchema { index; graph }`, `SchemaState`, `loadSchema(api, mart)`, `useSchema(api, mart) → { state, load(mart), reload() }`.
  - `use-query-run.ts`: `RunState`, `useQueryRun(api, { totalsRetryMs? }) → { state, run(dataMartId, draft), cancel() }`.
  - `use-report-document.ts`: `SaveOutcome`, `ReportDocument`, `useReportDocument(reportId?) → ReportDocument` with `status`, `error`, `savedId`, `saved`, `title`, `setTitle`, `draft`, `setDraft`, `dirty`, `isAuthor`, `saveWithSync({ asCopy? })`, `createSheetsReport({ title, destinationId })`, `updateSheetsReport()`.

- [ ] **Step 1: Write the failing hook tests**

`ui/features/editor/use-schema.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { DATA_MARTS, DM } from '../../fixtures/smart-data';
import { __mock, __resetForTests } from '../../sdk-mock';
import { mockServices } from '../../test/render';
import { useSchema } from './use-schema';

beforeEach(() => __resetForTests());
const visitor = DATA_MARTS.find((m) => m.id === DM.visitor)!;

it('loads the blendable schema and graph of the main data mart', async () => {
  const { api } = await mockServices();
  const { result } = renderHook(() => useSchema(api, visitor));
  await waitFor(() => expect(result.current.state.status).toBe('ready'));
  const state = result.current.state;
  if (state.status !== 'ready') throw new Error('not ready');
  expect(state.index.groups[0]?.title).toBe('Visitor');
  expect(state.graph.nodes).toHaveLength(6);
});

it('reports a failure and recovers on reload', async () => {
  __mock.fail(`/api/data-marts/${DM.visitor}/blendable-schema`, { code: 'HTTP_ERROR', status: 403, message: 'Forbidden' });
  const { api } = await mockServices();
  const { result } = renderHook(() => useSchema(api, visitor));
  await waitFor(() => expect(result.current.state.status).toBe('error'));
  expect(result.current.state).toMatchObject({ error: { message: "You don't have access to Visitor." } });
  __mock.clearFailures();
  result.current.reload();
  await waitFor(() => expect(result.current.state.status).toBe('ready'));
});

it('stays idle without a main data mart', async () => {
  const { api } = await mockServices();
  const { result } = renderHook(() => useSchema(api, undefined));
  expect(result.current.state.status).toBe('idle');
});
```

`ui/features/editor/use-query-run.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { DM } from '../../fixtures/smart-data';
import type { OdmApi, QueryResult } from '../../lib/odm-api';
import { emptyDraft, type ReportDraft } from '../../lib/report-draft';
import { useQueryRun } from './use-query-run';

const draft = (column: string): ReportDraft => ({ ...emptyDraft(DM.visitor), columns: [{ name: column, aliasPath: '' }] });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

it('never lets an older run overwrite a newer one', async () => {
  const first = deferred<QueryResult>();
  const second = deferred<QueryResult>();
  const queue = [first, second];
  const api = {
    runQuery: vi.fn(() => queue.shift()!.promise),
    getRunTotals: vi.fn(async () => ({ 'visits | SUM': 1 })),
  } as unknown as OdmApi;
  const { result } = renderHook(() => useQueryRun(api, { totalsRetryMs: 0 }));

  act(() => void result.current.run(DM.visitor, draft('email')));
  act(() => void result.current.run(DM.visitor, draft('client_id')));
  await act(async () => second.resolve({ rows: [{ client_id: 'b' }], truncated: false, runId: 'r2' }));
  await act(async () => first.resolve({ rows: [{ email: 'a' }], truncated: false, runId: 'r1' }));

  await waitFor(() => expect(result.current.state.status).toBe('success'));
  const state = result.current.state;
  if (state.status !== 'success') throw new Error('not success');
  expect(state.result.rows).toEqual([{ client_id: 'b' }]);
  await waitFor(() => expect(result.current.state).toMatchObject({ totals: { 'visits | SUM': 1 } }));
  expect(api.getRunTotals).toHaveBeenCalledWith(DM.visitor, 'r2');
});

it('retries totals once when the first read is empty', async () => {
  const totals = [null, { 'visits | SUM': 5 }];
  const api = {
    runQuery: vi.fn(async () => ({ rows: [], truncated: false, runId: 'r1' })),
    getRunTotals: vi.fn(async () => totals.shift() ?? null),
  } as unknown as OdmApi;
  const { result } = renderHook(() => useQueryRun(api, { totalsRetryMs: 0 }));
  await act(async () => result.current.run(DM.visitor, draft('email')));
  await waitFor(() => expect(result.current.state).toMatchObject({ totals: { 'visits | SUM': 5 } }));
});

it('cancels a running query', async () => {
  const api = { runQuery: vi.fn(() => new Promise(() => {})), getRunTotals: vi.fn() } as unknown as OdmApi;
  const { result } = renderHook(() => useQueryRun(api));
  act(() => void result.current.run(DM.visitor, draft('email')));
  expect(result.current.state.status).toBe('running');
  act(() => result.current.cancel());
  expect(result.current.state).toEqual({ status: 'idle', cancelled: true });
});
```

`ui/features/editor/use-report-document.test.tsx`:

```tsx
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { DM } from '../../fixtures/smart-data';
import { emptyDraft } from '../../lib/report-draft';
import { __mock, __resetForTests } from '../../sdk-mock';
import { ServicesProvider, type Services } from '../../services';
import { mockServices } from '../../test/render';
import { useReportDocument } from './use-report-document';

beforeEach(() => __resetForTests());

const wrapperFor = (services: Services) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <ServicesProvider services={services}>{children}</ServicesProvider>;
  };

const visitorDraft = () => ({ ...emptyDraft(DM.visitor), columns: [{ name: 'email', aliasPath: '' }] });

it('saves a new report and tracks unsaved changes', async () => {
  const services = await mockServices();
  const { result } = renderHook(() => useReportDocument(undefined), { wrapper: wrapperFor(services) });
  act(() => {
    result.current.setDraft(visitorDraft());
    result.current.setTitle('Visitors');
  });
  expect(result.current.dirty).toBe(true);
  await act(async () => void (await result.current.saveWithSync()));
  expect(result.current.dirty).toBe(false);
  expect(result.current.savedId).toBeDefined();
  expect([...__mock.state.collections.get('reports')!.values()][0]?.parentId).toBe(DM.visitor);
});

it("saves someone else's report as a copy without touching the original", async () => {
  __mock.seedReport('theirs', { schemaVersion: 1, title: 'Theirs', draft: visitorDraft(), createdBy: 'someone', updatedBy: 'someone' });
  const services = await mockServices();
  const { result } = renderHook(() => useReportDocument('theirs'), { wrapper: wrapperFor(services) });
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.isAuthor).toBe(false);
  await act(async () => void (await result.current.saveWithSync({ asCopy: true })));
  expect(result.current.savedId).not.toBe('theirs');
  expect(result.current.saved?.createdBy).toBe('demo-user');
  expect(result.current.title).toBe('Theirs (copy)');
  expect(__mock.state.collections.get('reports')!.get('theirs')?.document).toMatchObject({ title: 'Theirs' });
});

it('creates a linked Google Sheets report and then keeps it in sync on save', async () => {
  const services = await mockServices();
  const { result } = renderHook(() => useReportDocument(undefined), { wrapper: wrapperFor(services) });
  act(() => result.current.setDraft(visitorDraft()));
  await act(async () => void (await result.current.createSheetsReport({ title: 'Visitors', destinationId: 'dest-sheets' })));
  const linked = result.current.saved?.linkedReport;
  expect(linked).toMatchObject({ reportId: 'report-2', spreadsheetId: 'sheet-1' });

  act(() => result.current.setDraft({ ...visitorDraft(), columns: [{ name: 'client_id', aliasPath: '' }] }));
  let outcome: unknown;
  await act(async () => {
    outcome = await result.current.saveWithSync();
  });
  expect(outcome).toEqual({ kind: 'synced', runStatus: 'SUCCESS', runError: undefined });
  expect(__mock.state.requests.some((r) => r.method === 'PUT' && r.path === '/api/reports/report-2')).toBe(true);
  expect(result.current.saved?.linkedReport?.spreadsheetId).toBe('sheet-1');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run ui/features/editor`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Implement `use-schema.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { OdmApi } from '../../lib/odm-api';
import type { DataMartSummary, RelationshipGraph } from '../../lib/odm-types';
import { buildSchemaIndex, type SchemaIndex } from '../../lib/schema-index';
import { describeError, type UserFacingError } from '../../lib/errors';

export interface LoadedSchema { index: SchemaIndex; graph: RelationshipGraph }

export type SchemaState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: UserFacingError }
  | ({ status: 'ready' } & LoadedSchema);

export async function loadSchema(api: OdmApi, mart: DataMartSummary): Promise<LoadedSchema> {
  const [schema, graph] = await Promise.all([api.getBlendableSchema(mart.id), api.getRelationshipGraph(mart.id)]);
  return { index: buildSchemaIndex({ id: mart.id, title: mart.title }, schema), graph };
}

export function useSchema(api: OdmApi, mart: DataMartSummary | undefined) {
  const cache = useRef(new Map<string, Promise<LoadedSchema>>());
  const [state, setState] = useState<SchemaState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(
    (target: DataMartSummary) => {
      let pending = cache.current.get(target.id);
      if (!pending) {
        pending = loadSchema(api, target);
        cache.current.set(target.id, pending);
        pending.catch(() => cache.current.delete(target.id));
      }
      return pending;
    },
    [api],
  );

  useEffect(() => {
    if (!mart) {
      setState({ status: 'idle' });
      return;
    }
    let alive = true;
    setState({ status: 'loading' });
    load(mart).then(
      (loaded) => alive && setState({ status: 'ready', ...loaded }),
      (error) => alive && setState({ status: 'error', error: describeError(error, mart.title) }),
    );
    return () => {
      alive = false;
    };
  }, [mart, load, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, load, reload };
}
```

- [ ] **Step 4: Implement `use-query-run.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { OdmApi, QueryResult } from '../../lib/odm-api';
import type { Totals } from '../../lib/odm-types';
import { toReadPlan, toTraverseOptions } from '../../lib/read-plan';
import type { ReportDraft } from '../../lib/report-draft';
import { configHash } from '../../lib/report-store';
import { describeError, type UserFacingError } from '../../lib/errors';

export type RunState =
  | { status: 'idle'; cancelled?: boolean }
  | { status: 'running'; appliedHash: string }
  | { status: 'success'; result: QueryResult; totals: Totals | null; appliedHash: string; appliedDraft: ReportDraft }
  | { status: 'error'; error: UserFacingError; appliedHash: string };

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function useQueryRun(api: OdmApi, { totalsRetryMs = 3000 }: { totalsRetryMs?: number } = {}) {
  const [state, setState] = useState<RunState>({ status: 'idle' });
  const current = useRef<AbortController | null>(null);

  const run = useCallback(
    async (dataMartId: string, draft: ReportDraft) => {
      current.current?.abort();
      const controller = new AbortController();
      current.current = controller;
      const appliedHash = configHash(draft);
      const isCurrent = () => current.current === controller && !controller.signal.aborted;
      setState({ status: 'running', appliedHash });
      try {
        const result = await api.runQuery(dataMartId, toTraverseOptions(toReadPlan(draft)), controller.signal);
        if (!isCurrent()) return;
        setState({ status: 'success', result, totals: null, appliedHash, appliedDraft: draft });
        if (!result.runId) return;
        // ODM writes totals into the run from a separate query, so the first read can be empty.
        let totals = await api.getRunTotals(dataMartId, result.runId).catch(() => null);
        if (totals === null && isCurrent()) {
          await wait(totalsRetryMs);
          totals = await api.getRunTotals(dataMartId, result.runId).catch(() => null);
        }
        if (isCurrent() && totals) {
          setState((s) => (s.status === 'success' && s.appliedHash === appliedHash ? { ...s, totals } : s));
        }
      } catch (error) {
        if (!isCurrent()) return;
        setState({ status: 'error', error: describeError(error), appliedHash });
      }
    },
    [api, totalsRetryMs],
  );

  const cancel = useCallback(() => {
    current.current?.abort();
    current.current = null;
    setState({ status: 'idle', cancelled: true });
  }, []);

  useEffect(() => () => current.current?.abort(), []);

  return { state, run, cancel };
}
```

- [ ] **Step 5: Implement `use-report-document.ts`**

```ts
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useServices } from '../../services';
import { describeError, type UserFacingError } from '../../lib/errors';
import type { ReportRunStatus } from '../../lib/odm-types';
import type { ReportDraft } from '../../lib/report-draft';
import { configHash, stableHash, type LinkedReport, type SavedReport, type StoredReport } from '../../lib/report-store';
import { createLinkedReport, updateLinkedReport, type SyncOutcome } from '../../lib/sheets-sync';

export type SaveOutcome =
  | { kind: 'saved' }
  | { kind: 'synced'; runStatus: ReportRunStatus; runError?: string }
  | { kind: 'link-missing' };

export interface ReportDocument {
  status: 'loading' | 'ready' | 'error';
  error?: UserFacingError;
  savedId?: string;
  saved?: StoredReport;
  title: string;
  setTitle(title: string): void;
  draft: ReportDraft | null;
  setDraft: Dispatch<SetStateAction<ReportDraft | null>>;
  dirty: boolean;
  isAuthor: boolean;
  saveWithSync(options?: { asCopy?: boolean }): Promise<SaveOutcome>;
  createSheetsReport(input: { title: string; destinationId: string }): Promise<SyncOutcome>;
  updateSheetsReport(): Promise<SaveOutcome>;
}

interface SaveOptions { asCopy?: boolean; title?: string; linkedReport?: LinkedReport | null }

export function useReportDocument(reportId: string | undefined): ReportDocument {
  const { store, api, userId, pollIntervalMs } = useServices();
  const [status, setStatus] = useState<ReportDocument['status']>(reportId ? 'loading' : 'ready');
  const [error, setError] = useState<UserFacingError>();
  const [saved, setSaved] = useState<{ id?: string; report?: StoredReport }>({});
  const [title, setTitle] = useState('Untitled report');
  const [draft, setDraft] = useState<ReportDraft | null>(null);

  // Saves can run back-to-back (save → create Sheets report → save); refs give each step the latest state.
  const savedRef = useRef(saved);
  const draftRef = useRef(draft);
  const titleRef = useRef(title);
  useLayoutEffect(() => {
    savedRef.current = saved;
    draftRef.current = draft;
    titleRef.current = title;
  });

  useEffect(() => {
    if (!reportId) return;
    let alive = true;
    store.get(reportId).then(
      (found) => {
        if (!alive) return;
        if (!found) {
          setError({ message: 'This report no longer exists.', retryable: false });
          setStatus('error');
          return;
        }
        setSaved({ id: found.id, report: found.report });
        setTitle(found.report.title);
        setDraft(found.report.draft);
        setStatus('ready');
      },
      (e) => {
        if (!alive) return;
        setError(describeError(e, 'this report'));
        setStatus('error');
      },
    );
    return () => {
      alive = false;
    };
  }, [reportId, store]);

  const save = useCallback(
    async ({ asCopy = false, title: titleOverride, linkedReport }: SaveOptions = {}): Promise<SavedReport> => {
      const current = draftRef.current;
      if (!current) throw new Error('Choose a data mart first.');
      const previous = asCopy ? {} : savedRef.current;
      const nextTitle = titleOverride ?? titleRef.current;
      const report: StoredReport = {
        schemaVersion: 1,
        title: nextTitle,
        draft: current,
        createdBy: previous.report?.createdBy ?? userId,
        updatedBy: userId,
        linkedReport: linkedReport === null ? undefined : (linkedReport ?? previous.report?.linkedReport),
      };
      const result = await store.save({ id: previous.id, report, previousParentId: previous.report?.draft.mainDataMartId });
      savedRef.current = { id: result.id, report: result.report };
      titleRef.current = nextTitle;
      setSaved(savedRef.current);
      setTitle(nextTitle);
      return result;
    },
    [store, userId],
  );

  const syncLinked = useCallback(
    async (linked: LinkedReport): Promise<SaveOutcome> => {
      const result = await updateLinkedReport(
        api,
        linked,
        { title: titleRef.current, draft: draftRef.current! },
        { intervalMs: pollIntervalMs },
      );
      if ('missing' in result) {
        await save({ linkedReport: null });
        return { kind: 'link-missing' };
      }
      await save({ linkedReport: result.linked });
      return { kind: 'synced', runStatus: result.runStatus, runError: result.runError };
    },
    [api, save, pollIntervalMs],
  );

  const saveWithSync = useCallback(
    async ({ asCopy = false }: { asCopy?: boolean } = {}): Promise<SaveOutcome> => {
      const linked = asCopy ? undefined : savedRef.current.report?.linkedReport;
      if (linked && draftRef.current && linked.syncedDraftHash !== configHash(draftRef.current)) return syncLinked(linked);
      await save(asCopy ? { asCopy, title: `${titleRef.current} (copy)`, linkedReport: null } : {});
      return { kind: 'saved' };
    },
    [save, syncLinked],
  );

  const updateSheetsReport = useCallback(async (): Promise<SaveOutcome> => {
    const linked = savedRef.current.report?.linkedReport;
    if (!linked) throw new Error('This report has no Google Sheets report yet.');
    return syncLinked(linked);
  }, [syncLinked]);

  const createSheetsReport = useCallback(
    async ({ title: reportTitle, destinationId }: { title: string; destinationId: string }): Promise<SyncOutcome> => {
      await save({ title: reportTitle });
      const outcome = await createLinkedReport(
        api,
        { title: reportTitle, destinationId, draft: draftRef.current! },
        { intervalMs: pollIntervalMs },
      );
      await save({ title: reportTitle, linkedReport: outcome.linked });
      return outcome;
    },
    [api, save, pollIntervalMs],
  );

  const dirty =
    draft !== null &&
    (!saved.report || saved.report.title !== title || stableHash(saved.report.draft) !== stableHash(draft));

  return {
    status,
    error,
    savedId: saved.id,
    saved: saved.report,
    title,
    setTitle,
    draft,
    setDraft,
    dirty,
    isAuthor: !saved.report || saved.report.createdBy === userId,
    saveWithSync,
    createSheetsReport,
    updateSheetsReport,
  };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run ui/features/editor && npm run lint && npm run typecheck`
Expected: PASS. In the linked-report test the mock numbers objects in creation order — spreadsheet `sheet-1`, report `report-2` — which is why the test expects those ids.

- [ ] **Step 7: Commit**

```bash
git add ui/features/editor
git commit -m "Add editor hooks for schema, query runs and the report document"
```

---
### Task 15: Column panel — the *All* tab and the path dialogs

**Files:**
- Create: `ui/components/NativeSelect.tsx`, `ui/features/column-panel/TypeBadge.tsx`, `ui/features/column-panel/PathDialog.tsx`, `ui/features/column-panel/DateChoiceDialog.tsx`, `ui/features/column-panel/AllFieldsTab.tsx`
- Modify: `ui/test/render.tsx` (add `renderUi`)
- Test: `ui/features/column-panel/AllFieldsTab.test.tsx`, `ui/features/column-panel/DateChoiceDialog.test.tsx`

**Interfaces:**
- Consumes: `SchemaIndex`, `InstanceInfo`, `FieldKind`, `AliasPath`, `chain`, `chainLabel` (Task 4); `ReportDraft`, `DateChoice`, `usedInstances` (Task 6); `DataMartSummary` (Task 4).
- Produces:
  - `NativeSelect` — a styled native `<select>` (the design system's native Select), same props as `<select>`.
  - `TypeBadge({ kind })`.
  - `PathDialog({ title, description?, index, mainTitle, instances, initial?, confirmLabel?, onChoose(path), onCancel() })` — mounted only while open.
  - `DateChoiceDialog({ choice, index, onChoose(column | null) })` — mounted only while a choice is pending.
  - `AllFieldsTab({ index, draft, marts, onToggleField(name, checked), onIncludePath(path), onChangeInstancePath(from, to), onAddFilter(name) })`.
  - `renderUi(ui)` in `ui/test/render.tsx`.

- [ ] **Step 1: Add the shared native select and the test helper**

`ui/components/NativeSelect.tsx`:

```tsx
import type { SelectHTMLAttributes } from 'react';
import { cn } from '@owox/ui/lib/utils';

/** The design system's native Select: a plain <select> on the Input tokens. */
export function NativeSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30',
        className,
      )}
      {...props}
    />
  );
}
```

Append to `ui/test/render.tsx`:

```tsx
export function renderUi(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}
```

- [ ] **Step 2: Write the failing tests**

`ui/features/column-panel/AllFieldsTab.test.tsx`:

```tsx
import { useState } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DATA_MARTS, DM, VISITOR_SCHEMA } from '../../fixtures/smart-data';
import { buildSchemaIndex } from '../../lib/schema-index';
import { addColumn, changeInstancePath, emptyDraft, includePath, removeColumn } from '../../lib/report-draft';
import { renderUi } from '../../test/render';
import { AllFieldsTab } from './AllFieldsTab';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);

function Harness({ onAddFilter = vi.fn() }: { onAddFilter?: (name: string) => void }) {
  const [draft, setDraft] = useState(emptyDraft(DM.visitor));
  return (
    <>
      <AllFieldsTab
        index={index}
        draft={draft}
        marts={DATA_MARTS}
        onToggleField={(name, checked) => setDraft((d) => (checked ? addColumn(d, index, name).draft : removeColumn(d, name)))}
        onIncludePath={(path) => setDraft((d) => includePath(d, path))}
        onChangeInstancePath={(from, to) => setDraft((d) => changeInstancePath(d, index, from, to).draft)}
        onAddFilter={onAddFilter}
      />
      <output data-testid='columns'>{draft.columns.map((c) => c.name).join(',')}</output>
    </>
  );
}

const columns = () => screen.getByTestId('columns').textContent;

it('adds a main-mart column directly', async () => {
  renderUi(<Harness />);
  await userEvent.click(screen.getByRole('checkbox', { name: 'Email (Visitor)' }));
  expect(columns()).toBe('email');
});

it('asks for the join path when a data mart is reachable in more than one way', async () => {
  renderUi(<Harness />);
  await userEvent.click(screen.getByRole('button', { name: 'Page' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Title (Page)' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Visitor → Landing page')).toBeInTheDocument();
  expect(within(dialog).getByText('Visitor → Session → Pageview → Page')).toBeInTheDocument();
  expect(within(dialog).getByText('Landing page: The first page the visitor landed on.')).toBeInTheDocument();
  expect(within(dialog).getByText('Multiplies rows')).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole('radio', { name: 'Visitor → Landing page' }));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Use this path' }));
  expect(columns()).toBe('landing_page__title');
  expect(screen.getByRole('button', { name: 'via Landing page' })).toBeInTheDocument();
});

it('lets the same data mart join through a second path at once', async () => {
  renderUi(<Harness />);
  await userEvent.click(screen.getByRole('button', { name: 'Page' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Title (Page)' }));
  await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Use this path' }));
  await userEvent.click(screen.getByRole('button', { name: '+ via another path' }));
  await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Use this path' }));
  const titles = screen.getAllByRole('checkbox', { name: /^Title \(/ });
  expect(titles).toHaveLength(2);
  await userEvent.click(titles[1]!);
  expect(columns()).toBe('landing_page__title,sessions_pageviews_page__title');
});

it('searches across all reachable data marts', async () => {
  renderUi(<Harness />);
  await userEvent.type(screen.getByRole('searchbox', { name: 'Search fields' }), 'source');
  expect(screen.getByRole('checkbox', { name: 'Source (Session)' })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Creation Source (User)' })).toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: 'Email (Visitor)' })).not.toBeInTheDocument();
});

it('names data marts that cannot be reached and offers filters', async () => {
  const onAddFilter = vi.fn();
  renderUi(<Harness onAddFilter={onAddFilter} />);
  expect(screen.getByText("1 data mart can't be reached from Visitor")).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Filter by Email' }));
  expect(onAddFilter).toHaveBeenCalledWith('email');
});
```

`ui/features/column-panel/DateChoiceDialog.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM, VISITOR_SCHEMA } from '../../fixtures/smart-data';
import { buildSchemaIndex, dateFields } from '../../lib/schema-index';
import { renderUi } from '../../test/render';
import { DateChoiceDialog } from './DateChoiceDialog';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);
const choice = { aliasPath: 'contact.user', candidates: dateFields(index.instances.get('contact.user')!) };

it('preselects the first date and lets the user decline', async () => {
  const onChoose = vi.fn();
  renderUi(<DateChoiceDialog choice={choice} index={index} onChoose={onChoose} />);
  expect(screen.getByRole('radio', { name: 'Creation Date' })).toBeChecked();
  await userEvent.click(screen.getByRole('button', { name: 'Add date' }));
  expect(onChoose).toHaveBeenLastCalledWith('contact_user__creation_date');
  await userEvent.click(screen.getByRole('radio', { name: "Don't add a date" }));
  await userEvent.click(screen.getByRole('button', { name: 'Continue without a date' }));
  expect(onChoose).toHaveBeenLastCalledWith(null);
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run ui/features/column-panel`
Expected: FAIL — unresolved imports.

- [ ] **Step 4: Implement the badge and the dialogs**

`ui/features/column-panel/TypeBadge.tsx`:

```tsx
import { cn } from '@owox/ui/lib/utils';
import type { FieldKind } from '../../lib/schema-index';

const LABEL: Record<FieldKind, string> = { text: 'ABC', number: '123', date: 'DD', boolean: 'BOOL', other: '{ }' };

export function TypeBadge({ kind, className }: { kind: FieldKind; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('w-9 shrink-0 font-mono text-[10px] font-medium', kind === 'number' ? 'text-primary' : 'text-success', className)}
    >
      {LABEL[kind]}
    </span>
  );
}
```

`ui/features/column-panel/PathDialog.tsx`:

```tsx
import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@owox/ui/components/dialog';
import { cn } from '@owox/ui/lib/utils';
import { chain, type AliasPath, type InstanceInfo, type SchemaIndex } from '../../lib/schema-index';

interface PathDialogProps {
  title: string;
  description?: string;
  index: SchemaIndex;
  mainTitle: string;
  instances: InstanceInfo[];
  initial?: AliasPath;
  confirmLabel?: string;
  onChoose(path: AliasPath): void;
  onCancel(): void;
}

/** Mount it only while a choice is pending; it starts from `initial` every time. */
export function PathDialog({ title, description, index, mainTitle, instances, initial, confirmLabel = 'Use this path', onChoose, onCancel }: PathDialogProps) {
  const [selected, setSelected] = useState<AliasPath | undefined>(initial ?? instances[0]?.aliasPath);

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className='sm:max-w-[520px]'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <fieldset className='flex flex-col gap-2'>
          <legend className='sr-only'>Join path</legend>
          {instances.map((instance) => {
            const hops = chain(index, instance.aliasPath);
            const pathLabel = [mainTitle, ...hops.map((h) => h.label)].join(' → ');
            return (
              <label
                key={instance.aliasPath}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-md border border-border p-3',
                  selected === instance.aliasPath && 'border-primary bg-accent',
                )}
              >
                <input
                  type='radio'
                  name='join-path'
                  className='mt-1 accent-primary'
                  checked={selected === instance.aliasPath}
                  onChange={() => setSelected(instance.aliasPath)}
                  aria-label={pathLabel}
                />
                <span className='flex flex-col gap-1'>
                  <span className='text-sm font-medium'>{pathLabel}</span>
                  {hops
                    .filter((h) => h.joinDescription)
                    .map((h) => (
                      <span key={h.aliasPath} className='text-xs text-muted-foreground'>
                        {h.label}: {h.joinDescription}
                      </span>
                    ))}
                  {instance.grain === 'multiplies' && (
                    <Badge variant='outline' className='w-fit border-warning text-warning'>
                      <TriangleAlert className='h-3 w-3' />
                      Multiplies rows
                    </Badge>
                  )}
                </span>
              </label>
            );
          })}
        </fieldset>
        <DialogFooter>
          <Button variant='outline' onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={selected === undefined} onClick={() => selected !== undefined && onChoose(selected)}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

`ui/features/column-panel/DateChoiceDialog.tsx`:

```tsx
import { useState } from 'react';
import { Button } from '@owox/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@owox/ui/components/dialog';
import type { DateChoice } from '../../lib/report-draft';
import type { SchemaIndex } from '../../lib/schema-index';

const NONE = '';

/** Closing the dialog keeps the preselected date: by default a report always gets a period. */
export function DateChoiceDialog({ choice, index, onChoose }: { choice: DateChoice; index: SchemaIndex; onChoose(column: string | null): void }) {
  const [selected, setSelected] = useState(choice.candidates[0]?.name ?? NONE);
  const instance = index.instances.get(choice.aliasPath);
  const confirm = () => onChoose(selected === NONE ? null : selected);

  return (
    <Dialog open onOpenChange={(open) => !open && confirm()}>
      <DialogContent className='sm:max-w-[480px]'>
        <DialogHeader>
          <DialogTitle>Which date should limit {instance?.label ?? 'this data mart'}?</DialogTitle>
          <DialogDescription>
            This data mart has several dates. Pick the one the period applies to — it starts at the last 30 days, and you can change or remove it later.
          </DialogDescription>
        </DialogHeader>
        <fieldset className='flex flex-col gap-2 text-sm'>
          <legend className='sr-only'>Date</legend>
          {choice.candidates.map((field) => (
            <label key={field.name} className='flex cursor-pointer items-center gap-2'>
              <input type='radio' name='auto-date' className='accent-primary' checked={selected === field.name} onChange={() => setSelected(field.name)} aria-label={field.label} />
              {field.label}
            </label>
          ))}
          <label className='flex cursor-pointer items-center gap-2 text-muted-foreground'>
            <input type='radio' name='auto-date' className='accent-primary' checked={selected === NONE} onChange={() => setSelected(NONE)} aria-label="Don't add a date" />
            Don't add a date
          </label>
        </fieldset>
        <DialogFooter>
          <Button onClick={confirm}>{selected === NONE ? 'Continue without a date' : 'Add date'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Implement the *All* tab**

`ui/features/column-panel/AllFieldsTab.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, CircleHelp, Filter, Search } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Input } from '@owox/ui/components/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import type { DataMartSummary } from '../../lib/odm-types';
import { usedInstances, type ReportDraft } from '../../lib/report-draft';
import { chain, chainLabel, type AliasPath, type FieldInfo, type InstanceInfo, type MartGroup, type SchemaIndex } from '../../lib/schema-index';
import { PathDialog } from './PathDialog';
import { TypeBadge } from './TypeBadge';

type PathRequest =
  | { kind: 'add-field'; group: MartGroup; originalName: string }
  | { kind: 'add-instance'; group: MartGroup; instances: InstanceInfo[] }
  | { kind: 'change'; group: MartGroup; from: AliasPath; instances: InstanceInfo[] };

export interface AllFieldsTabProps {
  index: SchemaIndex;
  draft: ReportDraft;
  marts: DataMartSummary[];
  onToggleField(name: string, checked: boolean): void;
  onIncludePath(path: AliasPath): void;
  onChangeInstancePath(from: AliasPath, to: AliasPath): void;
  onAddFilter(name: string): void;
}

export function AllFieldsTab({ index, draft, marts, onToggleField, onIncludePath, onChangeInstancePath, onAddFilter }: AllFieldsTabProps) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([index.mainDataMartId]));
  const [request, setRequest] = useState<PathRequest | null>(null);

  const used = useMemo(() => new Set(usedInstances(draft)), [draft]);
  const selected = useMemo(() => new Set(draft.columns.map((c) => c.name)), [draft]);
  const main = index.instances.get('')!;
  const needle = query.trim().toLowerCase();
  const matches = (f: FieldInfo) => !needle || f.label.toLowerCase().includes(needle) || f.name.toLowerCase().includes(needle);
  const unreachable = marts.filter((m) => !index.groups.some((g) => g.dataMartId === m.id));

  const toggleGroup = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function handleToggle(group: MartGroup, instance: InstanceInfo, field: FieldInfo, checked: boolean) {
    if (!checked || used.has(instance.aliasPath) || group.instances.length === 1) {
      onToggleField(field.name, checked);
      return;
    }
    setRequest({ kind: 'add-field', group, originalName: field.originalName });
  }

  function choosePath(path: AliasPath) {
    if (!request) return;
    if (request.kind === 'add-field') {
      const field = index.instances.get(path)?.fields.find((f) => f.originalName === request.originalName);
      if (field) onToggleField(field.name, true);
    } else if (request.kind === 'add-instance') {
      onIncludePath(path);
    } else {
      onChangeInstancePath(request.from, path);
    }
    setRequest(null);
  }

  const dialogInstances = request
    ? request.kind === 'add-field'
      ? request.group.instances
      : request.instances
    : [];

  return (
    <div className='flex flex-col'>
      <div className='relative px-3 py-2'>
        <Search className='pointer-events-none absolute top-1/2 left-5 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
        <Input type='search' aria-label='Search fields' placeholder='Search' className='h-8 pl-8' value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {index.groups.map((group) => {
        const usedInGroup = group.instances.filter((i) => used.has(i.aliasPath));
        const shown = usedInGroup.length ? usedInGroup : group.instances.slice(0, 1);
        const unused = group.instances.filter((i) => !used.has(i.aliasPath));
        const anyMatch = shown.some((i) => i.fields.some(matches));
        if (needle && !anyMatch) return null;
        const isOpen = !!needle || expanded.has(group.dataMartId) || usedInGroup.length > 0;
        return (
          <section key={group.dataMartId} className='border-b border-border last:border-b-0'>
            <div className='flex items-center gap-1 px-2'>
              <Button variant='ghost' className='h-9 flex-1 justify-start gap-2 px-1 text-sm font-normal' onClick={() => toggleGroup(group.dataMartId)} aria-expanded={isOpen}>
                {isOpen ? <ChevronDown className='h-4 w-4' /> : <ChevronRight className='h-4 w-4' />}
                {group.title}
              </Button>
              {group.description && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type='button' aria-label={`About ${group.title}`} className='text-muted-foreground'>
                      <CircleHelp className='h-4 w-4' />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className='max-w-xs'>{group.description}</TooltipContent>
                </Tooltip>
              )}
              {usedInGroup.length > 0 && unused.length > 0 && (
                <Button variant='link' size='sm' className='h-7 px-1 text-xs' onClick={() => setRequest({ kind: 'add-instance', group, instances: unused })}>
                  + via another path
                </Button>
              )}
            </div>

            {isOpen &&
              shown.map((instance) => (
                <div key={instance.aliasPath} className='pb-2'>
                  {instance.aliasPath !== '' && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type='button'
                          className='ml-9 rounded-sm px-1 text-xs text-muted-foreground hover:text-foreground'
                          onClick={() =>
                            group.instances.length > 1 &&
                            setRequest({ kind: 'change', group, from: instance.aliasPath, instances: group.instances.filter((i) => i.aliasPath === instance.aliasPath || !used.has(i.aliasPath)) })
                          }
                        >
                          via {chainLabel(index, instance.aliasPath)}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className='max-w-xs'>
                        {chain(index, instance.aliasPath).map((hop) => (
                          <p key={hop.aliasPath}>
                            {hop.label}: {hop.joinDescription || 'No description.'}
                          </p>
                        ))}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {instance.fields.filter(matches).map((field) => {
                    const id = `field-${field.name}`;
                    return (
                      <div key={field.name} className='group flex items-center gap-2 rounded-md px-3 py-1 hover:bg-accent'>
                        <TypeBadge kind={field.kind} />
                        <Checkbox
                          id={id}
                          checked={selected.has(field.name)}
                          onCheckedChange={(checked) => handleToggle(group, instance, field, checked === true)}
                          aria-label={`${field.label} (${usedInGroup.length ? instance.label : group.title})`}
                        />
                        <label htmlFor={id} className='flex-1 truncate text-sm'>
                          {field.label}
                        </label>
                        {field.description && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type='button' aria-label={`About ${field.label}`} className='text-muted-foreground'>
                                <CircleHelp className='h-4 w-4' />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className='max-w-xs'>{field.description}</TooltipContent>
                          </Tooltip>
                        )}
                        {field.kind !== 'date' && (
                          <Button
                            variant='ghost'
                            size='icon'
                            className='size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                            aria-label={`Filter by ${field.label}`}
                            onClick={() => onAddFilter(field.name)}
                          >
                            <Filter className='h-4 w-4' />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
          </section>
        );
      })}

      {unreachable.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <p tabIndex={0} className='px-3 py-3 text-xs text-muted-foreground'>
              {unreachable.length} data mart{unreachable.length === 1 ? '' : 's'} can't be reached from {main.title}
            </p>
          </TooltipTrigger>
          <TooltipContent className='max-w-xs'>
            Relationships run one way. No relationship path leads from {main.title} to: {unreachable.map((m) => m.title).join(', ')}.
          </TooltipContent>
        </Tooltip>
      )}

      {request && (
        <PathDialog
          title={request.kind === 'change' ? `Change how ${request.group.title} is joined` : `How should ${request.group.title} be joined?`}
          description={`${request.group.title} can be reached from ${main.title} in more than one way. Each path can give different rows.`}
          index={index}
          mainTitle={main.title}
          instances={dialogInstances}
          initial={request.kind === 'change' ? request.from : undefined}
          onChoose={choosePath}
          onCancel={() => setRequest(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run ui/features/column-panel && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add ui/components ui/features/column-panel ui/test/render.tsx
git commit -m "Add the All fields tab with join path and auto date dialogs"
```

---

### Task 16: Column panel — the *Selected* tab and the panel container

**Files:**
- Modify: `ui/lib/filter-operators.ts` (append `newFilterId`)
- Create: `ui/features/column-panel/DateRangeEditor.tsx`, `ui/features/column-panel/FilterEditor.tsx`, `ui/features/column-panel/SelectedTab.tsx`, `ui/features/column-panel/ColumnPanel.tsx`
- Test: `ui/features/column-panel/SelectedTab.test.tsx`, `ui/features/column-panel/ColumnPanel.test.tsx`

**Interfaces:**
- Consumes: Task 15 components; `DateRangeValue`, `DATE_RANGE_PRESETS`, `describeDateRange` (Task 5); `ReportDraft`, `DraftFilter`, `AUTO_DATE_RANGE`, `usedInstances` (Task 6); `operatorsFor`, `coerceFilterValue`, `describeFilter` (Task 11); `dateFields` (Task 4).
- Produces:
  - `newFilterId(): string` (`filter-operators.ts`).
  - `DateRangeEditor({ value, onChange, label })`.
  - `FilterEditor({ field, instanceLabel, mainTitle, isJoined, filter?, onSave(filter), onCancel() })`.
  - `SelectedTab({ index, draft, pendingFilterField, onPendingFilterDone(), onSetDateRange(column, range), onRemoveDateRange(column), onUpsertFilter(filter), onRemoveFilter(id), onMoveColumn(from, to), onRemoveColumn(name) })`.
  - `ColumnPanel(props: ColumnPanelProps)` with everything from `AllFieldsTabProps` and `SelectedTab` callbacks plus `onChangeMain(id)`, `onApply()`, `applyDisabled`, `applying`, `issues: string[]`, `filterRequest: { field: string; nonce: number } | null`.

- [ ] **Step 1: Write the failing tests**

`ui/features/column-panel/SelectedTab.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM, VISITOR_SCHEMA } from '../../fixtures/smart-data';
import { buildSchemaIndex } from '../../lib/schema-index';
import { addColumn, emptyDraft, upsertFilter, type ReportDraft } from '../../lib/report-draft';
import { renderUi } from '../../test/render';
import { SelectedTab } from './SelectedTab';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);
const add = (d: ReportDraft, ...names: string[]) => names.reduce((x, n) => addColumn(x, index, n).draft, d);

function setup(draft: ReportDraft, pendingFilterField: string | null = null) {
  const handlers = {
    onPendingFilterDone: vi.fn(),
    onSetDateRange: vi.fn(),
    onRemoveDateRange: vi.fn(),
    onUpsertFilter: vi.fn(),
    onRemoveFilter: vi.fn(),
    onMoveColumn: vi.fn(),
    onRemoveColumn: vi.fn(),
  };
  renderUi(<SelectedTab index={index} draft={draft} pendingFilterField={pendingFilterField} {...handlers} />);
  return handlers;
}

it('shows date ranges with their data mart and changes the period', async () => {
  const h = setup(add(emptyDraft(DM.visitor), 'email', 'sessions__source'));
  const dates = screen.getByRole('region', { name: 'Date ranges' });
  expect(within(dates).getByText('Creation Date')).toBeInTheDocument();
  expect(within(dates).getByText('Session')).toBeInTheDocument();
  await userEvent.selectOptions(within(dates).getAllByRole('combobox', { name: /period/i })[0]!, 'last_7_days');
  expect(h.onSetDateRange).toHaveBeenCalledWith('creation_date', { kind: 'preset', preset: 'last_7_days' });
  await userEvent.click(within(dates).getByRole('button', { name: 'Remove date range Creation Date' }));
  expect(h.onRemoveDateRange).toHaveBeenCalledWith('creation_date');
});

it('switches a period to a custom range', async () => {
  const h = setup(add(emptyDraft(DM.visitor), 'email'));
  await userEvent.selectOptions(screen.getByRole('combobox', { name: /period/i }), 'custom');
  expect(h.onSetDateRange).toHaveBeenLastCalledWith('creation_date', expect.objectContaining({ kind: 'custom' }));
});

it('creates a slice filter for a joined data mart from a pending field', async () => {
  const h = setup(add(emptyDraft(DM.visitor), 'sessions__source'), 'sessions__source');
  const editor = screen.getByRole('form', { name: 'Filter Source' });
  await userEvent.selectOptions(within(editor).getByRole('combobox', { name: 'Operator' }), 'in');
  await userEvent.type(within(editor).getByRole('textbox', { name: 'Values' }), 'google, bing');
  await userEvent.click(within(editor).getByRole('switch', { name: 'Only narrow Session' }));
  await userEvent.click(within(editor).getByRole('button', { name: 'Save filter' }));
  expect(h.onUpsertFilter).toHaveBeenCalledWith(
    expect.objectContaining({ column: 'sessions__source', aliasPath: 'sessions', operator: 'in', value: ['google', 'bing'], sliceOnly: true }),
  );
  expect(h.onPendingFilterDone).toHaveBeenCalled();
});

it('edits and removes existing filters', async () => {
  const draft = upsertFilter(add(emptyDraft(DM.visitor), 'email'), { id: 'f1', column: 'email', aliasPath: '', operator: 'is_not_blank', sliceOnly: false });
  const h = setup(draft);
  expect(screen.getByText('is not empty')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Remove filter Email' }));
  expect(h.onRemoveFilter).toHaveBeenCalledWith('f1');
});

it('reorders and removes columns, and flags unavailable ones', async () => {
  const draft = { ...add(emptyDraft(DM.visitor), 'email', 'client_id'), columns: [{ name: 'email', aliasPath: '' }, { name: 'client_id', aliasPath: '' }, { name: 'gone', aliasPath: '' }] };
  const h = setup(draft);
  await userEvent.click(screen.getByRole('button', { name: 'Move Email down' }));
  expect(h.onMoveColumn).toHaveBeenCalledWith(0, 1);
  expect(screen.getByText('Unavailable')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Remove column gone' }));
  expect(h.onRemoveColumn).toHaveBeenCalledWith('gone');
});
```

`ui/features/column-panel/ColumnPanel.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DATA_MARTS, DM, VISITOR_SCHEMA } from '../../fixtures/smart-data';
import { buildSchemaIndex } from '../../lib/schema-index';
import { emptyDraft } from '../../lib/report-draft';
import { renderUi } from '../../test/render';
import { ColumnPanel } from './ColumnPanel';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);

function setup(overrides: Partial<Parameters<typeof ColumnPanel>[0]> = {}) {
  const props = {
    index, draft: emptyDraft(DM.visitor), marts: DATA_MARTS, filterRequest: null,
    onToggleField: vi.fn(), onIncludePath: vi.fn(), onChangeInstancePath: vi.fn(), onAddFilter: vi.fn(),
    onSetDateRange: vi.fn(), onRemoveDateRange: vi.fn(), onUpsertFilter: vi.fn(), onRemoveFilter: vi.fn(),
    onMoveColumn: vi.fn(), onRemoveColumn: vi.fn(), onPendingFilterDone: vi.fn(),
    onChangeMain: vi.fn(), onApply: vi.fn(), applyDisabled: false, applying: false, issues: [],
    ...overrides,
  };
  renderUi(<ColumnPanel {...props} />);
  return props;
}

it('shows the grain and changes the main data mart', async () => {
  const props = setup();
  expect(screen.getByText('1 row = 1 Visitor')).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Report on' }), DM.session);
  expect(props.onChangeMain).toHaveBeenCalledWith(DM.session);
});

it('shows issues and blocks Apply', async () => {
  const props = setup({ applyDisabled: true, issues: ['Pick at least one column.'] });
  expect(screen.getByText('Pick at least one column.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(props.onApply).not.toHaveBeenCalled();
});

it('opens the Selected tab with a filter editor when a filter is requested', () => {
  setup({ filterRequest: { field: 'email', nonce: 1 } });
  expect(screen.getByRole('tab', { name: /selected/i })).toHaveAttribute('data-state', 'active');
  expect(screen.getByRole('form', { name: 'Filter Email' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run ui/features/column-panel/SelectedTab.test.tsx ui/features/column-panel/ColumnPanel.test.tsx`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Install drag-and-drop and add the filter id helper**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Append to `ui/lib/filter-operators.ts`:

```ts
export function newFilterId(): string {
  return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
```

- [ ] **Step 4: Implement the editors**

`ui/features/column-panel/DateRangeEditor.tsx`:

```tsx
import { Input } from '@owox/ui/components/input';
import { NativeSelect } from '../../components/NativeSelect';
import { DATE_RANGE_PRESETS, type DateRangePreset, type DateRangeValue } from '../../lib/date-ranges';

const today = () => new Date().toISOString().slice(0, 10);

export function DateRangeEditor({ value, onChange, label }: { value: DateRangeValue; onChange(value: DateRangeValue): void; label: string }) {
  const selected = value.kind === 'preset' ? value.preset : value.kind;
  return (
    <div className='flex flex-col gap-1'>
      <NativeSelect
        aria-label={`Period for ${label}`}
        value={selected}
        onChange={(e) => {
          const next = e.target.value;
          if (next === 'all-time') onChange({ kind: 'all-time' });
          else if (next === 'custom') onChange({ kind: 'custom', from: today(), to: today() });
          else onChange({ kind: 'preset', preset: next as DateRangePreset });
        }}
      >
        {DATE_RANGE_PRESETS.map((p) => (
          <option key={p.preset} value={p.preset}>
            {p.label}
          </option>
        ))}
        <option value='custom'>Custom</option>
        <option value='all-time'>All time</option>
      </NativeSelect>
      {value.kind === 'custom' && (
        <div className='flex items-center gap-1'>
          <Input type='date' aria-label={`Start of ${label}`} className='h-8' value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          <span className='text-muted-foreground'>–</span>
          <Input type='date' aria-label={`End of ${label}`} className='h-8' value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </div>
      )}
    </div>
  );
}
```

`ui/features/column-panel/FilterEditor.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { Switch } from '@owox/ui/components/switch';
import { NativeSelect } from '../../components/NativeSelect';
import { coerceFilterValue, newFilterId, operatorsFor } from '../../lib/filter-operators';
import type { DraftFilter, FilterOperator } from '../../lib/report-draft';
import type { FieldInfo } from '../../lib/schema-index';

interface FilterEditorProps {
  field: FieldInfo;
  instanceLabel: string;
  mainTitle: string;
  isJoined: boolean;
  filter?: DraftFilter;
  onSave(filter: DraftFilter): void;
  onCancel(): void;
}

export function FilterEditor({ field, instanceLabel, mainTitle, isJoined, filter, onSave, onCancel }: FilterEditorProps) {
  const options = operatorsFor(field.kind);
  const [operator, setOperator] = useState<FilterOperator | undefined>(filter?.operator ?? options[0]?.operator);
  const option = options.find((o) => o.operator === operator);
  const initialRange = (filter?.value as { from?: unknown; to?: unknown } | undefined) ?? {};
  const [single, setSingle] = useState(filter && !Array.isArray(filter.value) && typeof filter.value !== 'object' ? String(filter.value ?? '') : '');
  const [list, setList] = useState(Array.isArray(filter?.value) ? (filter.value as unknown[]).join('\n') : '');
  const [range, setRange] = useState({ from: String(initialRange.from ?? ''), to: String(initialRange.to ?? '') });
  const [sliceOnly, setSliceOnly] = useState(filter?.sliceOnly ?? false);

  if (!option) return <p className='px-3 text-xs text-muted-foreground'>This field can't be filtered here.</p>;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!option) return;
    const raw = option.input === 'range' ? range : option.input === 'list' ? list : single;
    onSave({
      id: filter?.id ?? newFilterId(),
      column: field.name,
      aliasPath: field.aliasPath,
      operator: option.operator,
      value: coerceFilterValue(field.kind, option.input, raw),
      sliceOnly: isJoined && sliceOnly,
    });
  }

  return (
    <form aria-label={`Filter ${field.label}`} onSubmit={submit} className='flex flex-col gap-2 rounded-md border border-border bg-card p-3'>
      <NativeSelect aria-label='Operator' value={operator} onChange={(e) => setOperator(e.target.value as FilterOperator)}>
        {options.map((o) => (
          <option key={o.operator} value={o.operator}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
      {option.input === 'single' && (
        <Input aria-label='Value' className='h-8' value={single} inputMode={field.kind === 'number' ? 'decimal' : undefined} onChange={(e) => setSingle(e.target.value)} />
      )}
      {option.input === 'list' && (
        <textarea
          aria-label='Values'
          rows={3}
          placeholder='One value per line or comma-separated'
          className='rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30'
          value={list}
          onChange={(e) => setList(e.target.value)}
        />
      )}
      {option.input === 'range' && (
        <div className='flex items-center gap-1'>
          <Input aria-label='From' className='h-8' value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          <span className='text-muted-foreground'>–</span>
          <Input aria-label='To' className='h-8' value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </div>
      )}
      {isJoined && (
        <label className='flex items-start gap-2 text-sm'>
          <Switch checked={sliceOnly} onCheckedChange={setSliceOnly} aria-label={`Only narrow ${instanceLabel}`} />
          <span>
            Only narrow {instanceLabel}
            <span className='block text-xs text-muted-foreground'>Keeps every {mainTitle} row and filters {instanceLabel} before the join.</span>
          </span>
        </label>
      )}
      <div className='flex justify-end gap-2'>
        <Button type='button' variant='outline' size='sm' onClick={onCancel}>
          Cancel
        </Button>
        <Button type='submit' size='sm'>
          Save filter
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Implement the *Selected* tab**

`ui/features/column-panel/SelectedTab.tsx`:

```tsx
import { useState, type ReactNode } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, GripVertical, Plus, X } from 'lucide-react';
import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { AUTO_DATE_RANGE, usedInstances, type DraftFilter, type ReportDraft } from '../../lib/report-draft';
import type { DateRangeValue } from '../../lib/date-ranges';
import { describeFilter } from '../../lib/filter-operators';
import { dateFields, type SchemaIndex } from '../../lib/schema-index';
import { DateRangeEditor } from './DateRangeEditor';
import { FilterEditor } from './FilterEditor';
import { TypeBadge } from './TypeBadge';

export interface SelectedTabProps {
  index: SchemaIndex;
  draft: ReportDraft;
  pendingFilterField: string | null;
  onPendingFilterDone(): void;
  onSetDateRange(column: string, range: DateRangeValue): void;
  onRemoveDateRange(column: string): void;
  onUpsertFilter(filter: DraftFilter): void;
  onRemoveFilter(id: string): void;
  onMoveColumn(from: number, to: number): void;
  onRemoveColumn(name: string): void;
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className='flex flex-col gap-1 border-b border-border py-2 last:border-b-0'>
      <div className='flex items-center justify-between px-3'>
        <h3 className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function SortableRow({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    // dnd-kit positions the dragged row through a transform; that is the one inline style here.
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className='flex items-center gap-2 px-3 py-1'>
      <button type='button' aria-label='Drag to reorder' className='cursor-grab text-muted-foreground' {...attributes} {...listeners}>
        <GripVertical className='h-4 w-4' />
      </button>
      {children}
    </li>
  );
}

export function SelectedTab(props: SelectedTabProps) {
  const { index, draft, pendingFilterField, onPendingFilterDone } = props;
  const [editingFilter, setEditingFilter] = useState<string | null>(null);
  const [newFilterField, setNewFilterField] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const main = index.instances.get('')!;
  const used = usedInstances(draft).map((p) => index.instances.get(p)).filter((i) => i !== undefined);
  const martLabel = (aliasPath: string) => index.instances.get(aliasPath)?.label ?? 'Unavailable';
  const fieldLabel = (name: string) => index.fields.get(name)?.label ?? name;
  const ranged = new Set(draft.dateRanges.map((r) => r.column));
  const addableDates = used.flatMap((i) => dateFields(i).filter((f) => !ranged.has(f.name)));
  const filterable = used.flatMap((i) => i.fields.filter((f) => f.kind !== 'date'));
  const creatingField = pendingFilterField ?? newFilterField;
  const creating = creatingField ? index.fields.get(creatingField) : undefined;
  const names = draft.columns.map((c) => c.name);

  const closeNewFilter = () => {
    setNewFilterField(null);
    if (pendingFilterField) onPendingFilterDone();
  };

  function onDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    props.onMoveColumn(names.indexOf(String(event.active.id)), names.indexOf(String(event.over.id)));
  }

  return (
    <div className='flex flex-col'>
      <Section
        title='Date ranges'
        action={
          addableDates.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant='ghost' size='sm' className='h-7 text-xs'>
                  <Plus className='h-4 w-4' />
                  Date
                </Button>
              </PopoverTrigger>
              <PopoverContent className='w-64 p-1'>
                {addableDates.map((f) => (
                  <button key={f.name} type='button' className='flex w-full justify-between rounded-sm px-2 py-1 text-left text-sm hover:bg-accent' onClick={() => props.onSetDateRange(f.name, AUTO_DATE_RANGE)}>
                    {f.label}
                    <span className='text-xs text-muted-foreground'>{martLabel(f.aliasPath)}</span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )
        }
      >
        {draft.dateRanges.length === 0 && <p className='px-3 text-xs text-muted-foreground'>No periods. The report reads all time.</p>}
        {draft.dateRanges.map((range) => (
          <div key={range.column} className='flex items-start gap-2 px-3 py-1'>
            <TypeBadge kind='date' className='mt-2' />
            <div className='flex flex-1 flex-col gap-1'>
              <div className='flex items-center justify-between text-sm'>
                <span>{fieldLabel(range.column)}</span>
                <span className='text-xs text-muted-foreground'>{martLabel(range.aliasPath)}</span>
              </div>
              <DateRangeEditor value={range.range} label={fieldLabel(range.column)} onChange={(value) => props.onSetDateRange(range.column, value)} />
            </div>
            <Button variant='ghost' size='icon' className='size-7' aria-label={`Remove date range ${fieldLabel(range.column)}`} onClick={() => props.onRemoveDateRange(range.column)}>
              <X className='h-4 w-4' />
            </Button>
          </div>
        ))}
      </Section>

      <Section
        title='Filters'
        action={
          filterable.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant='ghost' size='sm' className='h-7 text-xs'>
                  <Plus className='h-4 w-4' />
                  Filter
                </Button>
              </PopoverTrigger>
              <PopoverContent className='max-h-72 w-64 overflow-y-auto p-1'>
                {filterable.map((f) => (
                  <button key={f.name} type='button' className='flex w-full justify-between rounded-sm px-2 py-1 text-left text-sm hover:bg-accent' onClick={() => setNewFilterField(f.name)}>
                    {f.label}
                    <span className='text-xs text-muted-foreground'>{martLabel(f.aliasPath)}</span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )
        }
      >
        {creating && (
          <div className='px-3'>
            <FilterEditor
              key={creating.name}
              field={creating}
              instanceLabel={martLabel(creating.aliasPath)}
              mainTitle={main.title}
              isJoined={creating.aliasPath !== ''}
              onSave={(filter) => {
                props.onUpsertFilter(filter);
                closeNewFilter();
              }}
              onCancel={closeNewFilter}
            />
          </div>
        )}
        {draft.filters.length === 0 && !creating && <p className='px-3 text-xs text-muted-foreground'>No filters.</p>}
        {draft.filters.map((filter) => {
          const field = index.fields.get(filter.column);
          return (
            <div key={filter.id} className='px-3 py-1'>
              {editingFilter === filter.id && field ? (
                <FilterEditor
                  field={field}
                  filter={filter}
                  instanceLabel={martLabel(filter.aliasPath)}
                  mainTitle={main.title}
                  isJoined={filter.aliasPath !== ''}
                  onSave={(next) => {
                    props.onUpsertFilter(next);
                    setEditingFilter(null);
                  }}
                  onCancel={() => setEditingFilter(null)}
                />
              ) : (
                <div className='flex items-center gap-2'>
                  <button type='button' className='flex flex-1 flex-col text-left' onClick={() => setEditingFilter(filter.id)}>
                    <span className='flex justify-between text-sm'>
                      {fieldLabel(filter.column)}
                      <span className='text-xs text-muted-foreground'>{martLabel(filter.aliasPath)}</span>
                    </span>
                    <span className='text-xs text-muted-foreground'>
                      {describeFilter(filter)}
                      {filter.sliceOnly && ` · only narrows ${martLabel(filter.aliasPath)}`}
                    </span>
                  </button>
                  <Button variant='ghost' size='icon' className='size-7' aria-label={`Remove filter ${fieldLabel(filter.column)}`} onClick={() => props.onRemoveFilter(filter.id)}>
                    <X className='h-4 w-4' />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </Section>

      <Section title='Columns'>
        {draft.columns.length === 0 && <p className='px-3 text-xs text-muted-foreground'>Tick columns in All.</p>}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={names} strategy={verticalListSortingStrategy}>
            <ul className='flex flex-col'>
              {draft.columns.map((column, i) => {
                const field = index.fields.get(column.name);
                const label = field?.label ?? column.name;
                return (
                  <SortableRow key={column.name} id={column.name}>
                    {field ? <TypeBadge kind={field.kind} /> : <Badge variant='destructive'>Unavailable</Badge>}
                    <span className='flex-1 truncate text-sm'>{label}</span>
                    <span className='text-xs text-muted-foreground'>{field ? martLabel(field.aliasPath) : ''}</span>
                    <Button variant='ghost' size='icon' className='size-7' aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => props.onMoveColumn(i, i - 1)}>
                      <ChevronUp className='h-4 w-4' />
                    </Button>
                    <Button variant='ghost' size='icon' className='size-7' aria-label={`Move ${label} down`} disabled={i === draft.columns.length - 1} onClick={() => props.onMoveColumn(i, i + 1)}>
                      <ChevronDown className='h-4 w-4' />
                    </Button>
                    <Button variant='ghost' size='icon' className='size-7' aria-label={`Remove column ${label}`} onClick={() => props.onRemoveColumn(column.name)}>
                      <X className='h-4 w-4' />
                    </Button>
                  </SortableRow>
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
      </Section>
    </div>
  );
}
```

- [ ] **Step 6: Implement the panel container**

`ui/features/column-panel/ColumnPanel.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import { NativeSelect } from '../../components/NativeSelect';
import { AllFieldsTab, type AllFieldsTabProps } from './AllFieldsTab';
import { SelectedTab, type SelectedTabProps } from './SelectedTab';

export interface ColumnPanelProps
  extends AllFieldsTabProps,
    Omit<SelectedTabProps, 'pendingFilterField'> {
  /** A request to open the filter editor for a field; `nonce` lets the same field be requested twice. */
  filterRequest: { field: string; nonce: number } | null;
  onChangeMain(dataMartId: string): void;
  onApply(): void;
  applyDisabled: boolean;
  applying: boolean;
  issues: string[];
}

export function ColumnPanel(props: ColumnPanelProps) {
  const { index, draft, marts, filterRequest } = props;
  const [tab, setTab] = useState(filterRequest ? 'selected' : 'all');
  const [pendingFilterField, setPendingFilterField] = useState<string | null>(filterRequest?.field ?? null);
  const main = index.instances.get('')!;

  useEffect(() => {
    if (!filterRequest) return;
    setTab('selected');
    setPendingFilterField(filterRequest.field);
  }, [filterRequest]);

  return (
    <div className='flex h-full min-h-0 flex-col bg-background' data-testid='columnPanel'>
      <div className='flex flex-col gap-1 border-b border-border p-3'>
        <label htmlFor='main-data-mart' className='text-xs text-muted-foreground'>
          Report on
        </label>
        <NativeSelect id='main-data-mart' value={draft.mainDataMartId} onChange={(e) => props.onChangeMain(e.target.value)}>
          {marts.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </NativeSelect>
        <p className='text-xs text-muted-foreground'>1 row = 1 {main.title}</p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className='flex min-h-0 flex-1 flex-col'>
        <TabsList className='mx-3 mt-3 grid grid-cols-2'>
          <TabsTrigger value='all'>All</TabsTrigger>
          <TabsTrigger value='selected'>Selected {draft.columns.length}</TabsTrigger>
        </TabsList>
        <TabsContent value='all' className='min-h-0 flex-1 overflow-y-auto'>
          <AllFieldsTab {...props} />
        </TabsContent>
        <TabsContent value='selected' className='min-h-0 flex-1 overflow-y-auto'>
          <SelectedTab
            {...props}
            pendingFilterField={pendingFilterField}
            onPendingFilterDone={() => {
              setPendingFilterField(null);
              props.onPendingFilterDone();
            }}
          />
        </TabsContent>
      </Tabs>

      <div className='flex flex-col gap-2 border-t border-border p-3'>
        {props.issues.map((issue) => (
          <p key={issue} className='text-xs text-destructive'>
            {issue}
          </p>
        ))}
        <Button className='w-full' disabled={props.applyDisabled} onClick={props.onApply} data-testid='apply'>
          {props.applying && <Loader2 className='h-4 w-4 animate-spin' />}
          Apply
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run ui/features/column-panel && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add ui/lib/filter-operators.ts ui/features/column-panel package.json package-lock.json
git commit -m "Add the Selected tab, filter and period editors, and the column panel"
```

---

### Task 17: Result table

**Files:**
- Create: `ui/features/data-table/ColumnHeader.tsx`, `ui/features/data-table/ResultTable.tsx`
- Test: `ui/features/data-table/ResultTable.test.tsx`

**Interfaces:**
- Consumes: `RunState` (Task 14); `outputColumns`, `totalFor`, `pageOf`, `pageCount`, `PAGE_SIZE`, `OutputColumn` (Task 11); `formatCell`, `formatCount` (Task 11); `describeFilter` (Task 11); `SchemaIndex`, `chainLabel` (Task 4); `ReportDraft` (Task 6); `ROW_CAP` (Task 7); `AggregateFunction`, `DateTruncUnit` (Task 4).
- Produces: `ResultTable(props: ResultTableProps)` with `index`, `draft`, `run`, `stale`, `onSort(column, direction | null)`, `onSetAggregations(column, fns | undefined)`, `onSetDateTrunc(column, unit | undefined)`, `onEditFilter(column)`, `onRemoveFilter(id)`, `onCreateSheets()`, `onCancel()`, `onRetry()`; `ColumnHeader` (internal to the feature).

- [ ] **Step 1: Write the failing tests**

`ui/features/data-table/ResultTable.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM, VISITOR_SCHEMA, sampleRows } from '../../fixtures/smart-data';
import { buildSchemaIndex } from '../../lib/schema-index';
import { emptyDraft, type ReportDraft } from '../../lib/report-draft';
import type { RunState } from '../editor/use-query-run';
import { renderUi } from '../../test/render';
import { ResultTable } from './ResultTable';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);
const draft: ReportDraft = { ...emptyDraft(DM.visitor), columns: [{ name: 'email', aliasPath: '' }, { name: 'visits', aliasPath: '' }] };

function success(rows: Record<string, unknown>[], extra: Partial<Extract<RunState, { status: 'success' }>> = {}): RunState {
  return { status: 'success', result: { rows, truncated: false, runId: 'r1' }, totals: null, appliedHash: 'h', appliedDraft: draft, ...extra };
}

function setup(run: RunState, d: ReportDraft = draft) {
  const handlers = {
    onSort: vi.fn(), onSetAggregations: vi.fn(), onSetDateTrunc: vi.fn(), onEditFilter: vi.fn(),
    onRemoveFilter: vi.fn(), onCreateSheets: vi.fn(), onCancel: vi.fn(), onRetry: vi.fn(),
  };
  renderUi(<ResultTable index={index} draft={d} run={run} stale={false} {...handlers} />);
  return handlers;
}

it('prompts to apply before the first run', () => {
  setup({ status: 'idle' });
  expect(screen.getByText('Pick columns and click Apply')).toBeInTheDocument();
});

it('shows 100 rows per page and pages without re-querying', async () => {
  setup(success(sampleRows(['email', 'visits'], 120)));
  expect(screen.getAllByRole('row')).toHaveLength(1 + 100); // header + body
  expect(screen.getByText('1–100 of 120')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getByText('101–120 of 120')).toBeInTheDocument();
  expect(screen.getByText('email-101')).toBeInTheDocument();
});

it('points to Google Sheets when the result hits the cap', async () => {
  const h = setup({ ...success(sampleRows(['email'], 2500)), result: { rows: sampleRows(['email'], 2500), truncated: true, runId: 'r1' } } as RunState);
  expect(screen.getByText('Showing the first 2,500 rows.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Create Google Sheets report' }));
  expect(h.onCreateSheets).toHaveBeenCalled();
});

it('renders totals, automatic aggregations and awkward cells', () => {
  setup(success([{ email: null, 'visits | SUM': 12 }, { email: 'x'.repeat(5000), 'visits | SUM': 3 }], { totals: { 'visits | SUM': 15, 'visits | AVG': 7.5 } }));
  expect(screen.getByText('SUM · Automatic')).toBeInTheDocument();
  expect(screen.getByTestId('totals-visits | SUM')).toHaveTextContent('15');
  expect(screen.getByText('—')).toBeInTheDocument();
  const long = screen.getByTitle('x'.repeat(5000));
  expect(long).toHaveClass('truncate');
});

it('explains an empty result', () => {
  setup(success([]));
  expect(screen.getByText('No rows for this period')).toBeInTheDocument();
});

it('shows errors with retry and lets a running query be cancelled', async () => {
  const h = setup({ status: 'error', error: { message: "Couldn't reach OWOX Data Marts.", retryable: true }, appliedHash: 'h' });
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(h.onRetry).toHaveBeenCalled();
});

it('sorts from the column menu', async () => {
  const h = setup(success(sampleRows(['email', 'visits'], 3)));
  await userEvent.click(screen.getByRole('button', { name: 'Column options for Email' }));
  await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Z → A' }));
  expect(h.onSort).toHaveBeenCalledWith('email', 'desc');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run ui/features/data-table`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Implement the column header**

`ui/features/data-table/ColumnHeader.tsx`:

```tsx
import { ArrowDown, ArrowUp, EllipsisVertical, X } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { cn } from '@owox/ui/lib/utils';
import type { AggregateFunction, DateTruncUnit } from '../../lib/odm-types';
import type { OutputColumn } from '../../lib/output-columns';
import { describeFilter } from '../../lib/filter-operators';
import type { ReportDraft } from '../../lib/report-draft';
import { chainLabel, type FieldInfo, type SchemaIndex } from '../../lib/schema-index';

const TRUNC: { unit: DateTruncUnit | 'FULL'; label: string }[] = [
  { unit: 'FULL', label: 'Full date' },
  { unit: 'DAY', label: 'Day' },
  { unit: 'WEEK', label: 'Week' },
  { unit: 'MONTH', label: 'Month' },
  { unit: 'QUARTER', label: 'Quarter' },
  { unit: 'YEAR', label: 'Year' },
];

const FN_LABEL: Record<AggregateFunction, string> = {
  SUM: 'Sum', AVG: 'Average', MIN: 'Min', MAX: 'Max', COUNT: 'Count', COUNT_DISTINCT: 'Count unique',
  ANY_VALUE: 'Sample', STRING_AGG: 'Combined', P25: '25th percentile', P50: 'Median', P75: '75th percentile', P95: '95th percentile',
};

function aggregationsFor(field: FieldInfo): AggregateFunction[] {
  if (field.allowedAggregations?.length) return field.allowedAggregations;
  if (field.kind === 'number') return ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'COUNT_DISTINCT'];
  if (field.kind === 'date') return ['MIN', 'MAX', 'COUNT_DISTINCT'];
  if (field.kind === 'text') return ['COUNT', 'COUNT_DISTINCT'];
  return [];
}

export interface ColumnHeaderProps {
  out: OutputColumn;
  index: SchemaIndex;
  draft: ReportDraft;
  onSort(column: string, direction: 'asc' | 'desc' | null): void;
  onSetAggregations(column: string, fns: AggregateFunction[] | undefined): void;
  onSetDateTrunc(column: string, unit: DateTruncUnit | undefined): void;
  onEditFilter(column: string): void;
  onRemoveFilter(id: string): void;
}

export function ColumnHeader({ out, index, draft, onSort, onSetAggregations, onSetDateTrunc, onEditFilter, onRemoveFilter }: ColumnHeaderProps) {
  const name = out.column?.name;
  const field = name ? index.fields.get(name) : undefined;
  const instance = field ? index.instances.get(field.aliasPath) : undefined;
  const sortAt = draft.sorts.findIndex((s) => s.column === name);
  const sort = draft.sorts[sortAt];
  const filters = draft.filters.filter((f) => f.column === name);
  const label = field?.label ?? out.key;
  const current = draft.columns.find((c) => c.name === name);
  const aggregations = field ? aggregationsFor(field) : [];

  return (
    <th scope='col' className='min-w-[140px] px-3 py-2 text-left align-top font-normal'>
      <div className='text-xs text-muted-foreground'>{instance ? (instance.aliasPath ? chainLabel(index, instance.aliasPath) : instance.label) : ''}</div>
      <div className='flex items-start gap-1'>
        <span className={cn('flex items-center gap-1 font-medium', sort && 'text-primary')}>
          {sort && (sort.direction === 'asc' ? <ArrowUp className='h-4 w-4' /> : <ArrowDown className='h-4 w-4' />)}
          {sort && draft.sorts.length > 1 && <sup>{sortAt + 1}</sup>}
          {label}
        </span>
        {name && field && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='icon' className='size-6' aria-label={`Column options for ${label}`}>
                <EllipsisVertical className='h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='start' className='w-52'>
              {field.kind !== 'date' && <DropdownMenuItem onSelect={() => onEditFilter(name)}>Filter…</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Sort</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={sort?.direction ?? 'none'} onValueChange={(v) => onSort(name, v === 'none' ? null : (v as 'asc' | 'desc'))}>
                <DropdownMenuRadioItem value='asc'>A → Z</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value='desc'>Z → A</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value='none'>Unsorted</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              {aggregations.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Aggregation</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={current?.aggregations?.[0] ?? out.fn ?? 'none'}
                    onValueChange={(v) => onSetAggregations(name, v === 'none' ? undefined : [v as AggregateFunction])}
                  >
                    {/* HTTP Data cannot opt out of ODM's automatic aggregation, so None is hidden then. */}
                    {!out.automatic && <DropdownMenuRadioItem value='none'>None</DropdownMenuRadioItem>}
                    {aggregations.map((fn) => (
                      <DropdownMenuRadioItem key={fn} value={fn}>
                        {FN_LABEL[fn]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </>
              )}
              {field.kind === 'date' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Date bucket</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={current?.dateTrunc ?? 'FULL'} onValueChange={(v) => onSetDateTrunc(name, v === 'FULL' ? undefined : (v as DateTruncUnit))}>
                    {TRUNC.map((t) => (
                      <DropdownMenuRadioItem key={t.unit} value={t.unit}>
                        {t.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {out.fn && (
        <div className='text-xs text-muted-foreground'>
          {out.fn}
          {out.automatic && ' · Automatic'}
        </div>
      )}
      {current?.dateTrunc && <div className='text-xs text-primary'>{TRUNC.find((t) => t.unit === current.dateTrunc)?.label}</div>}
      {filters.map((f) => (
        <span key={f.id} className='mt-1 inline-flex items-center gap-1 text-xs text-foreground'>
          {describeFilter(f)}
          <button type='button' aria-label={`Remove filter ${label}`} className='text-muted-foreground hover:text-foreground' onClick={() => onRemoveFilter(f.id)}>
            <X className='h-3 w-3' />
          </button>
        </span>
      ))}
    </th>
  );
}
```

- [ ] **Step 4: Implement the table**

`ui/features/data-table/ResultTable.tsx`:

```tsx
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Sheet, TableProperties, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { Button } from '@owox/ui/components/button';
import { Skeleton } from '@owox/ui/components/skeleton';
import { cn } from '@owox/ui/lib/utils';
import type { RunState } from '../editor/use-query-run';
import { formatCell, formatCount } from '../../lib/format';
import { outputColumns, pageCount, pageOf, PAGE_SIZE, totalFor } from '../../lib/output-columns';
import { ROW_CAP } from '../../lib/read-plan';
import type { ReportDraft } from '../../lib/report-draft';
import type { SchemaIndex } from '../../lib/schema-index';
import { ColumnHeader, type ColumnHeaderProps } from './ColumnHeader';

export interface ResultTableProps extends Omit<ColumnHeaderProps, 'out'> {
  run: RunState;
  stale: boolean;
  onCreateSheets(): void;
  onCancel(): void;
  onRetry(): void;
}

function Empty({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <div className='dm-empty-state'>
      <TableProperties className='dm-empty-state-ico' />
      <h2 className='dm-empty-state-title'>{title}</h2>
      <p className='dm-empty-state-subtitle'>{subtitle}</p>
      {children}
    </div>
  );
}

export function ResultTable(props: ResultTableProps) {
  const { run, index, stale } = props;
  const [page, setPage] = useState(0);
  const result = run.status === 'success' ? run.result : null;
  useEffect(() => setPage(0), [result]);

  const applied: ReportDraft | null = run.status === 'success' ? run.appliedDraft : null;
  const columns = useMemo(() => (result && applied ? outputColumns(result.rows, applied) : []), [result, applied]);

  if (run.status === 'idle') {
    return run.cancelled ? (
      <Empty title='Query cancelled' subtitle='Click Apply to run it again.' />
    ) : (
      <Empty title='Pick columns and click Apply' subtitle='Queries run only when you click Apply, so you can set everything up first.' />
    );
  }

  if (run.status === 'running') {
    return (
      <div className='flex flex-col gap-2 py-4' data-testid='running'>
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Loader2 className='h-4 w-4 animate-spin text-primary' />
          Running query…
          <Button variant='outline' size='sm' onClick={props.onCancel}>
            Cancel
          </Button>
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className='h-8 w-full' />
        ))}
      </div>
    );
  }

  if (run.status === 'error') {
    return (
      <Alert variant='destructive' className='my-4'>
        <AlertTitle>{run.error.message}</AlertTitle>
        <AlertDescription>
          {run.error.detail && (
            <details>
              <summary>Details</summary>
              <pre className='whitespace-pre-wrap text-xs'>{run.error.detail}</pre>
            </details>
          )}
          {run.error.retryable && (
            <Button variant='outline' size='sm' className='mt-2' onClick={props.onRetry}>
              <RefreshCw className='h-4 w-4' />
              Retry
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  const rows = run.result.rows;
  const total = rows.length;
  const pages = pageCount(total);
  const visible = pageOf(rows, page);
  const first = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const last = Math.min(total, (page + 1) * PAGE_SIZE);
  const totals = columns.map((out) => totalFor(run.totals, out));

  return (
    <div className='flex min-h-0 flex-col gap-2 py-2'>
      {stale && <p className='text-xs text-muted-foreground'>You changed the report. Click Apply to update the result.</p>}
      {run.result.truncated && (
        <Alert className='border-warning/40 bg-warning-bg text-warning'>
          <TriangleAlert className='h-4 w-4' />
          <AlertTitle>Showing the first {formatCount(ROW_CAP)} rows.</AlertTitle>
          <AlertDescription className='text-warning'>
            <p>Need more? Create a Google Sheets report with this configuration — it has no row limit.</p>
            <Button size='sm' className='mt-2' onClick={props.onCreateSheets}>
              <Sheet className='h-4 w-4' />
              Create Google Sheets report
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {total === 0 ? (
        <Empty title='No rows for this period' subtitle='Try widening the date ranges in Selected.' />
      ) : (
        <>
          <div className='dm-card overflow-auto p-0'>
            <table className='w-full text-sm'>
              <thead className='sticky top-0 bg-[var(--table-thead-sticky-bg)]'>
                <tr>
                  {columns.map((out) => (
                    <ColumnHeader key={out.key} out={out} {...props} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {totals.some(Boolean) && (
                  <tr className='border-y border-border bg-muted/50'>
                    {columns.map((out, i) => {
                      const cell = totals[i];
                      return (
                        <td key={out.key} className='px-3 py-2 text-right font-medium tabular-nums' data-testid={`totals-${out.key}`} title={cell?.others.map((o) => `${o.fn}: ${formatCell(o.value)}`).join('\n')}>
                          {cell ? formatCell(cell.value) : ''}
                        </td>
                      );
                    })}
                  </tr>
                )}
                {visible.map((row, r) => (
                  <tr key={page * PAGE_SIZE + r} className='border-b border-border last:border-b-0'>
                    {columns.map((out) => {
                      const value = row[out.key];
                      const text = formatCell(value);
                      return (
                        <td key={out.key} title={text} className={cn('max-w-[320px] truncate px-3 py-2', typeof value === 'number' && 'text-right tabular-nums')}>
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className='flex items-center justify-end gap-2 text-sm text-muted-foreground'>
            <span>
              {first}–{last} of {formatCount(total)}
            </span>
            <Button variant='ghost' size='icon' aria-label='Previous page' disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className='h-4 w-4' />
            </Button>
            <Button variant='ghost' size='icon' aria-label='Next page' disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className='h-4 w-4' />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
```

The totals row is a `<tr>` inside `<tbody>`, so the page-size test counts `1 + 100` rows only when there are no totals — the test passes `totals: null` there.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run ui/features/data-table && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/features/data-table
git commit -m "Add the result table with totals, pagination and the row-cap banner"
```

---
### Task 18: Entity relationship canvas

**Files:**
- Create: `ui/lib/canvas-model.ts`, `ui/features/canvas/CanvasNodeActions.tsx`, `ui/features/canvas/RelationshipCanvas.tsx`
- Test: `ui/lib/canvas-model.test.ts`, `ui/features/canvas/CanvasNodeActions.test.tsx`

**Interfaces:**
- Consumes: `SchemaIndex`, `InstanceInfo`, `AliasPath`, `parentPath`, `childInstances` (Task 4); `RelationshipGraph`, `MainGrainMultiplication` (Task 4); `ReportDraft`, `usedInstances` (Task 6).
- Produces: `NODE_WIDTH`, `NODE_HEIGHT`, `CanvasNode { path; label; dataMartId; kind: 'main' | 'used' | 'transit'; x; y }`, `CanvasEdge { id; source; target; keys: string[]; grain }`, `CanvasModel`, `buildCanvasModel(index, graph, draft)`; `CanvasNodeActions({ node, targets, onAddObject(path), onSetMain(dataMartId), onDelete(path) })`; `RelationshipCanvas({ index, graph, draft, theme, onAddObject(path), onSetMain(dataMartId), onDeleteInstance(path) })`.

- [ ] **Step 1: Install the graph libraries**

```bash
npm install @xyflow/react @dagrejs/dagre
```

- [ ] **Step 2: Write the failing tests**

`ui/lib/canvas-model.test.ts`:

```ts
import { DM, VISITOR_GRAPH, VISITOR_SCHEMA } from '../fixtures/smart-data';
import { buildSchemaIndex } from './schema-index';
import { addColumn, emptyDraft, includePath, type ReportDraft } from './report-draft';
import { buildCanvasModel } from './canvas-model';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);
const add = (d: ReportDraft, ...names: string[]) => names.reduce((x, n) => addColumn(x, index, n).draft, d);

it('draws the main mart, used instances and the transit instances between them', () => {
  const draft = add(emptyDraft(DM.visitor), 'email', 'landing_page__title', 'sessions_pageviews_page__title');
  const model = buildCanvasModel(index, VISITOR_GRAPH, draft);
  expect(Object.fromEntries(model.nodes.map((n) => [n.path, n.kind]))).toEqual({
    '': 'main',
    landing_page: 'used',
    sessions: 'transit',
    'sessions.pageviews': 'transit',
    'sessions.pageviews.page': 'used',
  });
  const viewedPage = model.nodes.find((n) => n.path === 'sessions.pageviews.page')!;
  const main = model.nodes.find((n) => n.path === '')!;
  expect(viewedPage.x).toBeGreaterThan(main.x);
});

it('marks instances that only carry the path as transit', () => {
  const draft = { ...includePath(emptyDraft(DM.visitor), 'sessions.pageviews.page') };
  const kinds = Object.fromEntries(buildCanvasModel(index, VISITOR_GRAPH, draft).nodes.map((n) => [n.path, n.kind]));
  expect(kinds).toEqual({ '': 'main', sessions: 'transit', 'sessions.pageviews': 'transit', 'sessions.pageviews.page': 'used' });
});

it('labels edges with join keys and grain', () => {
  const draft = includePath(emptyDraft(DM.visitor), 'sessions.pageviews');
  const edge = buildCanvasModel(index, VISITOR_GRAPH, draft).edges.find((e) => e.target === 'sessions.pageviews')!;
  expect(edge).toMatchObject({ source: 'sessions', keys: ['session_id = session_id', 'client_id = client_id'], grain: 'multiplies' });
});
```

`ui/features/canvas/CanvasNodeActions.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM, VISITOR_SCHEMA } from '../../fixtures/smart-data';
import { buildSchemaIndex, childInstances } from '../../lib/schema-index';
import { renderUi } from '../../test/render';
import { CanvasNodeActions } from './CanvasNodeActions';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);

it('adds only objects joinable from the selected node', async () => {
  const onAddObject = vi.fn();
  renderUi(
    <CanvasNodeActions
      node={{ path: 'sessions', label: 'Session', dataMartId: DM.session, kind: 'used', x: 0, y: 0 }}
      targets={childInstances(index, 'sessions')}
      onAddObject={onAddObject}
      onSetMain={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Add object' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: /Pageview/ }));
  expect(onAddObject).toHaveBeenCalledWith('sessions.pageviews');
});

it('cannot delete the main data mart or set it as main again', () => {
  renderUi(
    <CanvasNodeActions node={{ path: '', label: 'Visitor', dataMartId: DM.visitor, kind: 'main', x: 0, y: 0 }} targets={[]} onAddObject={vi.fn()} onSetMain={vi.fn()} onDelete={vi.fn()} />,
  );
  expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Set as main' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Add object' })).toBeDisabled();
});

it('sets another data mart as main and deletes an instance', async () => {
  const onSetMain = vi.fn();
  const onDelete = vi.fn();
  renderUi(
    <CanvasNodeActions node={{ path: 'sessions', label: 'Session', dataMartId: DM.session, kind: 'used', x: 0, y: 0 }} targets={[]} onAddObject={vi.fn()} onSetMain={onSetMain} onDelete={onDelete} />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Set as main' }));
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(onSetMain).toHaveBeenCalledWith(DM.session);
  expect(onDelete).toHaveBeenCalledWith('sessions');
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run ui/lib/canvas-model.test.ts ui/features/canvas`
Expected: FAIL — unresolved imports.

- [ ] **Step 4: Implement the canvas model**

`ui/lib/canvas-model.ts`:

```ts
import dagre from '@dagrejs/dagre';
import type { MainGrainMultiplication, RelationshipGraph } from './odm-types';
import { usedInstances, type ReportDraft } from './report-draft';
import { isSameOrDescendant, parentPath, type AliasPath, type SchemaIndex } from './schema-index';

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 44;

export interface CanvasNode {
  path: AliasPath;
  label: string;
  dataMartId: string;
  kind: 'main' | 'used' | 'transit';
  /** Top-left corner, ready for React Flow. */
  x: number;
  y: number;
}

export interface CanvasEdge {
  id: string;
  source: AliasPath;
  target: AliasPath;
  keys: string[];
  grain: MainGrainMultiplication;
}

export interface CanvasModel { nodes: CanvasNode[]; edges: CanvasEdge[] }

const MAIN_KEY = '__main__';
const key = (path: AliasPath) => path || MAIN_KEY;

export function buildCanvasModel(index: SchemaIndex, graph: RelationshipGraph, draft: ReportDraft): CanvasModel {
  const used = usedInstances(draft).filter((p) => index.instances.has(p));
  const own = new Set([
    ...draft.columns.map((c) => c.aliasPath),
    ...draft.dateRanges.map((r) => r.aliasPath),
    ...draft.filters.map((f) => f.aliasPath),
  ]);
  // An included path nothing else hangs below was added on purpose (Add object), so it counts as used.
  const leaves = draft.includedPaths.filter(
    (p) => !draft.includedPaths.some((other) => other !== p && isSameOrDescendant(other, p)),
  );

  const paths = new Set<AliasPath>(['']);
  for (const path of used) {
    for (let current = path; current; current = parentPath(current)) paths.add(current);
  }

  const keysByPath = new Map(
    graph.nodes.map((n) => [n.aliasPath, n.relationship.joinConditions.map((j) => `${j.sourceFieldName} = ${j.targetFieldName}`)]),
  );

  const layout = new dagre.graphlib.Graph();
  layout.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 140 });
  layout.setDefaultEdgeLabel(() => ({}));
  for (const path of paths) layout.setNode(key(path), { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const path of paths) if (path) layout.setEdge(key(parentPath(path)), key(path));
  dagre.layout(layout);

  const nodes: CanvasNode[] = [...paths].map((path) => {
    const instance = index.instances.get(path)!;
    const position = layout.node(key(path));
    return {
      path,
      label: instance.label,
      dataMartId: instance.dataMartId,
      kind: path === '' ? 'main' : own.has(path) || leaves.includes(path) ? 'used' : 'transit',
      x: position.x - NODE_WIDTH / 2,
      y: position.y - NODE_HEIGHT / 2,
    };
  });

  const edges: CanvasEdge[] = [...paths]
    .filter((path) => path !== '')
    .map((path) => ({
      id: `${key(parentPath(path))}->${path}`,
      source: parentPath(path),
      target: path,
      keys: keysByPath.get(path) ?? [],
      grain: index.instances.get(path)!.grain,
    }));

  return { nodes, edges };
}
```

- [ ] **Step 5: Implement the node actions and the canvas**

`ui/features/canvas/CanvasNodeActions.tsx`:

```tsx
import { CirclePlus, House, Trash2 } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@owox/ui/components/dropdown-menu';
import type { CanvasNode } from '../../lib/canvas-model';
import type { AliasPath, InstanceInfo } from '../../lib/schema-index';

interface CanvasNodeActionsProps {
  node: CanvasNode;
  /** Instances joinable from this node that are not on the canvas yet. */
  targets: InstanceInfo[];
  onAddObject(path: AliasPath): void;
  onSetMain(dataMartId: string): void;
  onDelete(path: AliasPath): void;
}

export function CanvasNodeActions({ node, targets, onAddObject, onSetMain, onDelete }: CanvasNodeActionsProps) {
  const isMain = node.kind === 'main';
  return (
    <div className='flex overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' size='sm' className='rounded-none' disabled={targets.length === 0}>
            <CirclePlus className='h-4 w-4' />
            Add object
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' className='w-64'>
          {targets.map((target) => (
            <DropdownMenuItem key={target.aliasPath} onSelect={() => onAddObject(target.aliasPath)}>
              <span className='flex flex-col'>
                <span>{target.label}</span>
                {target.joinDescription && <span className='text-xs text-muted-foreground'>{target.joinDescription}</span>}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant='ghost' size='sm' className='rounded-none' disabled={isMain} onClick={() => onSetMain(node.dataMartId)}>
        <House className='h-4 w-4' />
        Set as main
      </Button>
      <Button variant='ghost' size='sm' className='rounded-none' disabled={isMain} onClick={() => onDelete(node.path)}>
        <Trash2 className='h-4 w-4' />
        Delete
      </Button>
    </div>
  );
}
```

`ui/features/canvas/RelationshipCanvas.tsx`:

```tsx
import { useMemo, useState } from 'react';
import {
  Background, BaseEdge, Controls, EdgeLabelRenderer, getBezierPath, Handle, NodeToolbar, Position, ReactFlow,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { House } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { buildCanvasModel, NODE_HEIGHT, NODE_WIDTH, type CanvasEdge, type CanvasNode } from '../../lib/canvas-model';
import type { RelationshipGraph } from '../../lib/odm-types';
import type { ReportDraft } from '../../lib/report-draft';
import { childInstances, type AliasPath, type InstanceInfo, type SchemaIndex } from '../../lib/schema-index';
import { CanvasNodeActions } from './CanvasNodeActions';

type InstanceNodeData = CanvasNode & {
  targets: InstanceInfo[];
  onAddObject(path: AliasPath): void;
  onSetMain(dataMartId: string): void;
  onDelete(path: AliasPath): void;
};
type JoinEdgeData = Pick<CanvasEdge, 'keys' | 'grain'>;

const nodeId = (path: AliasPath) => path || '__main__';

function InstanceNode({ data, selected }: NodeProps<Node<InstanceNodeData>>) {
  return (
    <>
      <Handle type='target' position={Position.Left} isConnectable={false} className='opacity-0' />
      <div
        className={cn(
          'flex items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-card-foreground shadow-sm',
          data.kind === 'transit' && 'border-dashed text-muted-foreground',
          selected && 'border-primary ring-2 ring-ring/50',
        )}
        style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      >
        {data.kind === 'main' && <House className='h-4 w-4 shrink-0 text-primary' />}
        <span className='truncate font-medium'>{data.label}</span>
      </div>
      <Handle type='source' position={Position.Right} isConnectable={false} className='opacity-0' />
      <NodeToolbar isVisible={selected} position={Position.Bottom}>
        <CanvasNodeActions node={data} targets={data.targets} onAddObject={data.onAddObject} onSetMain={data.onSetMain} onDelete={data.onDelete} />
      </NodeToolbar>
    </>
  );
}

function JoinEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<Edge<JoinEdgeData>>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <BaseEdge id={id} path={path} />
      <EdgeLabelRenderer>
        {/* The label sits in a gap of the line: the background hides the stroke behind it. */}
        <div
          className='nodrag nopan absolute flex flex-col items-center rounded-sm bg-background px-1 font-mono text-[10px] leading-tight text-muted-foreground'
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {data?.keys.map((k) => <span key={k}>{k}</span>)}
          {data?.grain === 'multiplies' && <span className='text-warning'>×N</span>}
          {data?.grain === 'unknown' && <span>?</span>}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const NODE_TYPES = { instance: InstanceNode };
const EDGE_TYPES = { join: JoinEdge };

interface RelationshipCanvasProps {
  index: SchemaIndex;
  graph: RelationshipGraph;
  draft: ReportDraft;
  theme: 'light' | 'dark';
  onAddObject(path: AliasPath): void;
  onSetMain(dataMartId: string): void;
  onDeleteInstance(path: AliasPath): void;
}

export function RelationshipCanvas({ index, graph, draft, theme, onAddObject, onSetMain, onDeleteInstance }: RelationshipCanvasProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const model = useMemo(() => buildCanvasModel(index, graph, draft), [index, graph, draft]);
  const onCanvas = useMemo(() => new Set(model.nodes.map((n) => n.path)), [model]);

  const nodes: Node<InstanceNodeData>[] = model.nodes.map((n) => ({
    id: nodeId(n.path),
    type: 'instance',
    position: { x: n.x, y: n.y },
    selected: selected === nodeId(n.path),
    data: {
      ...n,
      targets: childInstances(index, n.path).filter((t) => !onCanvas.has(t.aliasPath)),
      onAddObject,
      onSetMain,
      onDelete: (path) => {
        setSelected(null);
        onDeleteInstance(path);
      },
    },
  }));
  const edges: Edge<JoinEdgeData>[] = model.edges.map((e) => ({
    id: e.id,
    type: 'join',
    source: nodeId(e.source),
    target: nodeId(e.target),
    data: { keys: e.keys, grain: e.grain },
  }));

  return (
    <div className='dm-card h-[520px] p-0' data-testid='relationshipCanvas'>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        colorMode={theme}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_, node) => setSelected(node.id)}
        onPaneClick={() => setSelected(null)}
        className='[--xy-background-color:transparent] [--xy-edge-stroke:var(--primary)]'
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
```

The canvas itself is verified by hand on the dev server and the real host (Task 21); React Flow does not lay out in happy-dom. Its logic is covered by `canvas-model.test.ts` and `CanvasNodeActions.test.tsx`.

- [ ] **Step 6: Run the tests and look at the canvas once**

Run: `npx vitest run ui/lib/canvas-model.test.ts ui/features/canvas && npm run lint && npm run typecheck`
Expected: PASS. The canvas is checked visually in Task 20 Step 5, once the editor renders it.

- [ ] **Step 7: Commit**

```bash
git add ui/lib/canvas-model.ts ui/lib/canvas-model.test.ts ui/features/canvas package.json package-lock.json
git commit -m "Add the entity relationship canvas with join keys on edges"
```

---

### Task 19: Google Sheets dialog and the SQL tab

**Files:**
- Create: `ui/features/sheets/SheetsReportDialog.tsx`, `ui/features/sql/SqlTab.tsx`
- Test: `ui/features/sheets/SheetsReportDialog.test.tsx`, `ui/features/sql/SqlTab.test.tsx`

**Interfaces:**
- Consumes: `useServices` (Task 13); `SyncOutcome`, `spreadsheetUrl`, `odmReportsPath`, `odmDestinationsPath` (Task 12); `SaveOutcome` (Task 14); `LinkedReport` (Task 10); `describeError` (Task 8); `tokenizeSql` (Task 11); `NativeSelect` (Task 15).
- Produces: `SheetsReportDialog({ mode, defaultTitle, dataMartId, onCreate(input), onUpdate(), onClose() })` (mounted while open); `SqlTab({ linked?, draftChanged, reportTitle, onCreateSheets(), onUpdateSheets() })`.

- [ ] **Step 1: Write the failing tests**

`ui/features/sheets/SheetsReportDialog.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM } from '../../fixtures/smart-data';
import { __mock, __resetForTests } from '../../sdk-mock';
import { mockServices, renderWithServices } from '../../test/render';
import { SheetsReportDialog } from './SheetsReportDialog';

beforeEach(() => __resetForTests());

const linked = { reportId: 'report-2', destinationId: 'dest-sheets', spreadsheetId: 'sheet-1', sheetId: 0, syncedDraftHash: 'h' };

it('creates a report in a chosen destination and offers both links', async () => {
  const onCreate = vi.fn(async () => ({ linked, runStatus: 'SUCCESS' as const }));
  renderWithServices(<SheetsReportDialog mode='create' defaultTitle='Visitors' dataMartId={DM.visitor} onCreate={onCreate} onUpdate={vi.fn()} onClose={vi.fn()} />, await mockServices());
  expect(await screen.findByRole('combobox', { name: 'Google Sheets destination' })).toHaveValue('dest-sheets');
  await userEvent.click(screen.getByRole('button', { name: 'Create report' }));
  expect(onCreate).toHaveBeenCalledWith({ title: 'Visitors', destinationId: 'dest-sheets' });
  expect(await screen.findByText('Your Google Sheets report is ready.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Open spreadsheet' }));
  expect(__mock.state.opened).toEqual(['https://docs.google.com/spreadsheets/d/sheet-1/edit#gid=0']);
  await userEvent.click(screen.getByRole('button', { name: 'Open report in ODM' }));
  expect(__mock.state.navigations).toEqual([`/ui/demo-project/data-marts/${DM.visitor}/reports`]);
});

it('sends the user to Destinations when there is no Google Sheets connection', async () => {
  __mock.state.destinations = [];
  renderWithServices(<SheetsReportDialog mode='create' defaultTitle='T' dataMartId={DM.visitor} onCreate={vi.fn()} onUpdate={vi.fn()} onClose={vi.fn()} />, await mockServices());
  expect(await screen.findByText('Connect Google Sheets in Destinations first.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Open Destinations' }));
  expect(__mock.state.navigations).toEqual(['/ui/demo-project/data-destinations']);
});

it('updates the linked report and handles a report deleted in ODM', async () => {
  const onUpdate = vi.fn(async () => ({ kind: 'link-missing' as const }));
  renderWithServices(<SheetsReportDialog mode='update' defaultTitle='T' dataMartId={DM.visitor} onCreate={vi.fn()} onUpdate={onUpdate} onClose={vi.fn()} />, await mockServices());
  await userEvent.click(screen.getByRole('button', { name: 'Update report' }));
  expect(await screen.findByText('The Google Sheets report was deleted in ODM. Create a new one to keep a spreadsheet in sync.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Create a new one' }));
  expect(await screen.findByRole('button', { name: 'Create report' })).toBeInTheDocument();
});
```

`ui/features/sql/SqlTab.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM } from '../../fixtures/smart-data';
import { __resetForTests } from '../../sdk-mock';
import { mockServices, renderWithServices } from '../../test/render';
import { SqlTab } from './SqlTab';

beforeEach(() => __resetForTests());

it('explains why there is no SQL yet and offers a Google Sheets report', async () => {
  const onCreateSheets = vi.fn();
  renderWithServices(<SqlTab draftChanged={false} reportTitle='R' onCreateSheets={onCreateSheets} onUpdateSheets={vi.fn()} />, await mockServices());
  expect(screen.getByText("ODM doesn't return SQL for ad-hoc queries yet.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Create Google Sheets report' }));
  expect(onCreateSheets).toHaveBeenCalled();
});

it('shows the linked report SQL, warns when it is behind, and downloads it', async () => {
  const services = await mockServices();
  const { id } = await services.api.createReport(DM.visitor, {
    title: 'R', destinationId: 'dest-sheets', spreadsheetId: 's', sheetId: 0,
    config: { columnConfig: ['email'], filterConfig: null, sortConfig: null, aggregationConfig: null, dateTruncConfig: null },
  });
  const linked = { reportId: id, destinationId: 'dest-sheets', spreadsheetId: 's', sheetId: 0, syncedDraftHash: 'h' };
  const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:sql');
  const onUpdateSheets = vi.fn();
  renderWithServices(<SqlTab linked={linked} draftChanged reportTitle='Visitors by source' onCreateSheets={vi.fn()} onUpdateSheets={onUpdateSheets} />, services);
  expect(await screen.findByTestId('sqlCode')).toHaveTextContent('SELECT email FROM');
  expect(screen.getByText('This SQL belongs to the Google Sheets report, not to your current changes.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Update report' }));
  expect(onUpdateSheets).toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Download .sql' }));
  expect(createObjectURL).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run ui/features/sheets ui/features/sql`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Implement the Google Sheets dialog**

`ui/features/sheets/SheetsReportDialog.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { CircleCheckBig, ExternalLink, Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@owox/ui/components/dialog';
import { Input } from '@owox/ui/components/input';
import { NativeSelect } from '../../components/NativeSelect';
import { useServices } from '../../services';
import { describeError } from '../../lib/errors';
import type { SheetsDestination } from '../../lib/odm-types';
import type { LinkedReport } from '../../lib/report-store';
import { odmDestinationsPath, odmReportsPath, spreadsheetUrl, type SyncOutcome } from '../../lib/sheets-sync';
import type { SaveOutcome } from '../editor/use-report-document';

interface SheetsReportDialogProps {
  mode: 'create' | 'update';
  defaultTitle: string;
  dataMartId: string;
  onCreate(input: { title: string; destinationId: string }): Promise<SyncOutcome>;
  onUpdate(): Promise<SaveOutcome>;
  onClose(): void;
}

type Step =
  | { kind: 'form' }
  | { kind: 'working' }
  | { kind: 'done'; linked?: LinkedReport; runStatus: string; runError?: string }
  | { kind: 'missing' }
  | { kind: 'error'; message: string };

export function SheetsReportDialog({ mode: initialMode, defaultTitle, dataMartId, onCreate, onUpdate, onClose }: SheetsReportDialogProps) {
  const { api, projectId, openExternal, navigate } = useServices();
  const [mode, setMode] = useState(initialMode);
  const [step, setStep] = useState<Step>({ kind: 'form' });
  const [title, setTitle] = useState(defaultTitle);
  const [destinations, setDestinations] = useState<SheetsDestination[] | null>(null);
  const [destinationId, setDestinationId] = useState('');

  useEffect(() => {
    if (mode !== 'create') return;
    let alive = true;
    api.listSheetsDestinations().then(
      (list) => {
        if (!alive) return;
        setDestinations(list);
        setDestinationId((current) => current || list[0]?.id || '');
      },
      (error) => alive && setStep({ kind: 'error', message: describeError(error, 'Google Sheets destinations').message }),
    );
    return () => {
      alive = false;
    };
  }, [api, mode]);

  async function create() {
    setStep({ kind: 'working' });
    try {
      const outcome = await onCreate({ title: title.trim() || defaultTitle, destinationId });
      setStep({ kind: 'done', linked: outcome.linked, runStatus: outcome.runStatus, runError: outcome.runError });
    } catch (error) {
      setStep({ kind: 'error', message: describeError(error).message });
    }
  }

  async function update() {
    setStep({ kind: 'working' });
    try {
      const outcome = await onUpdate();
      if (outcome.kind === 'link-missing') setStep({ kind: 'missing' });
      else if (outcome.kind === 'synced') setStep({ kind: 'done', runStatus: outcome.runStatus, runError: outcome.runError });
      else setStep({ kind: 'done', runStatus: 'SUCCESS' });
    } catch (error) {
      setStep({ kind: 'error', message: describeError(error).message });
    }
  }

  const doneMessage = (s: Extract<Step, { kind: 'done' }>) =>
    s.runStatus === 'SUCCESS'
      ? 'Your Google Sheets report is ready.'
      : s.runStatus === 'RUNNING'
        ? 'The report is still running. Open it in ODM to follow its progress.'
        : `The report was saved, but its run failed${s.runError ? `: ${s.runError}` : '.'}`;

  return (
    <Dialog open onOpenChange={(open) => !open && step.kind !== 'working' && onClose()}>
      <DialogContent className='sm:max-w-[520px]'>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create Google Sheets report' : 'Update Google Sheets'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'ODM creates a new spreadsheet and fills it with this configuration — no 2,500-row limit, and you get the SQL too.'
              : 'Push the current configuration into the same spreadsheet and run the report.'}
          </DialogDescription>
        </DialogHeader>

        {step.kind === 'form' && mode === 'create' && destinations === null && (
          <p className='flex items-center gap-2 text-sm text-muted-foreground'>
            <Loader2 className='h-4 w-4 animate-spin' />
            Loading destinations…
          </p>
        )}

        {step.kind === 'form' && mode === 'create' && destinations?.length === 0 && (
          <div className='flex flex-col gap-2 text-sm'>
            <p>Connect Google Sheets in Destinations first.</p>
            <Button variant='outline' className='w-fit' onClick={() => navigate(odmDestinationsPath(projectId))}>
              <ExternalLink className='h-4 w-4' />
              Open Destinations
            </Button>
          </div>
        )}

        {step.kind === 'form' && mode === 'create' && !!destinations?.length && (
          <div className='flex flex-col gap-3'>
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Report title
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Google Sheets destination
              <NativeSelect aria-label='Google Sheets destination' value={destinationId} onChange={(e) => setDestinationId(e.target.value)}>
                {destinations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
        )}

        {step.kind === 'working' && (
          <p className='flex items-center gap-2 text-sm text-muted-foreground'>
            <Loader2 className='h-4 w-4 animate-spin text-primary' />
            {mode === 'create' ? 'Creating the spreadsheet and running the report…' : 'Updating the report and running it…'}
          </p>
        )}

        {step.kind === 'done' && (
          <div className='flex flex-col gap-3 text-sm'>
            <p className='flex items-center gap-2'>
              {step.runStatus === 'SUCCESS' ? <CircleCheckBig className='h-4 w-4 text-success' /> : <TriangleAlert className='h-4 w-4 text-warning' />}
              {doneMessage(step)}
            </p>
            <div className='flex flex-wrap gap-2'>
              {step.linked && (
                <Button variant='outline' onClick={() => openExternal(spreadsheetUrl(step.linked!))}>
                  <ExternalLink className='h-4 w-4' />
                  Open spreadsheet
                </Button>
              )}
              <Button variant='outline' onClick={() => navigate(odmReportsPath(projectId, dataMartId))}>
                Open report in ODM
              </Button>
            </div>
          </div>
        )}

        {step.kind === 'missing' && (
          <div className='flex flex-col gap-2 text-sm'>
            <p>The Google Sheets report was deleted in ODM. Create a new one to keep a spreadsheet in sync.</p>
            <Button
              variant='outline'
              className='w-fit'
              onClick={() => {
                setMode('create');
                setStep({ kind: 'form' });
              }}
            >
              Create a new one
            </Button>
          </div>
        )}

        {step.kind === 'error' && <p className='text-sm text-destructive'>{step.message}</p>}

        <DialogFooter>
          {step.kind === 'done' || step.kind === 'missing' ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant='outline' disabled={step.kind === 'working'} onClick={onClose}>
                Cancel
              </Button>
              {mode === 'create' ? (
                <Button disabled={step.kind === 'working' || !destinationId} onClick={() => void create()}>
                  Create report
                </Button>
              ) : (
                <Button disabled={step.kind === 'working'} onClick={() => void update()}>
                  Update report
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Implement the SQL tab**

`ui/features/sql/SqlTab.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Download, FileCode2, RefreshCw, Sheet, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { Button } from '@owox/ui/components/button';
import { Skeleton } from '@owox/ui/components/skeleton';
import { cn } from '@owox/ui/lib/utils';
import { useServices } from '../../services';
import { describeError, type UserFacingError } from '../../lib/errors';
import type { LinkedReport } from '../../lib/report-store';
import { tokenizeSql, type SqlToken } from '../../lib/sql-highlight';

const TOKEN_CLASS: Record<SqlToken['kind'], string> = {
  keyword: 'font-semibold text-primary',
  string: 'text-success',
  number: 'text-warning',
  comment: 'italic text-muted-foreground',
  plain: '',
};

interface SqlTabProps {
  linked?: LinkedReport;
  draftChanged: boolean;
  reportTitle: string;
  onCreateSheets(): void;
  onUpdateSheets(): void;
}

type SqlState = { status: 'loading' } | { status: 'ready'; sql: string } | { status: 'error'; error: UserFacingError };

function download(filename: string, text: string) {
  // Clipboard access is blocked in the plugin iframe; downloads are allowed.
  const url = URL.createObjectURL(new Blob([text], { type: 'application/sql' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function SqlTab({ linked, draftChanged, reportTitle, onCreateSheets, onUpdateSheets }: SqlTabProps) {
  const { api } = useServices();
  const [state, setState] = useState<SqlState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const reportId = linked?.reportId;
  const version = linked?.syncedDraftHash;

  useEffect(() => {
    if (!reportId) return;
    let alive = true;
    setState({ status: 'loading' });
    api.getReportSql(reportId).then(
      (sql) => alive && setState({ status: 'ready', sql }),
      (error) => alive && setState({ status: 'error', error: describeError(error, 'this report') }),
    );
    return () => {
      alive = false;
    };
  }, [api, reportId, version, attempt]);

  if (!linked) {
    return (
      <div className='dm-empty-state'>
        <FileCode2 className='dm-empty-state-ico' />
        <h2 className='dm-empty-state-title'>ODM doesn't return SQL for ad-hoc queries yet.</h2>
        <p className='dm-empty-state-subtitle'>Create a Google Sheets report with this configuration to get both the SQL and the report.</p>
        <Button onClick={onCreateSheets}>
          <Sheet className='h-4 w-4' />
          Create Google Sheets report
        </Button>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-2 py-2'>
      {draftChanged && (
        <Alert className='border-warning/40 bg-warning-bg text-warning'>
          <TriangleAlert className='h-4 w-4' />
          <AlertTitle>This SQL belongs to the Google Sheets report, not to your current changes.</AlertTitle>
          <AlertDescription className='text-warning'>
            <Button size='sm' variant='outline' className='mt-1' onClick={onUpdateSheets}>
              Update report
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {state.status === 'loading' && <Skeleton className='h-64 w-full' />}
      {state.status === 'error' && (
        <Alert variant='destructive'>
          <AlertTitle>{state.error.message}</AlertTitle>
          <AlertDescription>
            <Button variant='outline' size='sm' className='mt-1' onClick={() => setAttempt((n) => n + 1)}>
              <RefreshCw className='h-4 w-4' />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {state.status === 'ready' && (
        <>
          <div className='flex justify-end'>
            <Button variant='outline' size='sm' onClick={() => download(`${reportTitle.replace(/[^\w-]+/g, '_') || 'report'}.sql`, state.sql)}>
              <Download className='h-4 w-4' />
              Download .sql
            </Button>
          </div>
          <pre className='dm-card overflow-auto font-mono text-xs leading-relaxed whitespace-pre' data-testid='sqlCode'>
            {tokenizeSql(state.sql).map((token, i) => (
              <span key={i} className={cn(TOKEN_CLASS[token.kind])}>
                {token.text}
              </span>
            ))}
          </pre>
        </>
      )}
    </div>
  );
}
```

`toHaveTextContent('SELECT email FROM')` normalises whitespace, so the mock's multi-line SQL matches.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run ui/features/sheets ui/features/sql && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/features/sheets ui/features/sql
git commit -m "Add the Google Sheets report dialog and the SQL tab"
```

---

### Task 20: Assemble the editor

**Files:**
- Modify: `ui/features/editor/EditorPage.tsx` (full replacement of the Task 13 stub)
- Test: `ui/features/editor/EditorPage.test.tsx`

**Interfaces:**
- Consumes: everything above — `useReportDocument`, `useSchema`, `useQueryRun` (Task 14); `ColumnPanel` (Task 16); `ResultTable` (Task 17); `RelationshipCanvas` (Task 18); `SheetsReportDialog`, `SqlTab` (Task 19); `DateChoiceDialog` (Task 15); draft functions (Task 6); `validateDraft`, `describeIssue` (Task 7); `configHash` (Task 10); `describeError` (Task 8).
- Produces: `EditorPage({ reportId?, onBack() })`.

- [ ] **Step 1: Write the failing integration tests**

`ui/features/editor/EditorPage.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM, sampleRows } from '../../fixtures/smart-data';
import { emptyDraft } from '../../lib/report-draft';
import { __mock, __resetForTests } from '../../sdk-mock';
import { mockServices, renderWithServices } from '../../test/render';
import { EditorPage } from './EditorPage';

beforeEach(() => __resetForTests());

async function startVisitorReport() {
  renderWithServices(<EditorPage onBack={vi.fn()} />, await mockServices());
  await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Data mart' }), DM.visitor);
  await userEvent.click(screen.getByRole('button', { name: 'Start' }));
  await screen.findByTestId('columnPanel');
}

const lastQuery = () =>
  [...__mock.state.requests].reverse().find((r) => r.path.startsWith('/api/external/http-data/')) as
    | { body: { column: string[]; filter: unknown[] | null; limit: number } }
    | undefined;

it('builds a report from scratch with a 30-day default period and shows rows', async () => {
  await startVisitorReport();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Email (Visitor)' }));
  await userEvent.click(screen.getByTestId('apply'));
  expect(await screen.findByText('1–100 of 120')).toBeInTheDocument();
  expect(lastQuery()?.body).toMatchObject({
    column: ['email'],
    limit: 2501,
    filter: [{ column: 'creation_date', operator: 'relative_date', value: { kind: 'last_n_days', n: 29 } }],
  });
});

it('asks which date to use for a joined mart with several dates', async () => {
  await startVisitorReport();
  await userEvent.click(screen.getByRole('button', { name: 'User' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Creation Source (User)' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('radio', { name: 'First Log In to OWOX Data Marts' }));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Add date' }));
  await userEvent.click(screen.getByRole('tab', { name: /selected/i }));
  expect(within(screen.getByRole('region', { name: 'Date ranges' })).getByText('First Log In to OWOX Data Marts')).toBeInTheDocument();
});

it('routes a capped result to a Google Sheets report and then shows its SQL', async () => {
  __mock.setRows((columns) => sampleRows(columns, 2600));
  await startVisitorReport();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Email (Visitor)' }));
  await userEvent.click(screen.getByTestId('apply'));
  // The header has a button with the same name; use the one in the row-cap banner.
  await userEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Create Google Sheets report' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Create report' }));
  expect(await screen.findByText('Your Google Sheets report is ready.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Done' }));
  await userEvent.click(screen.getByRole('tab', { name: 'SQL' }));
  expect(await screen.findByTestId('sqlCode')).toHaveTextContent('SELECT email');
  expect(screen.getByRole('button', { name: 'Update Google Sheets' })).toBeInTheDocument();
});

it('blocks Apply and explains when a saved column no longer exists', async () => {
  __mock.seedReport('r1', {
    schemaVersion: 1, title: 'Old', createdBy: 'demo-user', updatedBy: 'demo-user',
    draft: { ...emptyDraft(DM.visitor), columns: [{ name: 'gone_field', aliasPath: '' }] },
  });
  renderWithServices(<EditorPage reportId='r1' onBack={vi.fn()} />, await mockServices());
  expect(await screen.findByText('"gone_field" is no longer available. Remove it to run the report.')).toBeInTheDocument();
  expect(screen.getByTestId('apply')).toBeDisabled();
});

it('shows a schema failure with a retry instead of a blank screen', async () => {
  __mock.fail(`/api/data-marts/${DM.visitor}/blendable-schema`, { code: 'HTTP_ERROR', status: 500, message: 'boom' });
  renderWithServices(<EditorPage onBack={vi.fn()} />, await mockServices());
  await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Data mart' }), DM.visitor);
  await userEvent.click(screen.getByRole('button', { name: 'Start' }));
  expect(await screen.findByText("Couldn't load Visitor")).toBeInTheDocument();
  __mock.clearFailures();
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByTestId('columnPanel')).toBeInTheDocument();
});

it("saves someone else's report as a copy by default", async () => {
  __mock.seedReport('theirs', {
    schemaVersion: 1, title: 'Theirs', createdBy: 'someone', updatedBy: 'someone',
    draft: { ...emptyDraft(DM.visitor), columns: [{ name: 'email', aliasPath: '' }] },
  });
  renderWithServices(<EditorPage reportId='theirs' onBack={vi.fn()} />, await mockServices());
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Client ID (Visitor)' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Save as copy' }));
  await waitFor(() => expect(__mock.state.collections.get('reports')!.size).toBe(2));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run ui/features/editor/EditorPage.test.tsx`
Expected: FAIL — the stub has no data mart picker.

- [ ] **Step 3: Implement the editor page**

`ui/features/editor/EditorPage.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Columns3, Loader2, RefreshCw, Save, Sheet } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@owox/ui/components/alert-dialog';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { Sheet as SidePanel, SheetContent, SheetHeader, SheetTitle } from '@owox/ui/components/sheet';
import { Skeleton } from '@owox/ui/components/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import { useServices } from '../../services';
import { NativeSelect } from '../../components/NativeSelect';
import { describeError, type UserFacingError } from '../../lib/errors';
import type { DataMartSummary } from '../../lib/odm-types';
import { describeIssue, validateDraft } from '../../lib/read-plan';
import {
  addColumn, changeInstancePath, chooseAutoDate, emptyDraft, includePath, moveColumn, rebaseOnMain,
  removeColumn, removeDateRange, removeFilter, removeInstance, setAggregations, setDateRange, setDateTrunc,
  setSort, upsertFilter, type DateChoice, type RemapResult, type ReportDraft,
} from '../../lib/report-draft';
import { configHash } from '../../lib/report-store';
import type { SchemaIndex } from '../../lib/schema-index';
import { ColumnPanel } from '../column-panel/ColumnPanel';
import { DateChoiceDialog } from '../column-panel/DateChoiceDialog';
import { ResultTable } from '../data-table/ResultTable';
import { RelationshipCanvas } from '../canvas/RelationshipCanvas';
import { SheetsReportDialog } from '../sheets/SheetsReportDialog';
import { SqlTab } from '../sql/SqlTab';
import { useQueryRun } from './use-query-run';
import { useReportDocument, type SaveOutcome } from './use-report-document';
import { useSchema } from './use-schema';

interface PendingRemap { title: string; result: RemapResult; labels: string[] }

const UNDERLINE_LIST = 'h-auto w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0';
const UNDERLINE_TRIGGER =
  'flex-none rounded-none border-0 border-b-2 border-transparent px-1 pb-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none';

export function EditorPage({ reportId, onBack }: { reportId?: string; onBack(): void }) {
  const { api, theme } = useServices();
  const doc = useReportDocument(reportId);
  const [marts, setMarts] = useState<DataMartSummary[] | null>(null);
  const [martsError, setMartsError] = useState<UserFacingError | null>(null);
  const [startId, setStartId] = useState('');
  const [dateChoice, setDateChoice] = useState<DateChoice | null>(null);
  const [pendingRemap, setPendingRemap] = useState<PendingRemap | null>(null);
  const [filterRequest, setFilterRequest] = useState<{ field: string; nonce: number } | null>(null);
  const [sheets, setSheets] = useState<'create' | 'update' | null>(null);
  const [tab, setTab] = useState('table');
  const [panelOpen, setPanelOpen] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    api.listDataMarts().then(
      (list) => {
        if (!alive) return;
        setMarts(list);
        setStartId((current) => current || list[0]?.id || '');
      },
      (error) => alive && setMartsError(describeError(error, 'data marts')),
    );
    return () => {
      alive = false;
    };
  }, [api]);

  const draft = doc.draft;
  const mainMart = useMemo(() => marts?.find((m) => m.id === draft?.mainDataMartId), [marts, draft?.mainDataMartId]);
  const schema = useSchema(api, mainMart);
  const query = useQueryRun(api);
  const index: SchemaIndex | null = schema.state.status === 'ready' ? schema.state.index : null;

  const edit = useCallback(
    (fn: (d: ReportDraft, i: SchemaIndex) => ReportDraft) => {
      if (!index) return;
      doc.setDraft((d) => (d ? fn(d, index) : d));
    },
    [doc, index],
  );

  const labelsOf = (names: string[], i: SchemaIndex) => names.map((n) => i.fields.get(n)?.label ?? n);
  const issues = draft && index ? validateDraft(draft, index) : [];
  const hash = draft ? configHash(draft) : '';
  const applied = query.state.status === 'success' || query.state.status === 'error' ? query.state.appliedHash : null;
  const stale = query.state.status === 'success' && applied !== hash;
  const linked = doc.saved?.linkedReport;

  function toggleField(name: string, checked: boolean) {
    if (!index || !draft) return;
    if (!checked) {
      doc.setDraft(removeColumn(draft, name));
      return;
    }
    const result = addColumn(draft, index, name);
    doc.setDraft(result.draft);
    if (result.dateChoice) setDateChoice(result.dateChoice);
  }

  async function changeMain(dataMartId: string) {
    if (!draft || !index || dataMartId === draft.mainDataMartId) return;
    const mart = marts?.find((m) => m.id === dataMartId);
    if (!mart) return;
    try {
      const loaded = await schema.load(mart);
      const result = rebaseOnMain(draft, index, loaded.index);
      if (result.dropped.length) setPendingRemap({ title: `Report on ${mart.title}?`, result, labels: labelsOf(result.dropped, index) });
      else doc.setDraft(result.draft);
    } catch (error) {
      toast.error(describeError(error, mart.title).message);
    }
  }

  function changePath(from: string, to: string) {
    if (!draft || !index) return;
    const result = changeInstancePath(draft, index, from, to);
    if (result.dropped.length) setPendingRemap({ title: 'Change the join path?', result, labels: labelsOf(result.dropped, index) });
    else doc.setDraft(result.draft);
  }

  function apply() {
    if (!draft || issues.length) return;
    void query.run(draft.mainDataMartId, draft);
  }

  function report(outcome: SaveOutcome) {
    if (outcome.kind === 'link-missing') toast.warning('The Google Sheets report was deleted in ODM. Create a new one to keep a spreadsheet in sync.');
    else if (outcome.kind === 'synced' && outcome.runStatus !== 'SUCCESS') toast.error(`Saved, but the Google Sheets run failed${outcome.runError ? `: ${outcome.runError}` : '.'}`);
    else toast.success(outcome.kind === 'synced' ? 'Saved and updated Google Sheets.' : 'Report saved.');
  }

  async function save(asCopy = false) {
    setConfirmOverwrite(false);
    setSaving(true);
    try {
      report(await doc.saveWithSync({ asCopy }));
    } catch (error) {
      toast.error(describeError(error).message);
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <header className='dm-page-header flex flex-wrap items-center justify-between gap-2'>
      <div className='flex min-w-0 items-center gap-2'>
        <Button variant='ghost' size='icon' onClick={onBack} aria-label='Back to reports'>
          <ArrowLeft className='h-4 w-4' />
        </Button>
        {draft ? (
          <Input aria-label='Report title' className='dm-page-header-title h-auto border-transparent px-1 shadow-none' value={doc.title} onChange={(e) => doc.setTitle(e.target.value)} />
        ) : (
          <h1 className='dm-page-header-title'>New report</h1>
        )}
      </div>
      {draft && index && (
        <div className='flex items-center gap-2'>
          <Button variant='outline' disabled={!draft.columns.length || issues.length > 0} onClick={() => setSheets(linked ? 'update' : 'create')}>
            <Sheet className='h-4 w-4' />
            {linked ? 'Update Google Sheets' : 'Create Google Sheets report'}
          </Button>
          {doc.dirty && <span role='status' aria-label='Unsaved changes' className='size-2 rounded-full bg-primary' />}
          <Button disabled={!doc.dirty || saving} onClick={() => (doc.isAuthor ? void save() : setConfirmOverwrite(true))}>
            {saving ? <Loader2 className='h-4 w-4 animate-spin' /> : <Save className='h-4 w-4' />}
            {linked ? 'Save and update Google Sheets' : 'Save'}
          </Button>
          <Button variant='outline' size='icon' className='min-[900px]:hidden' aria-label='Columns' onClick={() => setPanelOpen(true)}>
            <Columns3 className='h-4 w-4' />
          </Button>
        </div>
      )}
    </header>
  );

  if (doc.status === 'loading' || (!marts && !martsError)) {
    return (
      <div className='dm-page' data-testid='editorPage'>
        {header}
        <div className='dm-page-content flex flex-col gap-2'>
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-64 w-full' />
        </div>
      </div>
    );
  }

  const fatal = doc.status === 'error' ? doc.error : martsError;
  if (fatal) {
    return (
      <div className='dm-page' data-testid='editorPage'>
        {header}
        <div className='dm-page-content'>
          <Alert variant='destructive'>
            <AlertTitle>{fatal.message}</AlertTitle>
          </Alert>
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className='dm-page' data-testid='editorPage'>
        {header}
        <div className='dm-empty-state'>
          <Columns3 className='dm-empty-state-ico' />
          <h2 className='dm-empty-state-title'>Choose the data mart your report is about</h2>
          <p className='dm-empty-state-subtitle'>Each row of the report is one row of this data mart. You can add columns from its joinable data marts next.</p>
          <div className='flex w-full max-w-sm items-center gap-2'>
            <NativeSelect aria-label='Data mart' value={startId} onChange={(e) => setStartId(e.target.value)}>
              {marts!.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </NativeSelect>
            <Button disabled={!startId} onClick={() => doc.setDraft(emptyDraft(startId))}>
              Start
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (schema.state.status === 'error') {
    return (
      <div className='dm-page' data-testid='editorPage'>
        {header}
        <div className='dm-page-content'>
          <Alert variant='destructive'>
            <AlertTitle>Couldn't load {mainMart?.title ?? 'this data mart'}</AlertTitle>
            <AlertDescription>
              <p>{schema.state.error.message}</p>
              <Button variant='outline' size='sm' className='mt-2' onClick={schema.reload}>
                <RefreshCw className='h-4 w-4' />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (!index || schema.state.status !== 'ready') {
    return (
      <div className='dm-page' data-testid='editorPage'>
        {header}
        <div className='dm-page-content'>
          <Skeleton className='h-64 w-full' />
        </div>
      </div>
    );
  }

  const graph = schema.state.graph;
  const noFields = index.instances.size === 1 && index.instances.get('')!.fields.length === 0;
  const visibleIssues = issues.filter((i) => i.kind !== 'no-columns').map((i) => describeIssue(i, index));
  const requestFilter = (field: string) => {
    setFilterRequest({ field, nonce: Date.now() });
    // On wide screens the panel is already visible; the side sheet is only for narrow ones.
    if (window.matchMedia('(max-width: 899px)').matches) setPanelOpen(true);
  };

  const panel = (
    <ColumnPanel
      index={index}
      draft={draft}
      marts={marts!}
      filterRequest={filterRequest}
      onToggleField={toggleField}
      onIncludePath={(path) => edit((d) => includePath(d, path))}
      onChangeInstancePath={changePath}
      onAddFilter={requestFilter}
      onSetDateRange={(column, range) => edit((d, i) => setDateRange(d, i, column, range))}
      onRemoveDateRange={(column) => edit((d) => removeDateRange(d, column))}
      onUpsertFilter={(filter) => edit((d) => upsertFilter(d, filter))}
      onRemoveFilter={(id) => edit((d) => removeFilter(d, id))}
      onMoveColumn={(from, to) => edit((d) => moveColumn(d, from, to))}
      onRemoveColumn={(name) => edit((d) => removeColumn(d, name))}
      onPendingFilterDone={() => setFilterRequest(null)}
      onChangeMain={(id) => void changeMain(id)}
      onApply={apply}
      applyDisabled={issues.length > 0 || (query.state.status === 'success' && !stale)}
      applying={query.state.status === 'running'}
      issues={visibleIssues}
    />
  );

  return (
    <div className='dm-page flex h-full flex-col' data-testid='editorPage'>
      {header}
      <div className='flex min-h-0 flex-1'>
        <main className='dm-page-content min-w-0 flex-1 overflow-auto'>
          {noFields ? (
            <div className='dm-empty-state'>
              <h2 className='dm-empty-state-title'>This data mart has no fields available for reports</h2>
              <p className='dm-empty-state-subtitle'>Ask its owner to make fields visible for reporting, or pick another data mart.</p>
            </div>
          ) : (
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className={UNDERLINE_LIST}>
                <TabsTrigger value='table' className={UNDERLINE_TRIGGER}>Data table</TabsTrigger>
                <TabsTrigger value='canvas' className={UNDERLINE_TRIGGER}>Entity relationship</TabsTrigger>
                <TabsTrigger value='sql' className={UNDERLINE_TRIGGER}>SQL</TabsTrigger>
              </TabsList>
              <TabsContent value='table'>
                <ResultTable
                  index={index}
                  draft={draft}
                  run={query.state}
                  stale={stale}
                  onSort={(column, direction) => edit((d) => setSort(d, column, direction))}
                  onSetAggregations={(column, fns) => edit((d) => setAggregations(d, column, fns))}
                  onSetDateTrunc={(column, unit) => edit((d) => setDateTrunc(d, column, unit))}
                  onEditFilter={requestFilter}
                  onRemoveFilter={(id) => edit((d) => removeFilter(d, id))}
                  onCreateSheets={() => setSheets(linked ? 'update' : 'create')}
                  onCancel={query.cancel}
                  onRetry={apply}
                />
              </TabsContent>
              <TabsContent value='canvas'>
                <RelationshipCanvas
                  index={index}
                  graph={graph}
                  draft={draft}
                  theme={theme}
                  onAddObject={(path) => edit((d) => includePath(d, path))}
                  onSetMain={(id) => void changeMain(id)}
                  onDeleteInstance={(path) => edit((d) => removeInstance(d, path))}
                />
              </TabsContent>
              <TabsContent value='sql'>
                <SqlTab
                  linked={linked}
                  draftChanged={!!linked && linked.syncedDraftHash !== hash}
                  reportTitle={doc.title}
                  onCreateSheets={() => setSheets('create')}
                  onUpdateSheets={() => setSheets('update')}
                />
              </TabsContent>
            </Tabs>
          )}
        </main>
        <aside className='hidden w-[380px] shrink-0 border-l border-border min-[900px]:flex'>{panel}</aside>
      </div>

      <SidePanel open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent className='w-full p-0 sm:min-w-[400px] min-[900px]:hidden'>
          <SheetHeader className='border-b border-border p-4'>
            <SheetTitle>Columns</SheetTitle>
          </SheetHeader>
          {panel}
        </SheetContent>
      </SidePanel>

      {dateChoice && (
        <DateChoiceDialog
          choice={dateChoice}
          index={index}
          onChoose={(column) => {
            edit((d, i) => chooseAutoDate(d, i, dateChoice.aliasPath, column));
            setDateChoice(null);
          }}
        />
      )}

      <AlertDialog open={!!pendingRemap} onOpenChange={(open) => !open && setPendingRemap(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingRemap?.title}</AlertDialogTitle>
            <AlertDialogDescription>These can't be kept and will be removed: {pendingRemap?.labels.join(', ')}.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive hover:bg-destructive/90'
              onClick={() => {
                if (pendingRemap) doc.setDraft(pendingRemap.result.draft);
                setPendingRemap(null);
              }}
            >
              Remove and continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOverwrite} onOpenChange={setConfirmOverwrite}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This report belongs to another member</AlertDialogTitle>
            <AlertDialogDescription>Save your changes as your own copy, or overwrite their report for everyone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => void save(false)}>Overwrite</AlertDialogCancel>
            <AlertDialogAction onClick={() => void save(true)}>Save as copy</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {sheets && (
        <SheetsReportDialog
          mode={sheets}
          defaultTitle={doc.title}
          dataMartId={draft.mainDataMartId}
          onCreate={(input) => doc.createSheetsReport(input)}
          onUpdate={() => doc.updateSheetsReport()}
          onClose={() => setSheets(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the integration tests and the whole suite**

Run: `npx vitest run && npm run lint && npm run typecheck && npm run build`
Expected: PASS; `dist/index.html` exists.

- [ ] **Step 5: Check the editor by hand on the dev server**

Run: `npm run dev`, open `http://localhost:5173/`, then:
1. *New report* → *Visitor* → *Start*; tick Email, Session › Source, Page › Title (pick *Landing page*), then *+ via another path* → viewed Page.
2. *Entity relationship*: Visitor → Contact/Session/Landing page branches, join keys in the edge gaps, `×N` on Session edges; select Session → *Add object* → Pageview.
3. *Apply*; page through 120 rows; open a column menu; switch the dark theme by toggling `.dark` on `<html>` in DevTools; narrow the window below 900 px and open *Columns*.
Expected: every step works without console errors.

- [ ] **Step 6: Commit**

```bash
git add ui/features/editor/EditorPage.tsx ui/features/editor/EditorPage.test.tsx
git commit -m "Assemble the report editor"
```

---

### Task 21: Release readiness

**Outward-facing steps — creating the GitHub repository, pushing, enabling Pages, cutting the release and publishing — need the user's explicit go-ahead before each one.**

**Files:**
- Modify: `AGENTS.md` (add the layout table), `README.md`
- Modify (umbrella repo `../`): `../CLAUDE.md` workspace table

**Interfaces:**
- Consumes: the finished plugin.
- Produces: a public `OWOX/smart-data-reports` repository with Pages and a `v0.1.0` release, installed for the user with `--scope member`.

- [ ] **Step 1: Document the layout in `AGENTS.md`**

Append to `AGENTS.md`:

```markdown
## Layout

| Path | Purpose |
| --- | --- |
| `plugin.json` | Manifest. The `reports` collection declaration is final. |
| `ui/lib/schema-index.ts` | Blendable schema → data marts, instances (one per join path), fields. |
| `ui/lib/report-draft.ts` | The report state and its rules: auto dates, path changes, rebasing. |
| `ui/lib/read-plan.ts` | Draft → HTTP Data parameters and report configuration; validation. |
| `ui/lib/odm-api.ts` | Typed calls through `ctx.owox`. |
| `ui/lib/report-store.ts` | Saved reports in the `reports` collection. |
| `ui/lib/sheets-sync.ts` | Create/update the linked ODM Google Sheets report. |
| `ui/lib/canvas-model.ts` | Draft → canvas nodes, edges and layout. |
| `ui/features/*` | React screens; props-driven, tested against `ui/sdk-mock.ts`. |
| `ui/vendor/owox-ui/` | Vendored ODM UI; refresh with `npm run sync:ui`. |
| `docs/verification/host-checks.md` | Platform facts verified on a real host. |
```

- [ ] **Step 2: Add the plugin to the workspace table (umbrella repo)**

In `../CLAUDE.md`, add a row under the `import-model/` row:

```markdown
| `smart-data-reports/` | `OWOX/smart-data-reports` | Builds ad-hoc reports on data marts and their joinable data marts. |
```

```bash
git -C .. add CLAUDE.md
git -C .. commit -m "List Smart Data Reports in the workspace table"
git add AGENTS.md README.md
git commit -m "Document the plugin layout"
```

- [ ] **Step 3: Verify the definition of done locally**

Run: `npm run lint && npm run typecheck && npm test && npm run build && test -f dist/index.html && git status --porcelain && grep -rn "OWOX_API_KEY\|owox_key_" --include='*.ts' --include='*.tsx' --include='*.json' ui plugin.json || echo CLEAN`
Expected: all pass, no uncommitted files, `CLEAN`.

- [ ] **Step 4: Publish (ask the user first; each command is outward-facing)**

```bash
gh repo create OWOX/smart-data-reports --public --source . --push
gh api --method POST repos/OWOX/smart-data-reports/pages -f build_type=workflow
gh run watch --repo OWOX/smart-data-reports
curl -sSf -o /dev/null -w '%{http_code}\n' https://owox.github.io/smart-data-reports/
gh release create v0.1.0 --repo OWOX/smart-data-reports --target main --generate-notes
owox-ctl plugins publish OWOX/smart-data-reports --scope member
```

Expected: the Pages URL answers `200` without sign-in; `owox-ctl` prints the publication with no `rejections`.

- [ ] **Step 5: Verify on the real host**

Install from `<instance>/ui/<projectId>/plugins` and check, with real member access:
1. Light and dark theme; window narrower and wider than 900 px.
2. Loading, empty, error and success states of the list, the editor, the table and the SQL tab.
3. A report over a data mart with relationships: path dialog, second path, canvas keys, *Apply*, 2,500-row banner, Google Sheets create → spreadsheet opens → SQL tab → change a column → *Save and update Google Sheets* → the same spreadsheet updates.
4. *Releases*: the plugin page shows `v0.1.0` and no *Release issues* card.

Record the outcome under a "Release v0.1.0" heading in `docs/verification/host-checks.md` and commit it.

```bash
git add docs/verification/host-checks.md
git commit -m "Record v0.1.0 host verification"
git push
```

---
