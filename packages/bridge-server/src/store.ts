/**
 * 共享状态：画布节点集合 + 连线 + 视口 + 拉取队列 + 本地资产映射。
 * 内存为运行时真相，通过 persist 落盘到 .aicanvas/canvas.json。
 */
import { randomUUID } from 'node:crypto';
import type { CanvasDocument, CanvasEdge, CanvasNode, NodeLayout, Viewport } from './types.js';

export interface AssetEntry {
  id: string;
  path: string;
  mime: string;
}

class Store {
  /** 画布上当前所有节点，按插入顺序 */
  private nodes = new Map<string, CanvasNode>();
  /** 节点之间的连线 */
  private edges = new Map<string, CanvasEdge>();
  /** 画布视口 */
  private viewport: Viewport | undefined;
  /** 用户在画布上「加入对话」入队、待 Agent 拉取的节点 */
  private pullQueue: CanvasNode[] = [];
  /** 本地文件资产：assetId -> 磁盘路径 */
  private assets = new Map<string, AssetEntry>();
  /** 同一路径复用同一 assetId，避免重复注册 */
  private assetByPath = new Map<string, AssetEntry>();

  // ---- 节点 ----
  addNode(
    partial: Omit<CanvasNode, 'id' | 'createdAt'> & { id?: string; createdAt?: number }
  ): CanvasNode {
    const node: CanvasNode = {
      id: partial.id ?? randomUUID(),
      kind: partial.kind,
      title: partial.title,
      content: partial.content,
      sourcePath: partial.sourcePath,
      assetUrl: partial.assetUrl,
      mime: partial.mime,
      missing: partial.missing,
      meta: partial.meta,
      layout: partial.layout,
      createdAt: partial.createdAt ?? Date.now(),
    };
    this.nodes.set(node.id, node);
    return node;
  }

  updateNode(id: string, patch: Partial<CanvasNode>): CanvasNode | undefined {
    const cur = this.nodes.get(id);
    if (!cur) return undefined;
    const next = { ...cur, ...patch, id: cur.id };
    this.nodes.set(id, next);
    return next;
  }

  getNode(id: string): CanvasNode | undefined {
    return this.nodes.get(id);
  }

  removeNode(id: string): boolean {
    // 同时清掉与之相关的连线
    for (const [eid, e] of this.edges) {
      if (e.source === id || e.target === id) this.edges.delete(eid);
    }
    return this.nodes.delete(id);
  }

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
  }

  listNodes(): CanvasNode[] {
    return [...this.nodes.values()];
  }

  /** 用画布全量快照覆盖（浏览器同步用） */
  replaceAll(nodes: CanvasNode[]): void {
    this.nodes.clear();
    for (const n of nodes) this.nodes.set(n.id, n);
  }

  // ---- 布局 ----
  /** 批量更新节点位置/尺寸（前端拖动、缩放后上报） */
  applyLayouts(layouts: Record<string, NodeLayout>): void {
    for (const [id, layout] of Object.entries(layouts)) {
      const cur = this.nodes.get(id);
      if (cur) this.nodes.set(id, { ...cur, layout });
    }
  }

  setViewport(v: Viewport): void {
    this.viewport = v;
  }

  getViewport(): Viewport | undefined {
    return this.viewport;
  }

  // ---- 连线 ----
  replaceEdges(edges: CanvasEdge[]): void {
    this.edges.clear();
    for (const e of edges) this.edges.set(e.id, e);
  }

  listEdges(): CanvasEdge[] {
    return [...this.edges.values()];
  }

  // ---- 文档序列化 / 恢复 ----
  /** 导出为可持久化文档（assetUrl 为运行时派生，不写入） */
  toDocument(): CanvasDocument {
    return {
      version: 1,
      updatedAt: Date.now(),
      viewport: this.viewport,
      nodes: this.listNodes().map(({ assetUrl: _assetUrl, missing: _missing, ...rest }) => rest),
      edges: this.listEdges(),
    };
  }

  /** 从持久化文档恢复（不含 assetUrl，由调用方重新注册后补齐） */
  loadDocument(doc: CanvasDocument): void {
    this.nodes.clear();
    this.edges.clear();
    for (const n of doc.nodes) this.nodes.set(n.id, n);
    for (const e of doc.edges ?? []) this.edges.set(e.id, e);
    this.viewport = doc.viewport;
  }

  // ---- 拉取队列 ----
  enqueue(nodes: CanvasNode[]): void {
    for (const n of nodes) {
      // 去重：同 id 覆盖到队尾
      const idx = this.pullQueue.findIndex((q) => q.id === n.id);
      if (idx >= 0) this.pullQueue.splice(idx, 1);
      this.pullQueue.push(n);
    }
  }

  peekQueue(): CanvasNode[] {
    return [...this.pullQueue];
  }

  /** 取出并清空队列 */
  drainQueue(): CanvasNode[] {
    const out = [...this.pullQueue];
    this.pullQueue = [];
    return out;
  }

  clearQueue(): void {
    this.pullQueue = [];
  }

  // ---- 本地资产 ----
  /** 注册本地文件为可访问资产；同一路径复用同一 id */
  registerAsset(path: string, mime: string): AssetEntry {
    const existing = this.assetByPath.get(path);
    if (existing) return existing;
    const id = randomUUID();
    const entry: AssetEntry = { id, path, mime };
    this.assets.set(id, entry);
    this.assetByPath.set(path, entry);
    return entry;
  }

  getAsset(id: string): AssetEntry | undefined {
    return this.assets.get(id);
  }
}

export const store = new Store();
