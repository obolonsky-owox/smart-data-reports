import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { DM, sampleRows } from '../../fixtures/smart-data';
import { emptyDraft, type ReportDraft } from '../../lib/report-draft';
import { configHash, type StoredReport } from '../../lib/report-store';
import { __mock, __resetForTests } from '../../sdk-mock';
import { mockServices, renderWithServices } from '../../test/render';
import { EditorPage } from './EditorPage';

vi.mock('sonner', async (original) => ({
  ...(await original<typeof import('sonner')>()),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));

beforeEach(() => {
  __resetForTests();
  vi.clearAllMocks();
});

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

it('confirms a join path change that drops selections, and keeps the path on cancel', async () => {
  await startVisitorReport();
  await userEvent.click(screen.getByRole('button', { name: 'Session' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Source (Session)' }));
  await userEvent.click(screen.getByRole('button', { name: 'Page' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Title (Page)' }));

  await userEvent.click(screen.getByRole('radio', { name: 'via Contact › Session' }));
  let dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText('Change the join path?')).toBeInTheDocument();
  expect(within(dialog).getByText(/will be removed: Title, Creation Date\./)).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'via Session' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Title (Page)' })).toBeChecked();

  await userEvent.click(screen.getByRole('radio', { name: 'via Contact › Session' }));
  dialog = await screen.findByRole('alertdialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Remove and continue' }));
  expect(screen.getByRole('radio', { name: 'via Contact › Session' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Source (Session)' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Title (Page)' })).not.toBeChecked();
  expect(screen.getByRole('tab', { name: 'Selected (1)' })).toBeInTheDocument();
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

it('links a new Google Sheets report before its first run, so a failed run offers Update', async () => {
  await startVisitorReport();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Email (Visitor)' }));
  await userEvent.click(screen.getByRole('button', { name: 'Create Google Sheets report' }));
  const dialog = await screen.findByRole('dialog');
  __mock.fail('/api/reports/', { code: 'HTTP_ERROR', status: 500, message: 'boom' }, 'GET');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Create report' }));
  expect(await within(dialog).findByRole('button', { name: 'Update report' })).toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: 'Create report' })).not.toBeInTheDocument();
  const saved = [...reports().values()][0]!.document as StoredReport;
  expect(saved.linkedReport).toMatchObject({ reportId: 'report-2', dataMartId: DM.visitor });
});

it('cancels the running query and clears the result when the main data mart changes', async () => {
  const services = await mockServices();
  let signal: AbortSignal | undefined;
  services.api = {
    ...services.api,
    runQuery: vi.fn((_id: string, _options: unknown, s?: AbortSignal) => ((signal = s), new Promise<never>(() => {}))),
  };
  renderWithServices(<EditorPage onBack={vi.fn()} />, services);
  await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Data mart' }), DM.visitor);
  await userEvent.click(screen.getByRole('button', { name: 'Start' }));
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Email (Visitor)' }));
  await userEvent.click(screen.getByTestId('apply'));
  expect(await screen.findByText('Running query…')).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Report on' }), DM.session);
  await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove and continue' }));
  expect(await screen.findByText('Pick columns and click Apply')).toBeInTheDocument();
  expect(screen.queryByText('Running query…')).not.toBeInTheDocument();
  expect(signal?.aborted).toBe(true);
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

describe('saving a report linked to Google Sheets', () => {
  const linkedDraft: ReportDraft = { ...emptyDraft(DM.visitor), columns: [{ name: 'email', aliasPath: '' }, { name: 'sessions__source', aliasPath: 'sessions' }] };
  const link = (draft: ReportDraft, extra: Partial<NonNullable<StoredReport['linkedReport']>> = {}) => ({
    reportId: 'report-1', destinationId: 'dest-sheets', spreadsheetId: 'sheet-1', sheetId: 0, syncedDraftHash: configHash(draft), ...extra,
  });

  async function openLinked(report: Partial<StoredReport> = {}) {
    const stored: StoredReport = {
      schemaVersion: 1, title: 'Linked', createdBy: 'demo-user', updatedBy: 'demo-user',
      draft: linkedDraft, linkedReport: link(linkedDraft, { dataMartId: DM.visitor }), ...report,
    };
    __mock.seedReport('mine', stored);
    __mock.state.reports.set('report-1', { id: 'report-1', title: 'Linked', body: {} });
    renderWithServices(<EditorPage reportId='mine' onBack={vi.fn()} />, await mockServices());
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Client ID (Visitor)' }));
    return stored;
  }

  const savedDoc = () => [...reports().values()][0]!;
  const puts = () => __mock.state.requests.filter((r) => r.method === 'PUT');

  it('keeps the edits when ODM rejects the update', async () => {
    const stored = await openLinked();
    __mock.fail('/api/reports/report-1', { code: 'HTTP_ERROR', status: 400, message: 'Bad Request', details: { message: 'Unknown column client_id.' } }, 'PUT');
    await userEvent.click(screen.getByRole('button', { name: 'Save and update Google Sheets' }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith("Saved. Google Sheets wasn't updated: Unknown column client_id."));
    const doc = savedDoc().document as StoredReport;
    expect(doc.draft.columns.map((c) => c.name)).toContain('client_id');
    expect(doc.linkedReport?.syncedDraftHash).toBe(stored.linkedReport!.syncedDraftHash);
    expect(screen.queryByRole('status', { name: 'Unsaved changes' })).not.toBeInTheDocument();
  });

  it("keeps the edits and shows ODM's reason when overwriting another member's linked report is refused", async () => {
    await openLinked({ createdBy: 'someone', updatedBy: 'someone' });
    __mock.fail('/api/reports/report-1', {
      code: 'HTTP_ERROR', status: 403, message: 'Forbidden',
      details: { message: 'You are not an owner of this report.', error: 'Forbidden', statusCode: 403 },
    }, 'PUT');
    await userEvent.click(screen.getByRole('button', { name: 'Save and update Google Sheets' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Overwrite' }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith("Saved. Google Sheets wasn't updated: You are not an owner of this report."));
    expect((reports().get('mine')!.document as StoredReport).draft.columns.map((c) => c.name)).toContain('client_id');
  });

  it('unlinks the Google Sheets report instead of updating it when the main data mart changed', async () => {
    await openLinked();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Report on' }), DM.session);
    const confirm = await screen.findByRole('alertdialog');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Remove and continue' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Save and update Google Sheets' }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('create a new Google Sheets report for Session')));
    expect(puts()).toEqual([]);
    expect(reports().size).toBe(1);
    expect(savedDoc()).toMatchObject({ parentId: DM.session });
    expect((savedDoc().document as StoredReport).linkedReport).toBeUndefined();
  });

  it('saves without updating Google Sheets while the report has problems', async () => {
    const broken: ReportDraft = { ...linkedDraft, columns: [...linkedDraft.columns, { name: 'gone_field', aliasPath: '' }] };
    await openLinked({ draft: broken, linkedReport: link(broken, { dataMartId: DM.visitor }) });
    await userEvent.click(screen.getByRole('button', { name: 'Save and update Google Sheets' }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/^Saved\. Google Sheets wasn't updated: /)));
    expect(puts()).toEqual([]);
    expect((savedDoc().document as StoredReport).draft.columns.map((c) => c.name)).toContain('client_id');
  });
});

describe('going back', () => {
  it('goes straight back when nothing changed', async () => {
    const onBack = vi.fn();
    renderWithServices(<EditorPage onBack={onBack} />, await mockServices());
    await userEvent.click(await screen.findByRole('button', { name: 'Back to reports' }));
    expect(onBack).toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('asks before discarding unsaved changes', async () => {
    const onBack = vi.fn();
    renderWithServices(<EditorPage onBack={onBack} />, await mockServices());
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Data mart' }), DM.visitor);
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Email (Visitor)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back to reports' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' });
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(onBack).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Back to reports' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }));
    expect(onBack).toHaveBeenCalled();
  });
});
