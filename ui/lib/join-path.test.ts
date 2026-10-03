import { DM, VISITOR_GRAPH, VISITOR_SCHEMA } from '../fixtures/smart-data';
import { joinPath, variantLabels } from './join-path';
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

it('gives each hop its join keys, and description', () => {
  expect(joinPath(index, VISITOR_GRAPH, 'sessions.pageviews').hops).toEqual([
    { keys: ['client_id = client_id'], description: 'Sessions of the visitor.' },
    { keys: ['session_id = session_id', 'client_id = client_id'], description: 'Pages viewed in the session.' },
  ]);
  expect(joinPath(index, VISITOR_GRAPH, 'landing_page').hops).toEqual([
    { keys: ['landing_page_id = id'], description: 'The first page the visitor landed on.' },
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
    { keys: [], description: 'The contact this visitor was identified as.' },
  ]);
});

it('shows only the main data mart for the main path or an unknown one', () => {
  for (const aliasPath of ['', 'nowhere']) {
    expect(joinPath(index, VISITOR_GRAPH, aliasPath)).toEqual({ nodes: [{ label: 'Visitor', dataMartId: DM.visitor }], hops: [] });
  }
});

describe('variantLabels', () => {
  it('names each join path by its chain', () => {
    expect(variantLabels(index, VISITOR_GRAPH, ['sessions', 'contact.sessions'])).toEqual(['via Session', 'via Contact › Session']);
  });

  // contact.first_session relabelled "Session" reads "via Contact › Session", like contact.sessions.
  const twins = buildSchemaIndex(
    { id: DM.visitor, title: 'Visitor' },
    {
      ...VISITOR_SCHEMA,
      availableSources: VISITOR_SCHEMA.availableSources.map((s) =>
        s.aliasPath === 'contact.first_session' ? { ...s, defaultAlias: 'Session' } : s,
      ),
    },
  );

  it('tells apart paths with the same chain by the keys of the first join that differs', () => {
    expect(variantLabels(twins, VISITOR_GRAPH, ['sessions', 'contact.sessions', 'contact.first_session'])).toEqual([
      'via Session',
      'via Contact › Session · contact_id = contact_id',
      'via Contact › Session · first_session_id = session_id, contact_id = contact_id',
    ]);
  });

  it('falls back to the alias path when the keys do not differ', () => {
    expect(variantLabels(twins, { rootDataMartId: DM.visitor, nodes: [] }, ['contact.sessions', 'contact.first_session'])).toEqual([
      'via Contact › Session · contact.sessions',
      'via Contact › Session · contact.first_session',
    ]);
  });
});
