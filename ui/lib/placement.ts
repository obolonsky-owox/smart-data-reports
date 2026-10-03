export type Placement = 'filter' | 'slice';

/** A period on the main mart bounds the whole report; on a joined mart it narrows that mart before the join. */
export function dateRangePlacement(aliasPath: string): Placement {
  return aliasPath === '' ? 'filter' : 'slice';
}

/** A filter is a slice only when marked slice-only on a joined mart. */
export function filterPlacement(filter: { aliasPath: string; sliceOnly?: boolean }): Placement {
  return filter.sliceOnly && filter.aliasPath !== '' ? 'slice' : 'filter';
}
