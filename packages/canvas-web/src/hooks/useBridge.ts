import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasNode, PushMsg, ReportMsg } from '@/lib/types';

export type ConnStatus = 'connecting' | 'open' | 'closed';

interface UseBridgeOptions {
  onAdd: (node: CanvasNode) => void;
  onUpdate: (id: string, patch: Partial<CanvasNode>) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onSnapshot: (nodes: CanvasNode[]) => void;
}

/** 与 bridge-server 建立 WebSocket 连接，处理推送并提供上报能力 */
export function useBridge(opts: UseBridgeOptions) {
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const connect = useCallback(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws`;
    setStatus('connecting');
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('open');
      ws.send(JSON.stringify({ type: 'hello' } satisfies ReportMsg));
    };

    ws.onmessage = (ev) => {
      let msg: PushMsg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      const o = optsRef.current;
      switch (msg.type) {
        case 'add_node':
          o.onAdd(msg.node);
          break;
        case 'update_node':
          o.onUpdate(msg.id, msg.patch);
          break;
        case 'remove_node':
          o.onRemove(msg.id);
          break;
        case 'clear':
          o.onClear();
          break;
        case 'snapshot':
          o.onSnapshot(msg.nodes);
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' } satisfies ReportMsg));
          break;
      }
    };

    ws.onclose = () => {
      setStatus('closed');
      // 自动重连
      setTimeout(() => connect(), 1500);
    };
    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  const report = useCallback((msg: ReportMsg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const enqueue = useCallback(
    (nodes: CanvasNode[]) => report({ type: 'selection_enqueue', nodes }),
    [report]
  );

  return { status, enqueue, report };
}
