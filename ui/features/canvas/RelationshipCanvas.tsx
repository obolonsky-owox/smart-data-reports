import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  BaseEdge, EdgeLabelRenderer, getBezierPath, Handle, MiniMap, NodeToolbar, Position, ReactFlow, ReactFlowProvider, useReactFlow,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Locate, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { buildCanvasModel, NODE_HEIGHT, NODE_WIDTH, type CanvasDirection, type CanvasEdge, type CanvasNode } from '../../lib/canvas-model';
import type { DataMartAppearance, RelationshipGraph } from '../../lib/odm-types';
import type { ReportDraft } from '../../lib/report-draft';
import { childInstances, type AliasPath, type InstanceInfo, type SchemaIndex } from '../../lib/schema-index';
import { CanvasNodeActions } from './CanvasNodeActions';
import { CanvasNodeCard } from './CanvasNodeCard';
import { CanvasSettingsPopover, type CanvasSettings } from './CanvasSettingsPopover';

// Spread into a mapped type: React Flow needs data to be assignable to Record<string, unknown>, which interfaces are not.
type InstanceNodeData = { [K in keyof CanvasNode]: CanvasNode[K] } & {
  appearance?: DataMartAppearance;
  hidden: CanvasSettings['hidden'];
  direction: CanvasDirection;
  targets: InstanceInfo[];
  onAddObject(path: AliasPath): void;
  onSetMain(dataMartId: string): void;
  onDelete(path: AliasPath): void;
};
type JoinEdgeData = Pick<CanvasEdge, 'keys'> & {
  /** Keys on the edge: always with Show join fields, otherwise while the edge is hovered. */
  showKeys: boolean;
  hovered: boolean;
};

const nodeId = (path: AliasPath) => path || '__main__';

const SOCKET_STYLE: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  background: 'var(--muted-foreground)',
  border: '2px solid var(--background)',
};

function InstanceNode({ data, selected }: NodeProps<Node<InstanceNodeData>>) {
  const vertical = data.direction === 'vertical';
  return (
    <div style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}>
      {data.kind !== 'main' && <Handle type='target' position={vertical ? Position.Top : Position.Left} isConnectable={false} style={SOCKET_STYLE} />}
      <CanvasNodeCard node={data} appearance={data.appearance} hidden={data.hidden} selected={!!selected} />
      <Handle type='source' position={vertical ? Position.Bottom : Position.Right} isConnectable={false} style={SOCKET_STYLE} />
      <NodeToolbar isVisible={selected} position={Position.Bottom}>
        {/* The toolbar is a React child of the node: without this a click (e.g. Delete) re-selects the node. */}
        <div onClick={(e) => e.stopPropagation()}>
          <CanvasNodeActions node={data} targets={data.targets} onAddObject={data.onAddObject} onSetMain={data.onSetMain} onDelete={data.onDelete} />
        </div>
      </NodeToolbar>
    </div>
  );
}

/** The join keys of one edge, one `source = target` line per condition. */
export function JoinEdgeLabel({ keys }: { keys: string[] }) {
  return (
    <div
      style={{
        background: 'var(--background)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '3px 8px',
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.5,
        color: 'var(--foreground)',
        boxShadow: '0 1px 3px 0 var(--border)',
      }}
    >
      {keys.map((k, i) => <div key={`${i}-${k}`}>{k}</div>)}
    </div>
  );
}

function JoinEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<Edge<JoinEdgeData>>) {
  // An SVG reference must be a plain fragment id.
  const markerId = `join-arrow-${useId().replace(/[^\w-]/g, '')}-${id.replace(/[^\w-]/g, '')}`;
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const color = data?.hovered ? 'var(--primary)' : 'var(--muted-foreground)';
  const keys = data?.keys ?? [];
  return (
    <>
      <defs>
        <marker id={markerId} markerWidth='9' markerHeight='9' refX='7' refY='3' orient='auto' markerUnits='strokeWidth'>
          <path d='M0,0 L7,3 L0,6 z' fill={color} />
        </marker>
      </defs>
      {/* The wide invisible interaction path React Flow adds makes the thin edge easy to hover. */}
      <BaseEdge id={id} path={path} markerEnd={`url(#${markerId})`} interactionWidth={24} style={{ stroke: color, strokeWidth: data?.hovered ? 2 : 1.5, transition: 'stroke 0.15s' }} />
      {data?.showKeys && keys.length > 0 && (
        <EdgeLabelRenderer>
          <div
            className='nodrag nopan pointer-events-none absolute z-10 w-max'
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            data-testid='joinEdgeLabel'
          >
            <JoinEdgeLabel keys={keys} />
          </div>
        </EdgeLabelRenderer>
      )}
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
  /** Icon and input source by data mart id. */
  appearance: ReadonlyMap<string, DataMartAppearance>;
  settings: CanvasSettings;
  onSettingsChange(next: CanvasSettings): void;
  onAddObject(path: AliasPath): void;
  onSetMain(dataMartId: string): void;
  onDeleteInstance(path: AliasPath): void;
}

function CanvasControls({ settings, onSettingsChange }: Pick<RelationshipCanvasProps, 'settings' | 'onSettingsChange'>) {
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
      <CanvasSettingsPopover settings={settings} onChange={onSettingsChange} />
    </div>
  );
}

/** Fits the graph again after a settings change moves the cards; data edits keep the member's viewport. */
function RefitOnLayoutChange({ layoutKey }: { layoutKey: string }) {
  const { fitView } = useReactFlow();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // React Flow measures the re-laid-out nodes first.
    const frame = requestAnimationFrame(() => void fitView({ padding: 0.2, duration: 300 }));
    return () => cancelAnimationFrame(frame);
  }, [layoutKey, fitView]);
  return null;
}

export function RelationshipCanvas(props: RelationshipCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasFlow {...props} />
    </ReactFlowProvider>
  );
}

function CanvasFlow({ index, graph, draft, theme, appearance, settings, onSettingsChange, onAddObject, onSetMain, onDeleteInstance }: RelationshipCanvasProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const { direction, showJoinFields, hidden } = settings;
  const metaRow = !hidden.source || !hidden.fields;
  const model = useMemo(
    () => buildCanvasModel(index, graph, draft, { direction, joinLabels: showJoinFields, metaRow }),
    [index, graph, draft, direction, showJoinFields, metaRow],
  );
  const onCanvas = useMemo(() => new Set(model.nodes.map((n) => n.path)), [model]);

  const nodes: Node<InstanceNodeData>[] = model.nodes.map((n) => ({
    id: nodeId(n.path),
    type: 'instance',
    position: { x: n.x, y: n.y },
    selected: selected === nodeId(n.path),
    data: {
      ...n,
      appearance: appearance.get(n.dataMartId),
      hidden,
      direction,
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
    data: { keys: e.keys, showKeys: showJoinFields || hoveredEdge === e.id, hovered: hoveredEdge === e.id },
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
        onEdgeMouseEnter={(_, edge) => setHoveredEdge(edge.id)}
        onEdgeMouseLeave={() => setHoveredEdge(null)}
        className='[--xy-background-color:transparent]'
      >
        <MiniMap pannable zoomable style={{ width: 140, height: 100 }} nodeColor='var(--muted-foreground)' />
        <CanvasControls settings={settings} onSettingsChange={onSettingsChange} />
        <RefitOnLayoutChange layoutKey={`${direction}/${showJoinFields}/${metaRow}`} />
      </ReactFlow>
    </div>
  );
}
