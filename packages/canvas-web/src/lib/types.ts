/** 前端画布节点模型与通信协议（与 bridge-server/src/types.ts 对应） */

export type NodeKind = 'text' | 'markdown' | 'image' | 'video' | 'audio' | 'file';

/** 节点在画布上的位置与尺寸（完全持久化） */
export interface NodeLayout {
  position: { x: number; y: number };
  size?: { width: number; height: number };
}

export interface CanvasNode {
  id: string;
  kind: NodeKind;
  title?: string;
  content?: string;
  /** 素材原始位置（本地绝对路径或 URL），持久化的真相来源 */
  sourcePath?: string;
  /** 运行时派生的可访问 URL */
  assetUrl?: string;
  mime?: string;
  /** 素材文件已丢失 */
  missing?: boolean;
  meta?: Record<string, unknown>;
  createdAt: number;
  layout?: NodeLayout;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
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
  | {
      type: 'snapshot';
      nodes: CanvasNode[];
      edges?: CanvasEdge[];
      viewport?: Viewport;
    }
  | { type: 'client_env'; env: ClientEnv }
  | { type: 'ping' };

export type ReportMsg =
  | { type: 'selection_enqueue'; nodes: CanvasNode[] }
  | { type: 'canvas_state'; nodes: CanvasNode[] }
  | { type: 'layout_update'; layouts: Record<string, NodeLayout> }
  | { type: 'viewport_update'; viewport: Viewport }
  | { type: 'edges_update'; edges: CanvasEdge[] }
  | { type: 'hello' }
  | { type: 'pong' };
