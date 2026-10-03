import type {
  AvailableSource, BlendableSchema, BlendedField, DataMartSummary, MainGrainMultiplication,
  NativeField, RelationshipGraph, Row, StorageSummary,
} from '../lib/odm-types';

export const DM = {
  visitor: 'dm-visitor',
  contact: 'dm-contact',
  user: 'dm-user',
  session: 'dm-session',
  pageview: 'dm-pageview',
  page: 'dm-page',
  invoice: 'dm-invoice',
} as const;
type MartId = (typeof DM)[keyof typeof DM];

const TITLES: Record<MartId, string> = {
  [DM.visitor]: 'Visitor',
  [DM.contact]: 'Contact',
  [DM.user]: 'User',
  [DM.session]: 'Session',
  [DM.pageview]: 'Pageview',
  [DM.page]: 'Page',
  [DM.invoice]: 'Invoice',
};

const NATIVE: Record<MartId, NativeField[]> = {
  [DM.visitor]: [
    { name: 'creation_date', type: 'DATE', alias: 'Creation Date' },
    { name: 'email', type: 'STRING', alias: 'Email', description: 'Visitor email, when known.' },
    { name: 'client_id', type: 'STRING', alias: 'Client ID' },
    { name: 'visits', type: 'INTEGER', alias: 'Visits', aggregationRole: 'metric', allowedAggregations: ['SUM', 'AVG', 'MIN', 'MAX'] },
    { name: 'geo', type: 'RECORD', alias: 'Geo', fields: [{ name: 'country', type: 'STRING', alias: 'Country' }] },
    { name: 'internal_flag', type: 'BOOLEAN', alias: 'Internal', isHiddenForReporting: true },
  ],
  [DM.contact]: [
    { name: 'creation_date', type: 'DATE', alias: 'Creation Date' },
    { name: 'name', type: 'STRING', alias: 'Name' },
  ],
  [DM.user]: [
    { name: 'creation_date', type: 'DATE', alias: 'Creation Date' },
    { name: 'first_login_date', type: 'DATE', alias: 'First Log In to OWOX Data Marts' },
    { name: 'creation_source', type: 'STRING', alias: 'Creation Source' },
  ],
  [DM.session]: [
    { name: 'date', type: 'DATE', alias: 'Date' },
    { name: 'source', type: 'STRING', alias: 'Source' },
    { name: 'duration_sec', type: 'INTEGER', alias: 'Duration', aggregationRole: 'metric', allowedAggregations: ['SUM', 'AVG'] },
  ],
  [DM.pageview]: [
    { name: 'date_time', type: 'TIMESTAMP', alias: 'Date and Time' },
    { name: 'page_id', type: 'STRING', alias: 'Page ID' },
  ],
  [DM.page]: [
    { name: 'creation_date', type: 'DATE', alias: 'Creation Date' },
    { name: 'title', type: 'STRING', alias: 'Title' },
    { name: 'url', type: 'STRING', alias: 'URL' },
  ],
  [DM.invoice]: [
    { name: 'issued_on', type: 'DATE', alias: 'Issued On' },
    { name: 'amount', type: 'NUMERIC', alias: 'Amount', aggregationRole: 'metric' },
  ],
};

export const DATA_MARTS: DataMartSummary[] = (Object.values(DM) as MartId[]).map((id) => ({
  id,
  title: TITLES[id],
  description: `${TITLES[id]} data mart.`,
  status: 'PUBLISHED' as const,
  availableForReporting: true,
  storage: { type: id === DM.invoice ? 'SNOWFLAKE' : 'GOOGLE_BIGQUERY' },
}));

export const STORAGE = { bigquery: 'storage-bigquery', snowflake: 'storage-snowflake' } as const;

export const STORAGES: StorageSummary[] = [
  { id: STORAGE.bigquery, title: 'Marketing BigQuery', type: 'GOOGLE_BIGQUERY' },
  { id: STORAGE.snowflake, title: 'Finance Snowflake', type: 'SNOWFLAKE' },
];

/** Data mart ids per storage, as the model canvas lists them. */
export const STORAGE_MART_IDS: Record<string, string[]> = {
  [STORAGE.bigquery]: DATA_MARTS.filter((m) => m.storage.type === 'GOOGLE_BIGQUERY').map((m) => m.id),
  [STORAGE.snowflake]: [DM.invoice],
};

interface Join {
  aliasPath: string;
  martId: MartId;
  label?: string;
  description: string;
  grain: MainGrainMultiplication;
  keys: [string, string][];
}

const lastSegment = (path: string) => path.split('.').at(-1)!;
const depthOf = (path: string) => path.split('.').length;

function blendedFor(join: Join): BlendedField[] {
  return NATIVE[join.martId]
    .filter((f) => !f.isHiddenForReporting && !f.fields)
    .map((f) => ({
      name: `${join.aliasPath.replaceAll('.', '_')}__${f.name}`,
      sourceRelationshipId: `rel-${join.aliasPath}`,
      sourceDataMartId: join.martId,
      sourceDataMartTitle: TITLES[join.martId],
      targetAlias: lastSegment(join.aliasPath),
      originalFieldName: f.name,
      type: f.type,
      sourceFieldType: f.type,
      alias: f.alias ?? '',
      description: f.description ?? '',
      isHidden: false,
      isCalculated: false,
      aggregateFunction: 'ANY_VALUE',
      postJoinAggregations: f.allowedAggregations,
      transitiveDepth: depthOf(join.aliasPath),
      aliasPath: join.aliasPath,
      outputPrefix: join.label ?? TITLES[join.martId],
    }));
}

function sourceFor(join: Join): AvailableSource {
  return {
    aliasPath: join.aliasPath,
    title: TITLES[join.martId],
    description: `${TITLES[join.martId]} data mart.`,
    joinDescription: join.description,
    defaultAlias: join.label ?? TITLES[join.martId],
    depth: depthOf(join.aliasPath),
    fieldCount: blendedFor(join).length,
    isIncluded: true,
    relationshipId: `rel-${join.aliasPath}`,
    dataMartId: join.martId,
    isAccessibleForReporting: true,
    mainGrainMultiplication: join.grain,
  };
}

function schemaFor(mainId: MartId, joins: Join[], extra: BlendedField[] = []): BlendableSchema {
  return {
    nativeFields: NATIVE[mainId],
    nativeDescription: `${TITLES[mainId]} data mart.`,
    blendedFields: [...joins.flatMap(blendedFor), ...extra],
    availableSources: joins.map(sourceFor),
    hiddenFieldNames: [],
  };
}

function graphFor(mainId: MartId, joins: Join[]): RelationshipGraph {
  const ref = (id: MartId) => ({ id, title: TITLES[id] });
  return {
    rootDataMartId: mainId,
    nodes: joins.map((join) => {
      const parentAlias = join.aliasPath.includes('.') ? join.aliasPath.slice(0, join.aliasPath.lastIndexOf('.')) : '';
      const parentMart = joins.find((j) => j.aliasPath === parentAlias)?.martId ?? mainId;
      return {
        aliasPath: join.aliasPath,
        depth: depthOf(join.aliasPath),
        isCycleStub: false,
        isBlocked: false,
        relationship: {
          id: `rel-${join.aliasPath}`,
          sourceDataMart: ref(parentMart),
          targetDataMart: ref(join.martId),
          targetAlias: lastSegment(join.aliasPath),
          joinConditions: join.keys.map(([sourceFieldName, targetFieldName]) => ({ sourceFieldName, targetFieldName })),
          description: join.description,
        },
      };
    }),
  };
}

const VISITOR_JOINS: Join[] = [
  { aliasPath: 'contact', martId: DM.contact, description: 'The contact this visitor was identified as.', grain: 'none', keys: [['contact_id', 'id']] },
  { aliasPath: 'contact.user', martId: DM.user, description: 'The product user behind the contact.', grain: 'none', keys: [['user_id', 'id']] },
  { aliasPath: 'sessions', martId: DM.session, description: 'Sessions of the visitor.', grain: 'multiplies', keys: [['client_id', 'client_id']] },
  { aliasPath: 'sessions.pageviews', martId: DM.pageview, description: 'Pages viewed in the session.', grain: 'multiplies', keys: [['session_id', 'session_id'], ['client_id', 'client_id']] },
  { aliasPath: 'sessions.pageviews.page', martId: DM.page, description: 'The page that was viewed.', grain: 'multiplies', keys: [['page_id', 'id']] },
  { aliasPath: 'landing_page', martId: DM.page, label: 'Landing page', description: 'The first page the visitor landed on.', grain: 'none', keys: [['landing_page_id', 'id']] },
  // Session again: once more under its default alias (a second path) and once under an Output Alias of its own.
  { aliasPath: 'contact.sessions', martId: DM.session, description: 'Sessions of the contact on any device.', grain: 'multiplies', keys: [['contact_id', 'contact_id']] },
  { aliasPath: 'contact.first_session', martId: DM.session, label: 'Contact First Session', description: '', grain: 'none', keys: [['first_session_id', 'session_id'], ['contact_id', 'contact_id']] },
];

const SESSION_JOINS: Join[] = [
  { aliasPath: 'pageviews', martId: DM.pageview, description: 'Pages viewed in the session.', grain: 'multiplies', keys: [['session_id', 'session_id']] },
  { aliasPath: 'pageviews.page', martId: DM.page, description: 'The page that was viewed.', grain: 'multiplies', keys: [['page_id', 'id']] },
];

const [hiddenTemplate] = blendedFor(VISITOR_JOINS[0]!);
const VISITOR_EXTRA: BlendedField[] = [
  { ...hiddenTemplate!, name: 'contact__hidden_note', originalFieldName: 'hidden_note', alias: 'Hidden note', isHidden: true },
  { ...hiddenTemplate!, name: 'contact__score_formula', originalFieldName: 'score_formula', alias: 'Score', isCalculated: true, type: 'FLOAT', sourceFieldType: 'FLOAT' },
];

export const VISITOR_SCHEMA = schemaFor(DM.visitor, VISITOR_JOINS, VISITOR_EXTRA);
export const SESSION_SCHEMA = schemaFor(DM.session, SESSION_JOINS);
export const VISITOR_GRAPH = graphFor(DM.visitor, VISITOR_JOINS);

export const SCHEMAS: Record<string, BlendableSchema> = Object.fromEntries(
  (Object.values(DM) as MartId[]).map((id) => [
    id,
    id === DM.visitor ? VISITOR_SCHEMA : id === DM.session ? SESSION_SCHEMA : schemaFor(id, []),
  ]),
);

export const GRAPHS: Record<string, RelationshipGraph> = Object.fromEntries(
  (Object.values(DM) as MartId[]).map((id) => [
    id,
    id === DM.visitor ? VISITOR_GRAPH : id === DM.session ? graphFor(DM.session, SESSION_JOINS) : graphFor(id, []),
  ]),
);

const TYPES = new Map<string, string>([
  ...Object.values(SCHEMAS).flatMap((s) => s.blendedFields.map((f) => [f.name, f.type] as [string, string])),
  ...Object.values(NATIVE).flatMap((fields) => fields.map((f) => [f.name, f.type] as [string, string])),
  ['geo.country', 'STRING'],
]);

/** Deterministic rows for dev and tests; keys follow the requested column order. */
export function sampleRows(columns: string[], count: number): Row[] {
  return Array.from({ length: count }, (_, i) =>
    Object.fromEntries(
      columns.map((column) => {
        const type = TYPES.get(column) ?? 'STRING';
        const day = String((i % 28) + 1).padStart(2, '0');
        if (type === 'DATE') return [column, `2026-09-${day}`];
        if (type === 'TIMESTAMP') return [column, `2026-09-${day}T10:00:00Z`];
        if (type === 'INTEGER' || type === 'NUMERIC') return [column, (i * 7) % 100];
        if (type === 'BOOLEAN') return [column, i % 2 === 0];
        return [column, `${column}-${i + 1}`];
      }),
    ),
  );
}
