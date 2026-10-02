import { DM, VISITOR_SCHEMA } from '../fixtures/smart-data';
import {
  buildSchemaIndex, chain, chainLabel, childInstances, dateFields, fieldKind, instancesOf,
  isSameOrDescendant, parentPath,
} from './schema-index';

const index = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, VISITOR_SCHEMA);

describe('fieldKind', () => {
  it.each([
    ['DATE', 'date'], ['DATETIME', 'date'], ['TIMESTAMP_NTZ', 'date'], ['INTEGER', 'number'],
    ['FLOAT64', 'number'], ['NUMERIC', 'number'], ['BOOLEAN', 'boolean'], ['STRING', 'text'],
    ['VARCHAR(255)', 'text'], ['ARRAY<STRING>', 'other'], ['TIME', 'other'],
  ])('%s → %s', (type, kind) => expect(fieldKind(type)).toBe(kind));
});

describe('paths', () => {
  it('derives parents and descendants', () => {
    expect(parentPath('sessions.pageviews')).toBe('sessions');
    expect(parentPath('sessions')).toBe('');
    expect(isSameOrDescendant('sessions.pageviews', 'sessions')).toBe(true);
    expect(isSameOrDescendant('sessions_x', 'sessions')).toBe(false);
    expect(isSameOrDescendant('anything', '')).toBe(true);
  });
});

describe('buildSchemaIndex', () => {
  it('groups instances by data mart with the main mart first', () => {
    expect(index.groups.map((g) => g.title)).toEqual(['Visitor', 'Contact', 'Page', 'Pageview', 'Session', 'User']);
  });

  it('keeps one data mart reachable through several paths as separate instances', () => {
    const page = index.groups.find((g) => g.dataMartId === DM.page)!;
    expect(page.instances.map((i) => i.aliasPath)).toEqual(['landing_page', 'sessions.pageviews.page']);
    expect(instancesOf(index, DM.page).map((i) => i.label)).toEqual(['Landing page', 'Page']);
  });

  it('flattens nested native fields and drops hidden ones', () => {
    const main = index.instances.get('')!;
    expect(main.fields.map((f) => f.name)).toEqual(['creation_date', 'email', 'client_id', 'visits', 'geo.country']);
    expect(index.fields.get('geo.country')?.label).toBe('Geo › Country');
  });

  it('drops hidden and calculated joined fields', () => {
    expect(index.fields.has('contact__hidden_note')).toBe(false);
    expect(index.fields.has('contact__score_formula')).toBe(false);
    expect(index.fields.get('contact__name')).toMatchObject({ aliasPath: 'contact', originalName: 'name', label: 'Name' });
  });

  it('skips inaccessible or excluded sources together with everything below them', () => {
    const schema = {
      ...VISITOR_SCHEMA,
      availableSources: VISITOR_SCHEMA.availableSources.map((s) =>
        s.aliasPath === 'contact' ? { ...s, isAccessibleForReporting: false } : s,
      ),
    };
    const restricted = buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, schema);
    expect(restricted.instances.has('contact')).toBe(false);
    expect(restricted.instances.has('contact.user')).toBe(false);
    expect(restricted.fields.has('contact_user__creation_source')).toBe(false);
  });

  it('reads a missing grain verdict as unknown', () => {
    const schema = {
      ...VISITOR_SCHEMA,
      availableSources: VISITOR_SCHEMA.availableSources.map(({ mainGrainMultiplication: _drop, ...s }) => s),
    };
    expect(buildSchemaIndex({ id: DM.visitor, title: 'Visitor' }, schema).instances.get('contact')?.grain).toBe('unknown');
  });
});

describe('navigation helpers', () => {
  it('walks the chain from the main mart to an instance', () => {
    expect(chain(index, 'sessions.pageviews.page').map((i) => i.title)).toEqual(['Session', 'Pageview', 'Page']);
    expect(chainLabel(index, 'sessions.pageviews.page')).toBe('Session › Pageview › Page');
    expect(chain(index, '')).toEqual([]);
  });

  it('lists direct targets of an instance', () => {
    expect(childInstances(index, '').map((i) => i.aliasPath)).toEqual(['contact', 'sessions', 'landing_page']);
    expect(childInstances(index, 'sessions').map((i) => i.aliasPath)).toEqual(['sessions.pageviews']);
  });

  it('finds date fields of an instance', () => {
    expect(dateFields(index.instances.get('contact.user')!).map((f) => f.name)).toEqual([
      'contact_user__creation_date',
      'contact_user__first_login_date',
    ]);
  });
});
