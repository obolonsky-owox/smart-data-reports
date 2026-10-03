import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DATA_MARTS, DM, GRAPHS, SESSION_SCHEMA, STORAGE, STORAGES, VISITOR_GRAPH, VISITOR_SCHEMA } from '../../fixtures/smart-data';
import { buildSchemaIndex } from '../../lib/schema-index';
import { emptyDraft } from '../../lib/report-draft';
import { TooltipProvider } from '@owox/ui/components/tooltip';
import { renderUi } from '../../test/render';
import { ColumnPanel } from './ColumnPanel';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);

function setup(overrides: Partial<Parameters<typeof ColumnPanel>[0]> = {}) {
  const props = {
    index, graph: VISITOR_GRAPH, draft: emptyDraft(DM.visitor), marts: DATA_MARTS, filterRequest: null,
    onToggleField: vi.fn(), onChangeInstancePath: vi.fn(), onSetAggregations: vi.fn(), onSetDateTrunc: vi.fn(),
    onSetDateRange: vi.fn(), onRemoveDateRange: vi.fn(), onUpsertFilter: vi.fn(), onRemoveFilter: vi.fn(),
    onMoveColumn: vi.fn(), onRemoveColumn: vi.fn(), onPendingFilterDone: vi.fn(),
    storages: null, storageId: undefined, onChangeStorage: vi.fn(),
    onChangeMain: vi.fn(), onApply: vi.fn(), applyDisabled: false, applying: false, issues: [],
    ...overrides,
  };
  const { rerender } = renderUi(<ColumnPanel {...props} />);
  return { ...props, rerender: (next: Partial<typeof props>) => rerender(<TooltipProvider><ColumnPanel {...props} {...next} /></TooltipProvider>) };
}

it('shows the grain and changes the main data mart', async () => {
  const props = setup();
  expect(screen.getByText('1 row = 1 Visitor')).toBeInTheDocument();
  const reportOn = screen.getByRole('combobox', { name: 'Report on' });
  expect(reportOn).toHaveTextContent('Visitor');
  await userEvent.click(reportOn);
  await userEvent.type(screen.getByRole('textbox', { name: 'Search data marts' }), 'sess');
  await userEvent.click(screen.getByRole('option', { name: 'Session' }));
  expect(props.onChangeMain).toHaveBeenCalledWith(DM.session, reportOn);
});

it('shows the storage above Report on and reports a storage change', async () => {
  const props = setup({ storages: STORAGES, storageId: STORAGE.bigquery });
  const storage = screen.getByRole('combobox', { name: 'Storage' });
  expect(storage).toHaveValue(STORAGE.bigquery);
  expect(storage.compareDocumentPosition(screen.getByRole('combobox', { name: 'Report on' }))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  await userEvent.selectOptions(storage, STORAGE.snowflake);
  expect(props.onChangeStorage).toHaveBeenCalledWith(STORAGE.snowflake);
});

it('has no storage dropdown when storages are unknown', () => {
  setup();
  expect(screen.queryByRole('combobox', { name: 'Storage' })).not.toBeInTheDocument();
});

it('shows issues and blocks Apply', async () => {
  const props = setup({ applyDisabled: true, issues: ['Pick at least one column.'] });
  expect(screen.getByText('Pick at least one column.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(props.onApply).not.toHaveBeenCalled();
});

it('opens the Selected tab with a filter editor when a filter is requested', () => {
  setup({ filterRequest: { field: 'email', nonce: 1 } });
  expect(screen.getByRole('tab', { name: 'Selected (0)' })).toHaveAttribute('data-state', 'active');
  expect(screen.getByRole('form', { name: 'Filter Email' })).toBeInTheDocument();
});

it('keeps the data mart choice while the schema loads and shows a placeholder for the fields', () => {
  setup({ index: null, graph: null, draft: emptyDraft(DM.session) });
  expect(screen.getByRole('combobox', { name: 'Report on' })).toHaveTextContent('Session');
  expect(screen.getByText('1 row = 1 Session')).toBeInTheDocument();
  expect(screen.getByRole('status', { name: 'Loading fields' })).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'All' })).not.toBeInTheDocument();
});

it('drops a pending filter when the main data mart changes', async () => {
  const filterRequest = { field: 'email', nonce: 1 };
  const { rerender } = setup({ filterRequest });
  expect(screen.getByRole('form', { name: 'Filter Email' })).toBeInTheDocument();
  rerender({
    filterRequest,
    draft: emptyDraft(DM.session),
    index: buildSchemaIndex({ id: DM.session, title: 'Session' }, SESSION_SCHEMA),
    graph: GRAPHS[DM.session]!,
  });
  expect(screen.getByText('1 row = 1 Session')).toBeInTheDocument();
  expect(screen.queryByRole('form', { name: /^Filter / })).not.toBeInTheDocument();
  // The stale request no longer shadows a new filter.
  await userEvent.click(within(screen.getByRole('region', { name: 'Filters' })).getByRole('button', { name: 'Filter' }));
  const pick = within(await screen.findByRole('dialog')).getAllByRole('button')[0]!;
  const label = pick.firstChild!.textContent!;
  await userEvent.click(pick);
  expect(screen.getByRole('form', { name: `Filter ${label}` })).toBeInTheDocument();
});

it('ignores a filter request for a field the data mart lacks', async () => {
  setup({ filterRequest: { field: 'gone_field', nonce: 1 } });
  await userEvent.click(within(screen.getByRole('region', { name: 'Filters' })).getByRole('button', { name: 'Filter' }));
  await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^Client ID/ }));
  expect(screen.getByRole('form', { name: 'Filter Client ID' })).toBeInTheDocument();
});
