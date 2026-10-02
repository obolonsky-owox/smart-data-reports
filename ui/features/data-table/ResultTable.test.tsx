import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM, VISITOR_SCHEMA, sampleRows } from '../../fixtures/smart-data';
import { buildSchemaIndex } from '../../lib/schema-index';
import { emptyDraft, type ReportDraft } from '../../lib/report-draft';
import type { RunState } from '../editor/use-query-run';
import { renderUi } from '../../test/render';
import { ResultTable } from './ResultTable';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);
const draft: ReportDraft = { ...emptyDraft(DM.visitor), columns: [{ name: 'email', aliasPath: '' }, { name: 'visits', aliasPath: '' }] };

function success(rows: Record<string, unknown>[], extra: Partial<Extract<RunState, { status: 'success' }>> = {}): RunState {
  return { status: 'success', result: { rows, truncated: false, runId: 'r1' }, totals: null, appliedHash: 'h', appliedDraft: draft, ...extra };
}

function setup(run: RunState, d: ReportDraft = draft) {
  const handlers = {
    onSort: vi.fn(), onSetAggregations: vi.fn(), onSetDateTrunc: vi.fn(), onEditFilter: vi.fn(),
    onRemoveFilter: vi.fn(), onCreateSheets: vi.fn(), onCancel: vi.fn(), onRetry: vi.fn(),
  };
  renderUi(<ResultTable index={index} draft={d} run={run} stale={false} {...handlers} />);
  return handlers;
}

it('prompts to apply before the first run', () => {
  setup({ status: 'idle' });
  expect(screen.getByText('Pick columns and click Apply')).toBeInTheDocument();
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
  const h = setup({ ...success(sampleRows(['email'], 2500)), result: { rows: sampleRows(['email'], 2500), truncated: true, runId: 'r1' } } as RunState);
  expect(screen.getByText('Showing the first 2,500 rows.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Create Google Sheets report' }));
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

it('shows errors with retry and lets a running query be cancelled', async () => {
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
