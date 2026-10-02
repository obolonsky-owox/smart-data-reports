import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM } from '../../fixtures/smart-data';
import { __mock, __resetForTests } from '../../sdk-mock';
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
