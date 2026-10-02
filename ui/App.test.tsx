import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { __resetForTests, connect } from './sdk-mock';

beforeEach(() => __resetForTests());

it('opens the editor from the reports list and comes back', async () => {
  render(<App context={await connect()} />);
  await userEvent.click(await screen.findByTestId('newReport'));
  expect(await screen.findByTestId('editorPage')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /back to reports/i }));
  expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument();
});
