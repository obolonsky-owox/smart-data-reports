import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM } from '../../fixtures/smart-data';
import { emptyDraft } from '../../lib/report-draft';
import type { StoredReport } from '../../lib/report-store';
import { toSnapshot } from '../../lib/run-snapshot';
import { __mock, __resetForTests } from '../../sdk-mock';
import { mockServices, renderWithServices } from '../../test/render';
import { ReportsListPage } from './ReportsListPage';

beforeEach(() => __resetForTests());

it('invites to build the first report when there are none', async () => {
  const onCreate = vi.fn();
  renderWithServices(<ReportsListPage onOpen={vi.fn()} onCreate={onCreate} />, await mockServices());
  expect(await screen.findByText('Build your first report')).toBeInTheDocument();
  await userEvent.click(screen.getAllByRole('button', { name: /new report/i })[1]!);
  expect(onCreate).toHaveBeenCalled();
});

it('lists saved reports with their data mart and author', async () => {
  __mock.seedReport('r1', { schemaVersion: 1, title: 'Visitors by source', draft: emptyDraft(DM.visitor), createdBy: 'demo-user', updatedBy: 'demo-user' });
  __mock.seedReport('r2', { schemaVersion: 1, title: 'Sessions', draft: emptyDraft(DM.session), createdBy: 'someone', updatedBy: 'someone' });
  const onOpen = vi.fn();
  renderWithServices(<ReportsListPage onOpen={onOpen} onCreate={vi.fn()} />, await mockServices());
  expect(await screen.findByText('Visitors by source')).toBeInTheDocument();
  expect(screen.getByText('Visitor')).toBeInTheDocument();
  expect(screen.getByText('You')).toBeInTheDocument();
  expect(screen.getByText('Another member')).toBeInTheDocument();
  await userEvent.click(screen.getByText('Sessions'));
  expect(onOpen).toHaveBeenCalledWith('r2');
});

it('shows an error with a working retry', async () => {
  __mock.fail('collection:reports', { code: 'HTTP_ERROR', status: 500, message: 'boom' });
  renderWithServices(<ReportsListPage onOpen={vi.fn()} onCreate={vi.fn()} />, await mockServices());
  expect(await screen.findByText("Couldn't load your reports")).toBeInTheDocument();
  __mock.clearFailures();
  await userEvent.click(screen.getByRole('button', { name: /retry/i }));
  expect(await screen.findByText('Build your first report')).toBeInTheDocument();
});

it('still lists saved reports when data marts fail to load', async () => {
  __mock.seedReport('r1', { schemaVersion: 1, title: 'Visitors by source', draft: emptyDraft(DM.visitor), createdBy: 'demo-user', updatedBy: 'demo-user' });
  __mock.fail('/api/data-marts', { code: 'HTTP_ERROR', status: 500, message: 'boom' }, 'GET');
  renderWithServices(<ReportsListPage onOpen={vi.fn()} onCreate={vi.fn()} />, await mockServices());
  expect(await screen.findByText('Visitors by source')).toBeInTheDocument();
  expect(screen.getByText('Unavailable data mart')).toBeInTheDocument();
});

describe('deleting a report', () => {
  const report = (extra: Partial<StoredReport> = {}): StoredReport => ({
    schemaVersion: 1, title: 'Visitors by source', draft: emptyDraft(DM.visitor), createdBy: 'demo-user', updatedBy: 'demo-user', ...extra,
  });
  const openMenu = async (title: string) => {
    await userEvent.click(await screen.findByRole('button', { name: `Actions for ${title}` }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete report' }));
    return screen.findByRole('alertdialog');
  };

  it('deletes the report and the kept last result from the row menu, without opening it', async () => {
    __mock.seedReport('r1', report());
    __mock.seedReport('r2', report({ title: 'Sessions', draft: emptyDraft(DM.session) }));
    const services = await mockServices();
    await services.snapshots.put('r1', toSnapshot({ ranAt: '2026-10-05T10:00:00Z', configHash: 'h', draft: emptyDraft(DM.visitor), rows: [], truncated: false, totals: null }));
    const onOpen = vi.fn();
    renderWithServices(<ReportsListPage onOpen={onOpen} onCreate={vi.fn()} />, services);
    const dialog = await openMenu('Visitors by source');
    expect(within(dialog).getByText('Delete “Visitors by source”?')).toBeInTheDocument();
    expect(within(dialog).queryByText(/Google Sheets/)).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete report' }));
    await waitFor(() => expect(screen.queryByText('Visitors by source')).not.toBeInTheDocument());
    expect(screen.getByText('Sessions')).toBeInTheDocument();
    expect(__mock.state.collections.get('reports')!.has('r1')).toBe(false);
    expect(__mock.state.collections.get('snapshots')!.has('r1')).toBe(false);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('keeps the report when the deletion is cancelled', async () => {
    __mock.seedReport('r1', report());
    renderWithServices(<ReportsListPage onOpen={vi.fn()} onCreate={vi.fn()} />, await mockServices());
    const dialog = await openMenu('Visitors by source');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Visitors by source')).toBeInTheDocument();
    expect(__mock.state.collections.get('reports')!.has('r1')).toBe(true);
  });

  it('points to a linked Google Sheets report, which it leaves in ODM', async () => {
    __mock.seedReport('r1', report({
      linkedReport: { reportId: 'odm-7', destinationId: 'dest-sheets', spreadsheetId: 's', sheetId: 0, syncedDraftHash: 'h', dataMartId: DM.visitor },
    }));
    renderWithServices(<ReportsListPage onOpen={vi.fn()} onCreate={vi.fn()} />, await mockServices());
    const dialog = await openMenu('Visitors by source');
    expect(within(dialog).getByText(/has a Google Sheets report in ODM. It isn't deleted here/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Open Google Sheets report in ODM' }));
    expect(__mock.state.navigations).toEqual([`/ui/demo-project/data-marts/${DM.visitor}/reports?reportId=odm-7`]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete report' }));
    await waitFor(() => expect(__mock.state.collections.get('reports')!.has('r1')).toBe(false));
    expect(__mock.state.requests.some((r) => r.path.startsWith('/api/reports/odm-7'))).toBe(false);
  });

  it('keeps the dialog and the report when the deletion fails', async () => {
    __mock.seedReport('r1', report());
    renderWithServices(<ReportsListPage onOpen={vi.fn()} onCreate={vi.fn()} />, await mockServices());
    const dialog = await openMenu('Visitors by source');
    __mock.fail('collection:reports', { code: 'HTTP_ERROR', status: 403, message: 'Forbidden' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete report' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Delete report' })).toBeEnabled());
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(__mock.state.collections.get('reports')!.has('r1')).toBe(true);
  });
});
