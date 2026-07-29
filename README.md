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
   ├─ stdio(MCP) ──► MCP 进程（轻量无状态）
                        │ HTTP
                        ▼
                     daemon（detached，不随客户端退出）
                     ├─ WebSocket ──► 浏览器画布(React Flow) [浏览器模式]
                     ├─ ui://资源 ──► 内嵌 iframe 画布      [MCP Apps 模式]
                     └─ 持久化 ────► <项目根>/.aicanvas/canvas.json
```

- `packages/canvas-web`：React + Vite + TypeScript + React Flow（`@xyflow/react`，MIT）+ shadcn/ui 画布前端。
- `packages/bridge-server`：同一份代码两种角色——**MCP 进程**（被客户端 spawn，只做协议转发）与 **daemon**（持有画布状态，提供 HTTP/WS/静态托管/本地文件代理）。

## 快速开始

### Codex plugin 一句话安装（推荐）

直接对 Codex 说：

> 帮我从 stable 分支安装这个 Codex plugin：https://github.com/Ye-Zayne/canvas.git

Codex 会添加仓库 marketplace 并安装 `ai-canvas` plugin。等安装完成后，
新建一个任务，再说「打开画布」即可。

对应的手动命令是：

```bash
codex plugin marketplace add https://github.com/Ye-Zayne/canvas.git --ref stable
codex plugin add ai-canvas@ai-canvas
```

插件已经内置可直接运行的 MCP server 与画布前端；不需要克隆仓库、
运行 `pnpm install`、手动构建或修改 `~/.codex/config.toml`。

### 一键安装（推荐）

以下脚本方式同时支持 Codex 与 Claude Code：

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

> 注意：Agent 客户端会自行以 stdio 方式 spawn MCP 进程，该进程会自动拉起（或复用）项目级 daemon 提供画布 UI，因此**无需再单独运行** `start.sh`（除非你想在开发模式下调试前端）。

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
| `canvas_relink` | 修复素材已丢失的卡片（重新指向新路径） |
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
   │     ├─ canvas/CanvasBoard.tsx    # React Flow 画布
   │     ├─ canvas/CardNode.tsx       # 卡片节点（含断链占位）
   │     ├─ bridge/                   # 通信适配层
   │     ├─ components/{Toolbar,QueueDrawer}.tsx
   │     ├─ hooks/useBridge.ts
   │     └─ lib/{types,mode,utils}.ts
   └─ bridge-server/         # MCP + WS + REST
      └─ src/
         ├─ index.ts         # 入口（MCP / daemon / 调试 三种模式）
         ├─ cli.ts           # daemon start/stop/status
         ├─ mcp.ts           # MCP tools/prompts/resources
         ├─ daemon-client.ts # MCP 侧：确保 daemon 存在 + HTTP 调用
         ├─ daemon-state.ts  # 状态文件、陈旧检测、端口分配
         ├─ ws.ts            # WebSocket 广播
         ├─ store.ts         # 内存状态 + 拉取队列
         ├─ canvas-service.ts # 加载/落盘/素材重注册
         ├─ persist.ts       # .aicanvas/canvas.json 读写（原子+防抖）
         ├─ project.ts       # 项目根目录解析
         ├─ assets.ts        # 本地文件代理
         ├─ config.ts
         └─ types.ts
```

## 数据与持久化

画布内容保存在**项目目录**下，随项目走：

```
<项目根>/.aicanvas/canvas.json
```

保存的内容：节点、连线、**每张卡片的位置与尺寸**、**视口（缩放与平移）**。
刷新页面或重启服务后，画布会完全恢复到上次的样子。

> 项目根默认为**服务启动时的工作目录**，可用环境变量 `CANVAS_PROJECT_DIR` 指定。

### 素材只存路径，不复制文件

`canvas.json` 里只保存素材的**原始磁盘路径**，不把图片视频拷进项目。

| 优点 | 代价 |
| --- | --- |
| 不占额外空间（视频往往很大） | 源文件被移动或删除会**断链** |
| 修改源文件即时生效 | 画布不能整体搬到其他机器 |

**断链后不会默默变空白**：卡片会显示「素材已丢失」占位、列出原始路径，
并提供「重新指定路径」就地修复（也可让 Agent 调 `canvas_relink`）。

### 安全保障

- **原子写入**：先写临时文件再重命名，中断不会产生损坏文件。
- **防抖 500ms**：拖动过程不会高频写盘；退出前强制落盘。
- **损坏容错**：文件非法时**保留原文件**并报可恢复错误（见 `/api/health` 的
  `loadError`），**绝不清空你的画布**。

## 说明与约束

- **本地文件访问**：浏览器不能直接读磁盘，本地媒体统一经 daemon 的 `/assets/:id` 代理（支持 Range，视频可拖动进度）。
- **大文件**：优先传路径而非 base64，避免 MCP 消息体过大。
- **单画布**：当前为单项目单画布（多 Page 尚未支持）。
- **端口**：默认偏好 `4399`，被占用时自动换端口；可用 `CANVAS_PORT` 指定偏好值。
- **本地只读于自己**：daemon 仅监听 `127.0.0.1`，不对外网暴露；本阶段未加访问 token。

## 项目级 daemon

画布服务以 **daemon** 方式运行，**不依赖某个对话存活**：

```
客户端 ──spawn─► MCP 进程（轻量、无状态）
                     │ HTTP
                     ▼
                  daemon（detached，独立存活）
                  ├─ 画布状态 + 持久化
                  └─ HTTP + WebSocket
```

关掉对话、重启客户端，**画布与数据不受影响**。

### 一个项目一个 daemon

状态记录在 `~/.aicanvas/daemons/<项目哈希>.json`（可用 `AICANVAS_HOME` 改位置）。
同一项目重复启动会**复用**已有 daemon；不同项目各自独立、自动分配不同端口。

复用判定需**三条同时成立**：状态文件存在、pid 进程存活、健康接口返回的
`projectRoot` 与当前一致。缺一即视为陈旧并自动清理。

> 为何不能只判 pid：pid 可能已被系统回收并复用给其他进程。

### 管理命令

```bash
pnpm daemon          # 启动（或复用）当前项目的 daemon
pnpm daemon:status   # 查看 pid / 端口 / 运行时长 / 日志位置
pnpm daemon:stop     # 停止（会先落盘再退出）
```

daemon 日志写在 `~/.aicanvas/daemons/<哈希>.log`。
因为 detached 进程不能继承 stdio（会污染 MCP 的 stdio 协议通道），所以日志必须落文件。

## 调试（不接 Agent 也能测）

```bash
# 仅起 HTTP+WS，不起 MCP、不注册 daemon 状态
node packages/bridge-server/dist/index.js --no-mcp

# 直接用 REST 推一张卡片到画布
curl -X POST http://127.0.0.1:4399/api/nodes \
  -H 'Content-Type: application/json' \
  -d '{"kind":"markdown","title":"示例","content":"# Hello\n来自 REST"}'

# 查看 daemon 状态与日志位置
pnpm daemon:status
```

三种运行模式：

| 命令 | 用途 |
| --- | --- |
| `node dist/index.js` | MCP 模式（客户端 spawn），自身无状态，自动确保 daemon 存在 |
| `node dist/index.js --daemon` | daemon 模式（纯服务，一般不手动调用） |
| `node dist/index.js --no-mcp` | 本地调试（单进程，不写状态文件） |
