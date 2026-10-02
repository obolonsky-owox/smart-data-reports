# Host checks (spec §10)

Pending: run the probe on a real host (plan Task 3 Step 3) and fill this table before release.

Instance: pending · Date: pending · SDK 0.36.0

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | HTTP Data auto-aggregates a metric with an explicit column list (`1_rowKeys` has `<metric> \| SUM`) | pending | pending |
| 2 | `totals` present on the HTTP Data run (`2_totals_now` / `2_totals_3s`) | pending | pending |
| 3 | `x-owox-run-id` reaches the plugin (`3_runId` not null) | pending | pending |
| 4 | `PUT /api/reports/:id` keeps the spreadsheet (verified in code) | yes | `report.controller.ts` `@Put(':id')` |
| 5 | `document.execCommand('copy')` works in the iframe | pending | pending |
| 6 | Sheets destinations list only those the member can use | pending | pending |
| 7 | `between` with date bounds on TIMESTAMP includes the whole day (`7_between_today` equals `7_relative_today`) | pending | pending |
| 8 | Graph `aliasPath` values equal blendable-schema `aliasPath` values | pending | pending |

Consequences to apply before continuing:
- **2 = after 3 s** → Task 14 Step 3: retry `getRunTotals` once after 3 s when the first read is `null` (the plan already does this).
- **2 = no** → drop the totals row from Task 17 and note it in the spec.
- **3 = no** → totals cannot be read; same as 2 = no.
- **5 = no** → Task 19 ships *Download .sql* only (the plan's default). **5 = yes** → add *Copy* next to it.
- **7 = no** → Task 5: send custom ranges and *Last year* as `gte from` + `lt (to + 1 day)` instead of `between`.
- **8 = no** → Task 18: match graph nodes to instances by `relationship.id` = `AvailableSource.relationshipId` instead of `aliasPath`.
