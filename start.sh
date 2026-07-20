#!/usr/bin/env bash
# AI 对话画布：一键启动脚本
# 构建前端（若未构建）并启动 bridge-server（含 MCP）。
set -e
cd "$(dirname "$0")"

WEB_DIST="packages/canvas-web/dist"

if [ ! -d "$WEB_DIST" ]; then
  echo "[start] 前端未构建，正在构建..."
  pnpm --filter canvas-web build
fi

echo "[start] 启动 bridge-server（HTTP+WS+MCP）..."
node packages/bridge-server/dist/index.js "$@"
