/** 前端画布节点模型与通信协议（与 bridge-server/src/types.ts 对应） */

export type NodeKind = 'text' | 'markdown' | 'image' | 'video' | 'audio' | 'file';

export interface CanvasNode {
  id: string;
  kind: NodeKind;
  title?: string;
  content?: string;
  assetUrl?: string;
  mime?: string;
  meta?: Record<string, unknown>;
  createdAt: number;
}

export type PushMsg =
  | { type: 'add_node'; node: CanvasNode }
  | { type: 'update_node'; id: string; patch: Partial<CanvasNode> }
  | { type: 'remove_node'; id: string }
  | { type: 'clear' }
  | { type: 'snapshot'; nodes: CanvasNode[] }
  | { type: 'ping' };

export type ReportMsg =
  | { type: 'selection_enqueue'; nodes: CanvasNode[] }
  | { type: 'canvas_state'; nodes: CanvasNode[] }
  | { type: 'hello' }
  | { type: 'pong' };
