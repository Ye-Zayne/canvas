/**
 * bridge-server 入口，三种运行模式：
 *
 *   node dist/index.js            默认：MCP 模式。被客户端 spawn，
 *                                 自身只做 MCP 协议，画布状态托管在 daemon。
 *   node dist/index.js --daemon   daemon 模式：纯服务（HTTP + WS + 持久化），
 *                                 detached 运行，不随客户端退出。
 *   node dist/index.js --no-mcp   本地调试：单进程 HTTP + WS，不写状态文件。
 *
 * 拆分 MCP 与 daemon 的原因：客户端退出只会结束 MCP 进程，
 * daemon 与画布数据不受影响。
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import { config, canvasUrl, setActualPort } from './config.js';
import { store } from './store.js';
import { broadcast, initWebSocket, clientCount } from './ws.js';
import { serveAsset } from './assets.js';
import { getClientEnv } from './client-env.js';
import {
  initCanvas,
  persist,
  flush,
  hydratedNodes,
  hydrateNode,
  relinkNode,
  getLoadError,
} from './canvas-service.js';
import { docPath, projectRoot } from './project.js';
import { clearState, pickPort, writeState, logFile } from './daemon-state.js';
import { startMcp } from './mcp.js';
import type { CanvasNode } from './types.js';

const log = (...a: unknown[]) => console.error('[bridge]', ...a);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createHttpServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '25mb' }));

  // 本地资产代理
  app.get('/assets/:id', serveAsset);

  // ---- 画布节点 ----
  app.post('/api/nodes', (req, res) => {
    const node = hydrateNode(store.addNode(req.body));
    broadcast({ type: 'add_node', node });
    persist();
    res.json(node);
  });
  app.get('/api/nodes', (_req, res) => res.json(hydratedNodes()));
  app.post('/api/clear', (_req, res) => {
    store.clear();
    broadcast({ type: 'clear' });
    persist();
    res.json({ ok: true });
  });

  // 修复断链：把节点素材重新指向新路径
  app.post('/api/nodes/:id/relink', (req, res) => {
    const { path: newPath } = req.body ?? {};
    if (typeof newPath !== 'string' || !newPath.trim()) {
      res.status(400).json({ error: '缺少 path' });
      return;
    }
    const node = relinkNode(req.params.id, newPath);
    if (!node) {
      res.status(404).json({ error: '节点不存在' });
      return;
    }
    broadcast({ type: 'update_node', id: node.id, patch: node });
    res.json(node);
  });

  app.get('/api/edges', (_req, res) => res.json(store.listEdges()));

  // ---- 拉取队列 ----
  app.get('/api/queue', (_req, res) => res.json(store.peekQueue()));
  app.post('/api/queue', (req, res) => {
    const { nodes } = req.body ?? {};
    if (!Array.isArray(nodes)) {
      res.status(400).json({ error: '缺少 nodes' });
      return;
    }
    store.enqueue(nodes as CanvasNode[]);
    res.json({ ok: true });
  });
  app.post('/api/queue/drain', (_req, res) => res.json(store.drainQueue()));

  // 客户端环境（前端据此切换交互与文案）
  app.get('/api/client', (_req, res) => res.json(getClientEnv()));

  app.get('/api/health', (_req, res) =>
    res.json({
      ok: true,
      // projectRoot 用于 daemon 复用判定：pid 可能被系统复用，必须叠加此校验
      projectRoot: projectRoot(),
      pid: process.pid,
      port: config.port,
      clients: clientCount(),
      nodes: store.listNodes().length,
      dataFile: docPath(),
      loadError: getLoadError(),
    })
  );

  // 静态托管前端打包产物（若已 build）
  const webDist = path.resolve(__dirname, '../../canvas-web/dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    // SPA 兜底：仅对非静态资源路径返回 index.html，避免掩盖 js/css 404
    app.get('*', (req, res, next) => {
      if (/\.[a-z0-9]+$/i.test(req.path)) return next();
      res.sendFile(path.join(webDist, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) =>
      res.send(
        '<h2>AI Canvas bridge is running.</h2><p>前端尚未构建，请在开发模式下访问 Vite 端口，或先执行 <code>pnpm build</code>。</p>'
      )
    );
  }

  return http.createServer(app);
}

/**
 * 启动画布服务（HTTP + WS + 持久化）。
 * @param registerState 是否写 daemon 状态文件（--no-mcp 调试模式不写，避免污染）
 */
async function startService(registerState: boolean): Promise<void> {
  const root = projectRoot();

  // 先从磁盘恢复画布（含素材重注册与断链检测）
  initCanvas();

  const port = await pickPort(config.port, config.host);
  if (port !== config.port) {
    log(`偏好端口 ${config.port} 被占用，改用 ${port}`);
  }
  setActualPort(port);

  const server = createHttpServer();
  initWebSocket(server);

  await new Promise<void>((resolve) => {
    server.listen(port, config.host, resolve);
  });
  log(`HTTP + WS listening at ${canvasUrl()}`);

  if (registerState) {
    writeState({
      projectRoot: root,
      pid: process.pid,
      port,
      host: config.host,
      startedAt: Date.now(),
      logFile: logFile(root),
    });
    log(`项目：${root}`);
  }

  // 退出前落盘并清理状态文件，避免留下僵尸记录
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    flush();
    if (registerState) clearState(root);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);
  process.on('beforeExit', () => flush());
}

async function main() {
  const argv = process.argv;

  if (argv.includes('--daemon')) {
    // 纯服务模式：由 MCP 进程 detached 拉起
    await startService(true);
    return;
  }

  if (argv.includes('--no-mcp')) {
    // 本地调试：单进程，不注册 daemon 状态
    await startService(false);
    log('MCP disabled (--no-mcp)');
    return;
  }

  // 默认：MCP 模式。画布状态托管在 daemon，本进程只负责协议转发。
  await startMcp();
}

main().catch((err) => {
  log('fatal', err);
  process.exit(1);
});
