import dagre from '@dagrejs/dagre';
import type { RelationshipGraph } from './odm-types';
import { usedInstances, type ReportDraft } from './report-draft';
import { isSameOrDescendant, parentPath, type AliasPath, type SchemaIndex } from './schema-index';

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 52;
/** The card's meta row under the title: input source and field count. */
export const NODE_META_HEIGHT = 24;

export type CanvasDirection = 'horizontal' | 'vertical';

export interface CanvasLayoutOptions {
  direction: CanvasDirection;
  /** Reserve room for the join-key labels; off when they only show on hover. */
  joinLabels: boolean;
  /** The cards carry the meta row. */
  metaRow: boolean;
}

const DEFAULT_LAYOUT: CanvasLayoutOptions = { direction: 'horizontal', joinLabels: true, metaRow: false };

export interface CanvasNode {
  path: AliasPath;
  label: string;
  dataMartId: string;
  /** The data mart's description. */
  description: string;
  /** What the join into this instance means; empty for the main mart. */
  joinDescription: string;
  kind: 'main' | 'used' | 'transit';
  /** Fields of the instance available for reports. */
  fieldCount: number;
  /** Of those, the ones that are report columns. */
  usedFieldCount: number;
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

export function buildCanvasModel(
  index: SchemaIndex,
  graph: RelationshipGraph,
  draft: ReportDraft,
  options: Partial<CanvasLayoutOptions> = {},
): CanvasModel {
  const { direction, joinLabels, metaRow } = { ...DEFAULT_LAYOUT, ...options };
  const height = NODE_HEIGHT + (metaRow ? NODE_META_HEIGHT : 0);
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
  layout.setGraph(direction === 'vertical' ? { rankdir: 'TB', nodesep: 40, ranksep: 90 } : { rankdir: 'LR', nodesep: 40, ranksep: 140 });
  layout.setDefaultEdgeLabel(() => ({}));
  for (const path of paths) layout.setNode(key(path), { width: NODE_WIDTH, height });
  // dagre reserves room for the join-key label on each edge, so shown labels do not overlap the nodes.
  for (const path of paths) {
    if (path) layout.setEdge(key(parentPath(path)), key(path), joinLabels ? labelSize(keysByPath.get(path) ?? []) : {});
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
      fieldCount: instance.fields.length,
      usedFieldCount: draft.columns.filter((c) => c.aliasPath === path).length,
      x: position.x - NODE_WIDTH / 2,
      y: position.y - height / 2,
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
