import { act, renderHook, waitFor } from '@testing-library/react';
import { DM } from '../../fixtures/smart-data';
import type { OdmApi, QueryResult } from '../../lib/odm-api';
import { emptyDraft, type ReportDraft } from '../../lib/report-draft';
import { useQueryRun } from './use-query-run';

const draft = (column: string): ReportDraft => ({ ...emptyDraft(DM.visitor), columns: [{ name: column, aliasPath: '' }] });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

it('never lets an older run overwrite a newer one', async () => {
  const first = deferred<QueryResult>();
  const second = deferred<QueryResult>();
  const queue = [first, second];
  const api = {
    runQuery: vi.fn(() => queue.shift()!.promise),
    getRunTotals: vi.fn(async () => ({ 'visits | SUM': 1 })),
  } as unknown as OdmApi;
  const { result } = renderHook(() => useQueryRun(api, { totalsRetryMs: 0 }));

  act(() => void result.current.run(DM.visitor, draft('email')));
  act(() => void result.current.run(DM.visitor, draft('client_id')));
  await act(async () => second.resolve({ rows: [{ client_id: 'b' }], truncated: false, runId: 'r2' }));
  await act(async () => first.resolve({ rows: [{ email: 'a' }], truncated: false, runId: 'r1' }));

  await waitFor(() => expect(result.current.state.status).toBe('success'));
  const state = result.current.state;
  if (state.status !== 'success') throw new Error('not success');
  expect(state.result.rows).toEqual([{ client_id: 'b' }]);
  await waitFor(() => expect(result.current.state).toMatchObject({ totals: { 'visits | SUM': 1 } }));
  expect(api.getRunTotals).toHaveBeenCalledWith(DM.visitor, 'r2');
});

it('retries totals once when the first read is empty', async () => {
  const totals = [null, { 'visits | SUM': 5 }];
  const api = {
    runQuery: vi.fn(async () => ({ rows: [], truncated: false, runId: 'r1' })),
    getRunTotals: vi.fn(async () => totals.shift() ?? null),
  } as unknown as OdmApi;
  const { result } = renderHook(() => useQueryRun(api, { totalsRetryMs: 0 }));
  await act(async () => result.current.run(DM.visitor, draft('email')));
  await waitFor(() => expect(result.current.state).toMatchObject({ totals: { 'visits | SUM': 5 } }));
});

it('cancels a running query', async () => {
  const api = { runQuery: vi.fn(() => new Promise(() => {})), getRunTotals: vi.fn() } as unknown as OdmApi;
  const { result } = renderHook(() => useQueryRun(api));
  act(() => void result.current.run(DM.visitor, draft('email')));
  expect(result.current.state.status).toBe('running');
  act(() => result.current.cancel());
  expect(result.current.state).toEqual({ status: 'idle', cancelled: true });
});

it('resets to idle and aborts the running query', async () => {
  let signal: AbortSignal | undefined;
  const api = {
    runQuery: vi.fn((_id: string, _options: unknown, s: AbortSignal) => ((signal = s), new Promise(() => {}))),
    getRunTotals: vi.fn(),
  } as unknown as OdmApi;
  const { result } = renderHook(() => useQueryRun(api));
  act(() => void result.current.run(DM.visitor, draft('email')));
  act(() => result.current.reset());
  expect(result.current.state).toEqual({ status: 'idle' });
  expect(signal?.aborted).toBe(true);
});

it("names the data mart when the query isn't allowed", async () => {
  const forbidden = Object.assign(new Error('Forbidden'), { name: 'PluginTransportError', payload: { code: 'HTTP_ERROR', status: 403, message: 'Forbidden' } });
  const api = { runQuery: vi.fn(async () => { throw forbidden; }), getRunTotals: vi.fn() } as unknown as OdmApi;
  const { result } = renderHook(() => useQueryRun(api));
  await act(async () => result.current.run(DM.visitor, draft('email'), 'Visitor'));
  expect(result.current.state).toMatchObject({ status: 'error', error: { message: "You don't have access to Visitor." } });
});
