import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { DM } from './fixtures/smart-data';
import { emptyDraft } from './lib/report-draft';
import { __mock, __resetForTests, connect } from './sdk-mock';

beforeEach(() => __resetForTests());

const queries = () => __mock.state.requests.filter((r) => r.path.startsWith('/api/external/http-data/')).length;

function seedVisitorReport(id = 'r1') {
  __mock.seedReport(id, { schemaVersion: 1, title: 'Visitors by source', draft: emptyDraft(DM.visitor), createdBy: 'someone', updatedBy: 'someone' });
}

it('opens the editor from the reports list and comes back', async () => {
  render(<App context={await connect()} />);
  await userEvent.click(await screen.findByTestId('newReport'));
  expect(await screen.findByTestId('editorPage')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /back to reports/i }));
  expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument();
});

describe('page links', () => {
  it('opens the report a link points at without running it', async () => {
    seedVisitorReport();
    __mock.state.route = '/reports/r1';
    render(<App context={await connect()} />);
    expect(await screen.findByRole('textbox', { name: 'Report title' })).toHaveValue('Visitors by source');
    expect(queries()).toBe(0);
  });

  it('keeps the browser address on the page showing', async () => {
    seedVisitorReport();
    render(<App context={await connect()} />);
    await userEvent.click(await screen.findByText('Visitors by source'));
    await screen.findByRole('textbox', { name: 'Report title' });
    await userEvent.click(screen.getByRole('button', { name: /back to reports/i }));
    await userEvent.click(await screen.findByTestId('newReport'));
    expect(__mock.state.routes).toEqual(['/', '/reports/r1', '/', '/reports/new']);
  });

  it('moves the address to a new report once it is saved', async () => {
    render(<App context={await connect()} />);
    await userEvent.click(await screen.findByTestId('newReport'));
    await userEvent.click(await screen.findByRole('combobox', { name: 'Data mart' }));
    await userEvent.click(within(screen.getByRole('listbox', { name: 'Data mart' })).getByRole('option', { name: 'Visitor' }));
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Email (Visitor)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Apply & Save' }));
    const [savedId] = [...__mock.state.collections.get('reports')!.keys()];
    await waitFor(() => expect(__mock.state.routes.at(-1)).toBe(`/reports/${savedId}`));
  });

  it('shares the address the browser shows', async () => {
    seedVisitorReport();
    __mock.state.route = '/reports/r1';
    render(<App context={await connect()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Share' }));
    expect(__mock.state.copiedLinks).toEqual(['/reports/r1']);
  });

  it("can't share a report that isn't saved yet", async () => {
    render(<App context={await connect()} />);
    await userEvent.click(await screen.findByTestId('newReport'));
    await userEvent.click(await screen.findByRole('combobox', { name: 'Data mart' }));
    await userEvent.click(within(screen.getByRole('listbox', { name: 'Data mart' })).getByRole('option', { name: 'Visitor' }));
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('button', { name: 'Share' })).toBeDisabled();
  });

  it("explains a link to a report the member can't open", async () => {
    __mock.state.route = '/reports/hidden';
    render(<App context={await connect()} />);
    expect(await screen.findByText("This report doesn't exist, or you don't have access to its data mart.")).toBeInTheDocument();
  });

  it('opens the list for an unknown route', async () => {
    __mock.state.route = '/dashboards/42';
    render(<App context={await connect()} />);
    expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument();
    expect(__mock.state.routes).toEqual(['/']);
  });

  it('hides Share and reports no address on a host without page links', async () => {
    seedVisitorReport();
    __mock.state.route = undefined;
    render(<App context={await connect()} />);
    await userEvent.click(await screen.findByText('Visitors by source'));
    await screen.findByRole('textbox', { name: 'Report title' });
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
    expect(__mock.state.routes).toEqual([]);
  });
});
