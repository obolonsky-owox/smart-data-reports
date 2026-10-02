import { renderHook, waitFor } from '@testing-library/react';
import { DATA_MARTS, DM } from '../../fixtures/smart-data';
import { __mock, __resetForTests } from '../../sdk-mock';
import { mockServices } from '../../test/render';
import { useSchema } from './use-schema';

beforeEach(() => __resetForTests());
const visitor = DATA_MARTS.find((m) => m.id === DM.visitor)!;

it('loads the blendable schema and graph of the main data mart', async () => {
  const { api } = await mockServices();
  const { result } = renderHook(() => useSchema(api, visitor));
  await waitFor(() => expect(result.current.state.status).toBe('ready'));
  const state = result.current.state;
  if (state.status !== 'ready') throw new Error('not ready');
  expect(state.index.groups[0]?.title).toBe('Visitor');
  expect(state.graph.nodes).toHaveLength(6);
});

it('reports a failure and recovers on reload', async () => {
  __mock.fail(`/api/data-marts/${DM.visitor}/blendable-schema`, { code: 'HTTP_ERROR', status: 403, message: 'Forbidden' });
  const { api } = await mockServices();
  const { result } = renderHook(() => useSchema(api, visitor));
  await waitFor(() => expect(result.current.state.status).toBe('error'));
  expect(result.current.state).toMatchObject({ error: { message: "You don't have access to Visitor." } });
  __mock.clearFailures();
  result.current.reload();
  await waitFor(() => expect(result.current.state.status).toBe('ready'));
});

it('stays idle without a main data mart', async () => {
  const { api } = await mockServices();
  const { result } = renderHook(() => useSchema(api, undefined));
  expect(result.current.state.status).toBe('idle');
});
