import type { MainGrainMultiplication, RelationshipGraph } from './odm-types';
import { chain, type AliasPath, type SchemaIndex } from './schema-index';

export interface JoinPathNode {
  label: string;
  dataMartId: string;
}

export interface JoinPathHop {
  /** One `source = target` line per join condition. */
  keys: string[];
  description: string;
  /** Row multiplication relative to the main data mart once this hop is joined (cumulative). */
  grain: MainGrainMultiplication;
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
        grain: i.grain,
      };
    }),
  };
}
