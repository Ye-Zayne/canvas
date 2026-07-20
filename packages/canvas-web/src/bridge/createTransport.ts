/**
 * 传输探测与创建：
 * 运行时判断是否处于 MCP Apps 宿主 iframe 中。
 * - 是：用 McpAppTransport（内嵌模式）
 * - 否：用 WsTransport（浏览器模式）
 *
 * 探测策略（保守，失败即回退）：
 *  1. 必须在 iframe 中（window.parent !== window）
 *  2. 且 URL 带 ?embed=1 标记（由装壳 HTML 注入）
 */
import type { CanvasTransport } from './transport';
import { WsTransport } from './WsTransport';
import { McpAppTransport } from './McpAppTransport';

export function isEmbeddedHost(): boolean {
  try {
    if (window.parent === window) return false;
    const params = new URLSearchParams(location.search);
    return params.get('embed') === '1';
  } catch {
    return false;
  }
}

export function createTransport(): CanvasTransport {
  if (isEmbeddedHost()) {
    return new McpAppTransport();
  }
  return new WsTransport();
}
