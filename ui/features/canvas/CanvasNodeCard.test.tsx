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

it('draws the data mart icon ODM picked, and the default one without', async () => {
  const { container, unmount } = renderWithServices(
    <CanvasNodeCard node={node} appearance={{ icon: 'sessions', definitionType: null }} selected={false} />,
    await mockServices(),
  );
  expect(container.querySelector('[data-testid="dataMartIcon"] svg')).toHaveClass('lucide-mouse-pointer-click');
  unmount();
  const second = renderWithServices(<CanvasNodeCard node={node} selected={false} />, await mockServices());
  expect(second.container.querySelector('[data-testid="dataMartIcon"] svg')).toHaveClass('lucide-box');
});

it('draws a lucide library icon once the icon library loads', async () => {
  const { container } = renderWithServices(
    <CanvasNodeCard node={node} appearance={{ icon: 'lucide:anchor', definitionType: null }} selected={false} />,
    await mockServices(),
  );
  await vi.waitFor(() => expect(container.querySelector('[data-testid="dataMartIcon"] svg')).toHaveClass('lucide-anchor'));
});

it('shows the input source and the field counts unless the settings hide them', async () => {
  const counted = { ...node, fieldCount: 12, usedFieldCount: 3 };
  const appearance = { icon: null, definitionType: 'SQL' };
  const services = await mockServices();
  const show = (hidden: { source: boolean; fields: boolean }) =>
    renderWithServices(<CanvasNodeCard node={counted} appearance={appearance} hidden={hidden} selected={false} />, services);

  const all = show({ source: false, fields: false });
  expect(screen.getByText('SQL')).toBeInTheDocument();
  expect(screen.getByText('3 of 12 fields')).toBeInTheDocument();
  all.unmount();

  const fieldsOnly = show({ source: true, fields: false });
  expect(screen.queryByText('SQL')).not.toBeInTheDocument();
  expect(screen.getByText('3 of 12 fields')).toBeInTheDocument();
  fieldsOnly.unmount();

  show({ source: true, fields: true });
  expect(screen.queryByText('3 of 12 fields')).not.toBeInTheDocument();
});
