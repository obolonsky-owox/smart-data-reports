import type {
  BlendableSchema, DataMartSummary, RelationshipGraph, ReportRunStatus, ReportSummary, Row,
  SheetsDestination, SpreadsheetRef, Totals,
} from './odm-types';
import { ROW_CAP, type ReportConfig, type TraverseOptions } from './read-plan';

export interface Traversal {
  readonly runId: string | undefined;
  rowChunks(): AsyncIterable<Row[]>;
  cancel(): Promise<void>;
}

/** The subset of `ctx.owox` this plugin uses. */
export interface OwoxClient {
  dataMarts: {
    list(): Promise<DataMartSummary[]>;
    traverseData(dataMartId: string, options: TraverseOptions): Promise<Traversal>;
  };
  getJson<T>(path: string, query?: Record<string, string>): Promise<T>;
  postJson<T>(path: string, body: unknown): Promise<T>;
  putJson<T>(path: string, body: unknown): Promise<T>;
}

export interface QueryResult { rows: Row[]; truncated: boolean; runId?: string }

export interface RunDetails { totals: Totals | null; executedSql: string | null }

export interface ReportTarget {
  title: string;
  destinationId: string;
  spreadsheetId: string;
  sheetId: number;
  config: ReportConfig;
}

export interface WaitOptions {
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  intervalMs?: number;
  timeoutMs?: number;
}

const enc = encodeURIComponent;
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function reportBody(target: ReportTarget) {
  return {
    title: target.title,
    dataDestinationId: target.destinationId,
    destinationConfig: { type: 'google-sheets-config', spreadsheetId: target.spreadsheetId, sheetId: target.sheetId },
    ...target.config,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Keeps a raw list item only if it is a published data mart available for reporting. */
function reportableMart(item: unknown): DataMartSummary | null {
  if (!isRecord(item) || typeof item.id !== 'string' || typeof item.title !== 'string') return null;
  if (item.status !== 'PUBLISHED' || item.availableForReporting !== true) return null;
  const storage = isRecord(item.storage) ? item.storage : {};
  return {
    id: item.id,
    title: item.title,
    description: typeof item.description === 'string' ? item.description : null,
    status: 'PUBLISHED',
    availableForReporting: true,
    storage: {
      type: typeof storage.type === 'string' ? storage.type : '',
      title: typeof storage.title === 'string' ? storage.title : '',
    },
  };
}

/** Pages `/api/data-marts` without the client's strict validation of every item. */
async function listDataMartsLeniently(owox: OwoxClient): Promise<DataMartSummary[]> {
  const marts: DataMartSummary[] = [];
  const seen = new Set<number>();
  let offset = 0;
  for (;;) {
    if (seen.has(offset)) throw new Error(`OWOX Data Marts API returned repeated nextOffset ${offset}`);
    seen.add(offset);
    const page = await owox.getJson<{ items?: unknown; nextOffset?: unknown }>(
      '/api/data-marts',
      offset === 0 ? undefined : { offset: String(offset) },
    );
    for (const item of Array.isArray(page?.items) ? page.items : []) {
      const mart = reportableMart(item);
      if (mart) marts.push(mart);
    }
    if (typeof page?.nextOffset !== 'number') return marts;
    offset = page.nextOffset;
  }
}

export function createOdmApi(owox: OwoxClient) {
  const getReport = (reportId: string) => owox.getJson<ReportSummary>(`/api/reports/${enc(reportId)}`);

  return {
    async listDataMarts(): Promise<DataMartSummary[]> {
      let all: DataMartSummary[];
      try {
        all = (await owox.dataMarts.list()).flatMap((m) => reportableMart(m) ?? []);
      } catch {
        // The client rejects the whole list over one item it doesn't recognise, e.g. a new storage type.
        all = await listDataMartsLeniently(owox);
      }
      return all.sort((a, b) => a.title.localeCompare(b.title));
    },

    getBlendableSchema: (dataMartId: string) =>
      owox.getJson<BlendableSchema>(`/api/data-marts/${enc(dataMartId)}/blendable-schema`),

    getRelationshipGraph: (dataMartId: string) =>
      owox.getJson<RelationshipGraph>(`/api/data-marts/${enc(dataMartId)}/relationships/graph`),

    /** Streams at most ROW_CAP rows; every call is a billed HTTP_DATA run in ODM. */
    async runQuery(dataMartId: string, options: TraverseOptions, signal?: AbortSignal): Promise<QueryResult> {
      if (signal?.aborted) throw abortError();
      const traversal = await owox.dataMarts.traverseData(dataMartId, options);
      const iterator = traversal.rowChunks()[Symbol.asyncIterator]();
      const rows: Row[] = [];
      let truncated = false;
      let onAbort: (() => void) | undefined;
      // The real client's cancel() is a no-op once reading has started, so a pending
      // next() is interrupted by racing it against this promise instead.
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(abortError());
        if (signal?.aborted) onAbort();
        else signal?.addEventListener('abort', onAbort, { once: true });
      });
      aborted.catch(() => undefined);
      try {
        for (;;) {
          const step = await Promise.race([iterator.next(), aborted]);
          if (step.done) break;
          rows.push(...step.value);
          if (rows.length > ROW_CAP) {
            truncated = true;
            await iterator.return?.();
            await traversal.cancel();
            break;
          }
        }
      } catch (error) {
        if (signal?.aborted) {
          void iterator.return?.()?.catch(() => undefined);
          void traversal.cancel().catch(() => undefined);
          throw abortError();
        }
        throw error;
      } finally {
        if (onAbort) signal?.removeEventListener('abort', onAbort);
      }
      return { rows: rows.slice(0, ROW_CAP), truncated, runId: traversal.runId };
    },

    /** ODM saves the executed SQL with parameter values inlined; older hosts don't. */
    async getRunDetails(dataMartId: string, runId: string): Promise<RunDetails> {
      const run = await owox.getJson<{ totals?: Totals | null; additionalParams?: unknown }>(
        `/api/data-marts/${enc(dataMartId)}/runs/${enc(runId)}`,
      );
      const params = isRecord(run.additionalParams) ? run.additionalParams : {};
      const httpData = isRecord(params.httpData) ? params.httpData : {};
      const sql = httpData.executionSqlQuery;
      return { totals: run.totals ?? null, executedSql: typeof sql === 'string' && sql.trim() ? sql : null };
    },

    async listSheetsDestinations(): Promise<SheetsDestination[]> {
      const list = await owox.getJson<SheetsDestination[]>('/api/data-destinations/by-type/GOOGLE_SHEETS');
      return list.map((d) => ({ id: d.id, title: d.title }));
    },

    createSpreadsheet: (destinationId: string, title: string) =>
      owox.postJson<SpreadsheetRef>(`/api/data-destinations/${enc(destinationId)}/google-sheets/documents`, { title }),

    createReport: (dataMartId: string, target: ReportTarget) =>
      owox.postJson<{ id: string }>('/api/reports', { dataMartId, ...reportBody(target) }),

    updateReport: (reportId: string, target: ReportTarget) =>
      owox.putJson<ReportSummary>(`/api/reports/${enc(reportId)}`, reportBody(target)),

    getReport,

    /** Starts a run and polls until a run newer than the previous one finishes. */
    async runReportAndWait(
      reportId: string,
      { signal, sleep = defaultSleep, intervalMs = 2000, timeoutMs = 600_000 }: WaitOptions = {},
    ): Promise<{ status: ReportRunStatus; error?: string }> {
      const before = await getReport(reportId);
      await owox.postJson(`/api/reports/${enc(reportId)}/run`, {});
      const startedAt = Date.now();
      for (;;) {
        if (signal?.aborted) throw abortError();
        await sleep(intervalMs);
        const report = await getReport(reportId);
        if (report.lastRunStatus && report.lastRunStatus !== 'RUNNING' && report.lastRunAt !== before.lastRunAt) {
          return { status: report.lastRunStatus, error: report.lastRunError };
        }
        if (Date.now() - startedAt > timeoutMs) return { status: 'RUNNING' };
      }
    },

    async getReportSql(reportId: string): Promise<string> {
      return (await owox.getJson<{ sql: string }>(`/api/reports/${enc(reportId)}/generated-sql`)).sql;
    },
  };
}

export type OdmApi = ReturnType<typeof createOdmApi>;
