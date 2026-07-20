/**
 * 画布节点数据模型与通信协议类型定义。
 * server 与 browser 共享同一套语义（前端有各自的副本）。
 */

export type NodeKind =
  | 'text'
  | 'markdown'
  | 'image'
  | 'video'
  | 'audio'
  | 'file';

export interface CanvasNode {
  id: string;
  kind: NodeKind;
  title?: string;
  /** 文本 / markdown 内容 */
  content?: string;
  /** 媒体或文件的可访问 URL（本地文件经 /assets/:id 代理） */
  assetUrl?: string;
  /** MIME 类型 */
  mime?: string;
  /** 额外元信息 */
  meta?: Record<string, unknown>;
  createdAt: number;
}

/** server -> browser 推送消息 */
export type PushMsg =
  | { type: 'add_node'; node: CanvasNode }
  | { type: 'update_node'; id: string; patch: Partial<CanvasNode> }
  | { type: 'remove_node'; id: string }
  | { type: 'clear' }
  | { type: 'snapshot'; nodes: CanvasNode[] }
  | { type: 'ping' };

/** browser -> server 上报消息 */
export type ReportMsg =
  | { type: 'selection_enqueue'; nodes: CanvasNode[] }
  | { type: 'canvas_state'; nodes: CanvasNode[] }
  | { type: 'hello' }
  | { type: 'pong' };
