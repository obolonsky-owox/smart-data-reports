import { dateRangePlacement, filterPlacement } from './placement';

it('places a main mart date range as a filter and a joined one as a slice', () => {
  expect(dateRangePlacement('')).toBe('filter');
  expect(dateRangePlacement('sessions')).toBe('slice');
});

it('places a filter as a slice only when it is slice-only on a joined mart', () => {
  expect(filterPlacement({ aliasPath: '', sliceOnly: false })).toBe('filter');
  expect(filterPlacement({ aliasPath: '', sliceOnly: true })).toBe('filter');
  expect(filterPlacement({ aliasPath: 'sessions', sliceOnly: false })).toBe('filter');
  expect(filterPlacement({ aliasPath: 'sessions', sliceOnly: true })).toBe('slice');
});
