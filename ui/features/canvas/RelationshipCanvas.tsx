import { useMemo, useState } from 'react';
import {
  Background, BaseEdge, Controls, EdgeLabelRenderer, getBezierPath, Handle, NodeToolbar, Position, ReactFlow,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { House } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { buildCanvasModel, NODE_HEIGHT, NODE_WIDTH, type CanvasEdge, type CanvasNode } from '../../lib/canvas-model';
import type { RelationshipGraph } from '../../lib/odm-types';
import type { ReportDraft } from '../../lib/report-draft';
import { childInstances, type AliasPath, type InstanceInfo, type SchemaIndex } from '../../lib/schema-index';
import { CanvasNodeActions } from './CanvasNodeActions';

// Spread into a mapped type: React Flow needs data to be assignable to Record<string, unknown>, which interfaces are not.
type InstanceNodeData = { [K in keyof CanvasNode]: CanvasNode[K] } & {
  targets: InstanceInfo[];
  onAddObject(path: AliasPath): void;
  onSetMain(dataMartId: string): void;
  onDelete(path: AliasPath): void;
};
type JoinEdgeData = Pick<CanvasEdge, 'keys' | 'grain'>;

const nodeId = (path: AliasPath) => path || '__main__';

function InstanceNode({ data, selected }: NodeProps<Node<InstanceNodeData>>) {
  return (
    <>
      <Handle type='target' position={Position.Left} isConnectable={false} className='opacity-0' />
      <div
        className={cn(
          'flex items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-card-foreground shadow-sm',
          data.kind === 'transit' && 'border-dashed text-muted-foreground',
          selected && 'border-primary ring-2 ring-ring/50',
        )}
        style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      >
        {data.kind === 'main' && <House className='h-4 w-4 shrink-0 text-primary' />}
        <span className='truncate font-medium'>{data.label}</span>
      </div>
      <Handle type='source' position={Position.Right} isConnectable={false} className='opacity-0' />
      <NodeToolbar isVisible={selected} position={Position.Bottom}>
        <CanvasNodeActions node={data} targets={data.targets} onAddObject={data.onAddObject} onSetMain={data.onSetMain} onDelete={data.onDelete} />
      </NodeToolbar>
    </>
  );
}

function JoinEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<Edge<JoinEdgeData>>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <BaseEdge id={id} path={path} />
      <EdgeLabelRenderer>
        {/* The label sits in a gap of the line: the background hides the stroke behind it. */}
        <div
          className='nodrag nopan absolute flex flex-col items-center rounded-sm bg-background px-1 font-mono text-[10px] leading-tight text-muted-foreground'
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {data?.keys.map((k) => <span key={k}>{k}</span>)}
          {data?.grain === 'multiplies' && <span className='text-warning'>×N</span>}
          {data?.grain === 'unknown' && <span>?</span>}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const NODE_TYPES = { instance: InstanceNode };
const EDGE_TYPES = { join: JoinEdge };

interface RelationshipCanvasProps {
  index: SchemaIndex;
  graph: RelationshipGraph;
  draft: ReportDraft;
  theme: 'light' | 'dark';
  onAddObject(path: AliasPath): void;
  onSetMain(dataMartId: string): void;
  onDeleteInstance(path: AliasPath): void;
}

export function RelationshipCanvas({ index, graph, draft, theme, onAddObject, onSetMain, onDeleteInstance }: RelationshipCanvasProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const model = useMemo(() => buildCanvasModel(index, graph, draft), [index, graph, draft]);
  const onCanvas = useMemo(() => new Set(model.nodes.map((n) => n.path)), [model]);

  const nodes: Node<InstanceNodeData>[] = model.nodes.map((n) => ({
    id: nodeId(n.path),
    type: 'instance',
    position: { x: n.x, y: n.y },
    selected: selected === nodeId(n.path),
    data: {
      ...n,
      targets: childInstances(index, n.path).filter((t) => !onCanvas.has(t.aliasPath)),
      onAddObject,
      onSetMain,
      onDelete: (path) => {
        setSelected(null);
        onDeleteInstance(path);
      },
    },
  }));
  const edges: Edge<JoinEdgeData>[] = model.edges.map((e) => ({
    id: e.id,
    type: 'join',
    source: nodeId(e.source),
    target: nodeId(e.target),
    data: { keys: e.keys, grain: e.grain },
  }));

  return (
    <div className='dm-card h-[520px] p-0' data-testid='relationshipCanvas'>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        colorMode={theme}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_, node) => setSelected(node.id)}
        onPaneClick={() => setSelected(null)}
        className='[--xy-background-color:transparent] [--xy-edge-stroke:var(--primary)]'
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
