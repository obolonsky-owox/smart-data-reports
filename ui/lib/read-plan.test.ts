import { DM, VISITOR_SCHEMA } from '../fixtures/smart-data';
import { buildSchemaIndex } from './schema-index';
import { addColumn, emptyDraft, setAggregations, setDateTrunc, setSort, upsertFilter, type ReportDraft } from './report-draft';
import {
  MAX_IN_VALUES, QUERY_LIMIT, describeIssue, toReadPlan, toReportConfig, toTraverseOptions, validateDraft,
} from './read-plan';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);
const today = new Date(2026, 9, 2);
const add = (draft: ReportDraft, ...names: string[]) => names.reduce((d, n) => addColumn(d, index, n).draft, draft);

describe('toReadPlan', () => {
  it('sends main-mart dates as filters and joined dates as slices', () => {
    const plan = toReadPlan(add(emptyDraft(DM.visitor), 'email', 'sessions__source'), today);
    expect(plan.column).toEqual(['email', 'sessions__source']);
    expect(plan.filter).toEqual([
      { column: 'creation_date', operator: 'relative_date', value: { kind: 'last_n_days', n: 29 } },
      { column: 'sessions__date', operator: 'relative_date', value: { kind: 'last_n_days', n: 29 }, placement: 'pre-join' },
    ]);
  });

  it('turns "only narrow" filters on joined marts into slices and ignores it on the main mart', () => {
    let draft = add(emptyDraft(DM.visitor), 'email', 'sessions__source');
    draft = upsertFilter(draft, { id: 'a', column: 'sessions__source', aliasPath: 'sessions', operator: 'eq', value: 'google', sliceOnly: true });
    draft = upsertFilter(draft, { id: 'b', column: 'email', aliasPath: '', operator: 'is_not_blank', sliceOnly: true });
    const filters = toReadPlan(draft, today).filter.slice(2);
    expect(filters).toEqual([
      { column: 'sessions__source', operator: 'eq', value: 'google', placement: 'pre-join' },
      { column: 'email', operator: 'is_not_blank' },
    ]);
  });

  it('maps sorts, aggregations and date buckets', () => {
    let draft = add(emptyDraft(DM.visitor), 'creation_date', 'visits');
    draft = setSort(draft, 'visits', 'desc');
    draft = setAggregations(draft, 'visits', ['SUM', 'AVG']);
    draft = setDateTrunc(draft, 'creation_date', 'MONTH');
    const plan = toReadPlan(draft, today);
    expect(plan.sort).toEqual([{ column: 'visits', direction: 'desc' }]);
    expect(plan.aggregation).toEqual([{ column: 'visits', function: 'SUM' }, { column: 'visits', function: 'AVG' }]);
    expect(plan.dateTrunc).toEqual([{ column: 'creation_date', unit: 'MONTH' }]);
  });
});

describe('request shapes', () => {
  const plan = toReadPlan(add(emptyDraft(DM.visitor), 'email'), today);

  it('asks HTTP Data for one row more than the cap and sends empty parts as null', () => {
    expect(toTraverseOptions(plan)).toEqual({
      column: ['email'], filter: plan.filter, sort: null, aggregation: null, dateTrunc: null, limit: QUERY_LIMIT,
    });
    expect(QUERY_LIMIT).toBe(2501);
  });

  it('builds a report configuration without any row limit', () => {
    expect(toReportConfig(plan)).toEqual({
      columnConfig: ['email'], filterConfig: plan.filter, sortConfig: null, aggregationConfig: null, dateTruncConfig: null,
    });
  });
});

describe('validateDraft', () => {
  it('requires at least one column', () => {
    expect(validateDraft(emptyDraft(DM.visitor), index, today)).toEqual([{ kind: 'no-columns' }]);
  });

  it('flags columns that are no longer in the schema', () => {
    const draft = { ...add(emptyDraft(DM.visitor), 'email'), columns: [{ name: 'gone_field', aliasPath: '' }] };
    const issues = validateDraft(draft, index, today);
    expect(issues).toContainEqual({ kind: 'unknown-column', column: 'gone_field' });
    expect(describeIssue({ kind: 'unknown-column', column: 'gone_field' }, index)).toBe(
      '"gone_field" is no longer available. Remove it to run the report.',
    );
  });

  it('requires filter values and caps list sizes', () => {
    let draft = add(emptyDraft(DM.visitor), 'email');
    draft = upsertFilter(draft, { id: 'empty', column: 'email', aliasPath: '', operator: 'eq', value: '', sliceOnly: false });
    draft = upsertFilter(draft, {
      id: 'big', column: 'email', aliasPath: '', operator: 'in',
      value: Array.from({ length: MAX_IN_VALUES + 1 }, (_, i) => `v${i}`), sliceOnly: false,
    });
    expect(validateDraft(draft, index, today)).toEqual(
      expect.arrayContaining([{ kind: 'filter-needs-value', filterId: 'empty' }, { kind: 'too-many-values', filterId: 'big' }]),
    );
  });

  it('flags a sort on a column that is not in the report', () => {
    const draft = { ...add(emptyDraft(DM.visitor), 'email'), sorts: [{ column: 'client_id', direction: 'asc' as const }] };
    expect(validateDraft(draft, index, today)).toContainEqual({ kind: 'sort-not-selected', column: 'client_id' });
    expect(describeIssue({ kind: 'sort-not-selected', column: 'client_id' }, index)).toBe(
      'The report is sorted by "Client ID", which isn\'t one of its columns. Remove that sort or add the column.',
    );
  });

  it('requires both dates of a custom period, in order', () => {
    const withRange = (from: string, to: string): ReportDraft => {
      const draft = add(emptyDraft(DM.visitor), 'email');
      return { ...draft, dateRanges: draft.dateRanges.map((r) => ({ ...r, range: { kind: 'custom', from, to } })) };
    };
    expect(validateDraft(withRange('2026-01-01', ''), index, today)).toContainEqual({ kind: 'custom-range-incomplete', column: 'creation_date' });
    expect(validateDraft(withRange('', '2026-01-01'), index, today)).toContainEqual({ kind: 'custom-range-incomplete', column: 'creation_date' });
    expect(validateDraft(withRange('2026-02-01', '2026-01-01'), index, today)).toContainEqual({ kind: 'custom-range-reversed', column: 'creation_date' });
    expect(validateDraft(withRange('2026-01-01', '2026-01-01'), index, today)).toEqual([]);
    expect(describeIssue({ kind: 'custom-range-incomplete', column: 'creation_date' }, index)).toBe('Fill in both dates of every custom period.');
    expect(describeIssue({ kind: 'custom-range-reversed', column: 'creation_date' }, index)).toBe("A period can't end before it starts.");
  });

  it('flags a filter parameter longer than ODM accepts', () => {
    const draft = upsertFilter(add(emptyDraft(DM.visitor), 'email'), {
      id: 'long', column: 'email', aliasPath: '', operator: 'in',
      value: Array.from({ length: 400 }, (_, i) => `someone.with.a.long.address.${i}@example.com`), sliceOnly: false,
    });
    expect(validateDraft(draft, index, today)).toContainEqual({ kind: 'too-long', param: 'filter' });
  });
});
