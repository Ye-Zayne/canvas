# AI 对话画布（AI Canvas）

[![CI](https://github.com/Ye-Zayne/canvas/actions/workflows/ci.yml/badge.svg)](https://github.com/Ye-Zayne/canvas/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

一个可长期固定在 **codex / claude code** 里的对话画布插件。基于 **React Flow + shadcn/ui**，通过内置 **MCP Server** 与 Agent 双向通信：

- **Agent → 画布**：Agent 把生成的文本、Markdown、图片、视频、音频、任意文件，以独立卡片的形式实时推送到画布，支持拖拽、缩放、拉伸、多选框选、节点连线等操作。
- **画布 → Agent**：在画布上点选卡片 →「加入对话」，再在 codex / claude code 里用 `/canvas-pull` 把这些内容作为上下文带回对话流。

## 两种形态（自动切换）

同一套画布，运行时自动选择渲染方式：

| 形态 | 触发条件 | 体验 |
| --- | --- | --- |
| **内嵌画布**（MCP Apps） | 客户端支持 [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview)（如 Claude / Claude Desktop） | 调用 `canvas_show` 后画布**直接嵌在对话面板内** |
| **浏览器画布**（回退） | 不支持 MCP Apps 的客户端（如当前的 Codex） | 调用 `canvas_open` 打开 `http://127.0.0.1:4399` |

> MCP Apps 是 MCP 官方协议的开放扩展。内嵌模式下，`ui://canvas/app.html` 只是一个装壳页，真正的画布 JS/CSS 通过 CSP 白名单从本地 `bridge-server` 加载，因此内嵌与浏览器共用同一份构建产物。两端「加入对话」行为一致（入队 + `/canvas-pull`）。

## 架构

```
codex / claude code
   │
   ├─ stdio(MCP) ──► bridge-server ──┬─ WebSocket ──► 浏览器画布(React Flow) [浏览器模式]
   │                                 └─ ui://资源 ──► 内嵌 iframe 画布      [MCP Apps 模式]
   │                                    （express 托管前端 + 代理本地文件）
```

- `packages/canvas-web`：React + Vite + TypeScript + React Flow（`@xyflow/react`，MIT）+ shadcn/ui 画布前端。
- `packages/bridge-server`：Node 服务，同时是 MCP Server（被 Agent 连接）+ WebSocket/REST 服务（被浏览器连接）+ 静态托管 + 本地文件代理。

## 快速开始

### 一键安装（推荐）

```bash
cd ai-canvas
./install.sh
```

脚本会自动完成：环境检查 → 安装依赖 → 构建 → 注册到 Codex / Claude Code。
**无需手动编辑任何配置文件。**

安装完成后：

1. 完全退出并重启 Codex / Claude Code（务必 `Cmd + Q`，关窗口无效）
2. 新建对话，输入「打开画布」
3. 在浏览器打开返回的地址即可使用

> 脚本可重复执行（幂等）。代码更新后再跑一次即可，不会产生重复配置；
> 修改前会自动备份为 `config.toml.bak` / `.claude.json.bak`。

---

### 手动安装

若你想自行控制每一步：

#### 1. 安装依赖

```bash
cd ai-canvas
pnpm install
```

> 若你的目录路径包含冒号 `:`（如本项目），pnpm 无法把 `.bin` 加入 PATH。项目已内置 `scripts/run-bin.mjs` 自动绕过，无需额外处理。

#### 2. 构建

```bash
pnpm build
```

#### 3. 启动

```bash
./start.sh
# 或
pnpm start
```

启动后画布地址：**http://127.0.0.1:4399**（可用环境变量 `CANVAS_PORT` 修改端口）。

#### 4. 注册到客户端

只做注册（不重新构建）：

```bash
node scripts/register-mcp.mjs "$(pwd)/packages/bridge-server/dist/index.js"
```

或参考下方「接入 codex / claude code」手动填写配置。

### 开发模式（热更新）

分两个终端：

```bash
pnpm dev:server   # 启动 bridge-server（HTTP+WS+MCP）
pnpm dev:web      # 启动 Vite 开发服务器（http://localhost:5173，已代理 /ws /assets /api）
```

## 接入 codex / claude code

> 使用 `./install.sh` 已自动完成下述配置，本节仅供手动配置或排查参考。

### Claude Code

在项目根或全局的 `.mcp.json` 添加：

```json
{
  "mcpServers": {
    "canvas": {
      "command": "node",
      "args": ["<绝对路径>/ai-canvas/packages/bridge-server/dist/index.js"]
    }
  }
}
```

MCP 的 prompts 会自动暴露为 slash 命令，例如：
- `/mcp__canvas__canvas-pull` — 拉取画布上加入对话的内容
- `/mcp__canvas__canvas-open` — 获取画布地址

resources 可用 `@` 引用：`@canvas://selection`、`@canvas://all`。

### Codex

在 `~/.codex/config.toml` 添加：

```toml
[mcp_servers.canvas]
command = "node"
args = ["<绝对路径>/ai-canvas/packages/bridge-server/dist/index.js"]
```

> 注意：Agent 客户端会自行以 stdio 方式 spawn bridge-server。该进程同时会监听 4399 端口提供画布 UI，因此**无需再单独运行** `start.sh`（除非你想在开发模式下调试前端）。

## MCP 能力清单

### Tools（Agent 主动调用）
| 工具 | 说明 |
| --- | --- |
| `canvas_show` | **内嵌打开画布**（支持 MCP Apps 的客户端在对话面板内渲染） |
| `canvas_open` | 返回画布浏览器地址（回退方式） |
| `canvas_add_text` | 推送文本 / Markdown 卡片 |
| `canvas_add_image` | 推送图片（本地路径或 URL） |
| `canvas_add_media` | 推送视频 / 音频 |
| `canvas_add_file` | 推送任意文件卡片（可下载） |
| `canvas_list` | 列出画布上所有卡片摘要 |
| `canvas_pull` | 取出用户「加入对话」的内容（出队） |
| `canvas_enqueue` | 内嵌画布内部调用：把选中卡片入队（一般不由用户直接触发） |

### Prompts（slash 命令）
- `canvas-pull`、`canvas-open`

### Resources（@ 引用）
- `canvas://selection`、`canvas://all`

## 典型用法

1. 让 Agent 生成内容并推到画布：
   > “把这段方案画到画布上” → Agent 调用 `canvas_add_text`
   > “把 /tmp/demo.mp4 放到画布” → Agent 调用 `canvas_add_media`
2. 在浏览器画布里自由排布、缩放这些卡片。
3. 选中若干卡片，点卡片上的「加入对话」或工具栏「选中加入」。
4. 回到 codex / claude code，执行 `/canvas-pull`，选中内容即作为上下文进入对话。

## 目录结构

```
ai-canvas/
├─ package.json              # pnpm workspace 根
├─ pnpm-workspace.yaml
├─ start.sh                  # 一键启动
├─ scripts/run-bin.mjs       # 绕过含 ":" 路径的 bin 启动器
└─ packages/
   ├─ canvas-web/            # 前端画布
   │  └─ src/
   │     ├─ App.tsx
   │     ├─ canvas/CanvasBoard.tsx
   │     ├─ canvas/shapes/{CanvasCardShape,CardBody}.tsx
   │     ├─ components/{Toolbar,QueueDrawer}.tsx
   │     ├─ components/ui/{button,badge,sheet}.tsx
   │     ├─ hooks/useBridge.ts
   │     └─ lib/{types,utils}.ts
   └─ bridge-server/         # MCP + WS + REST
      └─ src/
         ├─ index.ts         # 入口
         ├─ mcp.ts           # MCP tools/prompts/resources
         ├─ ws.ts            # WebSocket 广播
         ├─ store.ts         # 状态 + 拉取队列
         ├─ assets.ts        # 本地文件代理
         ├─ config.ts
         └─ types.ts
```

## 说明与约束

- **本地文件访问**：浏览器不能直接读磁盘，本地媒体统一经 bridge-server 的 `/assets/:id` 代理（支持 Range，视频可拖动进度）。
- **大文件**：优先传路径而非 base64，避免 MCP 消息体过大。
- **单画布**：MVP 为单用户单画布内存状态；持久化（保存/恢复）可后续扩展。
- **端口**：默认 `4399`，用 `CANVAS_PORT` 覆盖。

## 调试（不接 Agent 也能测）

```bash
# 仅起 HTTP+WS，不起 MCP
node packages/bridge-server/dist/index.js --no-mcp

# 直接用 REST 推一张卡片到画布
curl -X POST http://127.0.0.1:4399/api/nodes \
  -H 'Content-Type: application/json' \
  -d '{"kind":"markdown","title":"示例","content":"# Hello\n来自 REST"}'
```
