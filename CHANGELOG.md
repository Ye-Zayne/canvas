# 更新日志

本文件记录 AI 对话画布（AI Canvas）的所有重要变更。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

### 新增

- **Codex plugin 一句话安装**：仓库新增标准
  `.codex-plugin/plugin.json`、`.mcp.json` 与 marketplace 清单。
  插件内置已打包的 MCP server 和画布前端，安装后无需再执行
  `pnpm install`、构建或手动修改 `config.toml`。
- 新增 `stable` 发布流：`main` 的 push CI 全部通过后，自动将对应的已测试提交
  快进到 `stable` 分支，供 plugin marketplace 固定安装。
- **项目级 daemon**：画布服务不再依赖某个对话存活。
  客户端退出只会结束轻量的 MCP 进程，daemon 与画布数据不受影响。
  - MCP 进程改为无状态，所有画布操作经 HTTP 转给 daemon；
    进程以 `detached` 方式脱离父进程，日志落到
    `~/.aicanvas/daemons/<哈希>.log`（不能继承 stdio，否则污染 MCP 协议通道）。
  - **一个项目一个 daemon**：状态记录在 `~/.aicanvas/daemons/<哈希>.json`
    （可用 `AICANVAS_HOME` 改位置），同项目重复启动会复用。
  - **多项目并存**：偏好端口 4399 被占用时自动改用系统分配的空闲端口。
  - **僵尸状态自动清理**：复用判定要求状态文件存在、pid 存活、
    且健康接口返回的 `projectRoot` 一致三条同时成立
    （只判 pid 不安全——pid 可能已被系统复用给别的进程）。
  - 新增管理命令 `pnpm daemon` / `daemon:status` / `daemon:stop`。
- **画布持久化**：内容保存到项目目录 `.aicanvas/canvas.json`，
  刷新页面或重启服务后完整恢复，不再「刷新即清空」。
  - 节点位置与尺寸完全持久化：拖到哪、拉多大，下次打开一模一样。
  - 视口（缩放与平移）一并保存，重新打开回到上次的视野。
  - 节点间连线一并保存。
  - 原子写入（先写临时文件再 rename），中断不会产生损坏文件。
  - 写盘防抖 500ms，拖动过程不会高频写磁盘；进程退出前强制落盘。
  - 文件损坏时**保留原文件**、报可恢复错误（可从 `/api/health` 的
    `loadError` 读取），绝不清空用户画布。
- **素材只存路径引用，不复制文件**：`canvas.json` 只保存素材的原始磁盘路径，
  视频等大文件不占用额外空间，修改源文件即时生效。
  - 加载时按路径重新注册为可访问资产（浏览器无法直接读磁盘，需经代理）。
- **断链处理**：源文件被移动或删除时，卡片显示明确的「素材已丢失」占位，
  并展示原始绝对路径便于定位，提供「重新指定路径」就地修复；
  绝不静默空白或报错。
  - 新增 MCP 工具 `canvas_relink` 与接口 `POST /api/nodes/:id/relink`。
- `/api/health` 增加 `dataFile` 与 `loadError` 字段，便于排查。
- 支持通过环境变量 `CANVAS_PROJECT_DIR` 指定项目根目录，
  默认使用服务启动时的工作目录。

### 变更

- **依赖全量升级**（处理 Dependabot PR #1–#5、#7–#10）：
  - GitHub Actions：`checkout` v4→v7、`setup-node` v4→v7、`upload-artifact` v4→v7、
    `cache` v4→v6、`pnpm/action-setup` v4→v6。
  - `sonner` 1.7.4 → 2.0.7（大版本；已在浏览器实测 toast 行为正常）。
  - `globals` 15→17、`typescript-eslint` → 8.65、`prettier` → 3.9.6、
    `postcss` → 8.5.23、`eslint-plugin-react-refresh` 0.4→0.5。
  - `@vitejs/plugin-react` 4 → **5.2.0**（未采用 6.x：其要求 vite 8，
    当前为 vite 6；5.2.0 兼容 vite 4~8）。
- 小地图尺寸缩小，避免遮挡右下角卡片上的按钮。

### 修复

- **修复 CI 全部检查失败**：
  - workflow 与 `package.json` 重复指定 pnpm 版本导致 `Setup pnpm` 步骤直接报错退出。
  - ESLint 未忽略 `release/`（本地打包产物），产生 5000+ 条误报。
  - 5 个文件不符合 Prettier 规范，导致 `format:check` 失败。
- CI Node 版本 20 → 22（runner 已弃用 Node 20）。

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
