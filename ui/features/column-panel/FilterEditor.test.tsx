import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM, VISITOR_SCHEMA } from '../../fixtures/smart-data';
import { buildSchemaIndex } from '../../lib/schema-index';
import { renderUi } from '../../test/render';
import { FilterEditor } from './FilterEditor';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);
const email = index.fields.get('email')!;

// ODM sandboxes the plugin iframe without `allow-forms`, so the browser blocks form
// submission before any submit event fires. Swallow submit events to behave the same.
const blockSubmit = (event: Event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
};
beforeEach(() => document.addEventListener('submit', blockSubmit, true));
afterEach(() => document.removeEventListener('submit', blockSubmit, true));

function setup() {
  const onSave = vi.fn();
  const { container } = renderUi(
    <FilterEditor field={email} instanceLabel='Visitor' mainTitle='Visitor' isJoined={false} onSave={onSave} onCancel={vi.fn()} />,
  );
  return { onSave, container };
}

it('saves without form submission, which the plugin sandbox blocks', async () => {
  const { onSave, container } = setup();
  expect(container.querySelector('form')).toBeNull();
  await userEvent.type(screen.getByRole('textbox', { name: 'Value' }), 'a@b.c');
  await userEvent.click(screen.getByRole('button', { name: 'Save filter' }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ column: 'email', value: 'a@b.c' }));
});

it('saves on Enter in a value input', async () => {
  const { onSave } = setup();
  await userEvent.type(screen.getByRole('textbox', { name: 'Value' }), 'a@b.c{Enter}');
  expect(onSave).toHaveBeenCalledTimes(1);
});

it('offers the raw type operators for a slice and the joined type operators for a filter', async () => {
  const onSave = vi.fn();
  renderUi(
    <FilterEditor field={index.fields.get('contact__is_mql')!} instanceLabel='Contact' mainTitle='Visitor' isJoined onSave={onSave} onCancel={vi.fn()} />,
  );
  const operators = () => [...screen.getByRole('combobox', { name: 'Operator' }).querySelectorAll('option')].map((o) => o.value);
  expect(operators()).toContain('contains');
  await userEvent.click(screen.getByRole('switch', { name: 'Only narrow Contact' }));
  expect(operators()).toEqual(['is_true', 'is_false']);
  await userEvent.click(screen.getByRole('button', { name: 'Save filter' }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ column: 'contact__is_mql', operator: 'is_true', sliceOnly: true }));
});
