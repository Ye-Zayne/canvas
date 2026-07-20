/**
 * MCP Server：被 codex / claude code 通过 stdio 连接。
 * 注册 tools（Agent 主动推内容）、prompts（暴露为 slash 命令）、resources（@ 引用）。
 *
 * 重要：stdio 传输下 stdout 专用于 MCP 协议，所有日志必须走 stderr。
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { store } from './store.js';
import { broadcast } from './ws.js';
import { toAssetUrl } from './assets.js';
import { canvasUrl } from './config.js';
import type { CanvasNode } from './types.js';

const log = (...a: unknown[]) => console.error('[mcp]', ...a);

/** 把节点加入 store 并广播到画布 */
function pushNode(partial: Omit<CanvasNode, 'id' | 'createdAt'>): CanvasNode {
  const node = store.addNode(partial);
  broadcast({ type: 'add_node', node });
  return node;
}

/** 把节点列表格式化成给 Agent 读的文本 */
function formatNodes(nodes: CanvasNode[]): string {
  if (nodes.length === 0) return '（画布队列为空）';
  return nodes
    .map((n, i) => {
      const head = `${i + 1}. [${n.kind}] ${n.title ?? '(无标题)'}`;
      if (n.content) return `${head}\n${n.content}`;
      if (n.assetUrl) return `${head}\n资源: ${n.assetUrl}`;
      return head;
    })
    .join('\n\n');
}

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'ai-canvas', version: '0.1.0' });

  // ---- Tools ----
  server.tool('canvas_open', '打开/获取画布的浏览器地址。用户想查看画布时调用。', {}, async () => ({
    content: [{ type: 'text', text: `画布地址：${canvasUrl()}\n请在浏览器中打开以查看内容。` }],
  }));

  server.tool(
    'canvas_add_text',
    '把一段文本或 Markdown 内容以卡片形式推送到画布上。',
    {
      content: z.string().describe('文本或 Markdown 内容'),
      title: z.string().optional().describe('卡片标题'),
      markdown: z.boolean().optional().describe('是否按 Markdown 渲染，默认 true'),
    },
    async ({ content, title, markdown }) => {
      const node = pushNode({
        kind: markdown === false ? 'text' : 'markdown',
        title,
        content,
      });
      return { content: [{ type: 'text', text: `已推送到画布（id=${node.id}）` }] };
    }
  );

  server.tool(
    'canvas_add_image',
    '把一张图片推送到画布。支持本地文件路径或 http(s)/data URL。',
    {
      url: z.string().describe('图片的本地路径或 URL'),
      title: z.string().optional(),
    },
    async ({ url, title }) => {
      const { url: assetUrl, mime } = toAssetUrl(url);
      const node = pushNode({ kind: 'image', title, assetUrl, mime });
      return { content: [{ type: 'text', text: `已推送图片到画布（id=${node.id}）` }] };
    }
  );

  server.tool(
    'canvas_add_media',
    '把视频或音频推送到画布。支持本地文件路径或 URL。',
    {
      kind: z.enum(['video', 'audio']).describe('媒体类型'),
      url: z.string().describe('媒体的本地路径或 URL'),
      title: z.string().optional(),
    },
    async ({ kind, url, title }) => {
      const { url: assetUrl, mime } = toAssetUrl(url);
      const node = pushNode({ kind, title, assetUrl, mime });
      return { content: [{ type: 'text', text: `已推送${kind}到画布（id=${node.id}）` }] };
    }
  );

  server.tool(
    'canvas_add_file',
    '把任意文件以文件卡片形式推送到画布（可预览/下载）。',
    {
      path: z.string().describe('文件的本地路径或 URL'),
      title: z.string().optional(),
    },
    async ({ path: p, title }) => {
      const { url: assetUrl, mime } = toAssetUrl(p);
      const node = pushNode({
        kind: 'file',
        title: title ?? p.split('/').pop(),
        assetUrl,
        mime,
        meta: { source: p },
      });
      return { content: [{ type: 'text', text: `已推送文件到画布（id=${node.id}）` }] };
    }
  );

  server.tool('canvas_list', '列出画布上当前所有组件的摘要。', {}, async () => ({
    content: [{ type: 'text', text: formatNodes(store.listNodes()) }],
  }));

  server.tool(
    'canvas_pull',
    '取出用户在画布上「加入对话」的选中内容（出队并清空队列），作为上下文带入本次对话。',
    {},
    async () => {
      const nodes = store.drainQueue();
      const text =
        nodes.length === 0
          ? '当前没有待拉取的内容。请先在画布上选中组件并点击「加入对话」。'
          : `以下是用户从画布带入的内容：\n\n${formatNodes(nodes)}`;
      return { content: [{ type: 'text', text }] };
    }
  );

  // ---- Prompts（暴露为 slash 命令）----
  server.prompt('canvas-pull', '拉取画布上选中并加入对话的内容', async () => {
    const nodes = store.drainQueue();
    const text =
      nodes.length === 0
        ? '当前画布队列为空。请先在画布上选中组件并点击「加入对话」，再执行本命令。'
        : `请参考以下我从画布带入的内容继续：\n\n${formatNodes(nodes)}`;
    return {
      messages: [{ role: 'user', content: { type: 'text', text } }],
    };
  });

  server.prompt('canvas-open', '打开对话画布', async () => ({
    messages: [
      {
        role: 'user',
        content: { type: 'text', text: `请打开画布查看：${canvasUrl()}` },
      },
    ],
  }));

  // ---- Resources（@ 引用）----
  server.resource(
    'canvas-selection',
    'canvas://selection',
    { description: '画布上当前已加入对话队列的内容', mimeType: 'text/plain' },
    async (uri) => ({
      contents: [{ uri: uri.href, text: formatNodes(store.peekQueue()) }],
    })
  );

  server.resource(
    'canvas-all',
    'canvas://all',
    { description: '画布上的全部内容', mimeType: 'text/plain' },
    async (uri) => ({
      contents: [{ uri: uri.href, text: formatNodes(store.listNodes()) }],
    })
  );

  return server;
}

export async function startMcp(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('MCP server connected over stdio');
}
