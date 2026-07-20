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
    const node = store.addNode(req.body);
    broadcast({ type: 'add_node', node });
    res.json(node);
  });
  app.get('/api/nodes', (_req, res) => res.json(store.listNodes()));
  app.post('/api/clear', (_req, res) => {
    store.clear();
    broadcast({ type: 'clear' });
    res.json({ ok: true });
  });
  app.get('/api/queue', (_req, res) => res.json(store.peekQueue()));
  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, clients: clientCount(), nodes: store.listNodes().length })
  );

  // 静态托管前端打包产物（若已 build）
  const webDist = path.resolve(__dirname, '../../canvas-web/dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
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

  const server = createHttpServer();
  initWebSocket(server);

  await new Promise<void>((resolve) => {
    server.listen(config.port, config.host, resolve);
  });
  log(`HTTP + WS listening at ${canvasUrl()}`);

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
