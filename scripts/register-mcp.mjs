#!/usr/bin/env node
/**
 * 把 AI Canvas 注册到 Codex / Claude Code 的 MCP 配置里。
 * 幂等：重复执行只会更新，不会产生重复条目。
 *
 * 用法：node scripts/register-mcp.mjs <bridge-server 入口的绝对路径>
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';

const SERVER_NAME = 'canvas';
const entry = process.argv[2];

if (!entry || !fs.existsSync(entry)) {
  console.error(`[register] 找不到入口文件：${entry ?? '(未传入)'}`);
  process.exit(1);
}

const nodeBin = process.execPath;
const home = os.homedir();

/** 备份文件（保留一份 .bak，避免无限堆积） */
function backup(file) {
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, `${file}.bak`);
  }
}

/** TOML 单引号字面量字符串：内部不能含单引号，用它可原样保留 : 空格 中文等 */
function tomlLiteral(s) {
  if (s.includes("'")) {
    // 极少数情况路径含单引号，退回双引号并转义
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return `'${s}'`;
}

// ---------------- Codex ----------------
function registerCodex() {
  const dir = path.join(home, '.codex');
  const file = path.join(dir, 'config.toml');
  if (!fs.existsSync(dir)) {
    console.log('[register] 未检测到 ~/.codex，跳过 Codex 注册');
    return false;
  }

  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';

  // 用 sh -c 显式设置 PATH 再 exec node，兼容路径含中文/空格/冒号的情况
  const shArg = `export PATH="${path.dirname(nodeBin)}:$PATH"; exec ${JSON.stringify(nodeBin)} ${JSON.stringify(entry)}`;
  const block = [
    `[mcp_servers.${SERVER_NAME}]`,
    'type = "stdio"',
    'command = "/bin/sh"',
    `args = ["-c", ${tomlLiteral(shArg)}]`,
  ].join('\n');

  const header = `[mcp_servers.${SERVER_NAME}]`;
  const idx = text.indexOf(header);

  if (idx >= 0) {
    // 已存在：替换该 table 到下一个 table 之前的内容
    const rest = text.slice(idx + header.length);
    const nextTable = rest.search(/\n\s*\[/);
    const end = nextTable === -1 ? text.length : idx + header.length + nextTable;
    backup(file);
    text = `${text.slice(0, idx)}${block}\n${text.slice(end).replace(/^\n+/, '')}`;
    fs.writeFileSync(file, text);
    console.log('[register] Codex 配置已更新（原文件备份为 config.toml.bak）');
  } else {
    backup(file);
    const sep = text.length === 0 || text.endsWith('\n') ? '' : '\n';
    fs.writeFileSync(file, `${text}${sep}\n${block}\n`);
    console.log('[register] 已写入 Codex 配置：~/.codex/config.toml');
  }
  return true;
}

// ---------------- Claude Code ----------------
function registerClaude() {
  const file = path.join(home, '.claude.json');
  let json = {};
  if (fs.existsSync(file)) {
    try {
      json = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      console.warn('[register] ~/.claude.json 解析失败，跳过 Claude 注册');
      return false;
    }
    backup(file);
  }

  json.mcpServers = json.mcpServers ?? {};
  json.mcpServers[SERVER_NAME] = {
    command: nodeBin,
    args: [entry],
  };
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  console.log('[register] 已写入 Claude 配置：~/.claude.json');
  return true;
}

const okCodex = registerCodex();
const okClaude = registerClaude();

if (!okCodex && !okClaude) {
  console.error('[register] 未找到任何受支持的客户端配置目录');
  process.exit(1);
}
