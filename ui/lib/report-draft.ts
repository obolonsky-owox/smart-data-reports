import type { AggregateFunction, DateTruncUnit } from './odm-types';
import type { DateRangeValue } from './date-ranges';
import {
  dateFields, instancesOf, isSameOrDescendant,
  type AliasPath, type FieldInfo, type InstanceInfo, type MartGroup, type SchemaIndex,
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
    filters.push({
      ...filter,
      column: mapped.name,
      aliasPath: mapped.aliasPath,
      sliceOnly: mapped.aliasPath === '' ? false : filter.sliceOnly,
    });
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

/** Whether the instance holds columns, date ranges or filters. */
export function hasSelections(draft: ReportDraft, path: AliasPath): boolean {
  return (
    draft.columns.some((c) => c.aliasPath === path) ||
    draft.dateRanges.some((r) => r.aliasPath === path) ||
    draft.filters.some((f) => f.aliasPath === path)
  );
}

/**
 * The join path a group shows its fields through: the one holding selections, else the user's local
 * `chosen` path, else one already included in the report, else the shallowest.
 */
export function activeVariant(group: MartGroup, draft: ReportDraft, chosen?: AliasPath): InstanceInfo {
  const { instances } = group;
  return (
    instances.find((i) => hasSelections(draft, i.aliasPath)) ??
    instances.find((i) => i.aliasPath === chosen) ??
    instances.find((i) => draft.includedPaths.includes(i.aliasPath)) ??
    instances[0]!
  );
}
