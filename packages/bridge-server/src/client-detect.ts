/**
 * 客户端探测：判断本进程是被哪个 AI 客户端启动的。
 *
 * 原理：MCP server 由客户端 spawn，因此顺着父进程链向上查找，
 * 匹配已知客户端的进程特征即可识别。
 * 探测失败不影响功能，仅退化为通用文案。
 */
import { execFileSync } from 'node:child_process';

export type ClientKind = 'codex' | 'claude' | 'vscode' | 'unknown';

export interface ClientInfo {
  kind: ClientKind;
  /** 用于界面展示的名称 */
  label: string;
  /** 取回内容所用的命令，随客户端而异 */
  pullCommand: string;
}

const LABELS: Record<ClientKind, string> = {
  codex: 'Codex',
  claude: 'Claude Code',
  vscode: 'VS Code',
  unknown: 'AI 客户端',
};

/** 取父进程 ID */
function getPpid(pid: number): number | null {
  try {
    const out = execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: 1000,
    });
    const ppid = parseInt(out.trim(), 10);
    return Number.isFinite(ppid) && ppid > 1 ? ppid : null;
  } catch {
    return null;
  }
}

/** 取进程的完整命令行 */
function getCommand(pid: number): string {
  try {
    return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: 1000,
    }).trim();
  } catch {
    return '';
  }
}

/** 从命令行文本判断客户端类型 */
function matchKind(cmd: string): ClientKind | null {
  const s = cmd.toLowerCase();
  // 注意顺序：ChatGPT.app 同时承载 Codex，需先于通用规则判断
  if (s.includes('chatgpt.app') || s.includes('/codex') || s.includes('codex.app')) return 'codex';
  if (s.includes('claude')) return 'claude';
  if (s.includes('visual studio code') || s.includes('code helper')) return 'vscode';
  return null;
}

/** 沿父进程链向上探测，最多回溯若干层 */
export function detectClient(maxDepth = 6): ClientInfo {
  let pid: number | null = process.ppid;
  for (let i = 0; i < maxDepth && pid; i++) {
    const kind = matchKind(getCommand(pid));
    if (kind) return buildInfo(kind);
    pid = getPpid(pid);
  }
  return buildInfo('unknown');
}

function buildInfo(kind: ClientKind): ClientInfo {
  return {
    kind,
    label: LABELS[kind],
    // Claude Code 会把 MCP prompts 暴露成带前缀的 slash 命令
    pullCommand: kind === 'claude' ? '/canvas-pull' : '/canvas-pull',
  };
}
