import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM } from '../../fixtures/smart-data';
import { emptyDraft } from '../../lib/report-draft';
import { __mock, __resetForTests } from '../../sdk-mock';
import { mockServices, renderWithServices } from '../../test/render';
import { ReportsListPage } from './ReportsListPage';

beforeEach(() => __resetForTests());

it('invites to build the first report when there are none', async () => {
  const onCreate = vi.fn();
  renderWithServices(<ReportsListPage onOpen={vi.fn()} onCreate={onCreate} />, await mockServices());
  expect(await screen.findByText('Build your first report')).toBeInTheDocument();
  await userEvent.click(screen.getAllByRole('button', { name: /new report/i })[1]!);
  expect(onCreate).toHaveBeenCalled();
});

it('lists saved reports with their data mart and author', async () => {
  __mock.seedReport('r1', { schemaVersion: 1, title: 'Visitors by source', draft: emptyDraft(DM.visitor), createdBy: 'demo-user', updatedBy: 'demo-user' });
  __mock.seedReport('r2', { schemaVersion: 1, title: 'Sessions', draft: emptyDraft(DM.session), createdBy: 'someone', updatedBy: 'someone' });
  const onOpen = vi.fn();
  renderWithServices(<ReportsListPage onOpen={onOpen} onCreate={vi.fn()} />, await mockServices());
  expect(await screen.findByText('Visitors by source')).toBeInTheDocument();
  expect(screen.getByText('Visitor')).toBeInTheDocument();
  expect(screen.getByText('You')).toBeInTheDocument();
  expect(screen.getByText('Another member')).toBeInTheDocument();
  await userEvent.click(screen.getByText('Sessions'));
  expect(onOpen).toHaveBeenCalledWith('r2');
});

it('shows an error with a working retry', async () => {
  __mock.fail('collection:reports', { code: 'HTTP_ERROR', status: 500, message: 'boom' });
  renderWithServices(<ReportsListPage onOpen={vi.fn()} onCreate={vi.fn()} />, await mockServices());
  expect(await screen.findByText("Couldn't load your reports")).toBeInTheDocument();
  __mock.clearFailures();
  await userEvent.click(screen.getByRole('button', { name: /retry/i }));
  expect(await screen.findByText('Build your first report')).toBeInTheDocument();
});

it('still lists saved reports when data marts fail to load', async () => {
  __mock.seedReport('r1', { schemaVersion: 1, title: 'Visitors by source', draft: emptyDraft(DM.visitor), createdBy: 'demo-user', updatedBy: 'demo-user' });
  __mock.fail('/api/data-marts', { code: 'HTTP_ERROR', status: 500, message: 'boom' }, 'GET');
  renderWithServices(<ReportsListPage onOpen={vi.fn()} onCreate={vi.fn()} />, await mockServices());
  expect(await screen.findByText('Visitors by source')).toBeInTheDocument();
  expect(screen.getByText('Unavailable data mart')).toBeInTheDocument();
});
