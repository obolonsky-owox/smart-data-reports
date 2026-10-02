import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM, sampleRows } from '../../fixtures/smart-data';
import { emptyDraft } from '../../lib/report-draft';
import type { StoredReport } from '../../lib/report-store';
import { __mock, __resetForTests } from '../../sdk-mock';
import { mockServices, renderWithServices } from '../../test/render';
import { EditorPage } from './EditorPage';

beforeEach(() => __resetForTests());

async function startVisitorReport() {
  renderWithServices(<EditorPage onBack={vi.fn()} />, await mockServices());
  await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Data mart' }), DM.visitor);
  await userEvent.click(screen.getByRole('button', { name: 'Start' }));
  await screen.findByTestId('columnPanel');
}

const lastQuery = () =>
  [...__mock.state.requests].reverse().find((r) => r.path.startsWith('/api/external/http-data/')) as
    | { body: { column: string[]; filter: unknown[] | null; limit: number } }
    | undefined;

it('builds a report from scratch with a 30-day default period and shows rows', async () => {
  await startVisitorReport();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Email (Visitor)' }));
  await userEvent.click(screen.getByTestId('apply'));
  expect(await screen.findByText('1–100 of 120')).toBeInTheDocument();
  expect(lastQuery()?.body).toMatchObject({
    column: ['email'],
    limit: 2501,
    filter: [{ column: 'creation_date', operator: 'relative_date', value: { kind: 'last_n_days', n: 29 } }],
  });
});

it('asks which date to use for a joined mart with several dates', async () => {
  await startVisitorReport();
  await userEvent.click(screen.getByRole('button', { name: 'User' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Creation Source (User)' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('radio', { name: 'First Log In to OWOX Data Marts' }));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Add date' }));
  await userEvent.click(screen.getByRole('tab', { name: /selected/i }));
  expect(within(screen.getByRole('region', { name: 'Date ranges' })).getByText('First Log In to OWOX Data Marts')).toBeInTheDocument();
});

it('routes a capped result to a Google Sheets report and then shows its SQL', async () => {
  __mock.setRows((columns) => sampleRows(columns, 2600));
  await startVisitorReport();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Email (Visitor)' }));
  await userEvent.click(screen.getByTestId('apply'));
  // The header has a button with the same name; use the one in the row-cap banner.
  await userEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Create Google Sheets report' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Create report' }));
  expect(await screen.findByText('Your Google Sheets report is ready.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Done' }));
  await userEvent.click(screen.getByRole('tab', { name: 'SQL' }));
  expect(await screen.findByTestId('sqlCode')).toHaveTextContent('SELECT email');
  expect(screen.getByRole('button', { name: 'Update Google Sheets' })).toBeInTheDocument();
});

it('blocks Apply and explains when a saved column no longer exists', async () => {
  __mock.seedReport('r1', {
    schemaVersion: 1, title: 'Old', createdBy: 'demo-user', updatedBy: 'demo-user',
    draft: { ...emptyDraft(DM.visitor), columns: [{ name: 'gone_field', aliasPath: '' }] },
  });
  renderWithServices(<EditorPage reportId='r1' onBack={vi.fn()} />, await mockServices());
  expect(await screen.findByText('"gone_field" is no longer available. Remove it to run the report.')).toBeInTheDocument();
  expect(screen.getByTestId('apply')).toBeDisabled();
});

it('shows a schema failure with a retry instead of a blank screen', async () => {
  __mock.fail(`/api/data-marts/${DM.visitor}/blendable-schema`, { code: 'HTTP_ERROR', status: 500, message: 'boom' });
  renderWithServices(<EditorPage onBack={vi.fn()} />, await mockServices());
  await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Data mart' }), DM.visitor);
  await userEvent.click(screen.getByRole('button', { name: 'Start' }));
  expect(await screen.findByText("Couldn't load Visitor")).toBeInTheDocument();
  __mock.clearFailures();
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByTestId('columnPanel')).toBeInTheDocument();
});

const theirs: StoredReport = {
  schemaVersion: 1, title: 'Theirs', createdBy: 'someone', updatedBy: 'someone',
  draft: { ...emptyDraft(DM.visitor), columns: [{ name: 'email', aliasPath: '' }] },
};
const reports = () => __mock.state.collections.get('reports')!;
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));

async function openTheirs() {
  __mock.seedReport('theirs', theirs);
  renderWithServices(<EditorPage reportId='theirs' onBack={vi.fn()} />, await mockServices());
  return screen.findByRole('checkbox', { name: 'Client ID (Visitor)' });
}

it("saves someone else's report as a copy by default", async () => {
  await userEvent.click(await openTheirs());
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Save as copy' }));
  await waitFor(() => expect(reports().size).toBe(2));
  expect(reports().get('theirs')!.document).toEqual(theirs);
  const copy = [...reports().values()].find((d) => d.id !== 'theirs')!.document as StoredReport;
  expect(copy).toMatchObject({ title: 'Theirs (copy)', createdBy: 'demo-user' });
});

it('never overwrites when the confirmation is dismissed with Enter', async () => {
  await openTheirs();
  await userEvent.type(screen.getByRole('textbox', { name: 'Report title' }), ' edited');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  const confirm = await screen.findByRole('alertdialog');
  for (const name of ['Cancel', 'Overwrite', 'Save as copy']) expect(within(confirm).getByRole('button', { name })).toBeInTheDocument();
  await userEvent.keyboard('{Enter}');
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  await settle();
  expect(reports().size).toBe(1);
  expect(reports().get('theirs')!.document).toEqual(theirs);
});

it("asks before a Google Sheets report is created from someone else's report", async () => {
  await openTheirs();
  await userEvent.click(screen.getByRole('button', { name: 'Create Google Sheets report' }));
  await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Save as copy' }));
  expect(await screen.findByRole('button', { name: 'Create report' })).toBeInTheDocument();
  expect(reports().size).toBe(2);
  expect(reports().get('theirs')!.document).toEqual(theirs);
});

it('offers another data mart when the saved one is no longer available', async () => {
  __mock.seedReport('lost', {
    schemaVersion: 1, title: 'Lost', createdBy: 'demo-user', updatedBy: 'demo-user',
    draft: { ...emptyDraft('dm-missing'), columns: [{ name: 'email', aliasPath: '' }] },
  });
  renderWithServices(<EditorPage reportId='lost' onBack={vi.fn()} />, await mockServices());
  expect(await screen.findByText("This report's data mart is no longer available for reports.")).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Data mart' }), DM.visitor);
  await userEvent.click(screen.getByRole('button', { name: 'Use this data mart' }));
  expect(await screen.findByTestId('columnPanel')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Report title' })).toHaveValue('Lost');
});

it('retries a failed report load', async () => {
  __mock.seedReport('r1', { ...theirs, createdBy: 'demo-user' });
  __mock.fail('collection:reports', { code: 'HTTP_ERROR', status: 503, message: 'busy' });
  renderWithServices(<EditorPage reportId='r1' onBack={vi.fn()} />, await mockServices());
  const retry = await screen.findByRole('button', { name: 'Retry' });
  expect(screen.getByTestId('editorPage')).toBeInTheDocument();
  __mock.clearFailures();
  await userEvent.click(retry);
  expect(await screen.findByTestId('columnPanel')).toBeInTheDocument();
});

it('mounts the column panel only in the side sheet on narrow screens', async () => {
  const narrow = vi.spyOn(window, 'matchMedia').mockImplementation(
    (media) => ({ matches: true, media, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList,
  );
  try {
    renderWithServices(<EditorPage onBack={vi.fn()} />, await mockServices());
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Data mart' }), DM.visitor);
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Columns' }));
    expect(await screen.findAllByTestId('columnPanel')).toHaveLength(1);
    expect(within(screen.getByRole('dialog')).getByTestId('columnPanel')).toBeInTheDocument();
  } finally {
    narrow.mockRestore();
  }
});
