// The plugin's own pages, as the host shows them after `/plugins/<pluginId>/open`.
// A route arrives from a shared link, so it is untrusted: it only chooses what to show.

export type Screen = { kind: 'list' } | { kind: 'editor'; reportId?: string };

const NEW_REPORT = 'new';

export function routeOf(screen: Screen): string {
  if (screen.kind === 'list') return '/';
  return `/reports/${screen.reportId === undefined ? NEW_REPORT : encodeURIComponent(screen.reportId)}`;
}

/** Anything that is not a known page opens the reports list. */
export function screenOf(route: string | undefined): Screen {
  const path = (route ?? '/').split(/[?#]/, 1)[0]!;
  const match = path.match(/^\/reports\/([^/]+)\/?$/);
  if (!match) return { kind: 'list' };
  if (match[1] === NEW_REPORT) return { kind: 'editor' };
  try {
    const reportId = decodeURIComponent(match[1]!);
    return reportId ? { kind: 'editor', reportId } : { kind: 'list' };
  } catch {
    return { kind: 'list' };
  }
}
