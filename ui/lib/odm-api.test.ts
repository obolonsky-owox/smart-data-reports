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

  it('cancels the stream and rejects with AbortError when aborted', async () => {
    const t = traversal(sampleRows(['email'], 3000), 10);
    const { owox } = fakeOwox({ dataMarts: { list: async () => [], traverseData: async () => t } });
    const controller = new AbortController();
    controller.abort();
    await expect(createOdmApi(owox).runQuery(DM.visitor, options, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(t.cancelled).toBe(true);
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
