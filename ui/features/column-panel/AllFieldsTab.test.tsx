import { useState } from 'react';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DATA_MARTS, DM, VISITOR_GRAPH, VISITOR_SCHEMA } from '../../fixtures/smart-data';
import { buildSchemaIndex } from '../../lib/schema-index';
import type { AggregateFunction, DateTruncUnit } from '../../lib/odm-types';
import {
  addColumn, changeInstancePath, emptyDraft, includePath, removeColumn, removeFilter, setAggregations, setDateTrunc,
  upsertFilter, type DraftFilter, type ReportDraft,
} from '../../lib/report-draft';
import { renderUi } from '../../test/render';
import { AllFieldsTab } from './AllFieldsTab';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);

interface Spies {
  onSetAggregations?: (column: string, fns: AggregateFunction[] | undefined) => void;
  onSetDateTrunc?: (column: string, unit: DateTruncUnit | undefined) => void;
  onUpsertFilter?: (filter: DraftFilter) => void;
  onRemoveFilter?: (id: string) => void;
}

function Harness({ initial = emptyDraft(DM.visitor), spies = {} }: { initial?: ReportDraft; spies?: Spies }) {
  const [draft, setDraft] = useState(initial);
  return (
    <>
      <AllFieldsTab
        index={index}
        graph={VISITOR_GRAPH}
        draft={draft}
        marts={DATA_MARTS}
        onToggleField={(name, checked) => setDraft((d) => (checked ? addColumn(d, index, name).draft : removeColumn(d, name)))}
        onIncludePath={(path) => setDraft((d) => includePath(d, path))}
        onChangeInstancePath={(from, to) => setDraft((d) => changeInstancePath(d, index, from, to).draft)}
        onSetAggregations={(column, fns) => {
          spies.onSetAggregations?.(column, fns);
          setDraft((d) => setAggregations(d, column, fns));
        }}
        onSetDateTrunc={(column, unit) => {
          spies.onSetDateTrunc?.(column, unit);
          setDraft((d) => setDateTrunc(d, column, unit));
        }}
        onUpsertFilter={(filter) => {
          spies.onUpsertFilter?.(filter);
          setDraft((d) => upsertFilter(d, filter));
        }}
        onRemoveFilter={(id) => {
          spies.onRemoveFilter?.(id);
          setDraft((d) => removeFilter(d, id));
        }}
      />
      <output data-testid='columns'>{draft.columns.map((c) => c.name).join(',')}</output>
    </>
  );
}

const columns = () => screen.getByTestId('columns').textContent;
const rowOf = (checkboxName: string) => screen.getByRole('checkbox', { name: checkboxName }).closest<HTMLElement>('[data-slot="field-row"]')!;
const emailFilter = (overrides: Partial<DraftFilter> = {}): DraftFilter => ({
  id: 'f1', column: 'email', aliasPath: '', operator: 'contains', value: '@owox', sliceOnly: false, ...overrides,
});

it('adds a main-mart column directly', async () => {
  renderUi(<Harness />);
  await userEvent.click(screen.getByRole('checkbox', { name: 'Email (Visitor)' }));
  expect(columns()).toBe('email');
});

it('asks for the join path when a data mart is reachable in more than one way', async () => {
  renderUi(<Harness />);
  await userEvent.click(screen.getByRole('button', { name: 'Page' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Title (Page)' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Visitor → Landing page')).toBeInTheDocument();
  expect(within(dialog).getByText('Visitor → Session → Pageview → Page')).toBeInTheDocument();
  expect(within(dialog).getByText('Landing page: The first page the visitor landed on.')).toBeInTheDocument();
  expect(within(dialog).queryByText(/multipl|×N/i)).not.toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole('radio', { name: 'Visitor → Landing page' }));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Use this path' }));
  expect(columns()).toBe('landing_page__title');
  expect(screen.getByRole('button', { name: 'via Landing page' })).toBeInTheDocument();
});

it('lets the same data mart join through a second path at once', async () => {
  renderUi(<Harness />);
  await userEvent.click(screen.getByRole('button', { name: 'Page' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Title (Page)' }));
  await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Use this path' }));
  await userEvent.click(screen.getByRole('button', { name: '+ via another path' }));
  await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Use this path' }));
  const titles = screen.getAllByRole('checkbox', { name: /^Title \(/ });
  expect(titles).toHaveLength(2);
  await userEvent.click(titles[1]!);
  expect(columns()).toBe('landing_page__title,sessions_pageviews_page__title');
});

it('searches across all reachable data marts', async () => {
  renderUi(<Harness />);
  await userEvent.type(screen.getByRole('searchbox', { name: 'Search fields' }), 'source');
  expect(screen.getByRole('checkbox', { name: 'Source (Session)' })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Creation Source (User)' })).toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: 'Email (Visitor)' })).not.toBeInTheDocument();
});

it('names data marts that cannot be reached', () => {
  renderUi(<Harness />);
  expect(screen.getByText("1 data mart can't be reached from Visitor")).toBeInTheDocument();
});

it('shows the field type in the row and the description in a tooltip', async () => {
  renderUi(<Harness />);
  const row = rowOf('Email (Visitor)');
  expect(within(row).getByText('(STRING)')).toBeInTheDocument();
  expect(within(rowOf('Visits (Visitor)')).getByText('(INTEGER)')).toBeInTheDocument();

  const info = within(row).getByRole('button', { name: 'About Email' });
  await userEvent.hover(info);
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Visitor email, when known.');
  await userEvent.unhover(info);

  await userEvent.click(info);
  expect(columns()).toBe('');
});

it('opens the description tooltip on keyboard focus', async () => {
  renderUi(<Harness />);
  act(() => within(rowOf('Email (Visitor)')).getByRole('button', { name: 'About Email' }).focus());
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Visitor email, when known.');
});

it('offers aggregation only for checked fields and applies several functions', async () => {
  const onSetAggregations = vi.fn();
  renderUi(<Harness spies={{ onSetAggregations }} />);
  expect(screen.queryByRole('button', { name: 'Aggregation for Visits' })).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('checkbox', { name: 'Visits (Visitor)' }));
  const sigma = screen.getByRole('button', { name: 'Aggregation for Visits' });
  expect(sigma).not.toHaveClass('text-primary');
  await userEvent.click(sigma);
  const popover = await screen.findByRole('dialog');
  expect(within(popover).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['Sum', 'Average', 'Min', 'Max']);
  expect(within(popover).getByRole('button', { name: 'Apply' })).toBeDisabled();
  await userEvent.click(within(popover).getByRole('checkbox', { name: 'Average' }));
  await userEvent.click(within(popover).getByRole('checkbox', { name: 'Sum' }));
  await userEvent.click(within(popover).getByRole('button', { name: 'Apply' }));

  expect(onSetAggregations).toHaveBeenCalledWith('visits', ['SUM', 'AVG']);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Aggregation for Visits' })).toHaveClass('text-primary');
});

it('clears aggregations when every function is unticked', async () => {
  const onSetAggregations = vi.fn();
  const initial = { ...emptyDraft(DM.visitor), columns: [{ name: 'visits', aliasPath: '', aggregations: ['SUM' as const] }] };
  renderUi(<Harness initial={initial} spies={{ onSetAggregations }} />);
  await userEvent.click(screen.getByRole('button', { name: 'Aggregation for Visits' }));
  const popover = await screen.findByRole('dialog');
  await userEvent.click(within(popover).getByRole('checkbox', { name: 'Sum' }));
  await userEvent.click(within(popover).getByRole('button', { name: 'Apply' }));
  expect(onSetAggregations).toHaveBeenCalledWith('visits', undefined);
});

it('groups a date field by bucket instead of aggregating it', async () => {
  const onSetAggregations = vi.fn();
  const onSetDateTrunc = vi.fn();
  renderUi(<Harness spies={{ onSetAggregations, onSetDateTrunc }} />);
  await userEvent.click(screen.getByRole('checkbox', { name: 'Creation Date (Visitor)' }));
  await userEvent.click(screen.getByRole('button', { name: 'Aggregation for Creation Date' }));
  const popover = await screen.findByRole('dialog');
  const bucket = within(popover).getByRole('combobox', { name: 'Group by bucket' });
  expect(within(bucket).getAllByRole('option').map((o) => o.textContent)).toEqual(['Full date', 'Day', 'Week', 'Month', 'Quarter', 'Year']);

  await userEvent.click(within(popover).getByRole('checkbox', { name: 'Min' }));
  await userEvent.selectOptions(bucket, 'MONTH');
  expect(within(popover).getByRole('checkbox', { name: 'Min' })).not.toBeChecked();
  await userEvent.click(within(popover).getByRole('button', { name: 'Apply' }));

  expect(onSetDateTrunc).toHaveBeenCalledWith('creation_date', 'MONTH');
  expect(onSetAggregations).toHaveBeenCalledWith('creation_date', undefined);
  expect(screen.getByRole('button', { name: 'Aggregation for Creation Date' })).toHaveClass('text-primary');
});

it('has no filter for date fields', () => {
  renderUi(<Harness />);
  expect(screen.queryByRole('button', { name: 'Filter by Creation Date' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Filter by Email' })).toBeInTheDocument();
});

it('adds a filter from the row', async () => {
  const onUpsertFilter = vi.fn();
  renderUi(<Harness spies={{ onUpsertFilter }} />);
  await userEvent.click(screen.getByRole('button', { name: 'Filter by Email' }));
  const popover = await screen.findByRole('dialog');

  await userEvent.click(within(popover).getByRole('button', { name: 'Apply' }));
  expect(within(popover).getByText('Value is required')).toBeInTheDocument();
  expect(onUpsertFilter).not.toHaveBeenCalled();

  await userEvent.selectOptions(within(popover).getByRole('combobox', { name: 'Operator' }), 'is_not_blank');
  expect(within(popover).queryByText('Value is required')).not.toBeInTheDocument();
  await userEvent.click(within(popover).getByRole('button', { name: 'Apply' }));

  expect(onUpsertFilter).toHaveBeenCalledWith(
    expect.objectContaining({ column: 'email', aliasPath: '', operator: 'is_not_blank', sliceOnly: false }),
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Filter by Email' })).toHaveClass('text-primary');
  expect(columns()).toBe('');
});

it('slices a joined data mart before the join', async () => {
  const onUpsertFilter = vi.fn();
  renderUi(<Harness spies={{ onUpsertFilter }} />);
  await userEvent.click(screen.getByRole('button', { name: 'Contact' }));
  await userEvent.click(screen.getByRole('button', { name: 'Filter by Name' }));
  const popover = await screen.findByRole('dialog');
  await userEvent.click(within(popover).getByRole('button', { name: 'Slice' }));
  expect(within(popover).getByText(/filters Contact before the join/)).toBeInTheDocument();
  await userEvent.type(within(popover).getByRole('textbox', { name: 'Value' }), 'Ann');
  await userEvent.click(within(popover).getByRole('button', { name: 'Apply' }));

  expect(onUpsertFilter).toHaveBeenCalledWith(
    expect.objectContaining({ column: 'contact__name', aliasPath: 'contact', operator: 'eq', value: 'Ann', sliceOnly: true }),
  );
});

it('offers no slice tab for main data mart fields', async () => {
  renderUi(<Harness />);
  await userEvent.click(screen.getByRole('button', { name: 'Filter by Email' }));
  const popover = await screen.findByRole('dialog');
  expect(within(popover).queryByRole('button', { name: 'Slice' })).not.toBeInTheDocument();
});

it('lists existing rules in the filter popover and removes them', async () => {
  const onRemoveFilter = vi.fn();
  const initial = { ...emptyDraft(DM.visitor), filters: [emailFilter(), emailFilter({ id: 'f2', operator: 'is_not_blank', value: undefined })] };
  renderUi(<Harness initial={initial} spies={{ onRemoveFilter }} />);
  const trigger = screen.getByRole('button', { name: 'Filter by Email' });
  expect(trigger).toHaveClass('text-primary');
  expect(trigger).toHaveTextContent('2');

  await userEvent.click(trigger);
  const popover = await screen.findByRole('dialog');
  expect(within(popover).getByText('contains @owox', { selector: 'span' })).toBeInTheDocument();
  expect(within(popover).getByText('is not empty', { selector: 'span' })).toBeInTheDocument();
  expect(within(popover).getByRole('button', { name: 'Add' })).toBeInTheDocument();

  await userEvent.click(within(popover).getAllByRole('button', { name: 'Remove filter' })[0]!);
  expect(onRemoveFilter).toHaveBeenCalledWith('f1');
  expect(within(popover).queryByText('contains @owox')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Filter by Email' })).not.toHaveTextContent('2');
});

it('shows only selected fields when asked', async () => {
  renderUi(<Harness />);
  await userEvent.click(screen.getByRole('checkbox', { name: 'Email (Visitor)' }));
  await userEvent.click(screen.getByRole('switch', { name: 'Show selected only' }));
  expect(screen.getByRole('checkbox', { name: 'Email (Visitor)' })).toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: 'Client ID (Visitor)' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Contact' })).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('switch', { name: 'Show selected only' }));
  expect(screen.getByRole('checkbox', { name: 'Client ID (Visitor)' })).toBeInTheDocument();
});

it('says so when nothing is selected and only selected fields are shown', async () => {
  renderUi(<Harness />);
  expect(screen.queryByText('No fields selected.')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('switch', { name: 'Show selected only' }));
  expect(screen.getByText('No fields selected.')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('switch', { name: 'Show selected only' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Email (Visitor)' }));
  await userEvent.click(screen.getByRole('switch', { name: 'Show selected only' }));
  expect(screen.queryByText('No fields selected.')).not.toBeInTheDocument();
});

it('collapses and expands a group that has selected fields', async () => {
  const initial = { ...emptyDraft(DM.visitor), columns: [{ name: 'sessions__source', aliasPath: 'sessions' }] };
  renderUi(<Harness initial={initial} />);
  const session = screen.getByRole('button', { name: 'Session' });
  expect(session).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('checkbox', { name: 'Source (Session)' })).toBeChecked();

  await userEvent.click(session);
  expect(session).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('checkbox', { name: 'Source (Session)' })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: 'Duration (Session)' })).not.toBeInTheDocument();

  await userEvent.click(session);
  expect(screen.getByRole('checkbox', { name: 'Source (Session)' })).toBeChecked();
});

it('opens the main data mart and the groups with selected fields at first', () => {
  const initial = { ...emptyDraft(DM.visitor), columns: [{ name: 'contact__name', aliasPath: 'contact' }] };
  renderUi(<Harness initial={initial} />);
  expect(screen.getByRole('button', { name: 'Visitor' })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: 'Contact' })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: 'Session' })).toHaveAttribute('aria-expanded', 'false');
});

it('counts the selected fields of each data mart', async () => {
  renderUi(<Harness />);
  const session = screen.getByRole('button', { name: 'Session' });
  expect(session).not.toHaveAccessibleDescription();
  expect(within(session).queryByText(/\d/)).not.toBeInTheDocument();

  await userEvent.click(session);
  await userEvent.click(screen.getByRole('checkbox', { name: 'Source (Session)' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Duration (Session)' }));
  expect(session).toHaveAccessibleDescription('2 selected');
  expect(within(session).getByText('2')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Visitor' })).not.toHaveAccessibleDescription();

  await userEvent.click(screen.getByRole('checkbox', { name: 'Source (Session)' }));
  expect(session).toHaveAccessibleDescription('1 selected');
});

it('previews the join path when hovering the path chip', async () => {
  const initial = { ...emptyDraft(DM.visitor), columns: [{ name: 'sessions_pageviews_page__title', aliasPath: 'sessions.pageviews.page' }] };
  renderUi(<Harness initial={initial} />);
  await userEvent.hover(screen.getByRole('button', { name: 'via Session › Pageview › Page' }));
  const tooltip = await screen.findByRole('tooltip', {}, { timeout: 2000 });

  expect([...tooltip.querySelectorAll('[data-slot="join-path-node"]')].map((n) => n.textContent)).toEqual(['Visitor', 'Session', 'Pageview', 'Page']);
  expect(within(tooltip).getByText('session_id = session_id')).toBeInTheDocument();
  expect(within(tooltip).getByText('page_id = id')).toBeInTheDocument();
  expect(within(tooltip).queryByText(/×N|\?/)).not.toBeInTheDocument();
  expect(within(tooltip).getByText('Session: Sessions of the visitor.')).toBeInTheDocument();
  expect(within(tooltip).getByText('Pageview: Pages viewed in the session.')).toBeInTheDocument();
  expect(within(tooltip).getByText('Page: The page that was viewed.')).toBeInTheDocument();
});
