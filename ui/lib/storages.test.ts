import type { DataMartSummary, StorageSummary } from './odm-types';
import { groupByStorage, loadStorageMembership } from './storages';

const mart = (id: string, extra: Partial<DataMartSummary> = {}): DataMartSummary => ({
  id, title: id.toUpperCase(), description: null, status: 'PUBLISHED', availableForReporting: true, storage: { type: 'GOOGLE_BIGQUERY' }, ...extra,
});

const storages: StorageSummary[] = [
  { id: 's-bq', title: 'BigQuery', type: 'GOOGLE_BIGQUERY' },
  { id: 's-empty', title: 'Empty', type: 'GOOGLE_BIGQUERY' },
  { id: 's-sf', title: 'Snowflake', type: 'SNOWFLAKE' },
];
const martIds = { 's-bq': ['a', 'b', 'draft', 'hidden'], 's-empty': ['only-draft'], 's-sf': ['c'] };
const marts = [
  mart('a'), mart('b'), mart('c', { storage: { type: 'SNOWFLAKE' } }),
  mart('draft', { status: 'DRAFT' }), mart('hidden', { availableForReporting: false }), mart('only-draft', { status: 'DRAFT' }),
];

it('groups reportable data marts by storage, in storage order', () => {
  const catalog = groupByStorage(storages, martIds, marts);
  expect(catalog.groups.map((g) => [g.storage.id, g.marts.map((m) => m.id)])).toEqual([
    ['s-bq', ['a', 'b']],
    ['s-sf', ['c']],
  ]);
});

it('keeps only published data marts available for reporting', () => {
  const { groups } = groupByStorage(storages, martIds, marts);
  expect(groups.flatMap((g) => g.marts).every((m) => m.status === 'PUBLISHED' && m.availableForReporting)).toBe(true);
});

it('skips storages without a reportable data mart', () => {
  expect(groupByStorage(storages, martIds, marts).groups.map((g) => g.storage.id)).not.toContain('s-empty');
  expect(groupByStorage(storages, {}, marts).groups).toEqual([]);
});

it('finds the storage of a data mart', () => {
  const catalog = groupByStorage(storages, martIds, marts);
  expect(catalog.storageOf('a')).toBe('s-bq');
  expect(catalog.storageOf('c')).toBe('s-sf');
  expect(catalog.storageOf('draft')).toBe('s-bq');
  expect(catalog.storageOf('unknown')).toBeUndefined();
});

it('lists reportable data marts that no storage claims', () => {
  const catalog = groupByStorage(storages, { 's-bq': ['a'] }, marts);
  expect(catalog.unassigned.map((m) => m.id)).toEqual(['b', 'c']);
  expect(groupByStorage(storages, martIds, marts).unassigned).toEqual([]);
});

it('drops only the storages whose data marts failed to load', async () => {
  const membership = await loadStorageMembership({
    listStorages: async () => storages,
    listStorageMartIds: async (id: string) => {
      if (id === 's-sf') throw new Error('Forbidden');
      return martIds[id as keyof typeof martIds];
    },
  });
  expect(membership.storages.map((s) => s.id)).toEqual(['s-bq', 's-empty']);
  const catalog = groupByStorage(membership.storages, membership.martIdsByStorage, marts);
  expect(catalog.groups.map((g) => g.storage.id)).toEqual(['s-bq']);
  // Its reportable data mart has no storage now, so the editor falls back to the flat list.
  expect(catalog.unassigned.map((m) => m.id)).toEqual(['c']);
});

it('fails when the storages themselves cannot be listed', async () => {
  const api = { listStorages: async () => Promise.reject(new Error('boom')), listStorageMartIds: async () => [] };
  await expect(loadStorageMembership(api)).rejects.toThrow('boom');
});
