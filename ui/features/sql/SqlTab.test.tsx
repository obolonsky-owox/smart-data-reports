import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM } from '../../fixtures/smart-data';
import { __mock, __resetForTests } from '../../sdk-mock';
import { mockServices, renderWithServices } from '../../test/render';
import { SqlTab } from './SqlTab';

beforeEach(() => __resetForTests());

const ranAt = '2026-10-09T10:00:00.000Z';

it('asks to run the report before there is SQL, and still offers a Google Sheets report', async () => {
  const onCreateSheets = vi.fn();
  renderWithServices(<SqlTab lastRun={null} draftChanged={false} reportTitle='R' onCreateSheets={onCreateSheets} onUpdateSheets={vi.fn()} />, await mockServices());
  expect(screen.getByText('Run the report to see its SQL.')).toBeInTheDocument();
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
  renderWithServices(<SqlTab lastRun={null} linked={linked} draftChanged reportTitle='Visitors by source' onCreateSheets={vi.fn()} onUpdateSheets={onUpdateSheets} />, services);
  expect(await screen.findByTestId('sqlCode')).toHaveTextContent('SELECT email FROM');
  expect(screen.getByText('This SQL belongs to the Google Sheets report, not to your current changes.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Update report' }));
  expect(onUpdateSheets).toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Download .sql' }));
  expect(createObjectURL).toHaveBeenCalled();
});

it('shows the SQL of the last run with a note instead of the Google Sheets report SQL', async () => {
  const services = await mockServices();
  const linked = { reportId: 'r', destinationId: 'dest-sheets', spreadsheetId: 's', sheetId: 0, syncedDraftHash: 'h' };
  renderWithServices(
    <SqlTab lastRun={{ sql: 'SELECT email FROM t', ranAt, changedSince: false }} linked={linked} draftChanged reportTitle='R' onCreateSheets={vi.fn()} onUpdateSheets={vi.fn()} />,
    services,
  );
  expect(screen.getByTestId('sqlCode')).toHaveTextContent('SELECT email FROM t');
  expect(screen.getByText(/^SQL from the last run, .+\.$/)).toBeInTheDocument();
  expect(screen.queryByText(/belongs to the Google Sheets report/)).not.toBeInTheDocument();
  expect(__mock.state.requests.some((r) => r.path.endsWith('/generated-sql'))).toBe(false);
});

it('says when the last run is behind the current changes', async () => {
  renderWithServices(
    <SqlTab lastRun={{ sql: 'SELECT 1', ranAt, changedSince: true }} draftChanged={false} reportTitle='R' onCreateSheets={vi.fn()} onUpdateSheets={vi.fn()} />,
    await mockServices(),
  );
  expect(screen.getByText(/Run the report again to see the SQL for your changes\.$/)).toBeInTheDocument();
});

it('waits for the run before showing anything', async () => {
  renderWithServices(<SqlTab lastRun='pending' draftChanged={false} reportTitle='R' onCreateSheets={vi.fn()} onUpdateSheets={vi.fn()} />, await mockServices());
  expect(screen.queryByTestId('sqlCode')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create Google Sheets report' })).not.toBeInTheDocument();
});

it('offers a Google Sheets report when the run has no SQL', async () => {
  renderWithServices(
    <SqlTab lastRun={{ sql: null, ranAt, changedSince: false }} draftChanged={false} reportTitle='R' onCreateSheets={vi.fn()} onUpdateSheets={vi.fn()} />,
    await mockServices(),
  );
  expect(screen.getByText("ODM didn't return SQL for the last run.")).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create Google Sheets report' })).toBeInTheDocument();
});
