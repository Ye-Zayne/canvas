/**
 * McpAppTransport：MCP Apps 内嵌模式传输实现。
 *
 * 基于 MCP Apps 的 postMessage + JSON-RPC 协议（不引入 SDK，保持自包含）：
 *  - 启动时向宿主发送 `ui/initialize` 握手
 *  - 监听宿主推送的 `ui/render` / 自定义通知，转成画布节点事件
 *  - 「加入对话」通过 `tools/call` 调服务端 `canvas_enqueue` 工具入队
 *    （与浏览器模式一致：入队后由用户执行 /canvas-pull 拉取）
 *
 * 约定：宿主与 iframe 通过 window.postMessage 交换 JSON-RPC 2.0 消息。
 * 服务端在工具返回的结构化数据里带上 { canvas: PushMsg }，我们据此驱动画布。
 */
import type { CanvasNode, PushMsg } from '@/lib/types';
import type { CanvasTransport, ConnStatus, TransportHandlers } from './transport';

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

export class McpAppTransport implements CanvasTransport {
  readonly mode = 'mcp-app' as const;
  private handlers: TransportHandlers | null = null;
  private _status: ConnStatus = 'connecting';
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: unknown) => void }
  >();
  private onMessage = (ev: MessageEvent) => this.handleMessage(ev);

  get status(): ConnStatus {
    return this._status;
  }

  private setStatus(s: ConnStatus) {
    this._status = s;
    this.handlers?.onStatus?.(s);
  }

  connect(handlers: TransportHandlers): () => void {
    this.handlers = handlers;
    window.addEventListener('message', this.onMessage);
    // 发起握手
    this.request('ui/initialize', {
      capabilities: { canvas: true },
      client: { name: 'ai-canvas', version: '0.2.0' },
    })
      .then((result) => {
        this.setStatus('open');
        // 握手结果可能带初始快照
        this.applyInitResult(result);
      })
      .catch(() => this.setStatus('closed'));

    return () => {
      window.removeEventListener('message', this.onMessage);
      this.setStatus('closed');
    };
  }

  private applyInitResult(result: unknown) {
    const push = extractCanvasPush(result);
    if (push) this.dispatch(push);
  }

  private handleMessage(ev: MessageEvent) {
    const msg = ev.data as JsonRpcMessage;
    if (!msg || msg.jsonrpc !== '2.0') return;

    // 响应
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
      const p = this.pending.get(msg.id as number);
      if (p) {
        this.pending.delete(msg.id as number);
        if (msg.error) p.reject(msg.error);
        else p.resolve(msg.result);
      }
      return;
    }

    // 通知：宿主推送画布更新
    if (msg.method) {
      const push = extractCanvasPush(msg.params);
      if (push) this.dispatch(push);
    }
  }

  private dispatch(push: PushMsg) {
    const h = this.handlers;
    if (!h) return;
    switch (push.type) {
      case 'add_node':
        h.onAdd(push.node);
        break;
      case 'update_node':
        h.onUpdate(push.id, push.patch);
        break;
      case 'remove_node':
        h.onRemove(push.id);
        break;
      case 'clear':
        h.onClear();
        break;
      case 'snapshot':
        h.onSnapshot(push.nodes);
        break;
    }
  }

  private post(msg: JsonRpcMessage) {
    window.parent.postMessage(msg, '*');
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.post({ jsonrpc: '2.0', id, method, params });
      // 超时保护
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP Apps request timeout: ${method}`));
        }
      }, 8000);
    });
  }

  enqueue(nodes: CanvasNode[]): void {
    // 通过 tools/call 调服务端入队工具，与浏览器模式行为一致
    this.request('tools/call', {
      name: 'canvas_enqueue',
      arguments: { nodes },
    }).catch(() => {
      /* 入队失败静默：宿主可能未实现该工具 */
    });
  }
}

/** 从任意结构里提取 { canvas: PushMsg } 约定字段 */
function extractCanvasPush(data: unknown): PushMsg | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  const canvas = obj.canvas ?? (obj as { params?: Record<string, unknown> }).params?.canvas;
  if (canvas && typeof canvas === 'object' && 'type' in canvas) {
    return canvas as PushMsg;
  }
  return null;
}
