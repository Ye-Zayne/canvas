import { useCallback, useEffect, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { toast, Toaster } from 'sonner';
import { CanvasBoard, toFlowNode, type CardFlowNode } from './canvas/CanvasBoard';
import { useBridge } from './hooks/useBridge';
import { Toolbar } from './components/Toolbar';
import { QueueDrawer } from './components/QueueDrawer';
import type { CanvasNode } from './lib/types';

export default function App() {
  // React Flow 节点（画布可视状态）
  const [flowNodes, setFlowNodes] = useState<CardFlowNode[]>([]);
  // 节点索引：nodeId -> CanvasNode，作为拉取队列与元数据来源
  const nodesRef = useRef<Map<string, CanvasNode>>(new Map());
  const [queue, setQueue] = useState<CanvasNode[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [nodeCount, setNodeCount] = useState(0);
  const selectedIdsRef = useRef<string[]>([]);

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

  const { status, enqueue } = useBridge({
    onAdd: applyAdd,
    onUpdate: (id, patch) => {
      const cur = nodesRef.current.get(id);
      if (cur) applyAdd({ ...cur, ...patch });
    },
    onRemove: applyRemove,
    onClear: applyClear,
    onSnapshot: applySnapshot,
  });

  // 监听卡片「加入对话」事件
  useEffect(() => {
    const handler = (e: Event) => {
      const { nodeId } = (e as CustomEvent).detail as { nodeId: string };
      const node = nodesRef.current.get(nodeId);
      if (!node) return;
      setQueue((prev) => (prev.some((n) => n.id === nodeId) ? prev : [...prev, node]));
      enqueue([node]);
      toast.success('已加入对话队列', {
        description: '在 codex / claude code 里执行 /canvas-pull 拉取',
      });
    };
    window.addEventListener('canvas-enqueue', handler);
    return () => window.removeEventListener('canvas-enqueue', handler);
  }, [enqueue]);

  const removeFromQueue = useCallback((id: string) => {
    setQueue((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const enqueueSelection = useCallback(() => {
    const nodes: CanvasNode[] = [];
    for (const id of selectedIdsRef.current) {
      const n = nodesRef.current.get(id);
      if (n) nodes.push(n);
    }
    if (nodes.length === 0) {
      toast.info('请先在画布上选中一个或多个卡片');
      return;
    }
    setQueue((prev) => {
      const map = new Map(prev.map((n) => [n.id, n]));
      nodes.forEach((n) => map.set(n.id, n));
      return [...map.values()];
    });
    enqueue(nodes);
    toast.success(`已加入 ${nodes.length} 项到对话队列`);
  }, [enqueue]);

  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0">
        <ReactFlowProvider>
          <CanvasBoard
            nodes={flowNodes}
            onNodesChangeExternal={setFlowNodes}
            onSelectionChange={(ids) => (selectedIdsRef.current = ids)}
          />
        </ReactFlowProvider>
      </div>

      <Toolbar
        status={status}
        nodeCount={nodeCount}
        queueCount={queue.length}
        onOpenQueue={() => setDrawerOpen(true)}
        onEnqueueSelection={enqueueSelection}
      />

      <QueueDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        queue={queue}
        onRemove={removeFromQueue}
        onClear={() => setQueue([])}
      />

      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}
