# 更新日志

本文件记录 AI 对话画布（AI Canvas）的所有重要变更。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.4.0] - 2026-07-28

### 新增

- **一键安装脚本 `install.sh`**：执行一次即可完成环境检查、依赖安装、
  构建与客户端注册，用户无需手动编辑任何配置文件。
- 新增 `scripts/register-mcp.mjs`，负责把画布注册到 AI 客户端：
  - 支持 Codex（`~/.codex/config.toml`）与 Claude Code（`~/.claude.json`）。
  - **幂等**：重复执行只更新已有条目，不会产生重复配置。
  - 修改前自动备份为 `.bak`，且不影响文件中其他 MCP 服务与配置段落。
  - 正确处理包含中文、空格、冒号的项目路径，并显式注入 Node 所在目录到 PATH。

### 变更

- README 快速开始改为以一键安装为主，手动安装步骤保留为备选方案。

## [0.3.0] - 2026-07-28

### 变更（破坏性）

- **画布引擎从 tldraw 更换为 [React Flow](https://reactflow.dev)（`@xyflow/react`）**，
  原因是 tldraw 的授权方式不适用于商业场景；React Flow 采用 MIT 许可，可商用。
- 前端打包体积从 **1870 KB 降至 525 KB**（gzip 后 577 KB → 166 KB）。

### 新增

- 全新 `CardNode`（React Flow 自定义节点），完整复用原有内容渲染能力：
  文本、Markdown、图片、视频、音频、文件。
- 卡片支持拖拽移动（标题栏为把手）、边角拉伸调整尺寸、多选与框选、节点间连线。
- 画布内置缩放控件、小地图与网格背景。

### 移除

- 移除 `tldraw` 依赖及其自定义 shape 实现（`CanvasCardShape`、`CardBody`）。
- 不再支持自由手绘与图形旋转（React Flow 为节点画布，非白板）。

### 修复

- **修复画布白屏**：`/assets/:id` 资产代理会拦截 Vite 构建产物
  （`/assets/index-*.js`、`*.css`）并返回 404，导致前端无法挂载。
  现在未注册的资产 id 会放行给静态托管中间件。
- 修复 SPA 兜底路由会把缺失的静态资源请求返回 `index.html`，
  掩盖真实 404 的问题；带扩展名的路径不再进入兜底。

## [0.2.0] - 2026-07-20

### 新增

- **MCP Apps 内嵌画布**：在支持 [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview)
  的客户端（如 Claude）中，画布可直接渲染在对话面板内，无需切换到浏览器。
- 通信适配层 `CanvasTransport`，将画布与底层通信方式解耦：
  - `WsTransport` — 浏览器模式，基于 WebSocket。
  - `McpAppTransport` — 内嵌模式，基于 postMessage JSON-RPC（未引入外部 SDK）。
- 运行时自动探测宿主环境（`?embed=1`）并切换传输方式，不支持内嵌时回退浏览器。
- 新增 MCP 工具：
  - `canvas_show` — 内嵌打开画布（挂载 `_meta.ui` 指向 UI 资源）。
  - `canvas_enqueue` — 内嵌画布内部调用，将选中卡片加入拉取队列。
- 新增 UI 资源 `ui://canvas/app.html`（装壳页），画布脚本经 CSP 白名单
  从本地 bridge-server 加载，内嵌与浏览器共用同一份构建产物。

### 变更

- 两种形态下「加入对话」行为保持一致：均为入队 + `/canvas-pull` 拉取。

## [0.1.0] - 2026-07-20

### 新增

- 首个版本。基于 tldraw + shadcn/ui 的对话画布，通过内置 MCP Server
  与 codex / claude code 双向通信。
- Agent → 画布：`canvas_add_text`、`canvas_add_image`、`canvas_add_media`、
  `canvas_add_file` 将内容以卡片形式推送到画布。
- 画布 → Agent：选中卡片「加入对话」入队，客户端执行 `/canvas-pull` 带回上下文。
- MCP 能力：tools、prompts（slash 命令）、resources（`@` 引用）。
- bridge-server：MCP（stdio）+ WebSocket + REST + 静态托管 + 本地文件代理。
- 工程化：ESLint、Prettier、GitHub Actions CI/Release、Dependabot、PR/Issue 模板。

[0.4.0]: https://github.com/Ye-Zayne/canvas/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Ye-Zayne/canvas/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Ye-Zayne/canvas/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Ye-Zayne/canvas/releases/tag/v0.1.0
