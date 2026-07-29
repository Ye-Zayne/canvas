/**
 * 画布节点数据模型与通信协议类型定义。
 * server 与 browser 共享同一套语义（前端有各自的副本）。
 */

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
  /** 文本 / markdown 内容 */
  content?: string;
  /**
   * 素材的原始位置：本地绝对路径，或 http(s)/data URL。
   * 这是持久化的真相来源；assetUrl 由它在运行时派生。
   */
  sourcePath?: string;
  /** 运行时派生的可访问 URL（本地文件经 /assets/:id 代理），不持久化 */
  assetUrl?: string;
  /** MIME 类型 */
  mime?: string;
  /** 素材文件已丢失（sourcePath 指向的文件不存在） */
  missing?: boolean;
  /** 额外元信息 */
  meta?: Record<string, unknown>;
  createdAt: number;
  /** 画布布局，缺省时由前端自动排布并回写 */
  layout?: NodeLayout;
}

/** 节点之间的连线 */
export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
}

/** 画布视口，用于恢复上次的视野 */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/** 持久化到 .aicanvas/canvas.json 的完整文档 */
export interface CanvasDocument {
  /** schema 版本，便于后续迁移 */
  version: 1;
  updatedAt: number;
  viewport?: Viewport;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

/** 客户端环境信息（供前端切换文案与交互） */
export interface ClientEnv {
  kind: 'codex' | 'claude' | 'vscode' | 'unknown';
  label: string;
  pullCommand: string;
}

/** server -> browser 推送消息 */
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

/** browser -> server 上报消息 */
export type ReportMsg =
  | { type: 'selection_enqueue'; nodes: CanvasNode[] }
  | { type: 'canvas_state'; nodes: CanvasNode[] }
  /** 节点位置/尺寸变更（拖动、缩放） */
  | { type: 'layout_update'; layouts: Record<string, NodeLayout> }
  /** 视口变更 */
  | { type: 'viewport_update'; viewport: Viewport }
  /** 连线变更（全量覆盖） */
  | { type: 'edges_update'; edges: CanvasEdge[] }
  | { type: 'hello' }
  | { type: 'pong' };
