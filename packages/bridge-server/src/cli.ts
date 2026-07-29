#!/usr/bin/env node
/**
 * daemon 管理 CLI：
 *   node dist/cli.js status   查看当前项目的 daemon 状态
 *   node dist/cli.js stop     停止当前项目的 daemon
 *   node dist/cli.js start    启动（或复用）当前项目的 daemon
 *
 * 「当前项目」由 CANVAS_PROJECT_DIR 或工作目录决定。
 */
import { projectRoot } from './project.js';
import {
  readState,
  probeDaemon,
  clearState,
  pidAlive,
  stateFile,
  logFile,
} from './daemon-state.js';
import { ensureDaemon } from './daemon-client.js';

async function status(): Promise<number> {
  const root = projectRoot();
  console.log(`项目：${root}`);
  console.log(`状态文件：${stateFile(root)}`);
  console.log(`日志：${logFile(root)}`);

  const raw = readState(root);
  if (!raw) {
    console.log('状态：未运行');
    return 0;
  }

  const live = await probeDaemon(root);
  if (!live) {
    console.log(`状态：已失效（记录 pid=${raw.pid}，已清理陈旧记录）`);
    return 0;
  }

  const uptime = Math.round((Date.now() - live.startedAt) / 1000);
  console.log(`状态：运行中`);
  console.log(`  pid   ${live.pid}`);
  console.log(`  地址  http://${live.host}:${live.port}`);
  console.log(`  运行  ${uptime}s`);
  return 0;
}

async function stop(): Promise<number> {
  const root = projectRoot();
  const state = readState(root);
  if (!state) {
    console.log('daemon 未运行');
    return 0;
  }
  if (!pidAlive(state.pid)) {
    clearState(root);
    console.log('daemon 已不在运行，已清理陈旧状态');
    return 0;
  }
  try {
    // SIGTERM 会触发 daemon 的 flush + 清理状态文件
    process.kill(state.pid, 'SIGTERM');
  } catch (e) {
    console.error(`停止失败：${(e as Error).message}`);
    return 1;
  }

  // 等待其真正退出
  for (let i = 0; i < 25; i++) {
    if (!pidAlive(state.pid)) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (pidAlive(state.pid)) {
    console.error(`daemon（pid=${state.pid}）未在预期时间内退出`);
    return 1;
  }
  clearState(root);
  console.log(`已停止 daemon（pid=${state.pid}）`);
  return 0;
}

async function start(): Promise<number> {
  try {
    const state = await ensureDaemon();
    console.log(`daemon 就绪：http://${state.host}:${state.port}（pid=${state.pid}）`);
    return 0;
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
}

async function main() {
  const cmd = process.argv[2] ?? 'status';
  const code = await (cmd === 'stop' ? stop() : cmd === 'start' ? start() : status());
  process.exit(code);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
