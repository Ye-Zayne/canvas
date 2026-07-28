import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { toast, Toaster } from 'sonner';
import { Send, Plus } from 'lucide-react';
import { CanvasBoard, toFlowNode, type CardFlowNode } from './canvas/CanvasBoard';
import { useBridge } from './hooks/useBridge';
import { Toolbar } from './components/Toolbar';
import { QueueDrawer } from './components/QueueDrawer';
import { Button } from './components/ui/button';
import { CanvasModeContext, actionLabel } from './lib/mode';
import type { CanvasNode } from './lib/types';

export default function App() {
  // React Flow 节点（画布可视状态）
  const [flowNodes, setFlowNodes] = useState<CardFlowNode[]>([]);
  // 节点索引：nodeId -> CanvasNode，作为拉取队列与元数据来源
  const nodesRef = useRef<Map<string, CanvasNode>>(new Map());
  const [queue, setQueue] = useState<CanvasNode[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [nodeCount, setNodeCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const applyAdd = useCallback((node: CanvasNode) => {
    const isNew = !nodesRef.current.has(node.id);
    nodesRef.current.set(node.id, node);
    setNodeCount(nodesRef.current.size);

    setFlowNodes((cur) => {
      const idx = cur.findIndex((n) => n.id === node.id);
      if (idx >= 0) {
        // 已存在：只更新数据，保留位置与尺寸
        const next = [...cur];
        const fresh = toFlowNode(node, idx);
        next[idx] = { ...next[idx], data: fresh.data };
        return next;
      }
      return [...cur, toFlowNode(node, cur.length)];
    });

    if (isNew) {
      toast('新内容已加入画布', { description: node.title });
    }
  }, []);

  const applySnapshot = useCallback((incoming: CanvasNode[]) => {
    nodesRef.current = new Map(incoming.map((n) => [n.id, n]));
    setNodeCount(nodesRef.current.size);
    setFlowNodes(incoming.map((n, i) => toFlowNode(n, i)));
  }, []);

  const applyRemove = useCallback((id: string) => {
    nodesRef.current.delete(id);
    setNodeCount(nodesRef.current.size);
    setFlowNodes((cur) => cur.filter((n) => n.id !== id));
  }, []);

  const applyClear = useCallback(() => {
    nodesRef.current.clear();
    setNodeCount(0);
    setFlowNodes([]);
  }, []);

  const { status, enqueue, sendToChat, clientEnv, embedded } = useBridge({
    onAdd: applyAdd,
    onUpdate: (id, patch) => {
      const cur = nodesRef.current.get(id);
      if (cur) applyAdd({ ...cur, ...patch });
    },
    onRemove: applyRemove,
    onClear: applyClear,
    onSnapshot: applySnapshot,
  });

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
              onNodesChangeExternal={setFlowNodes}
              onSelectionChange={setSelectedIds}
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
