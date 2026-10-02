import { useState } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DATA_MARTS, DM, VISITOR_SCHEMA } from '../../fixtures/smart-data';
import { buildSchemaIndex } from '../../lib/schema-index';
import { addColumn, changeInstancePath, emptyDraft, includePath, removeColumn } from '../../lib/report-draft';
import { renderUi } from '../../test/render';
import { AllFieldsTab } from './AllFieldsTab';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);

function Harness({ onAddFilter = vi.fn() }: { onAddFilter?: (name: string) => void }) {
  const [draft, setDraft] = useState(emptyDraft(DM.visitor));
  return (
    <>
      <AllFieldsTab
        index={index}
        draft={draft}
        marts={DATA_MARTS}
        onToggleField={(name, checked) => setDraft((d) => (checked ? addColumn(d, index, name).draft : removeColumn(d, name)))}
        onIncludePath={(path) => setDraft((d) => includePath(d, path))}
        onChangeInstancePath={(from, to) => setDraft((d) => changeInstancePath(d, index, from, to).draft)}
        onAddFilter={onAddFilter}
      />
      <output data-testid='columns'>{draft.columns.map((c) => c.name).join(',')}</output>
    </>
  );
}

const columns = () => screen.getByTestId('columns').textContent;

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
  expect(within(dialog).getByText('Multiplies rows')).toBeInTheDocument();
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

it('names data marts that cannot be reached and offers filters', async () => {
  const onAddFilter = vi.fn();
  renderUi(<Harness onAddFilter={onAddFilter} />);
  expect(screen.getByText("1 data mart can't be reached from Visitor")).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Filter by Email' }));
  expect(onAddFilter).toHaveBeenCalledWith('email');
});
