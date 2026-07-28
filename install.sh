#!/usr/bin/env bash
# AI 对话画布：一键安装
#
#   ./install.sh
#
# 自动完成：环境检查 → 安装依赖 → 构建 → 注册到 Codex / Claude Code。
# 可重复执行（幂等），用于升级后重新安装。
set -euo pipefail
cd "$(dirname "$0")"

ROOT="$(pwd)"
ENTRY="$ROOT/packages/bridge-server/dist/index.js"

info()  { printf '\033[36m▸\033[0m %s\n' "$1"; }
ok()    { printf '\033[32m✓\033[0m %s\n' "$1"; }
warn()  { printf '\033[33m!\033[0m %s\n' "$1"; }
fail()  { printf '\033[31m✗\033[0m %s\n' "$1" >&2; exit 1; }

echo ""
echo "  AI 对话画布 · 一键安装"
echo "  ────────────────────────"
echo ""

# ---- 1. 环境检查 ----
info "检查运行环境"

command -v node >/dev/null 2>&1 || fail "未找到 node，请先安装 Node.js 18 或更高版本：https://nodejs.org"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || fail "Node.js 版本过低（当前 $(node -v)），需要 18 或更高版本"
ok "Node.js $(node -v)"

if ! command -v pnpm >/dev/null 2>&1; then
  warn "未找到 pnpm，正在通过 npm 安装"
  npm install -g pnpm >/dev/null 2>&1 || fail "pnpm 安装失败，请手动执行：npm install -g pnpm"
fi
ok "pnpm $(pnpm -v)"

# ---- 2. 安装依赖 ----
info "安装依赖（首次可能需要几分钟）"
pnpm install --silent 2>&1 | grep -Ev '^\s*$|WARN.*path delimiter' || true
ok "依赖安装完成"

# ---- 3. 构建 ----
info "构建画布与服务"
pnpm -r build > /tmp/ai-canvas-build.log 2>&1 || {
  warn "构建失败，日志末尾如下："
  tail -20 /tmp/ai-canvas-build.log
  fail "构建失败，完整日志见 /tmp/ai-canvas-build.log"
}
[ -f "$ENTRY" ] || fail "构建产物缺失：$ENTRY"
[ -f "$ROOT/packages/canvas-web/dist/index.html" ] || fail "前端构建产物缺失"
ok "构建完成"

# ---- 4. 注册到客户端 ----
info "注册到 AI 客户端"
node "$ROOT/scripts/register-mcp.mjs" "$ENTRY"

# ---- 完成 ----
echo ""
ok "安装完成"
echo ""
echo "  接下来："
echo ""
echo "    1. 完全退出并重启 Codex / Claude Code（务必 Cmd+Q，关窗口无效）"
echo "    2. 新建对话，输入：打开画布"
echo "    3. 在浏览器打开返回的地址即可使用"
echo ""
echo "  升级后重新执行本脚本即可，无需手动改配置。"
echo ""
