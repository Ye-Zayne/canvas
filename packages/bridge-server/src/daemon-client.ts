/**
 * daemon 客户端：供 MCP 进程使用。
 *
 * MCP 进程本身不再持有画布状态，所有操作都转成对 daemon 的 HTTP 调用。
 * 这样客户端（Codex/Claude）退出时只结束 MCP 进程，daemon 与数据不受影响。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { projectRoot } from './project.js';
import { probeDaemon, readState, logFile, stateDir, type DaemonState } from './daemon-state.js';
import type { CanvasEdge, CanvasNode } from './types.js';

const log = (...a: unknown[]) => console.error('[daemon-client]', ...a);

/** 当前已连上的 daemon 信息 */
let current: DaemonState | undefined;

export function daemonBaseUrl(): string {
  if (!current) throw new Error('daemon 尚未就绪');
  return `http://${current.host}:${current.port}`;
}

export function daemonState(): DaemonState | undefined {
  return current;
}

/**
 * 确保当前项目的 daemon 正在运行：
 *  - 已有可用 daemon：直接复用
 *  - 没有：以 detached 方式拉起一个，并等待其就绪
 */
export async function ensureDaemon(): Promise<DaemonState> {
  const root = projectRoot();

  const existing = await probeDaemon(root);
  if (existing) {
    current = existing;
    log(`复用已有 daemon（pid=${existing.pid}, port=${existing.port}）`);
    return existing;
  }

  await spawnDaemon(root);

  // 等待 daemon 写出状态文件并通过健康检查
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const state = await probeDaemon(root);
    if (state) {
      current = state;
      log(`daemon 已启动（pid=${state.pid}, port=${state.port}）`);
      return state;
    }
    await sleep(200);
  }

  const hint = readState(root) ? '状态文件已写出但健康检查失败' : '未写出状态文件';
  throw new Error(`daemon 启动超时（${hint}），详见日志：${logFile(root)}`);
}

/** 以 detached 方式拉起 daemon */
async function spawnDaemon(root: string): Promise<void> {
  fs.mkdirSync(stateDir(), { recursive: true });
  const out = fs.openSync(logFile(root), 'a');
  const entry = fileURLToPath(new URL('./index.js', import.meta.url));

  const child = spawn(process.execPath, [entry, '--daemon'], {
    cwd: root,
    env: { ...process.env, CANVAS_PROJECT_DIR: root },
    // 关键：不能继承 stdio，否则会污染 MCP 进程的 stdio 协议通道
    stdio: ['ignore', out, out],
    detached: true,
  });
  // 与父进程彻底脱钩，客户端退出不会带走 daemon
  child.unref();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 统一的请求封装，把网络错误转成可读信息 */
async function call<T>(method: 'GET' | 'POST', p: string, body?: unknown): Promise<T> {
  if (!current) await ensureDaemon();
  const url = `${daemonBaseUrl()}${p}`;
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`${method} ${p} 返回 ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (e) {
    const msg = (e as Error).message;
    throw new Error(
      `无法访问画布服务（${msg}）。可尝试重启客户端，或查看日志：${logFile(projectRoot())}`
    );
  }
}

// ---- 画布操作 ----

export function addNode(node: Omit<CanvasNode, 'id' | 'createdAt'>): Promise<CanvasNode> {
  return call<CanvasNode>('POST', '/api/nodes', node);
}

export function listNodes(): Promise<CanvasNode[]> {
  return call<CanvasNode[]>('GET', '/api/nodes');
}

export function clearNodes(): Promise<{ ok: boolean }> {
  return call<{ ok: boolean }>('POST', '/api/clear');
}

export function relink(id: string, path: string): Promise<CanvasNode | { error: string }> {
  return call<CanvasNode>('POST', `/api/nodes/${id}/relink`, { path });
}

export function enqueue(nodes: CanvasNode[]): Promise<{ ok: boolean }> {
  return call<{ ok: boolean }>('POST', '/api/queue', { nodes });
}

export function peekQueue(): Promise<CanvasNode[]> {
  return call<CanvasNode[]>('GET', '/api/queue');
}

export function drainQueue(): Promise<CanvasNode[]> {
  return call<CanvasNode[]>('POST', '/api/queue/drain');
}

export function listEdges(): Promise<CanvasEdge[]> {
  return call<CanvasEdge[]>('GET', '/api/edges');
}

/** 画布地址：给用户在浏览器打开 */
export function canvasAddress(): string {
  return daemonBaseUrl();
}

/** 供 config 使用：默认偏好端口 */
export const preferredPort = config.port;
