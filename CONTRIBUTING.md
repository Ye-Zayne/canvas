# 贡献指南

感谢你对 AI 对话画布的关注！

## 开发环境

- Node.js >= 20
- pnpm 10.x

```bash
pnpm install
pnpm dev:server   # 终端 1：bridge-server（HTTP+WS+MCP）
pnpm dev:web      # 终端 2：Vite 开发服务器
```

> 注意：若项目目录路径含冒号 `:`，pnpm 无法把 `.bin` 加入 PATH。项目内置 `scripts/run-bin.mjs` 自动绕过，所有 `pnpm` 脚本均可正常使用。

## 提交前检查

```bash
pnpm lint          # ESLint
pnpm format        # Prettier 自动格式化
pnpm build         # 构建 + 类型检查
```

## 代码规范

- 使用 TypeScript，避免 `any`（必要时加注释说明）。
- 前端组件遵循 React Hooks 规则。
- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)：`feat:`、`fix:`、`refactor:`、`docs:`、`chore:`、`ci:` 等。

## 项目结构

- `packages/canvas-web`：tldraw + shadcn 前端画布。
- `packages/bridge-server`：MCP Server + WebSocket + REST 桥接服务。

新增 MCP 工具时，请同步更新 `README.md` 的能力清单。

## 发布

维护者推送 `v*` 形式的 tag（如 `v0.2.0`）即触发 Release 工作流，自动构建并生成 GitHub Release 与产物压缩包。
