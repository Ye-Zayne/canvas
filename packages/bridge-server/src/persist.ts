/**
 * 画布持久化：读写 .aicanvas/canvas.json。
 *
 * 设计要点：
 *  - 原子写入：先写临时文件再 rename，中断不会留下损坏文件
 *  - 防抖：拖动会产生高频变更，合并后再落盘
 *  - 容错：JSON 非法时报可恢复错误并保留原文件，绝不清空用户画布
 */
import fs from 'node:fs';
import path from 'node:path';
import { docPath, ensureDataDir } from './project.js';
import type { CanvasDocument } from './types.js';

const log = (...a: unknown[]) => console.error('[persist]', ...a);

const WRITE_DEBOUNCE_MS = 500;

let timer: NodeJS.Timeout | null = null;
let pendingProvider: (() => CanvasDocument) | null = null;

/** 空文档 */
export function emptyDocument(): CanvasDocument {
  return { version: 1, updatedAt: Date.now(), nodes: [], edges: [] };
}

/**
 * 读取文档。
 * - 文件不存在：返回空文档（首次使用）
 * - 文件损坏：抛出可恢复错误，调用方决定如何提示；不覆盖原文件
 */
export function loadDocument(): { doc: CanvasDocument; error?: string } {
  const file = docPath();
  if (!fs.existsSync(file)) {
    return { doc: emptyDocument() };
  }
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return { doc: emptyDocument(), error: `无法读取 ${file}：${(e as Error).message}` };
  }
  try {
    const parsed = JSON.parse(raw) as CanvasDocument;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.nodes)) {
      throw new Error('结构不符合预期');
    }
    return {
      doc: {
        version: 1,
        updatedAt: parsed.updatedAt ?? Date.now(),
        viewport: parsed.viewport,
        nodes: parsed.nodes,
        edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      },
    };
  } catch (e) {
    // 关键：不清空、不覆盖，交由上层显示可恢复错误
    return {
      doc: emptyDocument(),
      error: `画布文件解析失败，已保留原文件：${file}（${(e as Error).message}）`,
    };
  }
}

/** 立即写盘（原子） */
export function writeDocumentNow(doc: CanvasDocument): void {
  try {
    ensureDataDir();
    const file = docPath();
    const tmp = path.join(path.dirname(file), `.canvas.json.tmp-${process.pid}`);
    const payload = JSON.stringify({ ...doc, updatedAt: Date.now() }, null, 2);
    fs.writeFileSync(tmp, payload);
    fs.renameSync(tmp, file);
  } catch (e) {
    log('写入失败', (e as Error).message);
  }
}

/**
 * 请求写盘（防抖）。
 * 传入 provider 而非快照，确保落盘时取到的是最新状态。
 */
export function scheduleWrite(provider: () => CanvasDocument): void {
  pendingProvider = provider;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const p = pendingProvider;
    pendingProvider = null;
    if (p) writeDocumentNow(p());
  }, WRITE_DEBOUNCE_MS);
}

/** 进程退出前把挂起的变更落盘 */
export function flushWrite(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const p = pendingProvider;
  pendingProvider = null;
  if (p) writeDocumentNow(p());
}
