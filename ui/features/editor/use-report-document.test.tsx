import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { DM } from '../../fixtures/smart-data';
import { emptyDraft } from '../../lib/report-draft';
import { __mock, __resetForTests } from '../../sdk-mock';
import { ServicesProvider, type Services } from '../../services';
import { mockServices } from '../../test/render';
import { useReportDocument } from './use-report-document';

beforeEach(() => __resetForTests());

const wrapperFor = (services: Services) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <ServicesProvider services={services}>{children}</ServicesProvider>;
  };

const visitorDraft = () => ({ ...emptyDraft(DM.visitor), columns: [{ name: 'email', aliasPath: '' }] });

it('saves a new report and tracks unsaved changes', async () => {
  const services = await mockServices();
  const { result } = renderHook(() => useReportDocument(undefined), { wrapper: wrapperFor(services) });
  act(() => {
    result.current.setDraft(visitorDraft());
    result.current.setTitle('Visitors');
  });
  expect(result.current.dirty).toBe(true);
  await act(async () => void (await result.current.saveWithSync()));
  expect(result.current.dirty).toBe(false);
  expect(result.current.savedId).toBeDefined();
  expect([...__mock.state.collections.get('reports')!.values()][0]?.parentId).toBe(DM.visitor);
});

it("saves someone else's report as a copy without touching the original", async () => {
  __mock.seedReport('theirs', { schemaVersion: 1, title: 'Theirs', draft: visitorDraft(), createdBy: 'someone', updatedBy: 'someone' });
  const services = await mockServices();
  const { result } = renderHook(() => useReportDocument('theirs'), { wrapper: wrapperFor(services) });
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.isAuthor).toBe(false);
  await act(async () => void (await result.current.saveWithSync({ asCopy: true })));
  expect(result.current.savedId).not.toBe('theirs');
  expect(result.current.saved?.createdBy).toBe('demo-user');
  expect(result.current.title).toBe('Theirs (copy)');
  expect(__mock.state.collections.get('reports')!.get('theirs')?.document).toMatchObject({ title: 'Theirs' });
});

it('creates a linked Google Sheets report and then keeps it in sync on save', async () => {
  const services = await mockServices();
  const { result } = renderHook(() => useReportDocument(undefined), { wrapper: wrapperFor(services) });
  act(() => result.current.setDraft(visitorDraft()));
  await act(async () => void (await result.current.createSheetsReport({ title: 'Visitors', destinationId: 'dest-sheets' })));
  const linked = result.current.saved?.linkedReport;
  expect(linked).toMatchObject({ reportId: 'report-2', spreadsheetId: 'sheet-1' });

  act(() => result.current.setDraft({ ...visitorDraft(), columns: [{ name: 'client_id', aliasPath: '' }] }));
  let outcome: unknown;
  await act(async () => {
    outcome = await result.current.saveWithSync();
  });
  expect(outcome).toEqual({ kind: 'synced', runStatus: 'SUCCESS', runError: undefined });
  expect(__mock.state.requests.some((r) => r.method === 'PUT' && r.path === '/api/reports/report-2')).toBe(true);
  expect(result.current.saved?.linkedReport?.spreadsheetId).toBe('sheet-1');
});

it('keeps the link when the first run of a new Google Sheets report fails', async () => {
  const services = await mockServices();
  const { result } = renderHook(() => useReportDocument(undefined), { wrapper: wrapperFor(services) });
  act(() => result.current.setDraft(visitorDraft()));
  __mock.fail('/api/reports/', { code: 'HTTP_ERROR', status: 500, message: 'boom' }, 'GET');
  await act(async () => {
    await expect(result.current.createSheetsReport({ title: 'Visitors', destinationId: 'dest-sheets' })).rejects.toThrow();
  });
  expect(result.current.saved?.linkedReport).toMatchObject({ reportId: 'report-2', spreadsheetId: 'sheet-1', dataMartId: DM.visitor });
  expect(result.current.saved?.title).toBe('Visitors');
});
