import { DM } from '../fixtures/smart-data';
import { emptyDraft } from './report-draft';
import {
  configHash, createReportStore, parseStoredReport,
  type CollectionDoc, type CollectionLike, type StoredReport,
} from './report-store';

function report(title: string, main: string = DM.visitor): StoredReport {
  return { schemaVersion: 1, title, draft: emptyDraft(main), createdBy: 'u1', updatedBy: 'u1' };
}

function doc<T>(id: string, document: T, updatedAt: string): CollectionDoc<T> {
  return { id, document, createdAt: updatedAt, updatedAt };
}

function fakeCollection(pages: { items: CollectionDoc<unknown>[]; nextCursor: string | null }[] = []) {
  const log: string[] = [];
  const collection: CollectionLike<StoredReport> = {
    list: async (o) => {
      log.push(`list:${o?.cursor ?? ''}`);
      return (pages.shift() ?? { items: [], nextCursor: null }) as { items: CollectionDoc<StoredReport>[]; nextCursor: string | null };
    },
    get: async () => null,
    put: async (id, document, o) => {
      log.push(`put:${id}:${o?.parentId}`);
      return { id, parentId: o?.parentId, document, createdAt: 't', updatedAt: 't' };
    },
    delete: async (id) => void log.push(`delete:${id}`),
  };
  return { collection, log };
}

describe('listAll', () => {
  it('keeps paging through short and empty pages and skips unreadable documents', async () => {
    const { collection, log } = fakeCollection([
      { items: [doc('a', report('Older'), '2026-09-01')], nextCursor: 'c1' },
      { items: [], nextCursor: 'c2' },
      { items: [doc('bad', { schemaVersion: 7 }, '2026-09-03'), doc('b', report('Newer'), '2026-09-02')], nextCursor: null },
    ]);
    const reports = await createReportStore(collection).listAll();
    expect(reports.map((r) => r.report.title)).toEqual(['Newer', 'Older']);
    expect(log).toEqual(['list:', 'list:c1', 'list:c2']);
  });

  it('stops on a repeated cursor instead of looping forever', async () => {
    const { collection } = fakeCollection([
      { items: [], nextCursor: 'same' },
      { items: [], nextCursor: 'same' },
    ]);
    await expect(createReportStore(collection).listAll()).rejects.toThrow('repeated cursor');
  });
});

describe('save', () => {
  it('creates a document under the main data mart', async () => {
    const { collection, log } = fakeCollection();
    const saved = await createReportStore(collection, () => 'new-id').save({ report: report('R') });
    expect(saved.id).toBe('new-id');
    expect(log).toEqual([`put:new-id:${DM.visitor}`]);
  });

  it('overwrites in place when the main data mart is unchanged', async () => {
    const { collection, log } = fakeCollection();
    await createReportStore(collection, () => 'unused').save({ id: 'r1', report: report('R'), previousParentId: DM.visitor });
    expect(log).toEqual([`put:r1:${DM.visitor}`]);
  });

  it('moves to a new document when the main data mart changes, writing before deleting', async () => {
    const { collection, log } = fakeCollection();
    const saved = await createReportStore(collection, () => 'moved').save({
      id: 'r1', report: report('R', DM.session), previousParentId: DM.visitor,
    });
    expect(saved.id).toBe('moved');
    expect(log).toEqual([`put:moved:${DM.session}`, 'delete:r1']);
  });
});

describe('parseStoredReport', () => {
  it('fills missing draft arrays so older documents still open', () => {
    const parsed = parseStoredReport({ schemaVersion: 1, title: 'T', draft: { mainDataMartId: DM.visitor }, createdBy: 'u', updatedBy: 'u' });
    expect(parsed?.draft).toEqual(emptyDraft(DM.visitor));
    expect(parseStoredReport({ schemaVersion: 2 })).toBeNull();
    expect(parseStoredReport('nope')).toBeNull();
  });

  it("keeps a link's data mart only when it is recorded", () => {
    const link = { reportId: 'r', destinationId: 'd', spreadsheetId: 's', sheetId: 0, syncedDraftHash: 'h' };
    const parse = (linkedReport: unknown) =>
      parseStoredReport({ schemaVersion: 1, title: 'T', draft: { mainDataMartId: DM.visitor }, linkedReport })?.linkedReport;
    expect(parse({ ...link, dataMartId: DM.visitor })).toEqual({ ...link, dataMartId: DM.visitor });
    expect(parse({ ...link, dataMartId: 7 })).toEqual(link);
    expect(parse(link)).toEqual(link);
  });
});

describe('configHash', () => {
  it('ignores what does not change the query', () => {
    const base = emptyDraft(DM.visitor);
    const a = { ...base, columns: [{ name: 'email', aliasPath: '' }], filters: [{ id: 'x', column: 'email', aliasPath: '', operator: 'is_not_blank' as const, sliceOnly: false }] };
    const b = { ...a, includedPaths: ['contact'], filters: [{ ...a.filters[0]!, id: 'y' }] };
    expect(configHash(a)).toBe(configHash(b));
    expect(configHash(a)).not.toBe(configHash({ ...a, columns: [] }));
  });
});
