/**
 * WebSocket 广播层：管理浏览器画布连接，向其推送 PushMsg，
 * 并处理浏览器上报的 ReportMsg（入队、全量同步）。
 */
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { store } from './store.js';
import type { PushMsg, ReportMsg } from './types.js';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export function initWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    clients.add(ws);
    // 新连接立即下发当前快照
    send(ws, { type: 'snapshot', nodes: store.listNodes() });

    ws.on('message', (raw) => {
      let msg: ReportMsg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      handleReport(msg);
    });

    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });
}

function handleReport(msg: ReportMsg): void {
  switch (msg.type) {
    case 'selection_enqueue':
      store.enqueue(msg.nodes);
      break;
    case 'canvas_state':
      store.replaceAll(msg.nodes);
      break;
    case 'hello':
    case 'pong':
      break;
  }
}

function send(ws: WebSocket, msg: PushMsg): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/** 向所有已连接画布广播 */
export function broadcast(msg: PushMsg): void {
  for (const ws of clients) send(ws, msg);
}

export function clientCount(): number {
  return clients.size;
}
