import type { RelationshipGraph } from './odm-types';
import { chain, chainLabel, type AliasPath, type SchemaIndex } from './schema-index';

export interface JoinPathNode {
  label: string;
  dataMartId: string;
}

export interface JoinPathHop {
  /** One `source = target` line per join condition. */
  keys: string[];
  description: string;
}

/** `hops[i]` joins `nodes[i]` to `nodes[i + 1]`. */
export interface JoinPath {
  nodes: JoinPathNode[];
  hops: JoinPathHop[];
}

/** The data marts from the main one to `aliasPath`, main first, with the join of each hop. */
export function joinPath(index: SchemaIndex, graph: RelationshipGraph, aliasPath: AliasPath): JoinPath {
  const main = index.instances.get('')!;
  const steps = chain(index, aliasPath);
  const relationships = new Map(graph.nodes.map((n) => [n.aliasPath, n.relationship]));
  return {
    nodes: [main, ...steps].map((i) => ({ label: i.label, dataMartId: i.dataMartId })),
    hops: steps.map((i) => {
      const relationship = relationships.get(i.aliasPath);
      return {
        keys: relationship?.joinConditions.map((c) => `${c.sourceFieldName} = ${c.targetFieldName}`) ?? [],
        description: i.joinDescription || relationship?.description || '',
      };
    }),
  };
}

/**
 * `via A › B` for each path. Paths whose chains read the same get the keys of the first join that differs among
 * them, or their alias path when that still does not tell them apart.
 */
export function variantLabels(index: SchemaIndex, graph: RelationshipGraph, paths: AliasPath[]): string[] {
  const labels = paths.map((p) => `via ${chainLabel(index, p)}`);
  const collides = (label: string, list: string[]) => list.filter((l) => l === label).length > 1;
  const keys = paths.map((p) => joinPath(index, graph, p).hops.map((h) => h.keys.join(', ')));
  const withKeys = labels.map((label, i) => {
    if (!collides(label, labels)) return label;
    const twins = labels.flatMap((l, j) => (l === label ? [j] : []));
    const hop = keys[i]!.findIndex((_, h) => twins.some((j) => keys[j]![h] !== keys[i]![h]));
    const hopKeys = hop === -1 ? '' : keys[i]![hop];
    return hopKeys ? `${label} · ${hopKeys}` : label;
  });
  return withKeys.map((label, i) => (collides(label, withKeys) ? `${labels[i]} · ${paths[i]}` : label));
}
