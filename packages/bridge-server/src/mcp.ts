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
import { persist, hydrateNode, relinkNode } from './canvas-service.js';
import type { CanvasNode } from './types.js';

/** MCP Apps 内嵌画布的 UI 资源 URI */
const CANVAS_UI_URI = 'ui://canvas/app.html';

/**
 * 装壳 HTML：iframe 只装壳，画布 JS/CSS 从本地 server 加载（CSP 白名单）。
 * 通过 ?embed=1 让前端探测到内嵌模式，切换到 McpAppTransport。
 */
function embedShellHtml(): string {
  const base = canvasUrl();
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AI Canvas</title>
    <base href="${base}/" />
  </head>
  <body style="margin:0">
    <iframe
      src="${base}/?embed=1"
      style="border:0;width:100vw;height:100vh;display:block"
      allow="clipboard-write; autoplay"
    ></iframe>
  </body>
</html>`;
}

const log = (...a: unknown[]) => console.error('[mcp]', ...a);

/** 把节点加入 store 并广播到画布，同时请求落盘 */
function pushNode(partial: Omit<CanvasNode, 'id' | 'createdAt'>): CanvasNode {
  const node = hydrateNode(store.addNode(partial));
  broadcast({ type: 'add_node', node });
  persist();
  return node;
}

/** 把节点列表格式化成给 Agent 读的文本 */
function formatNodes(nodes: CanvasNode[]): string {
  if (nodes.length === 0) return '（画布队列为空）';
  return nodes
    .map((n, i) => {
      const head = `${i + 1}. [${n.kind}] ${n.title ?? '(无标题)'}`;
      if (n.content) return `${head}\n${n.content}`;
      if (n.missing) return `${head}\n素材已丢失（原路径：${n.sourcePath}）`;
      if (n.assetUrl) return `${head}\n资源: ${n.assetUrl}`;
      if (n.sourcePath) return `${head}\n资源: ${n.sourcePath}`;
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

  // MCP Apps：在支持的宿主里内嵌渲染画布面板。工具挂 _meta.ui 指向 UI 资源。
  server.registerTool(
    'canvas_show',
    {
      description: '在客户端内嵌打开对话画布（支持 MCP Apps 的客户端会直接在对话面板内渲染）。',
      inputSchema: {},
      _meta: {
        'openai/outputTemplate': CANVAS_UI_URI,
        ui: {
          resourceUri: CANVAS_UI_URI,
          preferredSize: { width: 1280, height: 800 },
          csp: {
            // 允许内嵌 iframe 从本地 bridge-server 加载画布 JS/CSS 与本地资产
            resourceDomains: [canvasUrl()],
          },
        },
      },
    },
    async () => ({
      content: [{ type: 'text', text: `画布已打开。若客户端不支持内嵌，请访问：${canvasUrl()}` }],
      _meta: { ui: { resourceUri: CANVAS_UI_URI } },
    })
  );

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
      const { mime } = toAssetUrl(url);
      const node = pushNode({ kind: 'image', title, sourcePath: url, mime });
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
      const { mime } = toAssetUrl(url);
      const node = pushNode({ kind, title, sourcePath: url, mime });
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
      const { mime } = toAssetUrl(p);
      const node = pushNode({
        kind: 'file',
        title: title ?? p.split('/').pop(),
        sourcePath: p,
        mime,
        meta: { source: p },
      });
      return { content: [{ type: 'text', text: `已推送文件到画布（id=${node.id}）` }] };
    }
  );

  server.tool('canvas_list', '列出画布上当前所有组件的摘要。', {}, async () => ({
    content: [{ type: 'text', text: formatNodes(store.listNodes().map(hydrateNode)) }],
  }));

  server.tool(
    'canvas_relink',
    '修复画布上素材已丢失的卡片：把它重新指向新的文件路径。',
    {
      id: z.string().describe('卡片的节点 id'),
      path: z.string().describe('新的本地文件路径或 URL'),
    },
    async ({ id, path: p }) => {
      const node = relinkNode(id, p);
      if (!node) {
        return { content: [{ type: 'text', text: `未找到节点 ${id}` }] };
      }
      broadcast({ type: 'update_node', id, patch: node });
      const text = node.missing ? `已更新路径，但新路径仍不存在：${p}` : `已修复素材指向：${p}`;
      return { content: [{ type: 'text', text }] };
    }
  );

  // 内嵌模式：画布 iframe 通过 tools/call 调此工具把选中项入队（等价浏览器的 selection_enqueue）
  server.tool(
    'canvas_enqueue',
    '把画布上用户选中的节点加入拉取队列（内嵌画布内部调用，一般不由用户直接触发）。',
    {
      nodes: z
        .array(
          z.object({
            id: z.string(),
            kind: z.enum(['text', 'markdown', 'image', 'video', 'audio', 'file']),
            title: z.string().optional(),
            content: z.string().optional(),
            assetUrl: z.string().optional(),
            mime: z.string().optional(),
            createdAt: z.number().optional(),
          })
        )
        .describe('要加入对话队列的节点列表'),
    },
    async ({ nodes }) => {
      store.enqueue(nodes as CanvasNode[]);
      return {
        content: [
          { type: 'text', text: `已加入 ${nodes.length} 项到对话队列，可执行 /canvas-pull 拉取。` },
        ],
      };
    }
  );

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

  // ---- MCP Apps UI 资源（内嵌画布装壳 HTML）----
  server.resource(
    'canvas-app',
    CANVAS_UI_URI,
    {
      description: '内嵌对话画布的 UI 资源（MCP Apps）',
      mimeType: 'text/html+skybridge',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/html+skybridge',
          text: embedShellHtml(),
          _meta: {
            ui: {
              csp: { resourceDomains: [canvasUrl()] },
              preferredSize: { width: 1280, height: 800 },
            },
          },
        },
      ],
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
