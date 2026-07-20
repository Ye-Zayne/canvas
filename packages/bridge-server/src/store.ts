/**
 * 共享状态：画布节点集合 + 拉取队列 + 本地资产映射。
 * MVP 使用内存存储，单画布单用户。
 */
import { randomUUID } from 'node:crypto';
import type { CanvasNode } from './types.js';

export interface AssetEntry {
  id: string;
  path: string;
  mime: string;
}

class Store {
  /** 画布上当前所有节点，按插入顺序 */
  private nodes = new Map<string, CanvasNode>();
  /** 用户在画布上「加入对话」入队、待 Agent 拉取的节点 */
  private pullQueue: CanvasNode[] = [];
  /** 本地文件资产：assetId -> 磁盘路径 */
  private assets = new Map<string, AssetEntry>();

  // ---- 节点 ----
  addNode(partial: Omit<CanvasNode, 'id' | 'createdAt'> & { id?: string }): CanvasNode {
    const node: CanvasNode = {
      id: partial.id ?? randomUUID(),
      kind: partial.kind,
      title: partial.title,
      content: partial.content,
      assetUrl: partial.assetUrl,
      mime: partial.mime,
      meta: partial.meta,
      createdAt: Date.now(),
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

  removeNode(id: string): boolean {
    return this.nodes.delete(id);
  }

  clear(): void {
    this.nodes.clear();
  }

  listNodes(): CanvasNode[] {
    return [...this.nodes.values()];
  }

  /** 用画布全量快照覆盖（浏览器同步用） */
  replaceAll(nodes: CanvasNode[]): void {
    this.nodes.clear();
    for (const n of nodes) this.nodes.set(n.id, n);
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
  registerAsset(path: string, mime: string): AssetEntry {
    const id = randomUUID();
    const entry: AssetEntry = { id, path, mime };
    this.assets.set(id, entry);
    return entry;
  }

  getAsset(id: string): AssetEntry | undefined {
    return this.assets.get(id);
  }
}

export const store = new Store();
