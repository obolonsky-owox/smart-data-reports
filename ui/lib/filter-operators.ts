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
  const cast = (s: string) => (kind === 'number' && s !== '' ? Number(s) : s);
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

export function describeFilter(filter: DraftFilter, kind?: FieldKind): string {
  const option = (kind ? operatorsFor(kind).find((o) => o.operator === filter.operator) : undefined) ?? operatorOption(filter.operator);
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

export function newFilterId(): string {
  return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
