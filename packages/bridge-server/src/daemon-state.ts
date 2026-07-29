/**
 * daemon 状态管理：让同一个项目只跑一个 daemon，并能被后续进程复用。
 *
 * 状态文件位置：~/.aicanvas/daemons/<projectRoot 哈希>.json
 * 之所以放用户目录而非项目内，是因为它是「运行时状态」而非项目数据，
 * 不该被提交到版本库。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { projectRoot } from './project.js';

export interface DaemonState {
  projectRoot: string;
  pid: number;
  port: number;
  host: string;
  startedAt: number;
  logFile: string;
}

/** daemon 运行时状态根目录 */
export function stateDir(): string {
  const home = process.env.AICANVAS_HOME ?? path.join(os.homedir(), '.aicanvas');
  return path.join(home, 'daemons');
}

/** 当前项目对应的状态文件路径 */
export function stateFile(root = projectRoot()): string {
  const hash = createHash('sha256').update(root).digest('hex').slice(0, 16);
  return path.join(stateDir(), `${hash}.json`);
}

/** daemon 日志文件路径（detached 进程不能继承 stdio，必须落文件） */
export function logFile(root = projectRoot()): string {
  const hash = createHash('sha256').update(root).digest('hex').slice(0, 16);
  return path.join(stateDir(), `${hash}.log`);
}

export function readState(root = projectRoot()): DaemonState | undefined {
  const file = stateFile(root);
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as DaemonState;
  } catch {
    // 状态文件损坏等同于不存在，交由调用方重建
    return undefined;
  }
}

export function writeState(state: DaemonState): void {
  fs.mkdirSync(stateDir(), { recursive: true });
  const file = stateFile(state.projectRoot);
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}

export function clearState(root = projectRoot()): void {
  try {
    fs.rmSync(stateFile(root), { force: true });
  } catch {
    // 清理失败不阻塞主流程
  }
}

/** 进程是否存活（信号 0 只做存在性探测，不实际发送） */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * 判断状态文件描述的 daemon 是否真的可用。
 *
 * 必须三条同时成立，缺一即视为陈旧：
 *  1. 状态文件存在
 *  2. pid 进程存活
 *  3. /api/health 返回的 projectRoot 与预期一致
 *
 * 第 3 条不可省略：pid 可能已被系统回收并复用给了别的进程。
 */
export async function probeDaemon(root = projectRoot()): Promise<DaemonState | undefined> {
  const state = readState(root);
  if (!state) return undefined;
  if (!pidAlive(state.pid)) {
    clearState(root);
    return undefined;
  }
  try {
    const res = await fetch(`http://${state.host}:${state.port}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) throw new Error(`health ${res.status}`);
    const body = (await res.json()) as { projectRoot?: string };
    if (body.projectRoot !== root) throw new Error('projectRoot mismatch');
    return state;
  } catch {
    // 端口不通或项目不匹配：该状态已失效
    clearState(root);
    return undefined;
  }
}

/** 端口是否可用 */
function portFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

/**
 * 选择监听端口：优先用偏好端口（默认 4399），
 * 被占用时让系统分配空闲端口，从而支持多项目并存。
 */
export async function pickPort(preferred: number, host: string): Promise<number> {
  if (await portFree(preferred, host)) return preferred;
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, host, () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}
