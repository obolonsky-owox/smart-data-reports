import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DATA_MARTS, DM } from '../fixtures/smart-data';
import { renderUi } from '../test/render';
import { DataMartPicker } from './DataMartPicker';

const marts = DATA_MARTS.filter((m) => m.id !== DM.invoice);

function setup(value: string = DM.visitor) {
  const onChange = vi.fn();
  renderUi(<DataMartPicker label='Data mart' marts={marts} value={value} onChange={onChange} />);
  return { onChange, trigger: screen.getByRole('combobox', { name: 'Data mart' }) };
}

it('shows the current data mart and lists all of them when opened', async () => {
  const { trigger } = setup();
  expect(trigger).toHaveTextContent('Visitor');
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const list = screen.getByRole('listbox', { name: 'Data mart' });
  expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(marts.map((m) => m.title));
  expect(within(list).getByRole('option', { name: 'Visitor' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('textbox', { name: 'Search data marts' })).toHaveFocus();
});

it('filters by a case-insensitive substring of the title and picks with a click', async () => {
  const { trigger, onChange } = setup();
  await userEvent.click(trigger);
  await userEvent.type(screen.getByRole('textbox', { name: 'Search data marts' }), 'SESS');
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Session']);
  await userEvent.click(screen.getByRole('option', { name: 'Session' }));
  expect(onChange).toHaveBeenCalledWith(DM.session);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('says when nothing matches', async () => {
  const { trigger } = setup();
  await userEvent.click(trigger);
  await userEvent.type(screen.getByRole('textbox', { name: 'Search data marts' }), 'nothing like this');
  expect(screen.queryAllByRole('option')).toEqual([]);
  expect(screen.getByText('No data marts found.')).toBeInTheDocument();
});

it('moves through the list with the arrow keys and picks with Enter', async () => {
  const { trigger, onChange } = setup(DM.contact);
  await userEvent.click(trigger);
  const search = screen.getByRole('textbox', { name: 'Search data marts' });
  // Starts on the current data mart.
  expect(search).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Contact' }).id);
  await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{ArrowDown}');
  const third = marts[3]!;
  expect(search).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: third.title }).id);
  await userEvent.keyboard('{Enter}');
  expect(onChange).toHaveBeenCalledWith(third.id);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it('closes on Escape without changing the data mart', async () => {
  const { trigger, onChange } = setup();
  await userEvent.click(trigger);
  await userEvent.keyboard('{ArrowDown}{Escape}');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
  expect(trigger).toHaveFocus();
});

it('opens from the keyboard with ArrowDown', async () => {
  const { trigger } = setup();
  trigger.focus();
  await userEvent.keyboard('{ArrowDown}');
  expect(screen.getByRole('listbox', { name: 'Data mart' })).toBeInTheDocument();
});
