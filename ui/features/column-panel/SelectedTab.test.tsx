import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM, VISITOR_SCHEMA } from '../../fixtures/smart-data';
import { buildSchemaIndex } from '../../lib/schema-index';
import { addColumn, emptyDraft, upsertFilter, type ReportDraft } from '../../lib/report-draft';
import { renderUi } from '../../test/render';
import { SelectedTab } from './SelectedTab';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);
const add = (d: ReportDraft, ...names: string[]) => names.reduce((x, n) => addColumn(x, index, n).draft, d);

function setup(draft: ReportDraft, pendingFilterField: string | null = null) {
  const handlers = {
    onPendingFilterDone: vi.fn(),
    onSetDateRange: vi.fn(),
    onRemoveDateRange: vi.fn(),
    onUpsertFilter: vi.fn(),
    onRemoveFilter: vi.fn(),
    onMoveColumn: vi.fn(),
    onRemoveColumn: vi.fn(),
  };
  renderUi(<SelectedTab index={index} draft={draft} pendingFilterField={pendingFilterField} {...handlers} />);
  return handlers;
}

it('shows date ranges with their data mart and changes the period', async () => {
  const h = setup(add(emptyDraft(DM.visitor), 'email', 'sessions__source'));
  const dates = screen.getByRole('region', { name: 'Date ranges' });
  expect(within(dates).getByText('Creation Date')).toBeInTheDocument();
  expect(within(dates).getByText('Session')).toBeInTheDocument();
  await userEvent.selectOptions(within(dates).getAllByRole('combobox', { name: /period/i })[0]!, 'last_7_days');
  expect(h.onSetDateRange).toHaveBeenCalledWith('creation_date', { kind: 'preset', preset: 'last_7_days' });
  await userEvent.click(within(dates).getByRole('button', { name: 'Remove date range Creation Date' }));
  expect(h.onRemoveDateRange).toHaveBeenCalledWith('creation_date');
});

it('switches a period to a custom range', async () => {
  const h = setup(add(emptyDraft(DM.visitor), 'email'));
  await userEvent.selectOptions(screen.getByRole('combobox', { name: /period/i }), 'custom');
  expect(h.onSetDateRange).toHaveBeenLastCalledWith('creation_date', expect.objectContaining({ kind: 'custom' }));
});

it('creates a slice filter for a joined data mart from a pending field', async () => {
  const h = setup(add(emptyDraft(DM.visitor), 'sessions__source'), 'sessions__source');
  const editor = screen.getByRole('form', { name: 'Filter Source' });
  await userEvent.selectOptions(within(editor).getByRole('combobox', { name: 'Operator' }), 'in');
  await userEvent.type(within(editor).getByRole('textbox', { name: 'Values' }), 'google, bing');
  await userEvent.click(within(editor).getByRole('switch', { name: 'Only narrow Session' }));
  await userEvent.click(within(editor).getByRole('button', { name: 'Save filter' }));
  expect(h.onUpsertFilter).toHaveBeenCalledWith(
    expect.objectContaining({ column: 'sessions__source', aliasPath: 'sessions', operator: 'in', value: ['google', 'bing'], sliceOnly: true }),
  );
  expect(h.onPendingFilterDone).toHaveBeenCalled();
});

it('edits and removes existing filters', async () => {
  const draft = upsertFilter(add(emptyDraft(DM.visitor), 'email'), { id: 'f1', column: 'email', aliasPath: '', operator: 'is_not_blank', sliceOnly: false });
  const h = setup(draft);
  expect(screen.getByText('is not empty')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Remove filter Email' }));
  expect(h.onRemoveFilter).toHaveBeenCalledWith('f1');
});

it('reorders and removes columns, and flags unavailable ones', async () => {
  const draft = { ...add(emptyDraft(DM.visitor), 'email', 'client_id'), columns: [{ name: 'email', aliasPath: '' }, { name: 'client_id', aliasPath: '' }, { name: 'gone', aliasPath: '' }] };
  const h = setup(draft);
  await userEvent.click(screen.getByRole('button', { name: 'Move Email down' }));
  expect(h.onMoveColumn).toHaveBeenCalledWith(0, 1);
  expect(screen.getByText('Unavailable')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Remove column gone' }));
  expect(h.onRemoveColumn).toHaveBeenCalledWith('gone');
});
