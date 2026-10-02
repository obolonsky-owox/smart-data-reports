import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM } from '../../fixtures/smart-data';
import { __resetForTests } from '../../sdk-mock';
import { mockServices, renderWithServices } from '../../test/render';
import { SqlTab } from './SqlTab';

beforeEach(() => __resetForTests());

it('explains why there is no SQL yet and offers a Google Sheets report', async () => {
  const onCreateSheets = vi.fn();
  renderWithServices(<SqlTab draftChanged={false} reportTitle='R' onCreateSheets={onCreateSheets} onUpdateSheets={vi.fn()} />, await mockServices());
  expect(screen.getByText("ODM doesn't return SQL for ad-hoc queries yet.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Create Google Sheets report' }));
  expect(onCreateSheets).toHaveBeenCalled();
});

it('shows the linked report SQL, warns when it is behind, and downloads it', async () => {
  const services = await mockServices();
  const { id } = await services.api.createReport(DM.visitor, {
    title: 'R', destinationId: 'dest-sheets', spreadsheetId: 's', sheetId: 0,
    config: { columnConfig: ['email'], filterConfig: null, sortConfig: null, aggregationConfig: null, dateTruncConfig: null },
  });
  const linked = { reportId: id, destinationId: 'dest-sheets', spreadsheetId: 's', sheetId: 0, syncedDraftHash: 'h' };
  const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:sql');
  const onUpdateSheets = vi.fn();
  renderWithServices(<SqlTab linked={linked} draftChanged reportTitle='Visitors by source' onCreateSheets={vi.fn()} onUpdateSheets={onUpdateSheets} />, services);
  expect(await screen.findByTestId('sqlCode')).toHaveTextContent('SELECT email FROM');
  expect(screen.getByText('This SQL belongs to the Google Sheets report, not to your current changes.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Update report' }));
  expect(onUpdateSheets).toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Download .sql' }));
  expect(createObjectURL).toHaveBeenCalled();
});
