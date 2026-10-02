import { act, screen } from '@testing-library/react';
import { bootstrap } from './bootstrap';
import { __resetForTests, __setTheme } from './sdk-mock';
import { resetPluginContextForTests } from './lib/plugin-runtime';

beforeEach(() => {
  __resetForTests();
  resetPluginContextForTests();
  document.body.innerHTML = '<div id="root"></div>';
  document.documentElement.className = '';
});

it('renders the app after the handshake and applies the dark theme', async () => {
  __setTheme('dark');
  await act(async () => {
    await bootstrap();
  });
  expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument();
  expect(document.documentElement).toHaveClass('dark');
});
