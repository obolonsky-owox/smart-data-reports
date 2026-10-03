import type { AggregateFunction, DateTruncUnit } from './odm-types';
import { fieldKind, type FieldInfo } from './schema-index';

/** ODM's own names for aggregate functions, shared by the column picker and the table header. */
export const FN_LABEL: Record<AggregateFunction, string> = {
  SUM: 'Sum', AVG: 'Average', MIN: 'Min', MAX: 'Max', COUNT: 'Count', COUNT_DISTINCT: 'Count unique',
  ANY_VALUE: 'Sample', STRING_AGG: 'Combined', P25: '25th percentile', P50: 'Median', P75: '75th percentile', P95: '95th percentile',
};

/** Date buckets; 'FULL' means no bucket at all. */
export const TRUNC_OPTIONS: { unit: DateTruncUnit | 'FULL'; label: string }[] = [
  { unit: 'FULL', label: 'Full date' },
  { unit: 'DAY', label: 'Day' },
  { unit: 'WEEK', label: 'Week' },
  { unit: 'MONTH', label: 'Month' },
  { unit: 'QUARTER', label: 'Quarter' },
  { unit: 'YEAR', label: 'Year' },
];

/** The functions ODM allows for a field, or a sensible default by field kind when it names none. */
export function aggregationsFor(field: FieldInfo): AggregateFunction[] {
  if (field.allowedAggregations?.length) return field.allowedAggregations;
  // Aggregation runs after the join, on the joined value.
  const kind = field.joinedType ? fieldKind(field.joinedType) : field.kind;
  if (kind === 'number') return ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'COUNT_DISTINCT'];
  if (kind === 'date') return ['MIN', 'MAX', 'COUNT_DISTINCT'];
  if (kind === 'text') return ['COUNT', 'COUNT_DISTINCT'];
  return [];
}
