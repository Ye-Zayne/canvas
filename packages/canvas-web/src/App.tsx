import { useCallback, useEffect, useRef, useState } from 'react';
import { Editor } from 'tldraw';
import { toast, Toaster } from 'sonner';
import { CanvasBoard, upsertCard, removeCard, shapeIdForNode } from './canvas/CanvasBoard';
import { useBridge } from './hooks/useBridge';
import { Toolbar } from './components/Toolbar';
import { QueueDrawer } from './components/QueueDrawer';
import type { CanvasNode } from './lib/types';

export default function App() {
  const editorRef = useRef<Editor | null>(null);
  // 节点索引：nodeId -> CanvasNode，作为拉取队列与元数据来源
  const nodesRef = useRef<Map<string, CanvasNode>>(new Map());
  const [queue, setQueue] = useState<CanvasNode[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [nodeCount, setNodeCount] = useState(0);

  const applyAdd = useCallback((node: CanvasNode) => {
    nodesRef.current.set(node.id, node);
    setNodeCount(nodesRef.current.size);
    const ed = editorRef.current;
    if (ed) upsertCard(ed, node);
    if (node.kind !== 'text' && node.kind !== 'markdown') {
      toast(`新${kindLabel(node.kind)}已加入画布`, { description: node.title });
    } else {
      toast('新内容已加入画布', { description: node.title });
    }
  }, []);

  const applySnapshot = useCallback((incoming: CanvasNode[]) => {
    const ed = editorRef.current;
    nodesRef.current = new Map(incoming.map((n) => [n.id, n]));
    setNodeCount(nodesRef.current.size);
    if (ed) incoming.forEach((n) => upsertCard(ed, n));
  }, []);

  const applyRemove = useCallback((id: string) => {
    nodesRef.current.delete(id);
    setNodeCount(nodesRef.current.size);
    const ed = editorRef.current;
    if (ed) removeCard(ed, id);
  }, []);

  const applyClear = useCallback(() => {
    const ed = editorRef.current;
    if (ed) {
      const ids = [...nodesRef.current.keys()].map(shapeIdForNode);
      ed.deleteShapes(ids);
    }
    nodesRef.current.clear();
    setNodeCount(0);
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
    const ed = editorRef.current;
    if (!ed) return;
    const selected = ed.getSelectedShapes();
    const nodes: CanvasNode[] = [];
    for (const s of selected) {
      if (s.type === 'canvas-card') {
        const nodeId = (s.props as { nodeId: string }).nodeId;
        const n = nodesRef.current.get(nodeId);
        if (n) nodes.push(n);
      }
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
        <CanvasBoard onEditorReady={(ed) => (editorRef.current = ed)} />
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

function kindLabel(kind: CanvasNode['kind']): string {
  return {
    text: '文本',
    markdown: '内容',
    image: '图片',
    video: '视频',
    audio: '音频',
    file: '文件',
  }[kind];
}
