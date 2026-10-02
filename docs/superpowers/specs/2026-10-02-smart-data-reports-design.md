# Smart Data Reports — design

Date: 2026-10-02
Status: approved in brainstorming, pending written-spec review

## 1. Purpose

An OWOX Data Marts (ODM) plugin that lets a business user build an ad-hoc report on the
project's data marts with checkboxes and see the result in seconds, inside ODM. The interface is
modelled on the former OWOX Smart Data product (data table, entity-relationship canvas, SQL tab,
right-side column panel with *All* / *Selected*).

**The plugin is a thin shell over ODM.** ODM builds the SQL, resolves joins, prevents fan-out,
aggregates, computes totals, and executes. The plugin never composes SQL and never recomputes
numbers. If ODM cannot do something, the plugin does not fake it.

Success criteria:

- A user picks a main data mart, ticks columns from it and from joinable data marts, and sees
  rows after one *Apply*.
- Every date column the report depends on has its own period; the default is the last 30 days.
- The join path is always one of the relationships defined in the project, and the user sees
  which path and which join keys are used.
- The result never exceeds 2,500 rows; anything larger is routed to a Google Sheets report built
  from the same configuration.

## 2. Platform facts this design relies on

Verified against `OWOX/owox-data-marts` `origin/main` on 2026-10-02 (plugin SDK 0.36.0).

| Fact | Source |
| --- | --- |
| Rows for a data mart are readable by a plugin only through `GET /api/external/http-data/data-marts/:id.ndjson` (`ctx.owox.dataMarts.traverseData`). `POST /api/data-marts/:id/preview` is `@RejectPluginAuth`. | `apps/backend/src/data-marts/controllers/external/http-data.controller.ts`, `data-mart-preview.controller.ts` |
| HTTP Data accepts `column`, `filter`, `sort`, `aggregation`, `dateTrunc` (base64url JSON, ≤ 8,192 chars each) and `limit`. There is no offset. | `apps/backend/src/data-marts/dto/schemas/http-data-query.schema.ts` |
| Every HTTP Data call creates an `HTTP_DATA` run and consumes credits. The run id comes back in `x-owox-run-id`; totals are on `GET /api/data-marts/:id/runs/:runId`. | `use-cases/stream-http-data.service.ts`, `mappers/data-mart.mapper.ts` |
| Ad-hoc runs do not capture SQL (`captureExecutionSql: false`). Only saved reports expose SQL via `GET /api/reports/:id/generated-sql`. | `use-cases/stream-http-data.service.ts:181`, `controllers/report.controller.ts:166` |
| Fields reachable through joins come from `GET /api/data-marts/:id/blendable-schema`; each joined path is identified by `aliasPath`, each joined field by a unified SQL-safe name. One data mart can be reached through several paths at once. | `dto/domain/blendable-schema.dto.ts`, `services/blended-field-name.ts` |
| Relationships are directional (source → target), equality joins only, always `LEFT JOIN`, no cardinality field. Grain impact is exposed per path as `mainGrainMultiplication` / `mainGrainCollapse`. | `entities/data-mart-relationship.entity.ts`, `blending/blended-sql-dialect.ts` |
| Join keys per edge come from `GET /api/data-marts/:id/relationships/graph` (`relationship.joinConditions`). | `dto/presentation/relationship-graph-response-api.dto.ts` |
| Filters with `placement: 'pre-join'` are *slices* (narrow the joined mart before the join); default filters act on the joined result. | `docs/getting-started/setup-guide/output-controls.md` |
| `relative_date` with `last_n_days: n` renders `>= CURRENT_DATE - n AND <= CURRENT_DATE`, i.e. n + 1 days including today. | `bigquery/services/bigquery-clause-renderer.ts:227` |
| A report with a metric column and no aggregation is auto-aggregated by ODM (`sessions \| SUM`). Confirmed for reports; to verify for HTTP Data (see §10). | `docs/getting-started/setup-guide/report-aggregations.md` |
| `POST /api/reports` takes the same `columnConfig` / `filterConfig` / `sortConfig` / `aggregationConfig` / `dateTruncConfig` as HTTP Data. A plugin can create reports and run them, but cannot create a Google Sheets destination (OAuth routes are `@RejectPluginAuth`). | `dto/presentation/create-report-request-api.dto.ts`, `controllers/data-destination.controller.ts` |
| The iframe sandbox is `allow-scripts allow-downloads` with `allow=''`: downloads work, the Clipboard API does not. Theme is read once at mount. | `apps/web/src/pages/plugins/runtime/PluginRuntimePage.tsx` |
| `@owox/ui` is internal; plugins keep a local copy of the tokens. | `docs/plugins/authoring-guide.md:189-292` |

## 3. Architecture

A static React SPA on GitHub Pages, loaded by ODM in its plugin iframe. No backend of its own.

```
ui/
  bootstrap.tsx, main.tsx, App.tsx      entry, connect(), theme, error boundary
  lib/                                  no React imports; unit-tested
    plugin-runtime.ts                   memoized connect()
    odm-api.ts                          typed wrappers over ctx.owox
    schema-index.ts                     blendable-schema → marts, paths, fields
    report-draft.ts                     the report state and its rules
    read-plan.ts                        draft → HTTP Data params / report payload
    date-ranges.ts                      presets → relative_date / between
    report-store.ts                     `reports` collection (de)serialization
    errors.ts                           PluginTransportError payload → user message
  components/ui/                        local shadcn/ui primitives (see §9)
  features/
    reports-list/                       saved reports screen
    editor/                             toolbar, tabs, column panel
    data-table/                         result table, totals, pagination, banner
    relationship-canvas/                @xyflow/react + dagre canvas
    sql-tab/
    sheets-report/                      create / update Google Sheets report dialog
  styles/tokens.css                     vendored ODM tokens (see §9)
```

### `odm-api.ts`

| Function | Call |
| --- | --- |
| `listDataMarts()` | `ctx.owox.dataMarts.list` (all pages) |
| `getBlendableSchema(id)` | `GET /api/data-marts/:id/blendable-schema` |
| `getRelationshipGraph(id)` | `GET /api/data-marts/:id/relationships/graph` |
| `runQuery(id, params, signal)` | `traverseData` → `{ rows, runId, truncated }` |
| `getRunTotals(id, runId)` | `GET /api/data-marts/:id/runs/:runId` → `totals` |
| `listSheetsDestinations()` | `GET /api/data-destinations/by-type/GOOGLE_SHEETS` |
| `createSpreadsheet(destId, title)` | `POST /api/data-destinations/:id/google-sheets/documents` |
| `createReport(payload)` / `updateReport(id, payload)` | `POST /api/reports` / update endpoint (exact verb verified in §10) |
| `runReport(id)` / `getReport(id)` | `POST /api/reports/:id/run` / `GET /api/reports/:id` |
| `getReportSql(id)` | `GET /api/reports/:id/generated-sql` |

### Data flow

1. The user picks the main data mart. The plugin loads its blendable schema and relationship
   graph.
2. Edits change only the in-memory draft. No query runs.
3. *Apply* builds HTTP Data params with `limit: 2501` and streams the rows into memory. Queries
   never run automatically, because every run costs credits.
4. If row 2,501 arrives, the plugin keeps 2,500 and shows the limit banner.
5. Pagination (100 rows per page) slices the in-memory rows; it never re-queries.
6. Totals are read from the run once the stream ends.
7. A new *Apply* cancels a running one.

## 4. Report draft model

```ts
type AliasPath = string;            // '' for the main mart, else ODM aliasPath, e.g. 'sessions.pageviews'

interface ReportDraft {
  mainDataMartId: string;
  includedPaths: AliasPath[];       // instances on the canvas, with or without columns
  columns: DraftColumn[];           // display order
  dateRanges: DraftDateRange[];
  filters: DraftFilter[];
  sorts: { column: string; direction: 'asc' | 'desc' }[];   // priority order
}

interface DraftColumn {
  name: string;                     // native name, or ODM unified blended name
  aliasPath: AliasPath;
  aggregations?: AggregateFunction[];   // absent = let ODM decide
  aggregationOptOut?: boolean;          // user removed ODM's automatic aggregation
  dateTrunc?: 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';
}

interface DraftDateRange {
  column: string;
  aliasPath: AliasPath;
  range: DateRangePreset | { from: string; to: string } | 'all-time';
  autoAdded: boolean;
}

interface DraftFilter {
  column: string;
  aliasPath: AliasPath;
  operator: FilterOperator;
  value?: unknown;
  sliceOnly: boolean;               // joined marts only: placement 'pre-join'
}
```

A data-mart *instance* is identified by its `aliasPath`, never by the data mart id, because the
same data mart can be included through several paths at once.

### Rules (all in `report-draft.ts`)

- **Auto-added dates.** When the first column of an instance is added and that instance's mart
  has date fields (`DATE`, `DATETIME`, `TIMESTAMP` and the dialect equivalents):
  - one date field → add a date range on it with *Last 30 days*;
  - several → the UI asks which one, with a *Don't add a date* option;
  - the range is a filter on the main mart and a slice on a joined instance;
  - an auto-added range can be removed like any other; removing it is respected for that
    instance.
- **Change main mart.** Keep instances reachable from the new main (re-resolved against its
  blendable schema); list the columns, ranges and filters that would be dropped and ask before
  dropping them.
- **Delete instance.** Removes the instance, its columns, ranges and filters, and every instance
  whose path starts with it.
- **Change path of an instance.** Moves its columns, ranges and filters to the new path when the
  new path exposes the same fields; fields that do not exist there are listed and dropped after
  confirmation.

## 5. Read plan (`read-plan.ts`)

One pure function, `toReadPlan(draft)`, produces the ODM read-plan shape, used both for HTTP Data
and for `POST /api/reports`:

- `column` — `columns` names in display order.
- `filter` — date ranges + filters. Main-mart date ranges and ordinary filters have no placement;
  joined-instance date ranges and `sliceOnly` filters get `placement: 'pre-join'`.
- *Last N days* → `{ operator: 'relative_date', value: { kind: 'last_n_days', n: N - 1 } }`, so
  the range is N days **including today**. Other presets map to their `relative_date` kinds;
  custom ranges map to `between`.
- `sort`, `aggregation`, `dateTrunc` — straight from the draft.
- `limit` — `2501` for HTTP Data; omitted for reports (the whole point of a report).

Before *Apply*, the plugin validates: every filter has a value where the operator needs one; an
`in` list has 1–500 values; every encoded parameter is ≤ 8,192 characters (otherwise: "Too many
filters for one query. Remove some or create a Google Sheets report.").

## 6. Screens

### 6.1 Reports list (first screen)

`dm-page` with header "Reports" and a *New report* button. A `.dm-card` table: title, main data
mart, author, updated (relative time). Loading → skeleton; empty → empty state ("Build your first
report", CTA *New report*); error → inline destructive alert with *Retry*.

### 6.2 Editor

Header: report title (click to edit), *Save* (or *Save and update Google Sheets* when linked),
*Create Google Sheets report* / *Update Google Sheets*. Underline tabs: **Data table**, **Entity
relationship**, **SQL**. Right side: column panel. Below 900 px the panel becomes a sheet opened
from the toolbar.

### 6.3 Column panel

Pills tabs **All** / **Selected (n)**, and *Apply* at the bottom (disabled while the draft equals
the last applied one).

**All**

- "Report on: [main data mart ▾]" and the grain line "1 row = 1 \<main mart title\>".
- Search across all reachable fields.
- One group per data mart reachable from the main mart, with an info tooltip carrying the mart's
  description. A mart used through several paths shows one sub-section per used instance
  ("Page · via Session › Pageview", "Page · via Landing"). *+ via another path* in the group
  header adds another instance.
- Field row: type badge (ABC / 123 / DD / BOOL), checkbox, label (`alias` or `name`), info tooltip
  with the field description, filter icon on hover. Fields hidden for reporting are not shown.
- Path chip under each instance: "via Session › Pageview" with a tooltip listing each hop's join
  description. Click → change path.
- The first checkbox in a mart that has more than one path opens the path dialog: each path as a
  chain of mart titles, each hop's join description, and a "Multiplies rows" warning when ODM
  marks the path as `multiplies`.
- Footer: "\<n\> data marts can't be reached from \<main\>" with a tooltip that relationships run
  one way and the list of those marts.

**Selected** — three sections, as in Smart Data:

- **Date ranges** — each with mart label, preset, *+ Date*.
- **Filters** — each with mart label, operator and value; *Only narrow \<mart\>* switch on joined
  instances (slice); *+ Filter*.
- **Columns** — drag to reorder, mart label on the right.

Filter operators by type:

| Type | Operators |
| --- | --- |
| Text | is, is not, contains, doesn't contain, starts with, ends with, is any of, is empty, is not empty |
| Number | =, ≠, >, ≥, <, ≤, between, is empty, is not empty |
| Boolean | is true, is false |
| Date | only through Date ranges |

Date presets: Today, Yesterday, Last 7 / 14 / 30 / 90 days, This / Last week, This / Last month,
This / Last quarter, This / Last year, Custom, All time.

### 6.4 Data table

- Column header: mart label with path (small), field label, sort arrow with priority number,
  filter chip below ("is not empty ×"), ⋮ menu: *Filter ▸*, *Sort ▸* (A→Z, Z→A, Unsorted),
  *Aggregation ▸* (functions from the field's `allowedAggregations`, plus *None*), and *Date
  bucket ▸* (Full date / Day / Week / Month / Quarter / Year) on date fields. No *Rename* in v1:
  ODM read plans carry no column alias, so a plugin-only name would not reach Google Sheets.
- Aggregations ODM applied automatically are shown as chosen ("Automatic" hint) and can be
  changed or removed; removing them sets `aggregationOptOut`.
- Totals row under the header from the run's `totals`; the cell shows the column's own function,
  a tooltip shows the rest.
- Pagination: 100 rows per page, "1–100 of 2,500", previous / next.
- States: before first *Apply* — "Pick columns and click Apply"; running — skeleton rows and
  *Cancel*; 0 rows — "No rows for this period" with a hint to widen the date ranges; error — see
  §8.
- Limit banner when truncated: "Showing the first 2,500 rows. Need more? Create a Google Sheets
  report with this configuration." + button.

### 6.5 Entity relationship canvas

- Nodes are instances: the main mart (home icon), instances with selected columns, and transit
  instances on their paths (muted). The same mart can appear in several branches.
- Edges are drawn left → right (dagre). In the gap of each edge: the join keys
  (`visitor_id = visitor_id`, several conditions stacked) and a grain marker: "×N" for
  `multiplies`, "?" for `unknown`.
- Selecting a node shows *Add object* (only targets that have a relationship *from* this
  instance, with `targetAlias` and description), *Set as main*, *Delete*.
- An added instance without columns expands its group in the column panel.

### 6.6 SQL tab

- Draft not linked to a Google Sheets report: "ODM doesn't return SQL for ad-hoc queries yet.
  Create a Google Sheets report with this configuration to get both the SQL and the report." +
  button.
- Linked: read-only SQL from `GET /api/reports/:id/generated-sql` with syntax highlighting and
  *Download .sql*. If the draft changed since the report was last updated: warning "This SQL
  belongs to the Google Sheets report, not to your current changes." + *Update report*.
- Clipboard API is blocked in the iframe; a `document.execCommand('copy')` fallback is added only
  if §10 shows it works.

## 7. Persistence and Google Sheets

### 7.1 `reports` collection

```json
{
  "name": "reports",
  "scope": "project",
  "entityBinding": {
    "type": "data-mart",
    "actions": { "read": "USE", "create": "USE", "update": "USE", "delete": "USE" }
  }
}
```

- `parentId` = main data mart id. Anyone who can query the main mart can see and change its
  reports.
- Overwriting someone else's report is guarded in the UI only: when the current user is not the
  author, *Save* defaults to *Save as copy*; overwriting asks for confirmation.
- Changing the main mart changes `parentId`: put the document under the new parent first, then
  delete the old one.
- Listing pages with `cursor` until it is `null` (entity-bound pages may be short or empty).
- Unsaved changes live in memory only; *Save* shows an "Unsaved changes" dot.
- This declaration is final from the first release: `name`, `scope` and `entityBinding` cannot
  change afterwards.

Document:

```ts
interface StoredReport {
  schemaVersion: 1;
  title: string;
  draft: ReportDraft;
  createdBy: string;                 // ctx.userId
  updatedBy: string;
  linkedReport?: {
    reportId: string;
    destinationId: string;
    spreadsheetId: string;
    sheetId: number;
    syncedDraftHash: string;         // to detect "draft changed since last update"
  };
}
```

The read plan is never stored; it is derived from `draft`. A column that no longer exists in the
schema shows as "Unavailable" with *Remove*.

### 7.2 Google Sheets report

A saved report links to at most one ODM Google Sheets report, and that spreadsheet never changes.

*Create* (report not linked yet):

1. Dialog: report title (default: the saved report's title) and a Google Sheets destination from
   `listSheetsDestinations()`. If there is none: "Connect Google Sheets in Destinations first" +
   *Open Destinations* (`ctx.ui.navigate`).
2. Create a new spreadsheet in that destination.
3. `POST /api/reports` with `toReadPlan(draft)` minus `limit`, then `POST /api/reports/:id/run`;
   poll `GET /api/reports/:id` until the run finishes.
4. Store `linkedReport` and save the document (an unsaved draft is saved first; the dialog asks
   for a title).
5. Success: *Open spreadsheet* (`ctx.ui.openExternal`) and *Open report in ODM*
   (`ctx.ui.navigate`).

*Update* (report linked): *Save* on a linked report updates the ODM report's configuration with
the current read plan and runs it, so changes land in the same spreadsheet. If the ODM report is
gone (404), the link is removed and the user is offered *Create Google Sheets report*.

## 8. Errors

The SDK error class is not exported; classify by `error.name === 'PluginTransportError'` and
`error.payload.code`.

| Code | Message |
| --- | --- |
| `FORBIDDEN` | "You don't have access to \<mart\>." |
| `HTTP_ERROR` 400 | ODM's message as-is (for example, a HAVING filter on a joined metric) |
| `NETWORK_ERROR`, `TIMEOUT` | "Couldn't reach OWOX Data Marts." + *Retry* |
| `SUSPENDED` | "This plugin was suspended by an administrator." |
| other | "Something went wrong." + details in a collapsible block |

Failed mutations (save, create report) → `toast.error`; successful ones → `toast.success`.

## 9. Design system

Follow the OWOX Data Marts design system
(`OWOX/owox-factory/.agents/skills/owox-data-marts-design`): enterprise, dense, semantic tokens,
light/dark through `.dark` on `<html>`.

- **Tokens.** `@owox/ui` cannot be imported by a plugin, so `ui/styles/tokens.css` is a vendored
  copy of the token, semantic-colour and `dm-*` sections of
  `owox-data-marts/packages/ui/src/styles/globals.css`, with a header naming the source commit.
  `npm run sync:tokens -- <ref>` refreshes it from a given ref; no hand edits.
- **Stack matched to the product:** React 19, Vite 6, TypeScript 5.9, Tailwind CSS v4 (CSS-first),
  shadcn/ui primitives generated into `ui/components/ui/` over Radix, `lucide-react`, TanStack
  Table v8, `@xyflow/react` + `@dagrejs/dagre`, `@dnd-kit` for column reordering, Sonner toasts.
- **Patterns used:** `dm-page` / `dm-page-header` / `dm-page-content`; `.dm-card` for the reports
  list; underline `Tabs` for page sections and pills `Tabs` in the panel; `Sheet` for the narrow
  layout; `Dialog` for path choice and Google Sheets; `AlertDialog` for destructive confirmations
  (drop columns, overwrite, delete); `Popover` for filters; `Badge` for type badges; `Alert` for
  the limit banner and inline errors; `dm-empty-state` for empty states; `Skeleton` while loading.
- **Rules:** no hard-coded colours, no `text-gray-*` for semantic text, no `bg-white` without a
  dark equivalent, Lucide icons at `h-4 w-4` in controls, native system font stack, no web fonts.
- **Copy:** English, sentence case, "you", precise numbers ("2,500 rows"), no emoji.
- **Theme:** apply `ctx.theme` once at mount.

## 10. Step 0 — verify on a real host before building on it

Through the tunnel + debug-manifest loop from the workspace `CLAUDE.md`, on cloud:

1. HTTP Data applies ODM's automatic aggregation for an explicit column list with a metric, and
   how a removed automatic aggregation is expressed there. Reports have
   `autoAggregationOptOut`; if HTTP Data has no equivalent, `aggregationOptOut` is dropped from
   the draft and *None* is not offered on columns ODM aggregates automatically.
2. `totals` are present on the HTTP Data run.
3. `x-owox-run-id` reaches the plugin.
4. The exact verb and path for updating a report's configuration.
5. `document.execCommand('copy')` works in the plugin iframe.
6. `GET /api/data-destinations/by-type/GOOGLE_SHEETS` returns only destinations the member can
   use.

Any "no" changes the matching section of this spec before implementation continues.

## 11. Testing

- **Unit (vitest)** for `ui/lib/*`: schema grouping and multiple paths to one mart; auto-date rules
  (one date, several, *Don't add*, removal respected); change main / delete instance / change path
  pruning; read plan (filter vs slice placement, `n - 1`, `limit: 2501`, report payload without
  limit); date presets; validation limits; `StoredReport` round-trip; error classification.
- **Components (Testing Library + happy-dom)** against `ui/sdk-mock.ts` with a Smart Data-like
  fixture — Visitor, Contact, User, Session, Pageview, Page, plus a second path to Page: path
  dialog; limit banner at 2,501 rows; pagination; SQL tab states; create and update Google
  Sheets; save as copy for a non-author.
- **Manual on a real host:** personal install, light and dark, narrow and wide, every state in
  §6.

## 12. Repository and release

- Repo `OWOX/smart-data-reports`, display name "Smart Data Reports", Pages URL
  `https://owox.github.io/smart-data-reports/`, Vite `base: '/smart-data-reports/'`.
- Conventions from `import-model`, minus its known gaps: `@owox/plugin-sdk` at 0.36.x; `tsconfig`
  does not alias the SDK to the mock (only Vite serve and vitest do); ESLint with a `lint` script
  and a lint step in CI; no stale config entries.
- CI: lint, typecheck, test, build, deploy to Pages on push to `main`.
- First release `v0.1.0`. Below 1.0.0 the collection compatibility line is the minor version.
- Definition of done: the workspace `CLAUDE.md` list.

## 13. Out of scope for v1

- Pre-run cost estimate (needs raw SQL and EDIT rights; bytes only on BigQuery and Snowflake).
- SQL for ad-hoc queries (needs an ODM change; the SQL tab routes to a Google Sheets report).
- Column rename.
- Writing into an existing spreadsheet chosen by URL.
- Creating a Google Sheets destination from the plugin.
- Charts.
