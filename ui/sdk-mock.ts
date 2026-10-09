import type { PluginContext } from '@owox/plugin-sdk';
import { DATA_MARTS, GRAPHS, SCHEMAS, sampleRows } from './fixtures/smart-data';
import type { ReportSummary, Row } from './lib/odm-types';
import type { CollectionDoc, StoredReport } from './lib/report-store';

// Stand-in for @owox/plugin-sdk in `vite dev` and Vitest. It serves the fixture model in
// ui/fixtures and keeps reports and collections in memory.

type Payload = { code: string; status?: number; message: string; details?: unknown };

export class MockTransportError extends Error {
  constructor(readonly payload: Payload) {
    super(payload.message);
    this.name = 'PluginTransportError';
  }
}

export interface MockRequest { method: string; path: string; body?: unknown }

function freshState() {
  return {
    theme: 'light' as 'light' | 'dark',
    requests: [] as MockRequest[],
    navigations: [] as string[],
    opened: [] as string[],
    rows: (columns: string[]): Row[] => sampleRows(columns, 120),
    lastRows: [] as Row[],
    /** The executed SQL the last run saved; null on a host that doesn't save it. */
    lastSql: null as string | null,
    savesRunSql: true,
    /** Keyed by path prefix; `method` limits a failure to one HTTP method. */
    failures: new Map<string, { payload: Payload; method?: string }>(),
    collections: new Map<string, Map<string, CollectionDoc<unknown>>>(),
    reports: new Map<string, ReportSummary & { body: unknown }>(),
    destinations: [{ id: 'dest-sheets', title: 'Marketing Google Sheets' }],
    clock: 0,
    counter: 0,
  };
}

let state = freshState();
let context: PluginContext | undefined;

function tick(): string {
  state.clock += 1;
  return new Date(Date.UTC(2026, 9, 2, 12, 0, state.clock)).toISOString();
}

function maybeFail(key: string, method?: string) {
  for (const [prefix, failure] of state.failures) {
    if (key.startsWith(prefix) && (!failure.method || failure.method === method)) throw new MockTransportError(failure.payload);
  }
}

const notFound = () => new MockTransportError({ code: 'HTTP_ERROR', status: 404, message: 'Not Found' });

function traversal(rows: Row[], runId: string) {
  let cancelled = false;
  return {
    runId,
    async *rowChunks() {
      for (let i = 0; i < rows.length; i += 500) {
        if (cancelled) return;
        await Promise.resolve();
        yield rows.slice(i, i + 500);
      }
    },
    async cancel() {
      cancelled = true;
    },
  };
}

function totalsOf(rows: Row[]) {
  const first = rows[0] ?? {};
  return Object.fromEntries(
    Object.keys(first)
      .filter((key) => typeof first[key] === 'number')
      .map((key) => {
        const base = key.includes(' | ') ? key.slice(0, key.lastIndexOf(' | ')) : key;
        return [`${base} | SUM`, rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0)];
      }),
  );
}

const owox = {
  dataMarts: {
    async list() {
      maybeFail('/api/data-marts', 'GET');
      return DATA_MARTS;
    },
    async traverseData(
      id: string,
      options: { column?: string[]; aggregation?: { column: string; function: string }[] | null; limit?: number },
    ) {
      const path = `/api/external/http-data/data-marts/${id}.ndjson`;
      state.requests.push({ method: 'GET', path, body: options });
      maybeFail(path, 'GET');
      tick();
      let rows = state.rows(options.column ?? []);
      for (const rule of options.aggregation ?? []) {
        rows = rows.map((row) => {
          const { [rule.column]: value, ...rest } = row;
          return { ...rest, [`${rule.column} | ${rule.function}`]: value };
        });
      }
      rows = rows.slice(0, options.limit ?? rows.length);
      state.lastRows = rows;
      const columns = (options.column ?? []).join(',\n  ');
      state.lastSql = state.savesRunSql
        ? `SELECT\n  ${columns}\nFROM \`demo.data_mart\`\nWHERE TRUE${options.limit ? `\nLIMIT ${options.limit}` : ''}`
        : null;
      return traversal(rows, `run-${state.clock}`);
    },
  },

  async getJson<T>(path: string): Promise<T> {
    state.requests.push({ method: 'GET', path });
    maybeFail(path, 'GET');
    const id = (re: RegExp) => decodeURIComponent(path.match(re)?.[1] ?? '');
    if (/\/blendable-schema$/.test(path)) {
      const schema = SCHEMAS[id(/^\/api\/data-marts\/([^/]+)\//)];
      if (!schema) throw notFound();
      return schema as T;
    }
    if (/\/relationships\/graph$/.test(path)) {
      const graph = GRAPHS[id(/^\/api\/data-marts\/([^/]+)\//)];
      if (!graph) throw notFound();
      return graph as T;
    }
    if (/^\/api\/data-marts\/[^/]+\/runs\/[^/]+$/.test(path)) {
      const httpData = state.lastSql ? { executionSqlQuery: state.lastSql } : {};
      return { totals: totalsOf(state.lastRows), additionalParams: { httpData } } as T;
    }
    if (path === '/api/data-destinations/by-type/GOOGLE_SHEETS') return state.destinations as T;
    if (/\/generated-sql$/.test(path)) {
      const report = state.reports.get(id(/^\/api\/reports\/([^/]+)\//));
      if (!report) throw notFound();
      const columns = ((report.body as { columnConfig?: string[] }).columnConfig ?? []).join(',\n  ');
      return { sql: `SELECT\n  ${columns}\nFROM \`demo.data_mart\`\nWHERE TRUE`, canModifySource: false } as T;
    }
    if (/^\/api\/reports\/[^/]+$/.test(path)) {
      const report = state.reports.get(id(/^\/api\/reports\/([^/]+)$/));
      if (!report) throw notFound();
      const { body: _body, ...summary } = report;
      return summary as T;
    }
    throw notFound();
  },

  async postJson<T>(path: string, body: unknown): Promise<T> {
    state.requests.push({ method: 'POST', path, body });
    maybeFail(path, 'POST');
    if (/\/google-sheets\/documents$/.test(path)) {
      state.counter += 1;
      return { spreadsheetId: `sheet-${state.counter}`, sheetId: 0 } as T;
    }
    if (path === '/api/reports') {
      state.counter += 1;
      const reportId = `report-${state.counter}`;
      state.reports.set(reportId, { id: reportId, title: (body as { title: string }).title, body });
      return { id: reportId } as T;
    }
    const run = path.match(/^\/api\/reports\/([^/]+)\/run$/);
    if (run) {
      const report = state.reports.get(decodeURIComponent(run[1]!));
      if (!report) throw notFound();
      report.lastRunStatus = 'SUCCESS';
      report.lastRunAt = tick();
      return undefined as T;
    }
    throw notFound();
  },

  async putJson<T>(path: string, body: unknown): Promise<T> {
    state.requests.push({ method: 'PUT', path, body });
    maybeFail(path, 'PUT');
    const match = path.match(/^\/api\/reports\/([^/]+)$/);
    const report = match ? state.reports.get(decodeURIComponent(match[1]!)) : undefined;
    if (!report) throw notFound();
    report.title = (body as { title: string }).title;
    report.body = body;
    const { body: _body, ...summary } = report;
    return summary as T;
  },
};

function collection(name: string) {
  const docs = state.collections.get(name) ?? new Map<string, CollectionDoc<unknown>>();
  state.collections.set(name, docs);
  return {
    async list({ limit = 50, cursor }: { limit?: number; cursor?: string } = {}) {
      maybeFail(`collection:${name}`);
      const all = [...docs.values()];
      const start = cursor ? Number(cursor) : 0;
      return { items: all.slice(start, start + limit), nextCursor: start + limit < all.length ? String(start + limit) : null };
    },
    async get(id: string) {
      maybeFail(`collection:${name}`);
      return docs.get(id) ?? null;
    },
    async put(id: string, document: unknown, options: { parentId?: string } = {}) {
      maybeFail(`collection:${name}`);
      const now = tick();
      const doc = { id, parentId: options.parentId, document, createdAt: docs.get(id)?.createdAt ?? now, updatedAt: now };
      docs.set(id, doc);
      return doc;
    },
    async delete(id: string) {
      maybeFail(`collection:${name}`);
      docs.delete(id);
    },
  };
}

export async function connect(): Promise<PluginContext> {
  context ??= {
    pluginId: 'smart-data-reports-dev',
    installationId: 'local',
    projectId: 'demo-project',
    userId: 'demo-user',
    theme: state.theme,
    owox,
    credentials: {},
    collections: (name: string) => collection(name),
    ui: {
      async openExternal(url: string) {
        state.opened.push(url);
      },
      navigate(path: string) {
        state.navigations.push(path);
      },
    },
    signal: new AbortController().signal,
  } as unknown as PluginContext;
  return context;
}

export function __setTheme(theme: 'light' | 'dark'): void {
  state.theme = theme;
}

export function __resetForTests(): void {
  state = freshState();
  context = undefined;
}

export const __mock = {
  get state() {
    return state;
  },
  MockTransportError,
  fail(prefix: string, payload: Payload, method?: 'GET' | 'POST' | 'PUT') {
    state.failures.set(prefix, { payload, method });
  },
  clearFailures() {
    state.failures.clear();
  },
  setRows(fn: (columns: string[]) => Row[]) {
    state.rows = fn;
  },
  /** Simulates a host that doesn't save the executed SQL of HTTP Data runs. */
  dropRunSql() {
    state.savesRunSql = false;
  },
  seedReport(id: string, report: StoredReport) {
    const docs = state.collections.get('reports') ?? new Map<string, CollectionDoc<unknown>>();
    state.collections.set('reports', docs);
    const now = tick();
    docs.set(id, { id, parentId: report.draft.mainDataMartId, document: report, createdAt: now, updatedAt: now });
  },
};
