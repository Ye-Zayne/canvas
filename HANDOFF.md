# AI 画布 · 交接文档

> 更新时间：2026-07-29
> 用途：换 AI 产品 / 隔几天回来时，读这一份就能接着做。

---

## 一、当前状态

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/Ye-Zayne/canvas |
| 本地路径 | `/Users/zhangye/Downloads/文稿/codeflicker/画布-cc:cx/ai-canvas` |
| 分支 | `main`（工作区干净，全部已推送） |
| 最新提交 | `1bfec5b` 项目级 daemon (#12) |
| package 版本 | 0.4.0（CHANGELOG 有「未发布」段，尚未打 tag） |
| main 分支保护 | **已开启**：必须走 PR + CI 通过；禁止强推/删除；线性历史；管理员可绕过 |

**注意：因为 main 已受保护，之后不能直接 push 到 main，必须开分支走 PR。**

```bash
git checkout -b feat/xxx
# 改代码
git push -u origin feat/xxx
gh pr create --base main --head feat/xxx --title "..." --body "..."
gh pr checks <PR号>          # 等两项 CI 变 pass
gh pr merge <PR号> --squash --delete-branch
```

---

## 二、这是个什么产品

一个**本地开源的 AI 创作画布**，装进 Codex / Claude Code 使用。

- **AI → 画布**：AI 把生成的文本、图片、视频等推成卡片
- **画布 → AI**：选中卡片带回对话作为上下文

技术栈：pnpm monorepo + React Flow（MIT）+ Node/Express + MCP。

### 定位（已讨论确认）

目标是 **Lovart（对话式设计 Agent）+ LibTV（节点式视频画布）的结合体**，
但走一条它们做不到的路：

| | Lovart / LibTV | 本项目 |
|---|---|---|
| 形态 | 云平台 | **本地开源** |
| Agent | 平台自建 | **用户自带**（Codex/Claude） |
| Skill | 平台自定义 | **接用户已有本地 skill** |
| 素材 | 需上传 | **直读本地磁盘** |

> **不拼模型 knowhow（打光球、25宫格那些），拼 Agent 原生集成。**
> 完整讨论见 `.codeflicker/discuss/2026-07-28/canvas-designer-features/outline.md`

### 与 Canvasight 的关系

Canvasight（MIT，Codex 插件）是**任务梳理**工具，数据流是「画布→AI 下单」；
本项目是**媒体创作**，数据流是「AI→画布」。**方向相反，不是竞品。**

已决定**只借鉴它的工程形态，不 fork**（原因：媒体节点与网格布局
撞它两个最硬的设计约束）。决策见 `decisions/D01-borrow-not-fork.md`。

---

## 三、三样基建的进度

顺序：存储 → daemon → plugin

| 阶段 | 内容 | 状态 |
|---|---|---|
| 一 | 画布持久化 + 断链处理 | ✅ 已完成并合入 |
| 二 | 项目级 daemon | ✅ 已完成并合入 |
| 三 | Codex plugin 一句话安装 | ⬜ **下一步** |

### 阶段一成果

画布内容存 `<项目根>/.aicanvas/canvas.json`，刷新/重启完整恢复。

- 节点、连线、**每张卡片位置与尺寸**、**视口**全部持久化
- **素材只存路径引用**，不复制文件（省空间，但换机器会断链）
- 断链时显示「素材已丢失」占位 + 原路径 + 可重新指定
- 原子写入、防抖 500ms、JSON 损坏时保留原文件不清空

### 阶段二成果

画布服务改为 daemon，**关掉对话不受影响**。

```
客户端 ──spawn──► MCP 进程（轻量无状态）
                     │ HTTP
                     ▼
                  daemon（detached 独立存活）
```

- 一个项目一个 daemon，状态在 `~/.aicanvas/daemons/<项目哈希>.json`
- 多项目并存：4399 被占用时自动换端口
- 复用判定要**三条同时成立**：状态文件存在 + pid 存活 + projectRoot 一致
- 命令：`pnpm daemon` / `daemon:status` / `daemon:stop`

---

## 四、下一步：阶段三（Codex plugin）

**目标**：把安装方式从「跑 install.sh」升级成对 Codex 说一句话：

```
帮我从 stable 分支安装这个 Codex plugin：https://github.com/Ye-Zayne/canvas.git
```

**参考对象**：Canvasight 的插件布局
- 插件源码放 `plugins/<name>/`
- marketplace 配置 `.agents/plugins/marketplace.json`
- 安装命令 `codex plugin marketplace add <repo> --ref stable` + `codex plugin add`

**必须先做的调研**（我没有验证过，不要直接照搬）：
1. Codex plugin manifest 的确切格式与必填字段
2. plugin 如何声明自带的 MCP server
3. `stable` 分支的发布流程要怎么配

**这一步的特点（重要）**：
> 代码不难，但**调试链路很长**——每改一次要重装插件 + 重启 Codex + 新建任务
> 才能验证。自动化测不了 Codex 内部的插件加载，**需要人工配合真机验证**。

方案草稿见 `.codeflicker/plan/canvas-persistence/plan-phase2-daemon.md`（阶段二的，
阶段三还没写）。

---

## 五、待办与已知问题

### 待办
- [ ] 阶段三：Codex plugin 形态
- [ ] 打 tag 发版（CHANGELOG「未发布」段已积累阶段一+二内容，建议发 0.5.0）
- [ ] 多选浮出的批量按钮**未经真人鼠标验证**（自动化的合成事件触发不了
      React Flow 的多选，代码路径已核对过）

### 已知取舍（都是有意为之，不是 bug）
- **只存路径** → 换机器/移动素材会断链。缓解措施已做齐（占位+原路径+重新指定）。
- **daemon 不自动退出** → 避免误杀正在用的画布，代价是可能积累常驻进程。
  需要时可加「无连接超 N 小时退出」。
- **daemon 无访问 token** → 只监听 127.0.0.1，加 token 会让浏览器访问复杂化。
- **单画布** → 尚无 Canvasight 那样的多 Page。

### 环境坑
- 目录路径含冒号 `:`，pnpm 无法把 `.bin` 加进 PATH。
  项目内置 `scripts/run-bin.mjs` 绕过，**但 pnpm 本身是全局命令，直接调用即可**
  （别用 run-bin 去跑 pnpm）。
- ESLint 必须忽略 `release/`，否则会 lint 压缩产物报 5000+ 假错误（已配好）。

---

## 六、常用命令

```bash
cd ai-canvas

# 开发
pnpm install
pnpm -r build
pnpm dev:server      # HTTP+WS+MCP
pnpm dev:web         # Vite 热更新

# daemon
pnpm daemon          # 启动或复用
pnpm daemon:status   # pid/端口/运行时长/日志
pnpm daemon:stop

# 本地调试（不起 MCP、不写 daemon 状态）
node packages/bridge-server/dist/index.js --no-mcp
curl -X POST http://127.0.0.1:4399/api/nodes \
  -H 'Content-Type: application/json' \
  -d '{"kind":"markdown","title":"测试","content":"# Hello"}'

# 质量门（提 PR 前必跑）
pnpm lint            # 必须 0 error（4 个 react-refresh warning 是既有的）
pnpm format
pnpm -r build
```

---

## 七、文件地图

```
画布-cc:cx/
├─ ai-canvas/                          ← 主项目
│  ├─ install.sh                       一键安装
│  ├─ scripts/register-mcp.mjs         幂等注册到 Codex/Claude
│  ├─ scripts/run-bin.mjs              绕过含 ":" 路径
│  ├─ CHANGELOG.md                     有「未发布」段
│  └─ packages/
│     ├─ canvas-web/src/
│     │  ├─ App.tsx                    状态中枢、落盘上报
│     │  ├─ canvas/CanvasBoard.tsx     React Flow 画布
│     │  ├─ canvas/CardNode.tsx        卡片 + 断链占位
│     │  ├─ bridge/                    通信适配层（WS / MCP Apps）
│     │  └─ lib/{types,mode}.ts
│     └─ bridge-server/src/
│        ├─ index.ts                   三模式入口
│        ├─ cli.ts                     daemon 管理
│        ├─ mcp.ts                     MCP 工具（已改为调 daemon HTTP）
│        ├─ daemon-client.ts           ensureDaemon + HTTP 封装
│        ├─ daemon-state.ts            状态文件/复用判定/端口
│        ├─ canvas-service.ts          加载/落盘/素材重注册
│        ├─ persist.ts                 canvas.json 原子写入
│        └─ project.ts                 项目根解析
│
└─ .codeflicker/
   ├─ discuss/2026-07-28/canvas-designer-features/
   │  ├─ outline.md                    ★ 定位与决策总览
   │  ├─ decisions/D01-borrow-not-fork.md
   │  ├─ decisions/D02-infra-implementation.md
   │  └─ notes/canvasight-teardown.md  Canvasight 拆解
   └─ plan/canvas-persistence/
      ├─ plan.md                       阶段一方案
      └─ plan-phase2-daemon.md         阶段二方案
```

---

## 八、换产品时怎么开场

把这段话发给新的 AI：

> 我有个本地 AI 创作画布项目在 `/Users/zhangye/Downloads/文稿/codeflicker/画布-cc:cx/ai-canvas`，
> 先读 `HANDOFF.md` 了解全貌，再读
> `.codeflicker/discuss/2026-07-28/canvas-designer-features/outline.md` 了解定位决策。
> 前两个阶段（持久化、daemon）已完成，现在要做阶段三：Codex plugin 一句话安装。
> 注意 main 分支已受保护，必须开分支走 PR。
