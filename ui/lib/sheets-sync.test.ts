import { DM } from '../fixtures/smart-data';
import { emptyDraft, type ReportDraft } from './report-draft';
import { configHash } from './report-store';
import {
  createLinkedReport, odmReportsPath, spreadsheetUrl, updateLinkedReport, type SheetsApi,
} from './sheets-sync';

const draft: ReportDraft = { ...emptyDraft(DM.visitor), columns: [{ name: 'email', aliasPath: '' }] };

function fakeApi(overrides: Partial<SheetsApi> = {}) {
  const calls: unknown[][] = [];
  const api: SheetsApi = {
    createSpreadsheet: async (...args) => (calls.push(['createSpreadsheet', ...args]), { spreadsheetId: 'sheet-1', sheetId: 7 }),
    createReport: async (...args) => (calls.push(['createReport', ...args]), { id: 'report-1' }),
    updateReport: async (...args) => (calls.push(['updateReport', ...args]), { id: 'report-1', title: 'T' }),
    runReportAndWait: async (...args) => (calls.push(['run', args[0]]), { status: 'SUCCESS' as const }),
    ...overrides,
  };
  return { api, calls };
}

it('creates a spreadsheet, a report with the read plan, and runs it', async () => {
  const { api, calls } = fakeApi();
  const outcome = await createLinkedReport(api, { title: 'Visitors', destinationId: 'dest-1', draft });
  expect(outcome).toEqual({
    linked: { reportId: 'report-1', destinationId: 'dest-1', spreadsheetId: 'sheet-1', sheetId: 7, syncedDraftHash: configHash(draft), dataMartId: DM.visitor },
    runStatus: 'SUCCESS',
    runError: undefined,
  });
  expect(calls.map((c) => c[0])).toEqual(['createSpreadsheet', 'createReport', 'run']);
  expect(calls[1]?.[2]).toMatchObject({ title: 'Visitors', spreadsheetId: 'sheet-1', sheetId: 7, config: { columnConfig: ['email'] } });
});

it('updates the same report and spreadsheet', async () => {
  const { api, calls } = fakeApi();
  const linked = { reportId: 'report-1', destinationId: 'dest-1', spreadsheetId: 'sheet-1', sheetId: 7, syncedDraftHash: 'old' };
  const outcome = await updateLinkedReport(api, linked, { title: 'Visitors', draft });
  expect(outcome).toMatchObject({ linked: { ...linked, syncedDraftHash: configHash(draft) }, runStatus: 'SUCCESS' });
  expect(calls[0]?.[1]).toBe('report-1');
  expect(calls[0]?.[2]).toMatchObject({ spreadsheetId: 'sheet-1', sheetId: 7 });
});

it('reports a deleted ODM report as missing', async () => {
  const notFound = Object.assign(new Error('Not Found'), { name: 'PluginTransportError', payload: { code: 'HTTP_ERROR', status: 404, message: 'Not Found' } });
  const { api } = fakeApi({ updateReport: async () => { throw notFound; } });
  const linked = { reportId: 'gone', destinationId: 'd', spreadsheetId: 's', sheetId: 0, syncedDraftHash: 'h' };
  expect(await updateLinkedReport(api, linked, { title: 'T', draft })).toEqual({ missing: true });
});

it('builds links into Google Sheets and ODM', () => {
  expect(spreadsheetUrl({ spreadsheetId: 'abc', sheetId: 7 })).toBe('https://docs.google.com/spreadsheets/d/abc/edit#gid=7');
  expect(odmReportsPath('p1', DM.visitor)).toBe(`/ui/p1/data-marts/${DM.visitor}/reports`);
});
