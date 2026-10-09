import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM, VISITOR_GRAPH, VISITOR_SCHEMA, sampleRows } from '../../fixtures/smart-data';
import { buildSchemaIndex } from '../../lib/schema-index';
import { emptyDraft, type ReportDraft } from '../../lib/report-draft';
import type { RunState } from '../editor/use-query-run';
import { renderUi } from '../../test/render';
import { ResultTable } from './ResultTable';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);
const draft: ReportDraft = { ...emptyDraft(DM.visitor), columns: [{ name: 'email', aliasPath: '' }, { name: 'visits', aliasPath: '' }] };

function success(rows: Record<string, unknown>[], extra: Partial<Extract<RunState, { status: 'success' }>> = {}): RunState {
  return {
    status: 'success', result: { rows, truncated: false, runId: 'r1' }, totals: null, executedSql: null, appliedHash: 'h', appliedDraft: draft,
    ranAt: '2026-10-02T10:49:55.000Z', settled: true, ...extra,
  };
}

function setup(run: RunState, d: ReportDraft = draft, linked = false, stale = false) {
  const handlers = {
    onSort: vi.fn(), onSetAggregations: vi.fn(), onSetDateTrunc: vi.fn(), onEditFilter: vi.fn(),
    onRemoveFilter: vi.fn(), onCreateSheets: vi.fn(), onCancel: vi.fn(), onRetry: vi.fn(), onRefresh: vi.fn(),
  };
  renderUi(<ResultTable index={index} graph={VISITOR_GRAPH} draft={d} run={run} stale={stale} linked={linked} {...handlers} />);
  return handlers;
}

it('prompts to apply before the first run', () => {
  setup({ status: 'idle' });
  expect(screen.getByText('Pick columns and click Apply & Save')).toBeInTheDocument();
});

it('shows 100 rows per page and pages without re-querying', async () => {
  setup(success(sampleRows(['email', 'visits'], 120)));
  expect(screen.getAllByRole('row')).toHaveLength(1 + 100); // header + body
  expect(screen.getByText('1–100 of 120')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getByText('101–120 of 120')).toBeInTheDocument();
  expect(screen.getByText('email-101')).toBeInTheDocument();
});

it('points to Google Sheets when the result hits the cap', async () => {
  const rows = sampleRows(['email'], 2500);
  const h = setup(success(rows, { result: { rows, truncated: true, runId: 'r1' } }));
  expect(screen.getByText('Showing the first 2,500 rows.')).toBeInTheDocument();
  expect(screen.getByText('Need more? Create a Google Sheets report with this configuration.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Create Google Sheets report' }));
  expect(h.onCreateSheets).toHaveBeenCalled();
});

it('offers an update instead when the report is already linked to Google Sheets', async () => {
  const rows = sampleRows(['email'], 2500);
  const h = setup(success(rows, { result: { rows, truncated: true, runId: 'r1' } }), draft, true);
  await userEvent.click(screen.getByRole('button', { name: 'Update Google Sheets' }));
  expect(h.onCreateSheets).toHaveBeenCalled();
});

it('renders totals, automatic aggregations and awkward cells', () => {
  setup(success([{ email: null, 'visits | SUM': 12 }, { email: 'x'.repeat(5000), 'visits | SUM': 3 }], { totals: { 'visits | SUM': 15, 'visits | AVG': 7.5 } }));
  expect(screen.getByText('SUM · Automatic')).toBeInTheDocument();
  expect(screen.getByTestId('totals-visits | SUM')).toHaveTextContent('15');
  expect(screen.getByText('—')).toBeInTheDocument();
  const long = screen.getByTitle('x'.repeat(5000));
  expect(long).toHaveClass('truncate');
});

it('explains an empty result', () => {
  setup(success([]));
  expect(screen.getByText('No rows for this period')).toBeInTheDocument();
});

it('shows errors with retry', async () => {
  const h = setup({ status: 'error', error: { message: "Couldn't reach OWOX Data Marts.", retryable: true }, appliedHash: 'h' });
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(h.onRetry).toHaveBeenCalled();
});

it('sorts from the column menu', async () => {
  const h = setup(success(sampleRows(['email', 'visits'], 3)));
  await userEvent.click(screen.getByRole('button', { name: 'Column options for Email' }));
  await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Z → A' }));
  expect(h.onSort).toHaveBeenCalledWith('email', 'desc');
});

it('shows the running state and cancels', async () => {
  const h = setup({ status: 'running', appliedHash: 'h' });
  expect(screen.getByText('Running query…')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(h.onCancel).toHaveBeenCalled();
});

it('says when a query was cancelled', () => {
  setup({ status: 'idle', cancelled: true });
  expect(screen.getByText('Query cancelled')).toBeInTheDocument();
});

it('renders booleans and objects as text', () => {
  setup(success([{ email: true, visits: { a: [1, 2] } }]));
  expect(screen.getByText('true')).toBeInTheDocument();
  expect(screen.getByText('{"a":[1,2]}')).toBeInTheDocument();
});

it('marks the selected aggregation per output column', async () => {
  const d: ReportDraft = { ...draft, columns: [{ name: 'visits', aliasPath: '', aggregations: ['SUM', 'AVG'] }] };
  setup(success([{ 'visits | SUM': 1, 'visits | AVG': 2 }], { appliedDraft: d }), d);
  await userEvent.click(screen.getAllByRole('button', { name: 'Column options for Visits' })[1]);
  expect(await screen.findByRole('menuitemradio', { name: 'Average' })).toBeChecked();
  expect(screen.getByRole('menuitemradio', { name: 'Sum' })).not.toBeChecked();
});

it('hides None for automatic aggregations', async () => {
  setup(success([{ 'visits | SUM': 1 }]));
  await userEvent.click(screen.getByRole('button', { name: 'Column options for Visits' }));
  expect(await screen.findByRole('menuitemradio', { name: 'Sum' })).toBeChecked();
  expect(screen.queryByRole('menuitemradio', { name: 'None' })).not.toBeInTheDocument();
});

it('formats the range with thousands separators', async () => {
  setup(success(sampleRows(['email'], 2500)));
  for (let i = 0; i < 10; i++) await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getByText('1,001–1,100 of 2,500')).toBeInTheDocument();
});

it('heads a column with the field, then its data mart, and previews a joined one\'s join path', async () => {
  const joined: ReportDraft = { ...emptyDraft(DM.visitor), columns: [{ name: 'email', aliasPath: '' }, { name: 'sessions__source', aliasPath: 'sessions' }] };
  setup(success(sampleRows(['email', 'sessions__source'], 2), { appliedDraft: joined }), joined);
  const [, source] = screen.getAllByRole('columnheader');
  const field = within(source!).getByText('Source');
  const mart = within(source!).getByText('Session');
  expect(field.compareDocumentPosition(mart)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  await userEvent.hover(mart);
  const path = await screen.findByRole('list', { name: 'Join path' }, { timeout: 2000 });
  expect(within(path).getByText('client_id = client_id')).toBeInTheDocument();
});

it('says when the result was updated and refreshes it', async () => {
  const h = setup(success(sampleRows(['email', 'visits'], 3)));
  expect(screen.getByText(`Last updated ${new Date('2026-10-02T10:49:55.000Z').toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(h.onRefresh).toHaveBeenCalled();
});

it('offers no refresh of a result the report no longer matches', () => {
  setup(success(sampleRows(['email', 'visits'], 3)), draft, false, true);
  expect(screen.getByText('You changed the report. Click Apply & Save to update the result.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
});

it('says when a kept last result lost rows to the size limit', () => {
  setup(success(sampleRows(['email', 'visits'], 3), { restored: true, rowCount: 2500 }));
  expect(screen.getByText('Showing the first 3 of 2,500 rows kept from the last run. Refresh to see them all.')).toBeInTheDocument();
});
