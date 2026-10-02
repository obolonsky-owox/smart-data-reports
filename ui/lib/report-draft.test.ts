import { DM, SESSION_SCHEMA, VISITOR_SCHEMA } from '../fixtures/smart-data';
import { buildSchemaIndex } from './schema-index';
import {
  addColumn, changeInstancePath, chooseAutoDate, emptyDraft, moveColumn, rebaseOnMain,
  removeDateRange, removeInstance, setDateRange, setSort, upsertFilter, usedInstances,
  type ReportDraft,
} from './report-draft';

const visitor = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);
const session = buildSchemaIndex({ id: DM.session, title: 'Session' }, SESSION_SCHEMA);

function add(draft: ReportDraft, ...names: string[]): ReportDraft {
  return names.reduce((d, name) => addColumn(d, visitor, name).draft, draft);
}

describe('addColumn', () => {
  it('auto-adds the only date of the main mart as Last 30 days', () => {
    const draft = add(emptyDraft(DM.visitor), 'email', 'client_id');
    expect(draft.columns.map((c) => c.name)).toEqual(['email', 'client_id']);
    expect(draft.dateRanges).toEqual([
      { column: 'creation_date', aliasPath: '', range: { kind: 'preset', preset: 'last_30_days' }, autoAdded: true },
    ]);
  });

  it('auto-adds the date of a joined instance and includes its path', () => {
    const draft = add(emptyDraft(DM.visitor), 'contact__name');
    expect(draft.includedPaths).toEqual(['contact']);
    expect(draft.dateRanges.map((r) => [r.column, r.aliasPath])).toEqual([['contact__creation_date', 'contact']]);
  });

  it('asks which date to use when the instance has several, without adding one yet', () => {
    const result = addColumn(emptyDraft(DM.visitor), visitor, 'contact_user__creation_source');
    expect(result.draft.includedPaths).toEqual(['contact', 'contact.user']);
    expect(result.draft.dateRanges).toEqual([]);
    expect(result.dateChoice?.aliasPath).toBe('contact.user');
    expect(result.dateChoice?.candidates.map((f) => f.name)).toEqual([
      'contact_user__creation_date', 'contact_user__first_login_date',
    ]);
  });

  it('puts the picked date first among the candidates', () => {
    const result = addColumn(emptyDraft(DM.visitor), visitor, 'contact_user__first_login_date');
    expect(result.dateChoice?.candidates[0]?.name).toBe('contact_user__first_login_date');
  });

  it('ignores unknown and duplicate columns', () => {
    const draft = add(emptyDraft(DM.visitor), 'email');
    expect(addColumn(draft, visitor, 'email').draft).toBe(draft);
    expect(addColumn(draft, visitor, 'nope').draft).toBe(draft);
  });
});

describe('auto date opt-out', () => {
  it('respects "Don\'t add a date"', () => {
    const { draft } = addColumn(emptyDraft(DM.visitor), visitor, 'contact_user__creation_source');
    const declined = chooseAutoDate(draft, visitor, 'contact.user', null);
    expect(declined.dateRangeOptOut).toEqual(['contact.user']);
    const again = addColumn({ ...declined, columns: [] }, visitor, 'contact_user__creation_source');
    expect(again.dateChoice).toBeUndefined();
  });

  it('adds the chosen date', () => {
    const { draft } = addColumn(emptyDraft(DM.visitor), visitor, 'contact_user__creation_source');
    const chosen = chooseAutoDate(draft, visitor, 'contact.user', 'contact_user__first_login_date');
    expect(chosen.dateRanges.map((r) => r.column)).toEqual(['contact_user__first_login_date']);
  });

  it('does not re-add a removed auto date', () => {
    const draft = removeDateRange(add(emptyDraft(DM.visitor), 'email'), 'creation_date');
    expect(draft.dateRanges).toEqual([]);
    expect(add({ ...draft, columns: [] }, 'email').dateRanges).toEqual([]);
  });
});

describe('editing', () => {
  it('updates a date range and marks it as chosen by the user', () => {
    const draft = setDateRange(add(emptyDraft(DM.visitor), 'email'), visitor, 'creation_date', { kind: 'preset', preset: 'last_7_days' });
    expect(draft.dateRanges).toEqual([
      { column: 'creation_date', aliasPath: '', range: { kind: 'preset', preset: 'last_7_days' }, autoAdded: false },
    ]);
  });

  it('adds, updates and removes sorts in priority order', () => {
    let draft = add(emptyDraft(DM.visitor), 'email', 'client_id');
    draft = setSort(draft, 'email', 'asc');
    draft = setSort(draft, 'client_id', 'desc');
    draft = setSort(draft, 'email', 'desc');
    expect(draft.sorts).toEqual([{ column: 'email', direction: 'desc' }, { column: 'client_id', direction: 'desc' }]);
    expect(setSort(draft, 'email', null).sorts).toEqual([{ column: 'client_id', direction: 'desc' }]);
  });

  it('moves columns', () => {
    const draft = moveColumn(add(emptyDraft(DM.visitor), 'email', 'client_id', 'visits'), 2, 0);
    expect(draft.columns.map((c) => c.name)).toEqual(['visits', 'email', 'client_id']);
  });
});

describe('removeInstance', () => {
  it('removes the instance, everything below it and what refers to them', () => {
    let draft = add(emptyDraft(DM.visitor), 'email', 'sessions__source', 'sessions_pageviews_page__title');
    draft = upsertFilter(draft, { id: 'f1', column: 'sessions__source', aliasPath: 'sessions', operator: 'eq', value: 'google', sliceOnly: false });
    draft = setSort(draft, 'sessions_pageviews_page__title', 'asc');
    const next = removeInstance(draft, 'sessions');
    expect(next.columns.map((c) => c.name)).toEqual(['email']);
    expect(next.includedPaths).toEqual([]);
    expect(next.filters).toEqual([]);
    expect(next.sorts).toEqual([]);
    expect(next.dateRanges.map((r) => r.column)).toEqual(['creation_date']);
    expect(removeInstance(draft, '')).toBe(draft);
  });
});

describe('changeInstancePath', () => {
  it('moves columns and dates to the same fields on another path', () => {
    const draft = add(emptyDraft(DM.visitor), 'landing_page__title');
    const { draft: next, dropped } = changeInstancePath(draft, visitor, 'landing_page', 'sessions.pageviews.page');
    expect(dropped).toEqual([]);
    expect(next.columns).toEqual([{ name: 'sessions_pageviews_page__title', aliasPath: 'sessions.pageviews.page' }]);
    expect(next.dateRanges.map((r) => r.column)).toEqual(['sessions_pageviews_page__creation_date']);
    expect(next.includedPaths).toEqual(['sessions', 'sessions.pageviews', 'sessions.pageviews.page']);
  });
});

describe('rebaseOnMain', () => {
  it('keeps what the new main mart reaches and reports the rest as dropped', () => {
    const draft = add(
      emptyDraft(DM.visitor),
      'email', 'sessions__source', 'sessions_pageviews_page__title', 'landing_page__title', 'contact__name',
    );
    const { draft: next, dropped } = rebaseOnMain(draft, visitor, session);
    expect(next.mainDataMartId).toBe(DM.session);
    expect(next.columns.map((c) => c.name)).toEqual(['source', 'pageviews_page__title']);
    expect(dropped).toEqual(
      expect.arrayContaining(['email', 'landing_page__title', 'contact__name', 'creation_date', 'contact__creation_date']),
    );
    // A joined date becomes a main-mart date, i.e. a filter instead of a slice.
    expect(next.dateRanges.map((r) => [r.column, r.aliasPath])).toEqual(
      expect.arrayContaining([['date', ''], ['pageviews_page__creation_date', 'pageviews.page']]),
    );
  });
});

describe('usedInstances', () => {
  it('collects included paths and paths referenced by columns', () => {
    const draft = add(emptyDraft(DM.visitor), 'email', 'contact_user__creation_source');
    expect(usedInstances(draft).sort()).toEqual(['', 'contact', 'contact.user']);
  });
});
