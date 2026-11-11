import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderUi } from '../../test/render';
import { CanvasSettingsPanel, CanvasSettingsPopover, DEFAULT_CANVAS_SETTINGS } from './CanvasSettingsPopover';

it('hides the join keys by default', () => {
  expect(DEFAULT_CANVAS_SETTINGS.showJoinFields).toBe(false);
});

it('changes the direction, the join keys and the card content', async () => {
  const onChange = vi.fn();
  renderUi(<CanvasSettingsPanel settings={DEFAULT_CANVAS_SETTINGS} onChange={onChange} />);

  await userEvent.click(screen.getByRole('radio', { name: 'Vertical' }));
  expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_CANVAS_SETTINGS, direction: 'vertical' });

  await userEvent.click(screen.getByRole('switch', { name: 'Show join fields' }));
  expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_CANVAS_SETTINGS, showJoinFields: true });

  await userEvent.click(screen.getByRole('checkbox', { name: 'Input source' }));
  expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_CANVAS_SETTINGS, hidden: { source: true, fields: false } });

  await userEvent.click(screen.getByRole('button', { name: 'Title only' }));
  expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_CANVAS_SETTINGS, hidden: { source: true, fields: true } });
});

it('opens from the gear button', async () => {
  renderUi(<CanvasSettingsPopover settings={DEFAULT_CANVAS_SETTINGS} onChange={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Canvas settings' }));
  expect(await screen.findByRole('radiogroup', { name: 'Layout direction' })).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Show join fields' })).toHaveAttribute('aria-checked', 'false');
});
