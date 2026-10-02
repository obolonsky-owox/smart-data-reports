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
