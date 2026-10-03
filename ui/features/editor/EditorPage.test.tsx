import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM, sampleRows, STORAGE } from '../../fixtures/smart-data';
import { emptyDraft, type ReportDraft } from '../../lib/report-draft';
import { configHash, type StoredReport } from '../../lib/report-store';
import { toSnapshot } from '../../lib/run-snapshot';
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

const optionTitles = (list: HTMLElement) => within(list).queryAllByRole('option').map((o) => o.textContent);

/** Picks a data mart in the searchable picker named `name`. */
async function pickMart(name: 'Data mart' | 'Report on', title: string) {
  await userEvent.click(await screen.findByRole('combobox', { name }));
  await userEvent.click(within(screen.getByRole('listbox', { name })).getByRole('option', { name: title }));
}

async function startVisitorReport() {
  renderWithServices(<EditorPage onBack={vi.fn()} />, await mockServices());
  await pickMart('Data mart', 'Visitor');
  await userEvent.click(screen.getByRole('button', { name: 'Start' }));
  // The panel mounts at once; its fields follow when the schema has loaded.
  await screen.findByRole('checkbox', { name: 'Email (Visitor)' });
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

describe('the last result', () => {
  const queries = () => __mock.state.requests.filter((r) => r.path.startsWith('/api/external/http-data/')).length;

  it('saves on Apply & Save, keeps the result for the member and shows it on the next opening without a query', async () => {
    await startVisitorReport();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Email (Visitor)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Apply & Save' }));
    expect(await screen.findByText('1–100 of 120')).toBeInTheDocument();
    const [saved] = [...__mock.state.collections.get('reports')!.values()];
    await waitFor(() => expect(__mock.state.collections.get('snapshots')?.get(saved!.id)).toBeDefined());
    expect(__mock.state.collections.get('snapshots')!.get(saved!.id)!.parentId).toBe(DM.visitor);
    // Nothing changed since, so there is nothing to apply or save.
    expect(screen.getByRole('button', { name: 'Apply & Save' })).toBeDisabled();

    cleanup();
    const before = queries();
    renderWithServices(<EditorPage reportId={saved!.id} onBack={vi.fn()} />, await mockServices());
    expect(await screen.findByText('1–100 of 120')).toBeInTheDocument();
    expect(screen.getByText(/^Last updated /)).toBeInTheDocument();
    expect(queries()).toBe(before);

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(queries()).toBe(before + 1));
  });

  it('opens empty when the kept result is of another main data mart', async () => {
    __mock.seedReport('r1', {
      schemaVersion: 1, title: 'Visitors', createdBy: 'demo-user', updatedBy: 'demo-user',
      draft: { ...emptyDraft(DM.visitor), columns: [{ name: 'email', aliasPath: '' }] },
    });
    const services = await mockServices();
    await services.snapshots.put('r1', toSnapshot({
      ranAt: '2026-10-02T10:00:00.000Z', configHash: 'x', draft: { ...emptyDraft(DM.session), columns: [{ name: 'source', aliasPath: '' }] },
      rows: [{ source: 'google' }], truncated: false, totals: null,
    }));
    renderWithServices(<EditorPage reportId='r1' onBack={vi.fn()} />, services);
    expect(await screen.findByText('Pick columns and click Apply & Save')).toBeInTheDocument();
    expect(screen.queryByText('google')).not.toBeInTheDocument();
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
  await pickMart('Data mart', 'Visitor');
  await userEvent.click(screen.getByRole('button', { name: 'Start' }));
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Email (Visitor)' }));
  await userEvent.click(screen.getByTestId('apply'));
  expect(await screen.findByText('Running query…')).toBeInTheDocument();
  await pickMart('Report on', 'Session');
  await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove and continue' }));
  expect(await screen.findByText('Pick columns and click Apply & Save')).toBeInTheDocument();
  expect(screen.queryByText('Running query…')).not.toBeInTheDocument();
  expect(signal?.aborted).toBe(true);
});

describe('changing the main data mart', () => {
  it('returns the focus to Report on after confirming a change that drops columns', async () => {
    await startVisitorReport();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Email (Visitor)' }));
    await pickMart('Report on', 'Session');
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove and continue' }));
    expect(await screen.findByText('1 row = 1 Session')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Report on' })).toHaveFocus());
  });

  it('drops a pending filter request for a field of the previous data mart', async () => {
    await startVisitorReport();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Email (Visitor)' }));
    await userEvent.click(screen.getByTestId('apply'));
    await userEvent.click(await screen.findByRole('button', { name: 'Column options for Email' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Filter…' }));
    expect(await screen.findByRole('form', { name: 'Filter Email' })).toBeInTheDocument();

    await pickMart('Report on', 'Session');
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove and continue' }));
    await screen.findByText('1 row = 1 Session');
    expect(screen.queryByRole('form', { name: /^Filter / })).not.toBeInTheDocument();

    // A new filter on the new data mart opens its editor; the old request no longer shadows it.
    await userEvent.click(within(screen.getByRole('region', { name: 'Filters' })).getByRole('button', { name: 'Filter' }));
    const pick = within(await screen.findByRole('dialog')).getAllByRole('button')[0]!;
    const label = pick.firstChild!.textContent!;
    await userEvent.click(pick);
    expect(screen.getByRole('form', { name: `Filter ${label}` })).toBeInTheDocument();
  });
});

describe('storages', () => {
  it('filters the start screen by storage and searches the data marts', async () => {
    renderWithServices(<EditorPage onBack={vi.fn()} />, await mockServices());
    const storage = await screen.findByRole('combobox', { name: 'Storage' });
    expect(screen.getByText('Storage', { selector: 'label' })).toBeVisible();
    expect(screen.getByText('Data mart', { selector: 'span' })).toBeVisible();
    expect(within(storage).getAllByRole('option').map((o) => o.textContent)).toEqual(['Finance Snowflake', 'Marketing BigQuery']);
    // No storage was picked yet, so the one with the most data marts comes first.
    expect(storage).toHaveValue(STORAGE.bigquery);

    const picker = screen.getByRole('combobox', { name: 'Data mart' });
    expect(picker).toHaveTextContent('Contact');
    await userEvent.click(picker);
    expect(optionTitles(screen.getByRole('listbox', { name: 'Data mart' }))).toEqual(['Contact', 'Page', 'Pageview', 'Session', 'User', 'Visitor']);
    await userEvent.type(screen.getByRole('textbox', { name: 'Search data marts' }), 'sess');
    expect(optionTitles(screen.getByRole('listbox', { name: 'Data mart' }))).toEqual(['Session']);
    await userEvent.keyboard('{Enter}');
    expect(picker).toHaveTextContent('Session');

    await userEvent.selectOptions(storage, STORAGE.snowflake);
    expect(picker).toHaveTextContent('Invoice');
    await userEvent.click(picker);
    expect(optionTitles(screen.getByRole('listbox', { name: 'Data mart' }))).toEqual(['Invoice']);
    await userEvent.keyboard('{Escape}');

    // Changing the storage resets the data mart choice.
    await userEvent.selectOptions(storage, STORAGE.bigquery);
    expect(picker).toHaveTextContent('Contact');
  });

  it("shows a saved report's storage and switches the main data mart with it after confirming", async () => {
    __mock.seedReport('r1', {
      schemaVersion: 1, title: 'Visitors', createdBy: 'demo-user', updatedBy: 'demo-user',
      draft: { ...emptyDraft(DM.visitor), columns: [{ name: 'email', aliasPath: '' }] },
    });
    renderWithServices(<EditorPage reportId='r1' onBack={vi.fn()} />, await mockServices());
    await screen.findByRole('checkbox', { name: 'Email (Visitor)' });
    const storage = screen.getByRole('combobox', { name: 'Storage' });
    expect(storage).toHaveValue(STORAGE.bigquery);
    // Invoice lives in another storage, so it's neither offered nor counted as unreachable.
    await userEvent.click(screen.getByRole('combobox', { name: 'Report on' }));
    expect(optionTitles(screen.getByRole('listbox', { name: 'Report on' }))).not.toContain('Invoice');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText(/can't be reached/)).not.toBeInTheDocument();

    await userEvent.selectOptions(storage, STORAGE.snowflake);
    let dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Report on Invoice?')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('combobox', { name: 'Storage' })).toHaveValue(STORAGE.bigquery);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Storage' }), STORAGE.snowflake);
    dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove and continue' }));
    expect(await screen.findByText('1 row = 1 Invoice')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Storage' })).toHaveValue(STORAGE.snowflake);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Storage' })).toHaveFocus());
    expect(screen.getByRole('combobox', { name: 'Report on' })).toHaveTextContent('Invoice');
  });

  it('falls back to every reportable data mart when the data mart list names no storage', async () => {
    const services = await mockServices();
    const list = services.api.listDataMarts;
    services.api = { ...services.api, listDataMarts: async () => (await list()).map((m) => ({ ...m, storage: { type: m.storage.type, title: '' } })) };
    renderWithServices(<EditorPage onBack={vi.fn()} />, services);
    await userEvent.click(await screen.findByRole('combobox', { name: 'Data mart' }));
    expect(screen.queryByRole('combobox', { name: 'Storage' })).not.toBeInTheDocument();
    expect(optionTitles(screen.getByRole('listbox', { name: 'Data mart' }))).toEqual([
      'Contact', 'Invoice', 'Page', 'Pageview', 'Session', 'User', 'Visitor',
    ]);
    await userEvent.click(screen.getByRole('option', { name: 'Visitor' }));
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    await screen.findByTestId('columnPanel');
    expect(screen.queryByRole('combobox', { name: 'Storage' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Report on' }));
    expect(optionTitles(screen.getByRole('listbox', { name: 'Report on' }))).toContain('Invoice');
  });

  it('says when no data mart is available for reports', async () => {
    const services = await mockServices();
    services.api = { ...services.api, listDataMarts: async () => [] };
    renderWithServices(<EditorPage onBack={vi.fn()} />, services);
    expect(await screen.findByText('No published data marts available for reports')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
  });
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
  await pickMart('Data mart', 'Visitor');
  await userEvent.click(screen.getByRole('button', { name: 'Start' }));
  expect(await screen.findByText("Couldn't load Visitor")).toBeInTheDocument();
  __mock.clearFailures();
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('checkbox', { name: 'Email (Visitor)' })).toBeInTheDocument();
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
  await userEvent.click(screen.getByRole('button', { name: 'Apply & Save' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Save as copy' }));
  await waitFor(() => expect(reports().size).toBe(2));
  expect(reports().get('theirs')!.document).toEqual(theirs);
  const copy = [...reports().values()].find((d) => d.id !== 'theirs')!.document as StoredReport;
  expect(copy).toMatchObject({ title: 'Theirs (copy)', createdBy: 'demo-user' });
});

it('never overwrites when the confirmation is dismissed with Enter', async () => {
  await openTheirs();
  await userEvent.type(screen.getByRole('textbox', { name: 'Report title' }), ' edited');
  await userEvent.click(screen.getByRole('button', { name: 'Apply & Save' }));
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
  await pickMart('Data mart', 'Visitor');
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

const mockNarrowScreen = () =>
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (media) => ({ matches: true, media, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList,
  );

it('mounts the column panel only in the side sheet on narrow screens', async () => {
  const narrow = mockNarrowScreen();
  try {
    renderWithServices(<EditorPage onBack={vi.fn()} />, await mockServices());
    await pickMart('Data mart', 'Visitor');
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Show column panel' }));
    expect(await screen.findAllByTestId('columnPanel')).toHaveLength(1);
    expect(within(screen.getByRole('dialog')).getByTestId('columnPanel')).toBeInTheDocument();
    expect(screen.queryByRole('separator', { name: 'Resize column panel' })).not.toBeInTheDocument();
  } finally {
    narrow.mockRestore();
  }
});

describe('the column panel layout', () => {
  const initialWidth = window.innerWidth;
  const resizeWindow = (width: number) =>
    act(() => {
      window.innerWidth = width;
      window.dispatchEvent(new Event('resize'));
    });

  beforeEach(() => {
    window.innerWidth = 1200;
  });
  afterEach(() => {
    window.innerWidth = initialWidth;
  });

  const handle = () => screen.getByRole('separator', { name: 'Resize column panel' });
  const panelWidth = () => screen.getByRole('complementary').style.width;

  it('resizes by dragging its left edge, between 320px and 40% of the window', async () => {
    await startVisitorReport();
    expect(handle()).toHaveAttribute('aria-orientation', 'vertical');
    expect(handle()).toHaveAttribute('aria-valuenow', '380');
    expect(handle()).toHaveAttribute('aria-valuemin', '320');
    expect(handle()).toHaveAttribute('aria-valuemax', '480');
    expect(panelWidth()).toBe('380px');

    fireEvent.pointerDown(handle(), { pointerId: 1, clientX: 800 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 750 });
    expect(panelWidth()).toBe('430px');
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 100 });
    expect(panelWidth()).toBe('480px');
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 1100 });
    expect(panelWidth()).toBe('320px');
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 760 });
    fireEvent.pointerUp(handle(), { pointerId: 1, clientX: 760 });
    expect(panelWidth()).toBe('420px');
    // The drag is over: moving the pointer no longer resizes.
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 700 });
    expect(panelWidth()).toBe('420px');
    expect(handle()).toHaveAttribute('aria-valuenow', '420');

    // A narrower window lowers the maximum and clamps the panel to it.
    resizeWindow(1000);
    expect(handle()).toHaveAttribute('aria-valuemax', '400');
    expect(panelWidth()).toBe('400px');
  });

  it('resizes with the arrow keys in 16px steps', async () => {
    await startVisitorReport();
    handle().focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(panelWidth()).toBe('396px');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(panelWidth()).toBe('364px');
    for (let i = 0; i < 5; i++) await userEvent.keyboard('{ArrowRight}');
    expect(panelWidth()).toBe('320px');
    for (let i = 0; i < 20; i++) await userEvent.keyboard('{ArrowLeft}');
    expect(handle()).toHaveAttribute('aria-valuenow', '480');
  });

  it('hides the panel so the report takes the full width, and restores its width', async () => {
    await startVisitorReport();
    handle().focus();
    await userEvent.keyboard('{ArrowLeft}');
    await userEvent.click(screen.getByRole('button', { name: 'Hide column panel' }));
    expect(screen.queryByTestId('columnPanel')).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Data table' })).toBeInTheDocument();
    expect(screen.getByText('Pick columns and click Apply & Save')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show column panel' }));
    expect(screen.getByTestId('columnPanel')).toBeInTheDocument();
    expect(panelWidth()).toBe('396px');
  });

  it.each([
    ['wide', false],
    ['narrow', true],
  ])('keeps the panel and the focus while a new main data mart loads on %s screens', async (_screen, isNarrow) => {
    const narrow = isNarrow ? mockNarrowScreen() : undefined;
    try {
      renderWithServices(<EditorPage onBack={vi.fn()} />, await mockServices());
      await pickMart('Data mart', 'Visitor');
      await userEvent.click(screen.getByRole('button', { name: 'Start' }));
      if (isNarrow) await userEvent.click(await screen.findByRole('button', { name: 'Show column panel' }));
      await screen.findByRole('checkbox', { name: 'Email (Visitor)' });
      const panel = screen.getByTestId('columnPanel');
      await pickMart('Report on', 'Session');
      expect(await screen.findByText('1 row = 1 Session')).toBeInTheDocument();
      await screen.findAllByRole('checkbox', { name: /\(Session\)$/ });
      expect(screen.getByTestId('columnPanel')).toBe(panel);
      expect(screen.getByRole('combobox', { name: 'Report on' })).toHaveFocus();
    } finally {
      narrow?.mockRestore();
    }
  });
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

  const updateSheets = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Update Google Sheets' }));
    const guard = screen.queryByRole('alertdialog');
    if (guard) await userEvent.click(within(guard).getByRole('button', { name: 'Overwrite' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Update report' }));
  };

  it('saves on Apply & Save without updating Google Sheets', async () => {
    const stored = await openLinked();
    await userEvent.click(screen.getByRole('button', { name: 'Apply & Save' }));
    await waitFor(() => expect((savedDoc().document as StoredReport).draft.columns.map((c) => c.name)).toContain('client_id'));
    expect(puts()).toEqual([]);
    expect((savedDoc().document as StoredReport).linkedReport).toEqual(stored.linkedReport);
    expect(screen.getByRole('button', { name: 'Update Google Sheets' })).toBeEnabled();
  });

  it('keeps the edits when ODM rejects the update', async () => {
    const stored = await openLinked();
    __mock.fail('/api/reports/report-1', { code: 'HTTP_ERROR', status: 400, message: 'Bad Request', details: { message: 'Unknown column client_id.' } }, 'PUT');
    await updateSheets();
    expect(await screen.findByText("Saved. Google Sheets wasn't updated: Unknown column client_id.")).toBeInTheDocument();
    const doc = savedDoc().document as StoredReport;
    expect(doc.draft.columns.map((c) => c.name)).toContain('client_id');
    expect(doc.linkedReport?.syncedDraftHash).toBe(stored.linkedReport!.syncedDraftHash);
  });

  it("keeps the edits and shows ODM's reason when overwriting another member's linked report is refused", async () => {
    await openLinked({ createdBy: 'someone', updatedBy: 'someone' });
    __mock.fail('/api/reports/report-1', {
      code: 'HTTP_ERROR', status: 403, message: 'Forbidden',
      details: { message: 'You are not an owner of this report.', error: 'Forbidden', statusCode: 403 },
    }, 'PUT');
    await updateSheets();
    expect(await screen.findByText("Saved. Google Sheets wasn't updated: You are not an owner of this report.")).toBeInTheDocument();
    expect((reports().get('mine')!.document as StoredReport).draft.columns.map((c) => c.name)).toContain('client_id');
  });

  it('unlinks the Google Sheets report instead of updating it when the main data mart changed', async () => {
    await openLinked();
    await pickMart('Report on', 'Session');
    const confirm = await screen.findByRole('alertdialog');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Remove and continue' }));
    await screen.findByText('1 row = 1 Session');
    await updateSheets();
    expect(await screen.findByText(/reads the previous data mart, so it's no longer linked/)).toBeInTheDocument();
    expect(puts()).toEqual([]);
    expect(reports().size).toBe(1);
    expect(savedDoc()).toMatchObject({ parentId: DM.session });
    expect((savedDoc().document as StoredReport).linkedReport).toBeUndefined();
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
    await pickMart('Data mart', 'Visitor');
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
