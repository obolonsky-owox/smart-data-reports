import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM, VISITOR_SCHEMA } from '../../fixtures/smart-data';
import { buildSchemaIndex, childInstances } from '../../lib/schema-index';
import { renderUi } from '../../test/render';
import { CanvasNodeActions } from './CanvasNodeActions';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);

it('adds only objects joinable from the selected node', async () => {
  const onAddObject = vi.fn();
  renderUi(
    <CanvasNodeActions
      node={{ path: 'sessions', label: 'Session', dataMartId: DM.session, kind: 'used', x: 0, y: 0 }}
      targets={childInstances(index, 'sessions')}
      onAddObject={onAddObject}
      onSetMain={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Add object' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: /Pageview/ }));
  expect(onAddObject).toHaveBeenCalledWith('sessions.pageviews');
});

it('cannot delete the main data mart or set it as main again', () => {
  renderUi(
    <CanvasNodeActions node={{ path: '', label: 'Visitor', dataMartId: DM.visitor, kind: 'main', x: 0, y: 0 }} targets={[]} onAddObject={vi.fn()} onSetMain={vi.fn()} onDelete={vi.fn()} />,
  );
  expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Set as main' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Add object' })).toBeDisabled();
});

it('sets another data mart as main and deletes an instance', async () => {
  const onSetMain = vi.fn();
  const onDelete = vi.fn();
  renderUi(
    <CanvasNodeActions node={{ path: 'sessions', label: 'Session', dataMartId: DM.session, kind: 'used', x: 0, y: 0 }} targets={[]} onAddObject={vi.fn()} onSetMain={onSetMain} onDelete={onDelete} />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Set as main' }));
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(onSetMain).toHaveBeenCalledWith(DM.session);
  expect(onDelete).toHaveBeenCalledWith('sessions');
});
