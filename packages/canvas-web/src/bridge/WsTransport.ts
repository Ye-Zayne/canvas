/**
 * WsTransport：浏览器模式的传输实现。
 * 封装原 useBridge 的 WebSocket 连接 / 重连 / 消息分发逻辑。
 */
import type { CanvasEdge, CanvasNode, NodeLayout, PushMsg, ReportMsg, Viewport } from '@/lib/types';
import type { CanvasTransport, ConnStatus, TransportHandlers } from './transport';

export class WsTransport implements CanvasTransport {
  readonly mode = 'ws' as const;
  private ws: WebSocket | null = null;
  private handlers: TransportHandlers | null = null;
  private closedByUser = false;
  private _status: ConnStatus = 'connecting';

  get status(): ConnStatus {
    return this._status;
  }

  private setStatus(s: ConnStatus) {
    this._status = s;
    this.handlers?.onStatus?.(s);
  }

  connect(handlers: TransportHandlers): () => void {
    this.handlers = handlers;
    this.closedByUser = false;
    this.open();
    return () => {
      this.closedByUser = true;
      this.ws?.close();
    };
  }

  private open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws`;
    this.setStatus('connecting');
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.setStatus('open');
      ws.send(JSON.stringify({ type: 'hello' } satisfies ReportMsg));
    };

    ws.onmessage = (ev) => {
      let msg: PushMsg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      const h = this.handlers;
      if (!h) return;
      switch (msg.type) {
        case 'add_node':
          h.onAdd(msg.node);
          break;
        case 'update_node':
          h.onUpdate(msg.id, msg.patch);
          break;
        case 'remove_node':
          h.onRemove(msg.id);
          break;
        case 'clear':
          h.onClear();
          break;
        case 'snapshot':
          h.onSnapshot(msg.nodes, msg.edges, msg.viewport);
          break;
        case 'client_env':
          h.onClientEnv?.(msg.env);
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' } satisfies ReportMsg));
          break;
      }
    };

    ws.onclose = () => {
      this.setStatus('closed');
      if (!this.closedByUser) {
        setTimeout(() => this.open(), 1500);
      }
    };
    ws.onerror = () => ws.close();
  }

  enqueue(nodes: CanvasNode[]): void {
    this.send({ type: 'selection_enqueue', nodes });
  }

  reportLayouts(layouts: Record<string, NodeLayout>): void {
    this.send({ type: 'layout_update', layouts });
  }

  reportViewport(viewport: Viewport): void {
    this.send({ type: 'viewport_update', viewport });
  }

  reportEdges(edges: CanvasEdge[]): void {
    this.send({ type: 'edges_update', edges });
  }

  private send(msg: ReportMsg): void {
    const ws = this.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
