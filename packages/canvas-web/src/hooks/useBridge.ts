import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasNode } from '@/lib/types';
import type { CanvasTransport, ConnStatus } from '@/bridge/transport';
import { createTransport } from '@/bridge/createTransport';

export type { ConnStatus } from '@/bridge/transport';

interface UseBridgeOptions {
  onAdd: (node: CanvasNode) => void;
  onUpdate: (id: string, patch: Partial<CanvasNode>) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onSnapshot: (nodes: CanvasNode[]) => void;
}

/**
 * 通过传输适配层与后端通信。底层可能是 WebSocket（浏览器模式）
 * 或 MCP Apps postMessage（内嵌模式），对 App.tsx 透明。
 */
export function useBridge(opts: UseBridgeOptions) {
  const [status, setStatus] = useState<ConnStatus>('connecting');
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
      onSnapshot: (nodes) => optsRef.current.onSnapshot(nodes),
      onStatus: setStatus,
    });
    return cleanup;
  }, [transport]);

  const enqueue = useCallback((nodes: CanvasNode[]) => transport.enqueue(nodes), [transport]);

  return { status, enqueue, mode: transport.mode };
}
