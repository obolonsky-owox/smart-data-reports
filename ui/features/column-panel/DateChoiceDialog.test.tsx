import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DM, VISITOR_SCHEMA } from '../../fixtures/smart-data';
import { buildSchemaIndex, dateFields } from '../../lib/schema-index';
import { renderUi } from '../../test/render';
import { DateChoiceDialog } from './DateChoiceDialog';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);
const choice = { aliasPath: 'contact.user', candidates: dateFields(index.instances.get('contact.user')!) };

it('preselects the first date and lets the user decline', async () => {
  const onChoose = vi.fn();
  renderUi(<DateChoiceDialog choice={choice} index={index} onChoose={onChoose} />);
  expect(screen.getByRole('radio', { name: 'Creation Date' })).toBeChecked();
  await userEvent.click(screen.getByRole('button', { name: 'Add date' }));
  expect(onChoose).toHaveBeenLastCalledWith('contact_user__creation_date');
  await userEvent.click(screen.getByRole('radio', { name: "Don't add a date" }));
  await userEvent.click(screen.getByRole('button', { name: 'Continue without a date' }));
  expect(onChoose).toHaveBeenLastCalledWith(null);
});
