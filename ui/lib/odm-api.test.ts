import { vi } from 'vitest';
import { DATA_MARTS, DM, sampleRows } from '../fixtures/smart-data';
import { createOdmApi, type OwoxClient, type Traversal } from './odm-api';
import { QUERY_LIMIT, type ReportConfig } from './read-plan';
import type { Row } from './odm-types';

function traversal(rows: Row[], chunk = 500): Traversal & { cancelled: boolean } {
  const t = {
    runId: 'run-1',
    cancelled: false,
    async *rowChunks() {
      for (let i = 0; i < rows.length; i += chunk) {
        if (t.cancelled) return;
        yield rows.slice(i, i + chunk);
      }
    },
    async cancel() {
      t.cancelled = true;
    },
  };
  return t;
}

function fakeOwox(overrides: Partial<OwoxClient> = {}) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const owox: OwoxClient = {
    dataMarts: { list: async () => DATA_MARTS, traverseData: async () => traversal([]) },
    storages: { list: async () => [] },
    models: { getDataMarts: async () => ({ items: [], total: 0, nextOffset: null }) },
    getJson: async <T,>(path: string) => {
      calls.push({ method: 'GET', path });
      return {} as T;
    },
    postJson: async <T,>(path: string, body: unknown) => {
      calls.push({ method: 'POST', path, body });
      return { id: 'report-1' } as T;
    },
    putJson: async <T,>(path: string, body: unknown) => {
      calls.push({ method: 'PUT', path, body });
      return {} as T;
    },
    ...overrides,
  };
  return { owox, calls };
}

const options = { column: ['email'], filter: null, sort: null, aggregation: null, dateTrunc: null, limit: QUERY_LIMIT };
const config: ReportConfig = { columnConfig: ['email'], filterConfig: null, sortConfig: null, aggregationConfig: null, dateTruncConfig: null };

describe('runQuery', () => {
  it('collects all rows when under the cap', async () => {
    const { owox } = fakeOwox({ dataMarts: { list: async () => [], traverseData: async () => traversal(sampleRows(['email'], 120)) } });
    const result = await createOdmApi(owox).runQuery(DM.visitor, options);
    expect(result).toMatchObject({ truncated: false, runId: 'run-1' });
    expect(result.rows).toHaveLength(120);
  });

  it('stops at 2,500 rows and reports truncation when row 2,501 arrives', async () => {
    const t = traversal(sampleRows(['email'], 3000));
    const { owox } = fakeOwox({ dataMarts: { list: async () => [], traverseData: async () => t } });
    const result = await createOdmApi(owox).runQuery(DM.visitor, options);
    expect(result.truncated).toBe(true);
    expect(result.rows).toHaveLength(2500);
    expect(t.cancelled).toBe(true);
  });

  it('does not start a run when the signal is already aborted', async () => {
    const traverseData = vi.fn(async () => traversal([]));
    const { owox } = fakeOwox({ dataMarts: { list: async () => [], traverseData } });
    const controller = new AbortController();
    controller.abort();
    await expect(createOdmApi(owox).runQuery(DM.visitor, options, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(traverseData).not.toHaveBeenCalled();
  });

  it('keeps exactly 2,500 rows without truncation', async () => {
    const { owox } = fakeOwox({ dataMarts: { list: async () => [], traverseData: async () => traversal(sampleRows(['email'], 2500)) } });
    const result = await createOdmApi(owox).runQuery(DM.visitor, options);
    expect(result.truncated).toBe(false);
    expect(result.rows).toHaveLength(2500);
  });

  it('interrupts a stream that is waiting for the next chunk, like the real client', async () => {
    const stuck: Traversal = {
      runId: 'run-1',
      async *rowChunks() {
        yield sampleRows(['email'], 10);
        await new Promise<never>(() => undefined);
      },
      async cancel() {},
    };
    const { owox } = fakeOwox({ dataMarts: { list: async () => [], traverseData: async () => stuck } });
    const controller = new AbortController();
    const pending = createOdmApi(owox).runQuery(DM.visitor, options, controller.signal);
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

it('lists only published data marts available for reporting, by title', async () => {
  const marts = [
    { ...DATA_MARTS[0]!, title: 'Zeta' },
    { ...DATA_MARTS[1]!, title: 'Alpha' },
    { ...DATA_MARTS[2]!, status: 'DRAFT' as const },
    { ...DATA_MARTS[3]!, availableForReporting: false },
  ];
  const { owox } = fakeOwox({ dataMarts: { list: async () => marts, traverseData: async () => traversal([]) } });
  expect((await createOdmApi(owox).listDataMarts()).map((m) => m.title)).toEqual(['Alpha', 'Zeta']);
});

it('falls back to raw pages when the client rejects one unexpected data mart', async () => {
  const pages: Record<string, unknown> = {
    '': { items: [{ ...DATA_MARTS[0]!, title: 'Zeta', storage: { type: 'NEW_WAREHOUSE' } }, { id: 'broken' }], total: 4, nextOffset: 2 },
    '2': {
      items: [
        { id: 'dm-a', title: 'Alpha', status: 'PUBLISHED', availableForReporting: true },
        { id: 'dm-d', title: 'Draft', status: 'DRAFT', availableForReporting: true },
        { id: 'dm-h', title: 'Hidden', status: 'PUBLISHED', availableForReporting: false },
      ],
      total: 5,
      nextOffset: null,
    },
  };
  const queries: (Record<string, string> | undefined)[] = [];
  const { owox } = fakeOwox({
    dataMarts: { list: async () => { throw new Error('OWOX Data Marts API returned an unexpected response shape'); }, traverseData: async () => traversal([]) },
    getJson: async <T,>(path: string, query?: Record<string, string>) => {
      expect(path).toBe('/api/data-marts');
      queries.push(query);
      return pages[query?.offset ?? ''] as T;
    },
  });
  const marts = await createOdmApi(owox).listDataMarts();
  expect(marts.map((m) => m.id)).toEqual(['dm-a', DATA_MARTS[0]!.id]);
  expect(marts[0]).toEqual({ id: 'dm-a', title: 'Alpha', description: null, status: 'PUBLISHED', availableForReporting: true, storage: { type: '' } });
  expect(queries).toEqual([undefined, { offset: '2' }]);
});

describe('storages', () => {
  const node = (id: string) => ({ id, title: id, status: 'PUBLISHED' as const, description: null, fieldCount: 1 });

  it('lists storages without the extra fields the client passes through', async () => {
    const { owox } = fakeOwox({
      storages: { list: async () => [{ id: 's1', title: 'Warehouse', type: 'GOOGLE_BIGQUERY', credentials: 'x' } as never] },
    });
    expect(await createOdmApi(owox).listStorages()).toEqual([{ id: 's1', title: 'Warehouse', type: 'GOOGLE_BIGQUERY' }]);
  });

  it('pages the data marts of a storage until there is no next offset', async () => {
    const pages: Record<string, { items: ReturnType<typeof node>[]; total: number; nextOffset: number | null }> = {
      start: { items: [node('a'), node('b')], total: 3, nextOffset: 2 },
      2: { items: [node('c')], total: 3, nextOffset: null },
    };
    const getDataMarts = vi.fn(async (_storageId: string, offset?: number) => pages[offset ?? 'start']!);
    const { owox } = fakeOwox({ models: { getDataMarts } });
    expect(await createOdmApi(owox).listStorageMartIds('s1')).toEqual(['a', 'b', 'c']);
    expect(getDataMarts.mock.calls).toEqual([['s1', undefined], ['s1', 2]]);
  });

  it('stops on a repeated offset instead of looping forever', async () => {
    const { owox } = fakeOwox({ models: { getDataMarts: async () => ({ items: [node('a')], total: 9, nextOffset: 1 }) } });
    await expect(createOdmApi(owox).listStorageMartIds('s1')).rejects.toThrow('repeated nextOffset 1');
  });
});

it('creates and updates Google Sheets reports with the read plan', async () => {
  const { owox, calls } = fakeOwox();
  const api = createOdmApi(owox);
  const target = { title: 'Visitors', destinationId: 'dest/1', spreadsheetId: 'sheet-1', sheetId: 0, config };
  await api.createReport(DM.visitor, target);
  await api.updateReport('report-1', target);
  expect(calls[0]).toEqual({
    method: 'POST', path: '/api/reports',
    body: {
      dataMartId: DM.visitor, title: 'Visitors', dataDestinationId: 'dest/1',
      destinationConfig: { type: 'google-sheets-config', spreadsheetId: 'sheet-1', sheetId: 0 }, ...config,
    },
  });
  expect(calls[1]?.path).toBe('/api/reports/report-1');
  expect(calls[1]?.body).not.toHaveProperty('dataMartId');
});

it('encodes ids in paths', async () => {
  const { owox, calls } = fakeOwox();
  await createOdmApi(owox).getBlendableSchema('a/b');
  expect(calls[0]?.path).toBe('/api/data-marts/a%2Fb/blendable-schema');
});

it('waits for a new finished run of a report', async () => {
  const states = [
    { id: 'r', title: 'R', lastRunAt: '2026-10-01T00:00:00Z', lastRunStatus: 'SUCCESS' },
    { id: 'r', title: 'R', lastRunAt: '2026-10-01T00:00:00Z', lastRunStatus: 'SUCCESS' },
    { id: 'r', title: 'R', lastRunAt: '2026-10-02T00:00:00Z', lastRunStatus: 'RUNNING' },
    { id: 'r', title: 'R', lastRunAt: '2026-10-02T00:00:00Z', lastRunStatus: 'SUCCESS' },
  ];
  const { owox, calls } = fakeOwox({ getJson: async <T,>() => states.shift() as T });
  const sleeps: number[] = [];
  const result = await createOdmApi(owox).runReportAndWait('r', { sleep: async (ms) => void sleeps.push(ms) });
  expect(result).toEqual({ status: 'SUCCESS', error: undefined });
  expect(calls).toContainEqual({ method: 'POST', path: '/api/reports/r/run', body: {} });
  expect(sleeps).toEqual([2000, 2000, 2000]);
});
