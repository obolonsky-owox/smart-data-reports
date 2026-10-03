import dagre from '@dagrejs/dagre';
import type { RelationshipGraph } from './odm-types';
import { usedInstances, type ReportDraft } from './report-draft';
import { isSameOrDescendant, parentPath, type AliasPath, type SchemaIndex } from './schema-index';

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 52;

export interface CanvasNode {
  path: AliasPath;
  label: string;
  dataMartId: string;
  /** The data mart's description. */
  description: string;
  /** What the join into this instance means; empty for the main mart. */
  joinDescription: string;
  kind: 'main' | 'used' | 'transit';
  /** Top-left corner, ready for React Flow. */
  x: number;
  y: number;
}

export interface CanvasEdge {
  id: string;
  source: AliasPath;
  target: AliasPath;
  keys: string[];
}

export interface CanvasModel { nodes: CanvasNode[]; edges: CanvasEdge[] }

/** Size of the join-key label box, measured the way ODM does. */
function labelSize(lines: string[]) {
  if (lines.length === 0) return {};
  const maxChars = Math.max(...lines.map((l) => l.length));
  return { width: maxChars * 6.6 + 18, height: lines.length * 16.5 + 8, labelpos: 'c' };
}

const MAIN_KEY = '__main__';
const key = (path: AliasPath) => path || MAIN_KEY;

export function buildCanvasModel(index: SchemaIndex, graph: RelationshipGraph, draft: ReportDraft): CanvasModel {
  const used = usedInstances(draft).filter((p) => index.instances.has(p));
  const own = new Set([
    ...draft.columns.map((c) => c.aliasPath),
    ...draft.dateRanges.map((r) => r.aliasPath),
    ...draft.filters.map((f) => f.aliasPath),
  ]);
  // An included path nothing else hangs below was added on purpose (Add object), so it counts as used.
  const leaves = draft.includedPaths.filter(
    (p) => !draft.includedPaths.some((other) => other !== p && isSameOrDescendant(other, p)),
  );

  const paths = new Set<AliasPath>(['']);
  for (const path of used) {
    for (let current = path; current; current = parentPath(current)) paths.add(current);
  }

  const keysByPath = new Map(
    graph.nodes.map((n) => [n.aliasPath, n.relationship.joinConditions.map((j) => `${j.sourceFieldName} = ${j.targetFieldName}`)]),
  );

  const layout = new dagre.graphlib.Graph();
  layout.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 140 });
  layout.setDefaultEdgeLabel(() => ({}));
  for (const path of paths) layout.setNode(key(path), { width: NODE_WIDTH, height: NODE_HEIGHT });
  // dagre reserves room for the join-key label on each edge, so labels do not overlap the nodes.
  for (const path of paths) {
    if (path) layout.setEdge(key(parentPath(path)), key(path), labelSize(keysByPath.get(path) ?? []));
  }
  dagre.layout(layout);

  const nodes: CanvasNode[] = [...paths].map((path) => {
    const instance = index.instances.get(path)!;
    const position = layout.node(key(path));
    return {
      path,
      label: instance.label,
      dataMartId: instance.dataMartId,
      description: instance.description,
      joinDescription: instance.joinDescription,
      kind: path === '' ? 'main' : own.has(path) || leaves.includes(path) ? 'used' : 'transit',
      x: position.x - NODE_WIDTH / 2,
      y: position.y - NODE_HEIGHT / 2,
    };
  });

  const edges: CanvasEdge[] = [...paths]
    .filter((path) => path !== '')
    .map((path) => ({
      id: `${key(parentPath(path))}->${path}`,
      source: parentPath(path),
      target: path,
      keys: keysByPath.get(path) ?? [],
    }));

  return { nodes, edges };
}
