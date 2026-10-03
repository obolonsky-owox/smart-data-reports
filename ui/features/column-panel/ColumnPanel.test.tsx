import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DATA_MARTS, DM, VISITOR_GRAPH, VISITOR_SCHEMA } from '../../fixtures/smart-data';
import { buildSchemaIndex } from '../../lib/schema-index';
import { emptyDraft } from '../../lib/report-draft';
import { renderUi } from '../../test/render';
import { ColumnPanel } from './ColumnPanel';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);

function setup(overrides: Partial<Parameters<typeof ColumnPanel>[0]> = {}) {
  const props = {
    index, graph: VISITOR_GRAPH, draft: emptyDraft(DM.visitor), marts: DATA_MARTS, filterRequest: null,
    onToggleField: vi.fn(), onIncludePath: vi.fn(), onChangeInstancePath: vi.fn(), onSetAggregations: vi.fn(), onSetDateTrunc: vi.fn(),
    onSetDateRange: vi.fn(), onRemoveDateRange: vi.fn(), onUpsertFilter: vi.fn(), onRemoveFilter: vi.fn(),
    onMoveColumn: vi.fn(), onRemoveColumn: vi.fn(), onPendingFilterDone: vi.fn(),
    onChangeMain: vi.fn(), onApply: vi.fn(), applyDisabled: false, applying: false, issues: [],
    ...overrides,
  };
  renderUi(<ColumnPanel {...props} />);
  return props;
}

it('shows the grain and changes the main data mart', async () => {
  const props = setup();
  expect(screen.getByText('1 row = 1 Visitor')).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Report on' }), DM.session);
  expect(props.onChangeMain).toHaveBeenCalledWith(DM.session);
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
