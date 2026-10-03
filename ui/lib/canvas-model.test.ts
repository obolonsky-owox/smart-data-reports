import { DM, VISITOR_GRAPH, VISITOR_SCHEMA } from '../fixtures/smart-data';
import { buildSchemaIndex } from './schema-index';
import { addColumn, emptyDraft, includePath, type ReportDraft } from './report-draft';
import { buildCanvasModel, NODE_WIDTH } from './canvas-model';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);
const add = (d: ReportDraft, ...names: string[]) => names.reduce((x, n) => addColumn(x, index, n).draft, d);

it('draws the main mart, used instances and the transit instances between them', () => {
  const draft = add(emptyDraft(DM.visitor), 'email', 'landing_page__title', 'sessions_pageviews_page__title');
  const model = buildCanvasModel(index, VISITOR_GRAPH, draft);
  expect(Object.fromEntries(model.nodes.map((n) => [n.path, n.kind]))).toEqual({
    '': 'main',
    landing_page: 'used',
    sessions: 'transit',
    'sessions.pageviews': 'transit',
    'sessions.pageviews.page': 'used',
  });
  const viewedPage = model.nodes.find((n) => n.path === 'sessions.pageviews.page')!;
  const main = model.nodes.find((n) => n.path === '')!;
  expect(viewedPage.x).toBeGreaterThan(main.x);
});

it('marks instances that only carry the path as transit', () => {
  const draft = { ...includePath(emptyDraft(DM.visitor), 'sessions.pageviews.page') };
  const kinds = Object.fromEntries(buildCanvasModel(index, VISITOR_GRAPH, draft).nodes.map((n) => [n.path, n.kind]));
  expect(kinds).toEqual({ '': 'main', sessions: 'transit', 'sessions.pageviews': 'transit', 'sessions.pageviews.page': 'used' });
});

it('labels edges with join keys only', () => {
  const draft = includePath(emptyDraft(DM.visitor), 'sessions.pageviews');
  const edge = buildCanvasModel(index, VISITOR_GRAPH, draft).edges.find((e) => e.target === 'sessions.pageviews')!;
  expect(edge).toEqual({ id: 'sessions->sessions.pageviews', source: 'sessions', target: 'sessions.pageviews', keys: ['session_id = session_id', 'client_id = client_id'] });
});

it('carries the descriptions for the node tooltip', () => {
  const draft = includePath(emptyDraft(DM.visitor), 'sessions');
  const nodes = buildCanvasModel(index, VISITOR_GRAPH, draft).nodes;
  const sessions = nodes.find((n) => n.path === 'sessions')!;
  expect(sessions.description).toBe(index.instances.get('sessions')!.description);
  expect(sessions.joinDescription).toBe(index.instances.get('sessions')!.joinDescription);
});

it('lays labelled edges out with room between the nodes and keeps the left-to-right order', () => {
  const draft = includePath(emptyDraft(DM.visitor), 'sessions.pageviews');
  const nodes = buildCanvasModel(index, VISITOR_GRAPH, draft).nodes;
  const x = (path: string) => nodes.find((n) => n.path === path)!.x;
  expect(x('sessions')).toBeGreaterThan(x(''));
  expect(x('sessions.pageviews')).toBeGreaterThan(x('sessions'));
  // The two-line label of session -> pageviews (about 140px wide) fits between the cards.
  expect(x('sessions.pageviews') - x('sessions') - NODE_WIDTH).toBeGreaterThan(140);
});
