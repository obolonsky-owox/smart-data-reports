import { DM } from '../fixtures/smart-data';
import { emptyDraft } from './report-draft';
import { createSnapshotStore, parseSnapshot, snapshotRows, toSnapshot, type RunSnapshot } from './run-snapshot';
import type { CollectionDoc, CollectionLike } from './report-store';

const draft = { ...emptyDraft(DM.visitor), columns: [{ name: 'email', aliasPath: '' }, { name: 'visits', aliasPath: '', aggregations: ['SUM' as const] }] };
const rows = Array.from({ length: 50 }, (_, i) => ({ email: `user-${i}@example.com`, 'visits | SUM': i }));
const input = { ranAt: '2026-10-03T12:00:00.000Z', configHash: 'h1', draft, rows, truncated: false, totals: { 'visits | SUM': 1225 }, executedSql: 'SELECT email FROM t' };

it('packs rows as values in key order and reads them back', () => {
  const snapshot = toSnapshot(input);
  expect(snapshot.keys).toEqual(['email', 'visits | SUM']);
  expect(snapshot.rows[1]).toEqual(['user-1@example.com', 1]);
  expect(snapshot.rowCount).toBe(50);
  expect(snapshotRows(snapshot)).toEqual(rows);
});

it('keeps only the leading rows that fit the size limit', () => {
  const full = JSON.stringify(toSnapshot(input)).length;
  const snapshot = toSnapshot(input, full - 200);
  expect(snapshot.rows.length).toBeLessThan(50);
  expect(snapshot.rows.length).toBeGreaterThan(40);
  expect(snapshot.rowCount).toBe(50);
  expect(new TextEncoder().encode(JSON.stringify(snapshot)).length).toBeLessThanOrEqual(full - 200);
  expect(snapshotRows(snapshot)[0]).toEqual(rows[0]);
});

it('measures the limit in UTF-8 bytes', () => {
  const wide = { ...input, rows: [{ email: 'ї'.repeat(100), 'visits | SUM': 1 }] };
  const chars = JSON.stringify(toSnapshot(wide)).length;
  expect(toSnapshot(wide, chars + 10).rows).toHaveLength(0);
});

it('rejects documents that are not snapshots', () => {
  expect(parseSnapshot(toSnapshot(input))).toEqual(toSnapshot(input));
  expect(parseSnapshot(null)).toBeNull();
  expect(parseSnapshot({ ...toSnapshot(input), schemaVersion: 2 })).toBeNull();
  expect(parseSnapshot({ ...toSnapshot(input), draft: {} })).toBeNull();
  expect(parseSnapshot({ ...toSnapshot(input), rows: [1] })).toBeNull();
});

it('reads a snapshot saved before it kept the executed SQL', () => {
  const { executedSql: _sql, ...older } = toSnapshot(input);
  expect(parseSnapshot(older)?.executedSql).toBeNull();
});

it('stores a snapshot under the report id and its main data mart', async () => {
  const docs = new Map<string, CollectionDoc<RunSnapshot>>();
  const collection: CollectionLike<RunSnapshot> = {
    list: async () => ({ items: [...docs.values()], nextCursor: null }),
    get: async (id) => docs.get(id) ?? null,
    put: async (id, document, options) => {
      const doc = { id, parentId: options?.parentId, document, createdAt: '', updatedAt: '' };
      docs.set(id, doc);
      return doc;
    },
    delete: async (id) => void docs.delete(id),
  };
  const store = createSnapshotStore(collection);
  await store.put('r1', toSnapshot(input));
  expect(docs.get('r1')?.parentId).toBe(DM.visitor);
  expect(await store.get('r1')).toEqual(toSnapshot(input));
  expect(await store.get('missing')).toBeNull();
});
