import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasEdge, CanvasNode, ClientEnv, NodeLayout, Viewport } from '@/lib/types';
import type { CanvasTransport, ConnStatus } from '@/bridge/transport';
import { createTransport } from '@/bridge/createTransport';

export type { ConnStatus } from '@/bridge/transport';

interface UseBridgeOptions {
  onAdd: (node: CanvasNode) => void;
  onUpdate: (id: string, patch: Partial<CanvasNode>) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onSnapshot: (nodes: CanvasNode[], edges?: CanvasEdge[], viewport?: Viewport) => void;
}

/** 未探测到客户端时的兜底信息 */
const DEFAULT_ENV: ClientEnv = {
  kind: 'unknown',
  label: 'AI 客户端',
  pullCommand: '/canvas-pull',
};

/**
 * 通过传输适配层与后端通信。底层可能是 WebSocket（浏览器模式）
 * 或 MCP Apps postMessage（内嵌模式），对调用方透明。
 */
export function useBridge(opts: UseBridgeOptions) {
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [clientEnv, setClientEnv] = useState<ClientEnv>(DEFAULT_ENV);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // 传输实例整个生命周期只创建一次
  const transport = useMemo<CanvasTransport>(() => createTransport(), []);

  useEffect(() => {
    const cleanup = transport.connect({
      onAdd: (n) => optsRef.current.onAdd(n),
      onUpdate: (id, patch) => optsRef.current.onUpdate(id, patch),
      onRemove: (id) => optsRef.current.onRemove(id),
      onClear: () => optsRef.current.onClear(),
      onSnapshot: (nodes, edges, viewport) => optsRef.current.onSnapshot(nodes, edges, viewport),
      onClientEnv: setClientEnv,
      onStatus: setStatus,
    });
    return cleanup;
  }, [transport]);

  const enqueue = useCallback((nodes: CanvasNode[]) => transport.enqueue(nodes), [transport]);

  /** 上报节点位置/尺寸，由服务端持久化 */
  const reportLayouts = useCallback(
    (layouts: Record<string, NodeLayout>) => transport.reportLayouts?.(layouts),
    [transport]
  );

  const reportViewport = useCallback(
    (viewport: Viewport) => transport.reportViewport?.(viewport),
    [transport]
  );

  const reportEdges = useCallback(
    (edges: CanvasEdge[]) => transport.reportEdges?.(edges),
    [transport]
  );

  /** 内嵌模式：直接发回对话；不支持时返回 false 由调用方走队列 */
  const sendToChat = useCallback(
    async (nodes: CanvasNode[]): Promise<boolean> => {
      if (!transport.sendToChat) return false;
      try {
        await transport.sendToChat(nodes);
        return true;
      } catch {
        return false;
      }
    },
    [transport]
  );

  return {
    status,
    enqueue,
    sendToChat,
    reportLayouts,
    reportViewport,
    reportEdges,
    clientEnv,
    /** 是否内嵌在客户端内（可直接发回对话） */
    embedded: transport.mode === 'mcp-app',
  };
}
