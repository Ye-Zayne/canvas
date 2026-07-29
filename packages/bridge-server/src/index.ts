/**
 * bridge-server 入口：
 *  - 启动 HTTP（express）：静态托管画布前端 + /assets 代理 + REST 调试接口
 *  - 启动 WebSocket：与浏览器画布双向通信
 *  - 启动 MCP（stdio）：被 codex / claude code 连接
 *
 * 用法：
 *   node dist/index.js            # 同时启动 HTTP+WS+MCP（供 Agent 客户端 spawn）
 *   node dist/index.js --no-mcp   # 仅 HTTP+WS（本地开发调试画布用）
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import { config, canvasUrl } from './config.js';
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
import { docPath } from './project.js';
import { startMcp } from './mcp.js';

const log = (...a: unknown[]) => console.error('[bridge]', ...a);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createHttpServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '25mb' }));

  // 本地资产代理
  app.get('/assets/:id', serveAsset);

  // REST 调试接口：直接推送节点（不经 MCP，便于本地测试）
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
  app.get('/api/queue', (_req, res) => res.json(store.peekQueue()));
  // 客户端环境（前端据此切换交互与文案）
  app.get('/api/client', (_req, res) => res.json(getClientEnv()));
  app.get('/api/health', (_req, res) =>
    res.json({
      ok: true,
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

async function main() {
  const noMcp = process.argv.includes('--no-mcp');

  // 先从磁盘恢复画布（含素材重注册与断链检测）
  initCanvas();

  const server = createHttpServer();
  initWebSocket(server);

  await new Promise<void>((resolve) => {
    server.listen(config.port, config.host, resolve);
  });
  log(`HTTP + WS listening at ${canvasUrl()}`);

  // 退出前把挂起的变更落盘，避免丢失最后一次拖动
  const shutdown = () => {
    flush();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('beforeExit', () => flush());

  if (!noMcp) {
    await startMcp();
  } else {
    log('MCP disabled (--no-mcp)');
  }
}

main().catch((err) => {
  log('fatal', err);
  process.exit(1);
});
