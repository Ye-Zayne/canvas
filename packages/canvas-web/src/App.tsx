import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlowProvider, type Edge } from '@xyflow/react';
import { toast, Toaster } from 'sonner';
import { Send, Plus } from 'lucide-react';
import { CanvasBoard, toFlowNode, type CardFlowNode } from './canvas/CanvasBoard';
import { useBridge } from './hooks/useBridge';
import { Toolbar } from './components/Toolbar';
import { QueueDrawer } from './components/QueueDrawer';
import { Button } from './components/ui/button';
import { CanvasModeContext, actionLabel } from './lib/mode';
import type { CanvasEdge, CanvasNode, NodeLayout, Viewport } from './lib/types';

export default function App() {
  // React Flow 节点（画布可视状态）
  const [flowNodes, setFlowNodes] = useState<CardFlowNode[]>([]);
  const [flowEdges, setFlowEdges] = useState<Edge[]>([]);
  // 节点索引：nodeId -> CanvasNode，作为拉取队列与元数据来源
  const nodesRef = useRef<Map<string, CanvasNode>>(new Map());
  // 最新的 flowNodes 引用，供落盘时读取当前布局
  const flowNodesRef = useRef<CardFlowNode[]>([]);
  flowNodesRef.current = flowNodes;
  const [queue, setQueue] = useState<CanvasNode[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [nodeCount, setNodeCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // 从服务端恢复的视口，仅首次快照时设定
  const [initialViewport, setInitialViewport] = useState<Viewport | undefined>();
  const viewportRestored = useRef(false);

  // 事件处理函数的 ref 容器：useBridge 需在这些函数定义之前调用
  const applyAddRef = useRef<(n: CanvasNode) => void>(() => {});
  const applySnapshotRef = useRef<(n: CanvasNode[], e?: CanvasEdge[], v?: Viewport) => void>(
    () => {}
  );
  const applyRemoveRef = useRef<(id: string) => void>(() => {});
  const applyClearRef = useRef<() => void>(() => {});

  const {
    status,
    enqueue,
    sendToChat,
    reportLayouts,
    reportViewport,
    reportEdges,
    clientEnv,
    embedded,
  } = useBridge({
    onAdd: (node) => applyAddRef.current(node),
    onUpdate: (id, patch) => {
      const cur = nodesRef.current.get(id);
      if (cur) applyAddRef.current({ ...cur, ...patch });
    },
    onRemove: (id) => applyRemoveRef.current(id),
    onClear: () => applyClearRef.current(),
    onSnapshot: (nodes, edges, viewport) => applySnapshotRef.current(nodes, edges, viewport),
  });

  // 上报函数放进 ref，供下方回调使用，避免声明顺序造成的循环依赖
  const reportLayoutsRef = useRef(reportLayouts);
  reportLayoutsRef.current = reportLayouts;

  /**
   * 把当前画布上的位置/尺寸全量上报，由服务端持久化。
   * 延后一帧执行，确保读到 React 已提交的最新布局。
   */
  const commitLayouts = useCallback(() => {
    setTimeout(() => {
      const layouts: Record<string, NodeLayout> = {};
      for (const n of flowNodesRef.current) {
        layouts[n.id] = {
          position: { x: n.position.x, y: n.position.y },
          size: n.width && n.height ? { width: n.width, height: n.height } : undefined,
        };
      }
      reportLayoutsRef.current(layouts);
    }, 0);
  }, []);

  const applyAdd = useCallback(
    (node: CanvasNode) => {
      const isNew = !nodesRef.current.has(node.id);
      nodesRef.current.set(node.id, node);
      setNodeCount(nodesRef.current.size);

      setFlowNodes((cur) => {
        const idx = cur.findIndex((n) => n.id === node.id);
        if (idx >= 0) {
          // 已存在：只更新数据，保留用户调整过的位置与尺寸
          const next = [...cur];
          next[idx] = { ...next[idx], data: toFlowNode(node, idx).data };
          return next;
        }
        return [...cur, toFlowNode(node, cur.length)];
      });

      if (isNew) {
        toast('新内容已加入画布', { description: node.title });
        // 新节点由前端自动落位，需立即回写，否则刷新后位置会重算
        setTimeout(commitLayouts, 0);
      }
    },
    [commitLayouts]
  );

  const applySnapshot = useCallback(
    (incoming: CanvasNode[], edges?: CanvasEdge[], viewport?: Viewport) => {
      nodesRef.current = new Map(incoming.map((n) => [n.id, n]));
      setNodeCount(nodesRef.current.size);
      setFlowNodes(incoming.map((n, i) => toFlowNode(n, i)));
      setFlowEdges((edges ?? []).map((e) => ({ id: e.id, source: e.source, target: e.target })));
      if (viewport && !viewportRestored.current) {
        viewportRestored.current = true;
        setInitialViewport(viewport);
      }
      // 首次加载中若存在无持久位置的节点，自动落位后回写
      if (incoming.some((n) => !n.layout)) {
        setTimeout(commitLayouts, 0);
      }
    },
    [commitLayouts]
  );

  const applyRemove = useCallback((id: string) => {
    nodesRef.current.delete(id);
    setNodeCount(nodesRef.current.size);
    setFlowNodes((cur) => cur.filter((n) => n.id !== id));
  }, []);

  const applyClear = useCallback(() => {
    nodesRef.current.clear();
    setNodeCount(0);
    setFlowNodes([]);
    setFlowEdges([]);
  }, []);

  // 连线变化后同步到服务端（全量覆盖）
  const handleEdgesChange = useCallback(
    (updater: React.SetStateAction<Edge[]>) => {
      setFlowEdges((cur) => {
        const next = typeof updater === 'function' ? updater(cur) : updater;
        reportEdges(next.map((e) => ({ id: e.id, source: e.source, target: e.target })));
        return next;
      });
    },
    [reportEdges]
  );

  // 把回调放进 ref 交给 useBridge，避免 hook 声明顺序限制
  applyAddRef.current = applyAdd;
  applySnapshotRef.current = applySnapshot;
  applyRemoveRef.current = applyRemove;
  applyClearRef.current = applyClear;

  const mode = useMemo(() => ({ embedded, clientEnv }), [embedded, clientEnv]);

  /**
   * 把内容交给 AI：
   * - 内嵌模式：直接发回当前对话
   * - 浏览器模式：入队，等用户在客户端执行取回命令
   */
  const submitNodes = useCallback(
    async (nodes: CanvasNode[]) => {
      if (nodes.length === 0) return;

      if (embedded) {
        const ok = await sendToChat(nodes);
        if (ok) {
          toast.success(`已发送 ${nodes.length} 项到对话`);
          return;
        }
        // 直发失败则退回队列方式，保证内容不丢
      }

      setQueue((prev) => {
        const map = new Map(prev.map((n) => [n.id, n]));
        nodes.forEach((n) => map.set(n.id, n));
        return [...map.values()];
      });
      enqueue(nodes);
      toast.success(`已引用 ${nodes.length} 项`, {
        description: `回到 ${clientEnv.label} 输入 ${clientEnv.pullCommand} 取回`,
      });
    },
    [embedded, sendToChat, enqueue, clientEnv]
  );

  // 监听卡片上的操作按钮
  useEffect(() => {
    const handler = (e: Event) => {
      const { nodeId } = (e as CustomEvent).detail as { nodeId: string };
      const node = nodesRef.current.get(nodeId);
      if (node) void submitNodes([node]);
    };
    window.addEventListener('canvas-enqueue', handler);
    return () => window.removeEventListener('canvas-enqueue', handler);
  }, [submitNodes]);

  const removeFromQueue = useCallback((id: string) => {
    setQueue((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const submitSelection = useCallback(() => {
    const nodes = selectedIds
      .map((id) => nodesRef.current.get(id))
      .filter((n): n is CanvasNode => Boolean(n));
    void submitNodes(nodes);
  }, [selectedIds, submitNodes]);

  const label = actionLabel(embedded);

  return (
    <CanvasModeContext.Provider value={mode}>
      <div className="relative h-full w-full">
        <div className="absolute inset-0">
          <ReactFlowProvider>
            <CanvasBoard
              nodes={flowNodes}
              edges={flowEdges}
              onNodesChangeExternal={setFlowNodes}
              onEdgesChangeExternal={handleEdgesChange}
              onSelectionChange={setSelectedIds}
              onLayoutCommit={commitLayouts}
              onViewportChange={reportViewport}
              defaultViewport={initialViewport}
            />
          </ReactFlowProvider>
        </div>

        <Toolbar
          status={status}
          nodeCount={nodeCount}
          queueCount={queue.length}
          onOpenQueue={() => setDrawerOpen(true)}
        />

        {/* 多选时就地浮出批量操作，替代原先常驻的「选中加入」按钮 */}
        {selectedIds.length > 1 && (
          <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
            <Button size="sm" className="pointer-events-auto shadow-lg" onClick={submitSelection}>
              {embedded ? <Send size={13} /> : <Plus size={13} />}
              {label.idle}选中的 {selectedIds.length} 项
            </Button>
          </div>
        )}

        <QueueDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          queue={queue}
          onRemove={removeFromQueue}
          onClear={() => setQueue([])}
        />

        <Toaster position="bottom-right" richColors closeButton />
      </div>
    </CanvasModeContext.Provider>
  );
}
