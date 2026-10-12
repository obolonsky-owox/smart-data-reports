import type { StoredReport } from './report-store';

// Who wrote a report. The plugin host offers no member directory: a report carries its
// author's name from the time it was saved, and older reports borrow names from the people
// the data mart list mentions.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** A display name from an ODM user record: the full name, else the email. */
export function nameOf(user: unknown): string | null {
  return isRecord(user) ? (text(user.fullName) ?? text(user.email)) : null;
}

/** userId → name of every creator and owner the raw data mart list mentions. */
export function peopleOf(marts: unknown[]): Map<string, string> {
  const people = new Map<string, string>();
  const add = (user: unknown) => {
    const name = nameOf(user);
    if (name && isRecord(user) && typeof user.userId === 'string' && !people.has(user.userId)) people.set(user.userId, name);
  };
  for (const mart of marts) {
    if (!isRecord(mart)) continue;
    add(mart.createdByUser);
    for (const key of ['businessOwnerUsers', 'technicalOwnerUsers'] as const) {
      if (Array.isArray(mart[key])) mart[key].forEach(add);
    }
  }
  return people;
}

export function authorLabel(report: StoredReport, userId: string, people: ReadonlyMap<string, string>): string {
  if (report.createdBy === userId) return 'You';
  return report.createdByName ?? people.get(report.createdBy) ?? 'Another member';
}
