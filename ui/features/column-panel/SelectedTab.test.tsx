import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM, VISITOR_GRAPH, VISITOR_SCHEMA } from '../../fixtures/smart-data';
import { buildSchemaIndex } from '../../lib/schema-index';
import { addColumn, emptyDraft, setAggregations, setDateTrunc, upsertFilter, type ReportDraft } from '../../lib/report-draft';
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
    onSetAggregations: vi.fn(),
    onSetDateTrunc: vi.fn(),
    onMoveColumn: vi.fn(),
    onRemoveColumn: vi.fn(),
  };
  renderUi(<SelectedTab index={index} graph={VISITOR_GRAPH} draft={draft} pendingFilterField={pendingFilterField} {...handlers} />);
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

/** happy-dom lays nothing out; give each column row a 32px slot so dnd-kit can find its neighbours. */
function layOutColumnRows() {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const row = this.closest('li');
    const top = row ? [...row.parentElement!.children].indexOf(row) * 32 : 0;
    const height = row ? 32 : 0;
    return { x: 0, y: top, top, left: 0, width: 300, height, right: 300, bottom: top + height, toJSON: () => ({}) } as DOMRect;
  });
}

it('reorders and removes columns, and flags unavailable ones', async () => {
  const draft = { ...add(emptyDraft(DM.visitor), 'email', 'client_id'), columns: [{ name: 'email', aliasPath: '' }, { name: 'client_id', aliasPath: '' }, { name: 'gone', aliasPath: '' }] };
  const h = setup(draft);
  const columns = screen.getByRole('region', { name: 'Columns' });
  expect(within(columns).queryByRole('button', { name: /^Move / })).not.toBeInTheDocument();

  const layout = layOutColumnRows();
  try {
    // The drag handle's keyboard sensor: pick up, move one row down, drop.
    within(columns).getAllByRole('button', { name: 'Drag to reorder' })[0]!.focus();
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard(' ');
  } finally {
    layout.mockRestore();
  }
  expect(h.onMoveColumn).toHaveBeenCalledWith(0, 1);
  expect(screen.getByText('Unavailable')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Remove column gone' }));
  expect(h.onRemoveColumn).toHaveBeenCalledWith('gone');
});

it('closes the + Date and + Filter menus after a pick', async () => {
  const h = setup({ ...add(emptyDraft(DM.visitor), 'email'), dateRanges: [] });
  await userEvent.click(within(screen.getByRole('region', { name: 'Date ranges' })).getByRole('button', { name: 'Date' }));
  await userEvent.click(await screen.findByRole('button', { name: /^Creation Date/ }));
  expect(h.onSetDateRange).toHaveBeenCalledWith('creation_date', { kind: 'preset', preset: 'last_30_days' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await userEvent.click(within(screen.getByRole('region', { name: 'Filters' })).getByRole('button', { name: 'Filter' }));
  await userEvent.click(await screen.findByRole('button', { name: /^Client ID/ }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('form', { name: 'Filter Client ID' })).toBeInTheDocument();
});

it('marks date ranges and filters as ODM filters or slices', async () => {
  const draft = upsertFilter(add(emptyDraft(DM.visitor), 'email', 'sessions__source'), {
    id: 'f2',
    column: 'sessions__source',
    aliasPath: 'sessions',
    operator: 'is_not_blank',
    sliceOnly: true,
  });
  setup(draft);
  const dates = screen.getByRole('region', { name: 'Date ranges' });
  expect(within(dates).getAllByRole('button', { name: 'Filter' })).toHaveLength(1);
  const slice = within(dates).getByRole('button', { name: 'Slice' });
  await userEvent.hover(slice);
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Slice — narrows only Session before the join');
  await userEvent.unhover(slice);
  const filters = screen.getByRole('region', { name: 'Filters' });
  expect(within(filters).getByRole('button', { name: 'Slice' })).toBeInTheDocument();
  expect(within(filters).queryByText(/only narrows/)).not.toBeInTheDocument();
});

it('puts Filters & Slices first, with Date ranges before Filters, then Aggregations and Columns', () => {
  setup(add(emptyDraft(DM.visitor), 'email'));
  const titles = screen.getAllByRole('heading').map((h) => h.textContent);
  expect(titles).toEqual(['Filters & Slices', 'Date ranges', 'Filters', 'Aggregations', 'Columns']);
  const outer = screen.getByRole('region', { name: 'Filters & Slices' });
  expect(within(outer).getByRole('region', { name: 'Date ranges' })).toBeInTheDocument();
  expect(within(outer).getByRole('region', { name: 'Filters' })).toBeInTheDocument();
});

it('shows each column with its data type, like the field picker', () => {
  setup(add(emptyDraft(DM.visitor), 'email', 'contact__is_mql'));
  const columns = screen.getByRole('region', { name: 'Columns' });
  expect(within(columns).getByText('(STRING)')).toBeInTheDocument();
  expect(within(columns).getByText('(BOOLEAN)')).toBeInTheDocument();
  expect(within(columns).queryByText('ABC')).not.toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Date ranges' })).getAllByText('(DATE)')).not.toHaveLength(0);
});

it('lists aggregations and date buckets, and edits or removes them', async () => {
  const base = add(emptyDraft(DM.visitor), 'visits', 'creation_date', 'email');
  const draft = setDateTrunc(setAggregations(base, 'visits', ['SUM', 'AVG']), 'creation_date', 'MONTH');
  const h = setup(draft);
  const section = screen.getByRole('region', { name: 'Aggregations' });
  expect(within(section).getByText('Sum, Average')).toBeInTheDocument();
  expect(within(section).getByText('Month bucket')).toBeInTheDocument();
  expect(within(section).queryByText('Email')).not.toBeInTheDocument();

  await userEvent.click(within(section).getByRole('button', { name: 'Remove aggregation Creation Date' }));
  expect(h.onSetDateTrunc).toHaveBeenCalledWith('creation_date', undefined);
  await userEvent.click(within(section).getByRole('button', { name: 'Remove aggregation Visits' }));
  expect(h.onSetAggregations).toHaveBeenCalledWith('visits', undefined);

  await userEvent.click(within(section).getByRole('button', { name: 'Edit aggregation Visits' }));
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Max' }));
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(h.onSetAggregations).toHaveBeenLastCalledWith('visits', ['SUM', 'AVG', 'MAX']);
});

it('says how to add an aggregation when there is none', () => {
  setup(add(emptyDraft(DM.visitor), 'email'));
  expect(within(screen.getByRole('region', { name: 'Aggregations' })).getByText(/No aggregations/)).toBeInTheDocument();
});

it('previews the join path when hovering the data mart of a joined column', async () => {
  setup(add(emptyDraft(DM.visitor), 'email', 'sessions__source'));
  const columns = screen.getByRole('region', { name: 'Columns' });
  await userEvent.hover(within(columns).getByText('Session'));
  const list = await screen.findByRole('list', { name: 'Join path' }, { timeout: 2000 });
  expect(within(list).getByText('Visitor')).toBeInTheDocument();
  expect(within(list).getByText('client_id = client_id')).toBeInTheDocument();
  // The main data mart's own fields have no join path to show.
  expect(within(columns).getByText('Visitor').closest('[tabindex]')).toBeNull();
});
