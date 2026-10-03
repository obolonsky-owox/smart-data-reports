import { DM, VISITOR_GRAPH, VISITOR_SCHEMA } from '../fixtures/smart-data';
import { joinPath } from './join-path';
import { buildSchemaIndex } from './schema-index';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);

it('lists the data marts from the main one to the target', () => {
  const path = joinPath(index, VISITOR_GRAPH, 'sessions.pageviews.page');
  expect(path.nodes).toEqual([
    { label: 'Visitor', dataMartId: DM.visitor },
    { label: 'Session', dataMartId: DM.session },
    { label: 'Pageview', dataMartId: DM.pageview },
    { label: 'Page', dataMartId: DM.page },
  ]);
});

it('gives each hop its join keys, description and grain', () => {
  expect(joinPath(index, VISITOR_GRAPH, 'sessions.pageviews').hops).toEqual([
    { keys: ['client_id = client_id'], description: 'Sessions of the visitor.', grain: 'multiplies' },
    { keys: ['session_id = session_id', 'client_id = client_id'], description: 'Pages viewed in the session.', grain: 'multiplies' },
  ]);
  expect(joinPath(index, VISITOR_GRAPH, 'landing_page').hops).toEqual([
    { keys: ['landing_page_id = id'], description: 'The first page the visitor landed on.', grain: 'none' },
  ]);
});

it('falls back to the relationship description', () => {
  const bare = buildSchemaIndex(
    { id: DM.visitor, title: 'Visitor' },
    { ...VISITOR_SCHEMA, availableSources: VISITOR_SCHEMA.availableSources.map((s) => ({ ...s, joinDescription: undefined })) },
  );
  expect(joinPath(bare, VISITOR_GRAPH, 'contact').hops[0]!.description).toBe('The contact this visitor was identified as.');
});

it('has no keys for a hop the graph does not know', () => {
  expect(joinPath(index, { rootDataMartId: DM.visitor, nodes: [] }, 'contact').hops).toEqual([
    { keys: [], description: 'The contact this visitor was identified as.', grain: 'none' },
  ]);
});

it('shows only the main data mart for the main path or an unknown one', () => {
  for (const aliasPath of ['', 'nowhere']) {
    expect(joinPath(index, VISITOR_GRAPH, aliasPath)).toEqual({ nodes: [{ label: 'Visitor', dataMartId: DM.visitor }], hops: [] });
  }
});
