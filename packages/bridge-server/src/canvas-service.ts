/**
 * 画布服务层：串联 store（内存状态）与 persist（磁盘文档）。
 *
 * 职责：
 *  - 启动时加载文档，并按 sourcePath 重新注册素材、检测断链
 *  - 任何状态变更后请求防抖落盘
 *  - 对外提供带运行时字段（assetUrl / missing）的节点快照
 */
import { store } from './store.js';
import { loadDocument, scheduleWrite, flushWrite } from './persist.js';
import { resolveSource } from './assets.js';
import { docPath } from './project.js';
import type { CanvasNode } from './types.js';

const log = (...a: unknown[]) => console.error('[canvas]', ...a);

/** 加载时的可恢复错误（如 JSON 损坏），供接口暴露给用户 */
let loadError: string | undefined;

export function getLoadError(): string | undefined {
  return loadError;
}

/** 请求落盘（防抖） */
export function persist(): void {
  scheduleWrite(() => store.toDocument());
}

export function flush(): void {
  flushWrite();
}

/**
 * 为节点补齐运行时字段：assetUrl 与 missing。
 * 持久化只存 sourcePath，因此每次对外输出都需派生。
 */
export function hydrateNode(node: CanvasNode): CanvasNode {
  if (!node.sourcePath) return node;
  const { assetUrl, mime, missing } = resolveSource(node.sourcePath);
  return { ...node, assetUrl, mime: node.mime ?? mime, missing };
}

export function hydratedNodes(): CanvasNode[] {
  return store.listNodes().map(hydrateNode);
}

/** 启动时从磁盘恢复画布 */
export function initCanvas(): void {
  const { doc, error } = loadDocument();
  loadError = error;
  if (error) {
    log('加载告警：', error);
  }
  store.loadDocument(doc);

  // 重新注册素材并统计断链
  let missingCount = 0;
  for (const node of store.listNodes()) {
    if (!node.sourcePath) continue;
    const { missing } = resolveSource(node.sourcePath);
    if (missing) missingCount++;
  }

  log(
    `已加载画布：${store.listNodes().length} 个节点，${store.listEdges().length} 条连线` +
      (missingCount ? `，${missingCount} 个素材丢失` : '')
  );
  log(`数据文件：${docPath()}`);
}

/**
 * 修复断链：把节点的素材指向新路径。
 * 返回 undefined 表示节点不存在；missing=true 表示新路径同样不存在。
 */
export function relinkNode(id: string, newPath: string): CanvasNode | undefined {
  const cur = store.getNode(id);
  if (!cur) return undefined;
  const resolved = resolveSource(newPath);
  const next = store.updateNode(id, {
    sourcePath: newPath,
    mime: resolved.mime,
  });
  persist();
  return next ? hydrateNode(next) : undefined;
}
