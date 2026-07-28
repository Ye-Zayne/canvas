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

/** 客户端环境信息（由服务端探测后下发） */
export interface ClientEnv {
  kind: 'codex' | 'claude' | 'vscode' | 'unknown';
  label: string;
  pullCommand: string;
}

export type PushMsg =
  | { type: 'add_node'; node: CanvasNode }
  | { type: 'update_node'; id: string; patch: Partial<CanvasNode> }
  | { type: 'remove_node'; id: string }
  | { type: 'clear' }
  | { type: 'snapshot'; nodes: CanvasNode[] }
  | { type: 'client_env'; env: ClientEnv }
  | { type: 'ping' };

export type ReportMsg =
  | { type: 'selection_enqueue'; nodes: CanvasNode[] }
  | { type: 'canvas_state'; nodes: CanvasNode[] }
  | { type: 'hello' }
  | { type: 'pong' };
