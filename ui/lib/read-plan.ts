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
  | { kind: 'sort-not-selected'; column: string }
  | { kind: 'custom-range-incomplete'; column: string }
  | { kind: 'custom-range-reversed'; column: string }
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
  for (const { column, range } of draft.dateRanges) {
    if (range.kind !== 'custom') continue;
    if (!range.from || !range.to) issues.push({ kind: 'custom-range-incomplete', column });
    // ISO dates (YYYY-MM-DD) compare correctly as strings.
    else if (range.from > range.to) issues.push({ kind: 'custom-range-reversed', column });
  }
  const selected = new Set(draft.columns.map((c) => c.name));
  for (const sort of draft.sorts) {
    if (!selected.has(sort.column)) issues.push({ kind: 'sort-not-selected', column: sort.column });
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
    case 'sort-not-selected': {
      const label = index.fields.get(issue.column)?.label ?? issue.column;
      return `The report is sorted by "${label}", which isn't one of its columns. Remove that sort or add the column.`;
    }
    case 'custom-range-incomplete':
      return 'Fill in both dates of every custom period.';
    case 'custom-range-reversed':
      return "A period can't end before it starts.";
    case 'filter-needs-value':
      return 'Fill in a value for every filter.';
    case 'too-many-values':
      return `A filter can match at most ${MAX_IN_VALUES} values.`;
    case 'too-long':
      return 'Too many filters for one query. Remove some or create a Google Sheets report.';
  }
}
