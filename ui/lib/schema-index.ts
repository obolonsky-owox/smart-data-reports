import type { AggregateFunction, BlendableSchema, NativeField } from './odm-types';

/** '' is the main data mart; otherwise ODM's dotted relationship-alias path, e.g. 'sessions.pageviews'. */
export type AliasPath = string;
export type FieldKind = 'text' | 'number' | 'date' | 'boolean' | 'other';

export interface FieldInfo {
  /** The name ODM expects in read plans: native name or unified blended name. */
  name: string;
  label: string;
  description: string;
  /** The field's own type, as its data mart's Output Schema shows it. */
  type: string;
  kind: FieldKind;
  /**
   * Joined fields only, when it differs from `type`: the type of the value after the join. ODM first folds a
   * joined field per join key with its deduplication function, e.g. STRING_AGG turns a BOOLEAN into a STRING,
   * so filters after the join and the report's values see this type; a slice still sees `type`.
   */
  joinedType?: string;
  aliasPath: AliasPath;
  /** The field's name inside its own data mart; stable across paths. */
  originalName: string;
  aggregationRole?: 'dimension' | 'metric';
  allowedAggregations?: AggregateFunction[];
}

/** One way a data mart takes part in the report. The same mart can have several instances. */
export interface InstanceInfo {
  aliasPath: AliasPath;
  dataMartId: string;
  title: string;
  label: string;
  description: string;
  joinDescription: string;
  depth: number;
  fields: FieldInfo[];
}

/**
 * Instances that share an Output Alias (`InstanceInfo.label`) on one data mart: the same data shown under one
 * name, reached through different join paths. The main data mart is always a group of its own.
 */
export interface MartGroup {
  /** Unique within the index. */
  key: string;
  label: string;
  dataMartId: string;
  /** The data mart's title; differs from `label` when the relationship has an Output Alias. */
  title: string;
  description: string;
  /** The join paths, shallowest first. */
  instances: InstanceInfo[];
}

export interface SchemaIndex {
  mainDataMartId: string;
  instances: ReadonlyMap<AliasPath, InstanceInfo>;
  groups: MartGroup[];
  fields: ReadonlyMap<string, FieldInfo>;
}

const RECORD_TYPE = /^(RECORD|STRUCT)$/i;

export function fieldKind(type: string): FieldKind {
  const t = type.toUpperCase();
  if (/^(DATE|DATETIME|TIMESTAMP)/.test(t)) return 'date';
  if (/^(BOOL|BOOLEAN)$/.test(t)) return 'boolean';
  if (/^(INT|INTEGER|INT32|INT64|INT128|BIGINT|SMALLINT|TINYINT|BYTEINT|BYTE|SHORT|LONG|FLOAT|FLOAT32|FLOAT64|DOUBLE|REAL|NUMERIC|BIGNUMERIC|DECIMAL|NUMBER)\b/.test(t)) return 'number';
  if (/^(STRING|VARCHAR|CHAR|CHARACTER|TEXT)\b/.test(t)) return 'text';
  return 'other';
}

export function parentPath(path: AliasPath): AliasPath {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(0, dot);
}

export function isSameOrDescendant(path: AliasPath, ancestor: AliasPath): boolean {
  return ancestor === '' || path === ancestor || path.startsWith(`${ancestor}.`);
}

function flattenNative(fields: NativeField[], prefix = '', labelPrefix = ''): FieldInfo[] {
  return fields.flatMap((f) => {
    if (f.isHiddenForReporting) return [];
    const name = prefix ? `${prefix}.${f.name}` : f.name;
    const ownLabel = f.alias || f.name;
    const label = labelPrefix ? `${labelPrefix} › ${ownLabel}` : ownLabel;
    if (f.fields?.length && RECORD_TYPE.test(f.type)) return flattenNative(f.fields, name, label);
    return [{
      name,
      label,
      description: f.description ?? '',
      type: f.type,
      kind: fieldKind(f.type),
      aliasPath: '',
      originalName: name,
      aggregationRole: f.aggregationRole,
      allowedAggregations: f.allowedAggregations,
    }];
  });
}

export function buildSchemaIndex(main: { id: string; title: string }, schema: BlendableSchema): SchemaIndex {
  const instances = new Map<AliasPath, InstanceInfo>();
  instances.set('', {
    aliasPath: '',
    dataMartId: main.id,
    title: main.title,
    label: main.title,
    description: schema.nativeDescription ?? '',
    joinDescription: '',
    depth: 0,
    fields: flattenNative(schema.nativeFields),
  });

  const blocked: AliasPath[] = [];
  for (const source of [...schema.availableSources].sort((a, b) => a.depth - b.depth)) {
    const unusable =
      !source.isIncluded ||
      !source.isAccessibleForReporting ||
      blocked.some((p) => isSameOrDescendant(source.aliasPath, p)) ||
      !instances.has(parentPath(source.aliasPath));
    if (unusable) {
      blocked.push(source.aliasPath);
      continue;
    }
    instances.set(source.aliasPath, {
      aliasPath: source.aliasPath,
      dataMartId: source.dataMartId,
      title: source.title,
      label: source.defaultAlias || source.title,
      description: source.description ?? '',
      joinDescription: source.joinDescription ?? '',
      depth: source.depth,
      fields: [],
    });
  }

  for (const f of schema.blendedFields) {
    const instance = instances.get(f.aliasPath);
    if (!instance || instance.aliasPath === '' || f.isHidden || f.isCalculated) continue;
    // `type` is the type after deduplication; `sourceFieldType` is the field's own, absent on older hosts.
    const ownType = f.sourceFieldType || f.type;
    instance.fields.push({
      name: f.name,
      label: f.alias || f.originalFieldName,
      description: f.description,
      type: ownType,
      kind: fieldKind(ownType),
      ...(f.type && f.type !== ownType ? { joinedType: f.type } : {}),
      aliasPath: f.aliasPath,
      originalName: f.originalFieldName,
      allowedAggregations: f.postJoinAggregations,
    });
  }

  const byAlias = new Map<string, MartGroup>();
  for (const instance of instances.values()) {
    const key = instance.aliasPath === '' ? '' : `${instance.label}\u0000${instance.dataMartId}`;
    let group = byAlias.get(key);
    if (!group) {
      group = {
        key,
        label: instance.label,
        dataMartId: instance.dataMartId,
        title: instance.title,
        description: instance.description,
        instances: [],
      };
      byAlias.set(key, group);
    }
    group.instances.push(instance);
  }
  const groups = [...byAlias.values()];
  for (const group of groups) {
    group.instances.sort((a, b) => a.depth - b.depth || a.aliasPath.localeCompare(b.aliasPath));
  }
  groups.sort((a, b) =>
    a.key === '' ? -1 : b.key === '' ? 1 : a.label.localeCompare(b.label) || a.title.localeCompare(b.title),
  );

  const fields = new Map<string, FieldInfo>();
  for (const instance of instances.values()) for (const f of instance.fields) fields.set(f.name, f);

  return { mainDataMartId: main.id, instances, groups, fields };
}

/** Instances on the way from the main mart to `path`, excluding the main mart. */
export function chain(index: SchemaIndex, path: AliasPath): InstanceInfo[] {
  if (!path) return [];
  const segments = path.split('.');
  return segments
    .map((_, i) => index.instances.get(segments.slice(0, i + 1).join('.')))
    .filter((i): i is InstanceInfo => i !== undefined);
}

export function chainLabel(index: SchemaIndex, path: AliasPath): string {
  return chain(index, path).map((i) => i.label).join(' › ');
}

export function childInstances(index: SchemaIndex, path: AliasPath): InstanceInfo[] {
  return [...index.instances.values()].filter((i) => i.aliasPath !== '' && parentPath(i.aliasPath) === path);
}

export function instancesOf(index: SchemaIndex, dataMartId: string): InstanceInfo[] {
  return [...index.instances.values()]
    .filter((i) => i.dataMartId === dataMartId)
    .sort((a, b) => a.depth - b.depth || a.aliasPath.localeCompare(b.aliasPath));
}

export function dateFields(instance: InstanceInfo): FieldInfo[] {
  return instance.fields.filter((f) => f.kind === 'date');
}
