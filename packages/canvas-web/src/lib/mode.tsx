/**
 * 画布运行模式上下文：让任意层级组件都能拿到「是否内嵌」与客户端信息，
 * 从而切换交互与文案，无需逐层传递 props。
 */
import { createContext, useContext } from 'react';
import type { ClientEnv } from '@/lib/types';

export interface CanvasMode {
  /** 内嵌在支持 MCP Apps 的客户端内：可直接发回对话 */
  embedded: boolean;
  /** 服务端探测到的客户端信息 */
  clientEnv: ClientEnv;
}

const FALLBACK: CanvasMode = {
  embedded: false,
  clientEnv: { kind: 'unknown', label: 'AI 客户端', pullCommand: '/canvas-pull' },
};

export const CanvasModeContext = createContext<CanvasMode>(FALLBACK);

export function useCanvasMode(): CanvasMode {
  return useContext(CanvasModeContext);
}

/** 卡片主操作按钮的文案：内嵌可直发，浏览器需入队后取回 */
export function actionLabel(embedded: boolean): { idle: string; done: string } {
  return embedded ? { idle: '发送', done: '已发送' } : { idle: '引用', done: '已引用' };
}
