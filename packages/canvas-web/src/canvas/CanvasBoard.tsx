/**
 * React Flow 画布：无限画布、拖拽、缩放、框选、连线。
 * 对外暴露 upsert / remove / clear 能力，由 App 驱动。
 */
import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  SelectionMode,
  type Node,
  type Edge,
  type Connection,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CardNode, type CardNodeData } from './CardNode';
import type { CanvasNode } from '@/lib/types';

export type CardFlowNode = Node<CardNodeData, 'card'>;

/** 依据节点类型给出初始尺寸 */
function initialSize(kind: CanvasNode['kind']): { width: number; height: number } {
  switch (kind) {
    case 'image':
    case 'video':
      return { width: 320, height: 260 };
    case 'audio':
      return { width: 280, height: 150 };
    case 'file':
      return { width: 240, height: 170 };
    default:
      return { width: 320, height: 220 };
  }
}

/** 把 CanvasNode 转换成 React Flow 节点 */
export function toFlowNode(node: CanvasNode, index: number): CardFlowNode {
  const size = initialSize(node.kind);
  // 简单瀑布式排布，避免完全重叠
  const col = index % 3;
  const row = Math.floor(index / 3);
  return {
    id: node.id,
    type: 'card',
    position: { x: 80 + col * 360, y: 80 + row * 300 },
    width: size.width,
    height: size.height,
    dragHandle: '.drag-handle',
    data: {
      nodeId: node.id,
      kind: node.kind,
      title: node.title ?? '',
      content: node.content ?? '',
      assetUrl: node.assetUrl ?? '',
      mime: node.mime ?? '',
    },
  };
}

interface CanvasBoardProps {
  nodes: CardFlowNode[];
  onNodesChangeExternal: React.Dispatch<React.SetStateAction<CardFlowNode[]>>;
  onSelectionChange?: (ids: string[]) => void;
}

export function CanvasBoard({
  nodes,
  onNodesChangeExternal,
  onSelectionChange,
}: CanvasBoardProps) {
  const nodeTypes = useMemo(() => ({ card: CardNode }), []);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // 由 App 持有节点状态，这里只做位置/选中等增量变更回写
  const handleNodesChange = useCallback(
    (changes: Parameters<NonNullable<Parameters<typeof ReactFlow>[0]['onNodesChange']>>[0]) => {
      onNodesChangeExternal((cur) => applyNodeChangesSafe(changes, cur));
    },
    [onNodesChangeExternal]
  );

  const handleSelectionChange = useCallback(
    (params: OnSelectionChangeParams) => {
      onSelectionChange?.(params.nodes.map((n) => n.id));
    },
    [onSelectionChange]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={handleNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onSelectionChange={handleSelectionChange}
      selectionMode={SelectionMode.Partial}
      selectionOnDrag
      panOnDrag={[1, 2]}
      panOnScroll
      zoomOnPinch
      minZoom={0.15}
      maxZoom={3}
      fitView
      proOptions={{ hideAttribution: false }}
    >
      <Background gap={16} size={1} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable className="!bg-secondary" />
    </ReactFlow>
  );
}

/** 复用 React Flow 的变更应用逻辑（惰性导入以避免类型循环） */
import { applyNodeChanges, type NodeChange } from '@xyflow/react';
function applyNodeChangesSafe(changes: NodeChange[], cur: CardFlowNode[]): CardFlowNode[] {
  return applyNodeChanges(changes as NodeChange<CardFlowNode>[], cur);
}

export { useNodesState };
