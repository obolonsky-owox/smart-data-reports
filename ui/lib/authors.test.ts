import { authorLabel, nameOf, peopleOf } from './authors';
import { emptyDraft } from './report-draft';
import type { StoredReport } from './report-store';

const report = (extra: Partial<StoredReport> = {}): StoredReport => ({
  schemaVersion: 1, title: 'R', draft: emptyDraft('dm'), createdBy: 'u2', updatedBy: 'u2', ...extra,
});

it('names a user by full name, else by email', () => {
  expect(nameOf({ userId: 'u', fullName: ' Olena K ', email: 'o@x.com' })).toBe('Olena K');
  expect(nameOf({ userId: 'u', fullName: '', email: 'o@x.com' })).toBe('o@x.com');
  expect(nameOf({ userId: 'u', fullName: null, email: null })).toBeNull();
  expect(nameOf('u')).toBeNull();
});

it('collects creators and owners from the raw data mart list', () => {
  const people = peopleOf([
    { id: 'a', createdByUser: { userId: 'u1', fullName: 'Ann' }, businessOwnerUsers: [{ userId: 'u2', email: 'bo@x.com' }] },
    { id: 'b', createdByUser: null, technicalOwnerUsers: [{ userId: 'u3', fullName: 'Tom' }, { userId: 'u4' }] },
    'junk',
  ]);
  expect([...people]).toEqual([['u1', 'Ann'], ['u2', 'bo@x.com'], ['u3', 'Tom']]);
});

it('labels the author: you, the stored name, a known person, else another member', () => {
  const people = new Map([['u2', 'From marts']]);
  expect(authorLabel(report({ createdBy: 'me' }), 'me', people)).toBe('You');
  expect(authorLabel(report({ createdByName: 'Stored' }), 'me', people)).toBe('Stored');
  expect(authorLabel(report(), 'me', people)).toBe('From marts');
  expect(authorLabel(report({ createdBy: 'u9' }), 'me', people)).toBe('Another member');
});
