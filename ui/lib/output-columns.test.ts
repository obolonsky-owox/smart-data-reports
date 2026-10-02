import { DM } from '../fixtures/smart-data';
import { emptyDraft, type ReportDraft } from './report-draft';
import { outputColumns, pageCount, pageOf, splitOutputKey, totalFor } from './output-columns';

const draft: ReportDraft = {
  ...emptyDraft(DM.visitor),
  columns: [{ name: 'email', aliasPath: '' }, { name: 'visits', aliasPath: '', aggregations: ['AVG'] }, { name: 'sessions__duration_sec', aliasPath: 'sessions' }],
};

it('splits ODM output keys into column and function', () => {
  expect(splitOutputKey('visits | SUM')).toEqual({ base: 'visits', fn: 'SUM' });
  expect(splitOutputKey('email')).toEqual({ base: 'email' });
});

it('maps output keys to draft columns and marks automatic aggregations', () => {
  const rows = [{ email: 'a', 'visits | AVG': 2, 'sessions__duration_sec | SUM': 9 }];
  expect(outputColumns(rows, draft)).toEqual([
    { key: 'email', column: draft.columns[0], fn: undefined, automatic: false },
    { key: 'visits | AVG', column: draft.columns[1], fn: 'AVG', automatic: false },
    { key: 'sessions__duration_sec | SUM', column: draft.columns[2], fn: 'SUM', automatic: true },
  ]);
  expect(outputColumns([], draft).map((c) => c.key)).toEqual(['email', 'visits', 'sessions__duration_sec']);
});

it('picks the total for the column function, else SUM first', () => {
  const totals = { 'visits | SUM': 10, 'visits | AVG': 2.5, 'visits | MAX': 4 };
  const [, visits] = outputColumns([{ email: 'a', 'visits | AVG': 1 }], draft);
  expect(totalFor(totals, visits!)).toEqual({ fn: 'AVG', value: 2.5, others: [{ fn: 'SUM', value: 10 }, { fn: 'MAX', value: 4 }] });
  const plain = { key: 'visits', column: draft.columns[1], automatic: false };
  expect(totalFor(totals, plain)?.fn).toBe('SUM');
  expect(totalFor(null, plain)).toBeNull();
});

it('pages rows in hundreds', () => {
  const items = Array.from({ length: 250 }, (_, i) => i);
  expect(pageOf(items, 2)).toEqual(items.slice(200, 250));
  expect(pageCount(250)).toBe(3);
  expect(pageCount(0)).toBe(1);
});
