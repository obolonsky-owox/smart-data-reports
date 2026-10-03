import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM } from '../../fixtures/smart-data';
import { __mock } from '../../sdk-mock';
import { mockServices, renderWithServices } from '../../test/render';
import { CanvasNodeCard } from './CanvasNodeCard';

const node = { label: 'Session', dataMartId: DM.session, kind: 'used' as const, description: 'Browsing sessions', joinDescription: 'Visitor owns sessions' };

it('shows the label and both descriptions in the info tooltip', async () => {
  renderWithServices(<CanvasNodeCard node={node} selected={false} />, await mockServices());
  expect(screen.getByText('Session')).toBeInTheDocument();
  await userEvent.hover(screen.getByRole('button', { name: 'About Session' }));
  expect((await screen.findAllByText(/Browsing sessions/)).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Visitor owns sessions/).length).toBeGreaterThan(0);
});

it('opens the data mart in ODM', async () => {
  __mock.state.navigations.length = 0;
  renderWithServices(<CanvasNodeCard node={node} selected={false} />, await mockServices());
  await userEvent.click(screen.getByRole('button', { name: 'Open Session' }));
  expect(__mock.state.navigations).toEqual([`/ui/demo-project/data-marts/${DM.session}`]);
});

it('has no info button without a description and marks the main mart', async () => {
  renderWithServices(<CanvasNodeCard node={{ ...node, kind: 'main', description: '', joinDescription: '' }} selected />, await mockServices());
  expect(screen.queryByRole('button', { name: 'About Session' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Main data mart')).toBeInTheDocument();
});
