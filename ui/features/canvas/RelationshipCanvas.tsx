import { useId, useMemo, useState, type CSSProperties } from 'react';
import {
  BaseEdge, EdgeLabelRenderer, getBezierPath, Handle, MiniMap, NodeToolbar, Position, ReactFlow, ReactFlowProvider, useReactFlow,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Locate, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { buildCanvasModel, NODE_HEIGHT, NODE_WIDTH, type CanvasEdge, type CanvasNode } from '../../lib/canvas-model';
import type { RelationshipGraph } from '../../lib/odm-types';
import type { ReportDraft } from '../../lib/report-draft';
import { childInstances, type AliasPath, type InstanceInfo, type SchemaIndex } from '../../lib/schema-index';
import { CanvasNodeActions } from './CanvasNodeActions';
import { CanvasNodeCard } from './CanvasNodeCard';

// Spread into a mapped type: React Flow needs data to be assignable to Record<string, unknown>, which interfaces are not.
type InstanceNodeData = { [K in keyof CanvasNode]: CanvasNode[K] } & {
  targets: InstanceInfo[];
  onAddObject(path: AliasPath): void;
  onSetMain(dataMartId: string): void;
  onDelete(path: AliasPath): void;
};
/** `multiplies` is true on the hop where rows start to multiply (grain is cumulative along a path). */
type JoinEdgeData = Pick<CanvasEdge, 'keys' | 'grain'> & { multiplies: boolean };

const nodeId = (path: AliasPath) => path || '__main__';

const SOCKET_STYLE: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  background: 'var(--muted-foreground)',
  border: '2px solid var(--background)',
};

function InstanceNode({ data, selected }: NodeProps<Node<InstanceNodeData>>) {
  return (
    <div style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}>
      {data.kind !== 'main' && <Handle type='target' position={Position.Left} isConnectable={false} style={SOCKET_STYLE} />}
      <CanvasNodeCard node={data} selected={!!selected} />
      <Handle type='source' position={Position.Right} isConnectable={false} style={SOCKET_STYLE} />
      <NodeToolbar isVisible={selected} position={Position.Bottom}>
        {/* The toolbar is a React child of the node: without this a click (e.g. Delete) re-selects the node. */}
        <div onClick={(e) => e.stopPropagation()}>
          <CanvasNodeActions node={data} targets={data.targets} onAddObject={data.onAddObject} onSetMain={data.onSetMain} onDelete={data.onDelete} />
        </div>
      </NodeToolbar>
    </div>
  );
}

function JoinEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: EdgeProps<Edge<JoinEdgeData>>) {
  // An SVG reference must be a plain fragment id.
  const markerId = `join-arrow-${useId().replace(/[^\w-]/g, '')}-${id.replace(/[^\w-]/g, '')}`;
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const multiplies = !!data?.multiplies;
  const stroke = multiplies ? 'var(--warning)' : selected ? 'var(--primary)' : 'var(--muted-foreground)';
  return (
    <>
      <defs>
        <marker id={markerId} markerWidth='9' markerHeight='9' refX='7' refY='3' orient='auto' markerUnits='strokeWidth'>
          <path d='M0,0 L7,3 L0,6 z' fill={stroke} />
        </marker>
      </defs>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={`url(#${markerId})`}
        style={{ stroke, strokeWidth: selected ? 2.5 : 1.5, strokeDasharray: multiplies ? '8 4' : undefined }}
      />
      <EdgeLabelRenderer>
        <div
          className='nodrag nopan pointer-events-none absolute w-max'
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            background: 'var(--background)',
            border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 8,
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1.5,
            color: 'var(--foreground)',
            boxShadow: '0 1px 3px 0 var(--border)',
          }}
        >
          {data?.keys.map((k, i) => <div key={`${i}-${k}`}>{k}</div>)}
          {multiplies && <div style={{ color: 'var(--warning)' }}>×N</div>}
          {data?.grain === 'unknown' && <div className='text-muted-foreground'>?</div>}
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

function CanvasControls() {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  return (
    <div className='absolute top-3 right-3 z-10 flex flex-col gap-1.5'>
      <Button type='button' variant='outline' size='icon' className='h-12 w-12' aria-label='Fit to view' onClick={() => void fitView({ padding: 0.2, duration: 300 })}>
        <Locate className='h-6 w-6' />
      </Button>
      <Button type='button' variant='outline' size='icon' className='h-12 w-12' aria-label='Zoom in' onClick={() => void zoomIn({ duration: 150 })}>
        <ZoomIn className='h-6 w-6' />
      </Button>
      <Button type='button' variant='outline' size='icon' className='h-12 w-12' aria-label='Zoom out' onClick={() => void zoomOut({ duration: 150 })}>
        <ZoomOut className='h-6 w-6' />
      </Button>
    </div>
  );
}

export function RelationshipCanvas(props: RelationshipCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasFlow {...props} />
    </ReactFlowProvider>
  );
}

function CanvasFlow({ index, graph, draft, theme, onAddObject, onSetMain, onDeleteInstance }: RelationshipCanvasProps) {
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
    data: {
      keys: e.keys,
      grain: e.grain,
      multiplies: e.grain === 'multiplies' && (!e.source || index.instances.get(e.source)?.grain !== 'multiplies'),
    },
  }));

  return (
    <div className='relative h-[520px] overflow-hidden rounded-lg border' data-testid='relationshipCanvas'>
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
        className='[--xy-background-color:transparent]'
      >
        <MiniMap pannable zoomable style={{ width: 140, height: 100 }} nodeColor='var(--muted-foreground)' />
        <CanvasControls />
      </ReactFlow>
    </div>
  );
}
