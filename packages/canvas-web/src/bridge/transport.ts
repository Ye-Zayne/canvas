/**
 * 通信适配层：把「画布」与「底层通信方式」解耦。
 *
 * - WsTransport：浏览器模式，走 WebSocket（现有 useBridge 逻辑）。
 * - McpAppTransport：内嵌模式，走 MCP Apps postMessage（useApp）。
 *
 * App.tsx 只依赖 CanvasTransport 接口，不关心底层是 WS 还是 MCP Apps。
 */
import type { CanvasNode } from '@/lib/types';

export type ConnStatus = 'connecting' | 'open' | 'closed';

/** 画布从传输层接收的事件回调 */
export interface TransportHandlers {
  onAdd: (node: CanvasNode) => void;
  onUpdate: (id: string, patch: Partial<CanvasNode>) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onSnapshot: (nodes: CanvasNode[]) => void;
  /** 连接状态变化 */
  onStatus?: (status: ConnStatus) => void;
}

/** 统一的画布传输接口 */
export interface CanvasTransport {
  /** 建立连接并注册回调；返回清理函数 */
  connect(handlers: TransportHandlers): () => void;
  /** 用户「加入对话」：把选中节点入队，供 Agent 通过 /canvas-pull 拉取 */
  enqueue(nodes: CanvasNode[]): void;
  /** 当前连接状态 */
  readonly status: ConnStatus;
  /** 传输类型标识（用于 UI 展示 / 调试） */
  readonly mode: 'ws' | 'mcp-app';
}
