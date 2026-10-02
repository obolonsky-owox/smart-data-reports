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
