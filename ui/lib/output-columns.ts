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
