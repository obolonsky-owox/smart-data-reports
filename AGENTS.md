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
- No `localStorage`/`sessionStorage`/cookies/IndexedDB; persist through the `reports` and `snapshots` collections.
- The iframe sandbox is `allow-scripts allow-downloads` only: no `<form>` submission (the browser drops it before `submit` fires), no `alert`/`confirm`/`window.open`, no clipboard. Save on button clicks; open links via `ctx.ui.openExternal`.
- The collection declarations in `plugin.json` are final; later versions may only add collections. `ui/plugin-manifest.test.ts` guards them. `snapshots` is `member`-scoped on purpose: a result holds rows of joined data marts the next member may not reach.
- Commits, PRs, code comments in English. Never commit `node_modules/`, `dist/`, `.DS_Store`, `.env*`.
- Done means `npm run lint && npm run typecheck && npm test && npm run build` pass and
  `dist/index.html` exists.

## Local loops

- `npm run dev` — standalone page against `ui/sdk-mock.ts` and the fixture model in `ui/fixtures/`.
- Real host — expose `VITE_REAL_SDK=1 TUNNEL_HOST=<host> npm run dev` on a stable HTTPS tunnel,
  point a separate debug-manifest repo at it, publish `--scope member`, install, refresh the frame.
  `VITE_PROBE=1` additionally opens the Step 0 host probe instead of the app.

## Layout

| Path | Purpose |
| --- | --- |
| `plugin.json` | Manifest. Its collection declarations are final. |
| `ui/lib/schema-index.ts` | Blendable schema → data marts, instances (one per join path), fields. |
| `ui/lib/report-draft.ts` | The report state and its rules: auto dates, path changes, rebasing. |
| `ui/lib/read-plan.ts` | Draft → HTTP Data parameters and report configuration; validation. |
| `ui/lib/odm-api.ts` | Typed calls through `ctx.owox`. |
| `ui/lib/report-store.ts` | Saved reports in the `reports` collection. |
| `ui/lib/run-snapshot.ts` | Each member's last result of a saved report in the `snapshots` collection. |
| `ui/lib/sheets-sync.ts` | Create/update the linked ODM Google Sheets report. |
| `ui/lib/canvas-model.ts` | Draft → canvas nodes, edges and layout. |
| `ui/features/*` | React screens; props-driven, tested against `ui/sdk-mock.ts`. |
| `ui/vendor/owox-ui/` | Vendored ODM UI; refresh with `npm run sync:ui`. |
| `docs/verification/host-checks.md` | Platform facts verified on a real host. |
