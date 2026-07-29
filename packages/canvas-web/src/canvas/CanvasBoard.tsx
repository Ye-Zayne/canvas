/**
 * React Flow 画布：无限画布、拖拽、缩放、框选、连线。
 * 布局与视口由 App 持有并持久化，本组件只负责渲染与事件透出。
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  useReactFlow,
  SelectionMode,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type OnSelectionChangeParams,
  type Viewport as FlowViewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CardNode, type CardNodeData } from './CardNode';
import type { CanvasNode, Viewport } from '@/lib/types';

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

/** 新增节点的自动落位：简单瀑布式，避免完全重叠 */
export function autoPosition(index: number): { x: number; y: number } {
  const col = index % 3;
  const row = Math.floor(index / 3);
  return { x: 80 + col * 360, y: 80 + row * 300 };
}

/**
 * 把 CanvasNode 转换成 React Flow 节点。
 * 关键：已持久化的 layout 优先，绝不重算，否则会冲掉用户调整过的位置。
 */
export function toFlowNode(node: CanvasNode, fallbackIndex: number): CardFlowNode {
  const size = node.layout?.size ?? initialSize(node.kind);
  const position = node.layout?.position ?? autoPosition(fallbackIndex);
  return {
    id: node.id,
    type: 'card',
    position,
    width: size.width,
    height: size.height,
    dragHandle: '.drag-handle',
    data: {
      nodeId: node.id,
      kind: node.kind,
      title: node.title ?? '',
      content: node.content ?? '',
      assetUrl: node.assetUrl ?? '',
      sourcePath: node.sourcePath ?? '',
      mime: node.mime ?? '',
      missing: Boolean(node.missing),
    },
  };
}

interface CanvasBoardProps {
  nodes: CardFlowNode[];
  edges: Edge[];
  onNodesChangeExternal: React.Dispatch<React.SetStateAction<CardFlowNode[]>>;
  onEdgesChangeExternal: React.Dispatch<React.SetStateAction<Edge[]>>;
  onSelectionChange?: (ids: string[]) => void;
  /** 节点位置/尺寸发生变化（拖动结束、缩放结束） */
  onLayoutCommit?: () => void;
  /** 视口变化 */
  onViewportChange?: (v: Viewport) => void;
  /** 初始视口（从持久化恢复） */
  defaultViewport?: Viewport;
}

export function CanvasBoard({
  nodes,
  edges,
  onNodesChangeExternal,
  onEdgesChangeExternal,
  onSelectionChange,
  onLayoutCommit,
  onViewportChange,
  defaultViewport,
}: CanvasBoardProps) {
  const nodeTypes = useMemo(() => ({ card: CardNode }), []);
  const { setViewport } = useReactFlow();
  const viewportApplied = useRef(false);

  // 视口是异步到达的（快照下发），defaultViewport 只在首帧生效，
  // 因此必须在拿到持久化视口后命令式恢复一次。
  useEffect(() => {
    if (!defaultViewport || viewportApplied.current) return;
    viewportApplied.current = true;
    void setViewport(defaultViewport);
  }, [defaultViewport, setViewport]);

  const onConnect = useCallback(
    (params: Connection) => {
      onEdgesChangeExternal((eds) => addEdge(params, eds));
    },
    [onEdgesChangeExternal]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChangeExternal((cur) => applyNodeChanges(changes as NodeChange<CardFlowNode>[], cur));
      // 尺寸调整结束时落盘（拖动结束走 onNodeDragStop）
      const resized = changes.some((c) => c.type === 'dimensions' && c.resizing === false);
      if (resized) onLayoutCommit?.();
    },
    [onNodesChangeExternal, onLayoutCommit]
  );

  /** 拖动结束：React Flow 的权威事件，比依赖 change.dragging 可靠 */
  const handleNodeDragStop = useCallback(() => {
    onLayoutCommit?.();
  }, [onLayoutCommit]);

  /** 框选拖动多个节点结束 */
  const handleSelectionDragStop = useCallback(() => {
    onLayoutCommit?.();
  }, [onLayoutCommit]);

  const handleSelectionChange = useCallback(
    (params: OnSelectionChangeParams) => {
      onSelectionChange?.(params.nodes.map((n) => n.id));
    },
    [onSelectionChange]
  );

  const handleMoveEnd = useCallback(
    (_e: unknown, v: FlowViewport) => {
      onViewportChange?.({ x: v.x, y: v.y, zoom: v.zoom });
    },
    [onViewportChange]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={handleNodesChange}
      onNodeDragStop={handleNodeDragStop}
      onSelectionDragStop={handleSelectionDragStop}
      onConnect={onConnect}
      onSelectionChange={handleSelectionChange}
      onMoveEnd={handleMoveEnd}
      selectionMode={SelectionMode.Partial}
      selectionOnDrag
      panOnDrag={[1, 2]}
      panOnScroll
      zoomOnPinch
      minZoom={0.15}
      maxZoom={3}
      fitView={!defaultViewport}
      proOptions={{ hideAttribution: false }}
    >
      <Background gap={16} size={1} />
      <Controls showInteractive={false} />
      {/* MiniMap 会覆盖右下角卡片区域，缩小并降低层级避免挡住卡片交互 */}
      <MiniMap pannable zoomable className="!bg-secondary" style={{ width: 130, height: 90 }} />
    </ReactFlow>
  );
}
