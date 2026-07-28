/**
 * 客户端环境的单次探测与缓存。
 * 探测需要 spawn ps，因此只在首次调用时执行。
 */
import { detectClient } from './client-detect.js';
import type { ClientEnv } from './types.js';

let cached: ClientEnv | null = null;

export function getClientEnv(): ClientEnv {
  if (!cached) {
    const info = detectClient();
    cached = { kind: info.kind, label: info.label, pullCommand: info.pullCommand };
    console.error(`[bridge] 检测到客户端：${info.label}（${info.kind}）`);
  }
  return cached;
}
