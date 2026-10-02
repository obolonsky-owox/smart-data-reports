import { act, screen } from '@testing-library/react';
import { TooltipProvider } from '@owox/ui/components/tooltip';
import userEvent from '@testing-library/user-event';
import { DM } from '../../fixtures/smart-data';
import { __mock, __resetForTests } from '../../sdk-mock';
import { ServicesProvider } from '../../services';
import { mockServices, renderWithServices } from '../../test/render';
import { SheetsReportDialog } from './SheetsReportDialog';

beforeEach(() => __resetForTests());

const linked = { reportId: 'report-2', destinationId: 'dest-sheets', spreadsheetId: 'sheet-1', sheetId: 0, syncedDraftHash: 'h' };

it('creates a report in a chosen destination and offers both links', async () => {
  const onCreate = vi.fn(async () => ({ linked, runStatus: 'SUCCESS' as const }));
  renderWithServices(<SheetsReportDialog mode='create' defaultTitle='Visitors' dataMartId={DM.visitor} onCreate={onCreate} onUpdate={vi.fn()} onClose={vi.fn()} />, await mockServices());
  expect(await screen.findByRole('combobox', { name: 'Google Sheets destination' })).toHaveValue('dest-sheets');
  await userEvent.click(screen.getByRole('button', { name: 'Create report' }));
  expect(onCreate).toHaveBeenCalledWith({ title: 'Visitors', destinationId: 'dest-sheets' });
  expect(await screen.findByText('Your Google Sheets report is ready.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Open spreadsheet' }));
  expect(__mock.state.opened).toEqual(['https://docs.google.com/spreadsheets/d/sheet-1/edit#gid=0']);
  await userEvent.click(screen.getByRole('button', { name: 'Open report in ODM' }));
  expect(__mock.state.navigations).toEqual([`/ui/demo-project/data-marts/${DM.visitor}/reports`]);
});

it('sends the user to Destinations when there is no Google Sheets connection', async () => {
  __mock.state.destinations = [];
  renderWithServices(<SheetsReportDialog mode='create' defaultTitle='T' dataMartId={DM.visitor} onCreate={vi.fn()} onUpdate={vi.fn()} onClose={vi.fn()} />, await mockServices());
  expect(await screen.findByText('Connect Google Sheets in Destinations first.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Open Destinations' }));
  expect(__mock.state.navigations).toEqual(['/ui/demo-project/data-destinations']);
});

it('updates the linked report and handles a report deleted in ODM', async () => {
  const onUpdate = vi.fn(async () => ({ kind: 'link-missing' as const }));
  renderWithServices(<SheetsReportDialog mode='update' defaultTitle='T' dataMartId={DM.visitor} onCreate={vi.fn()} onUpdate={onUpdate} onClose={vi.fn()} />, await mockServices());
  await userEvent.click(screen.getByRole('button', { name: 'Update report' }));
  expect(await screen.findByText('The Google Sheets report was deleted in ODM. Create a new one to keep a spreadsheet in sync.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Create a new one' }));
  expect(await screen.findByRole('button', { name: 'Create report' })).toBeInTheDocument();
});

it('says the report was saved when the Google Sheets update failed', async () => {
  const onUpdate = vi.fn(async () => ({ kind: 'sync-failed' as const, message: 'You are not an owner of this report.' }));
  renderWithServices(<SheetsReportDialog mode='update' defaultTitle='T' dataMartId={DM.visitor} onCreate={vi.fn()} onUpdate={onUpdate} onClose={vi.fn()} />, await mockServices());
  await userEvent.click(screen.getByRole('button', { name: 'Update report' }));
  expect(await screen.findByText("Saved. Google Sheets wasn't updated: You are not an owner of this report.")).toBeInTheDocument();
});

it('offers a new Google Sheets report when the main data mart changed', async () => {
  const onUpdate = vi.fn(async () => ({ kind: 'link-dropped' as const }));
  renderWithServices(<SheetsReportDialog mode='update' defaultTitle='T' dataMartId={DM.session} onCreate={vi.fn()} onUpdate={onUpdate} onClose={vi.fn()} />, await mockServices());
  await userEvent.click(screen.getByRole('button', { name: 'Update report' }));
  expect(await screen.findByText(/reads the previous data mart, so it's no longer linked/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Create a new one' }));
  expect(await screen.findByRole('button', { name: 'Create report' })).toBeInTheDocument();
});

it('never offers a second Create once the report exists, and can be closed while it runs', async () => {
  let fail!: (error: Error) => void;
  const onCreate = vi.fn(() => new Promise<never>((_, reject) => (fail = reject)));
  const onClose = vi.fn();
  const services = await mockServices();
  const props = { mode: 'create' as const, defaultTitle: 'Visitors', dataMartId: DM.visitor, onCreate, onUpdate: vi.fn(), onClose };
  const { rerender } = renderWithServices(<SheetsReportDialog {...props} />, services);
  await userEvent.click(await screen.findByRole('button', { name: 'Create report' }));
  // The editor passes the link down as soon as it is saved, before the run finishes.
  rerender(
    <ServicesProvider services={services}>
      <TooltipProvider>
        <SheetsReportDialog {...props} linked={linked} />
      </TooltipProvider>
    </ServicesProvider>,
  );
  expect(screen.getByText('The report is still running. Open it in ODM to follow its progress.')).toBeInTheDocument();
  // The dialog's own X button is also named Close; the footer one is last.
  await userEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!);
  expect(onClose).toHaveBeenCalled();
  await act(async () => fail(new Error('polling failed')));
  expect(screen.queryByRole('button', { name: 'Create report' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Update report' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Open report in ODM' }));
  expect(__mock.state.navigations).toEqual([`/ui/demo-project/data-marts/${DM.visitor}/reports`]);
});
