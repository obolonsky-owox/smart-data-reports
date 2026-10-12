import { routeOf, screenOf } from './routes';

it('maps each screen to a route and back', () => {
  for (const screen of [{ kind: 'list' }, { kind: 'editor' }, { kind: 'editor', reportId: '0b6f-42' }] as const) {
    expect(screenOf(routeOf(screen))).toEqual(screen);
  }
});

it('percent-encodes report ids', () => {
  expect(routeOf({ kind: 'editor', reportId: 'a/b c' })).toBe('/reports/a%2Fb%20c');
  expect(screenOf('/reports/a%2Fb%20c')).toEqual({ kind: 'editor', reportId: 'a/b c' });
});

it('ignores a query, a hash and a trailing slash', () => {
  expect(screenOf('/reports/r1?from=email#top')).toEqual({ kind: 'editor', reportId: 'r1' });
  expect(screenOf('/reports/r1/')).toEqual({ kind: 'editor', reportId: 'r1' });
});

it('opens the list for a missing, unknown or malformed route', () => {
  for (const route of [undefined, '/', '', '/dashboards/1', '/reports', '/reports/', '/reports/r1/sql', '/reports/%E0%A4%A']) {
    expect(screenOf(route)).toEqual({ kind: 'list' });
  }
});
