// Mirrors of the ODM API shapes this plugin reads and writes. Sources in OWOX/owox-data-marts:
// packages/api-client/src/data-marts.ts and apps/backend/src/data-marts/dto/**.

export type AggregateFunction =
  | 'STRING_AGG' | 'MAX' | 'MIN' | 'SUM' | 'AVG' | 'COUNT' | 'COUNT_DISTINCT' | 'ANY_VALUE'
  | 'P25' | 'P50' | 'P75' | 'P95';

export type RelativeDatePreset =
  | { kind: 'today' }
  | { kind: 'yesterday' }
  | { kind: 'this_week' }
  | { kind: 'last_week' }
  | { kind: 'this_month' }
  | { kind: 'last_month' }
  | { kind: 'this_quarter' }
  | { kind: 'last_quarter' }
  | { kind: 'this_year' }
  | { kind: 'last_n_days'; n: number }
  | { kind: 'last_n_months'; n: number }
  | { kind: 'next_n_days'; n: number };

export type FilterPlacement = 'pre-join' | 'post-join';
export type ScalarOperator =
  | 'eq' | 'neq' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'gt' | 'lt' | 'gte' | 'lte';
export type ValuelessOperator = 'is_blank' | 'is_not_blank' | 'is_true' | 'is_false';

export type FilterRule = { column: string; placement?: FilterPlacement } & (
  | { operator: ScalarOperator; value: string | number | boolean }
  | { operator: ValuelessOperator }
  | { operator: 'in' | 'not_in'; value: string[] | number[] }
  | { operator: 'between'; value: { from: string; to: string } | { from: number; to: number } }
  | { operator: 'relative_date'; value: RelativeDatePreset }
);

export interface SortRule { column: string; direction: 'asc' | 'desc' }
export interface AggregationRule { column: string; function: AggregateFunction }
export type DateTruncUnit = 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';
export interface DateTruncRule { column: string; unit: DateTruncUnit }

export interface NativeField {
  name: string;
  type: string;
  alias?: string;
  description?: string;
  isPrimaryKey?: boolean;
  isHiddenForReporting?: boolean;
  aggregationRole?: 'dimension' | 'metric';
  allowedAggregations?: AggregateFunction[];
  fields?: NativeField[];
}

export interface BlendedField {
  name: string;
  sourceRelationshipId: string;
  sourceDataMartId: string;
  sourceDataMartTitle: string;
  targetAlias: string;
  originalFieldName: string;
  type: string;
  sourceFieldType: string;
  alias: string;
  description: string;
  isHidden: boolean;
  isCalculated: boolean;
  aggregateFunction: AggregateFunction;
  postJoinAggregations?: AggregateFunction[];
  transitiveDepth: number;
  aliasPath: string;
  outputPrefix: string;
}

export type MainGrainMultiplication = 'none' | 'multiplies' | 'unknown';

export interface AvailableSource {
  aliasPath: string;
  title: string;
  description?: string;
  joinDescription?: string;
  defaultAlias: string;
  depth: number;
  fieldCount: number;
  isIncluded: boolean;
  relationshipId: string;
  dataMartId: string;
  isAccessibleForReporting: boolean;
  /** Absent must be read as 'unknown', never 'none'. */
  mainGrainMultiplication?: MainGrainMultiplication;
}

export interface BlendableSchema {
  nativeFields: NativeField[];
  nativeDescription?: string;
  blendedFields: BlendedField[];
  availableSources: AvailableSource[];
  hiddenFieldNames: string[];
}

export interface JoinCondition { sourceFieldName: string; targetFieldName: string }
export interface DataMartRef { id: string; title: string }

export interface Relationship {
  id: string;
  sourceDataMart: DataMartRef;
  targetDataMart: DataMartRef;
  targetAlias: string;
  joinConditions: JoinCondition[];
  description?: string;
}

export interface RelationshipGraphNode {
  relationship: Relationship;
  aliasPath: string;
  depth: number;
  isCycleStub: boolean;
  isBlocked: boolean;
}

export interface RelationshipGraph { rootDataMartId: string; nodes: RelationshipGraphNode[] }

export interface DataMartSummary {
  id: string;
  title: string;
  description: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  availableForReporting: boolean;
  /** The data mart list names the storage but carries no storage id. */
  storage: { type: string; title: string };
}

/** A data storage of the project; relationships never cross storages. */
export interface StorageSummary {
  id: string;
  title: string;
  type: string;
}

export type Row = Record<string, unknown>;
/** Keys are `<column> | <FUNCTION>`, e.g. `visits | SUM`. */
export type Totals = Record<string, number | string | boolean | null>;

export type ReportRunStatus = 'SUCCESS' | 'ERROR' | 'RUNNING' | 'CANCELLED' | 'RESTRICTED';
export interface ReportSummary {
  id: string;
  title: string;
  lastRunAt?: string;
  lastRunStatus?: ReportRunStatus;
  lastRunError?: string;
}
export interface SheetsDestination { id: string; title: string }
export interface SpreadsheetRef { spreadsheetId: string; sheetId: number }
