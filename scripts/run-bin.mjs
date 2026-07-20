#!/usr/bin/env node
/**
 * 通用 bin 启动器。
 *
 * 背景：本项目所在目录路径含冒号（:），pnpm 会因此拒绝把 node_modules/.bin
 * 加入 PATH，导致 `tsc` / `vite` / `tsx` 等命令无法直接调用。
 * 本脚本用 Node 的模块解析能力在 node_modules 中定位到对应包的可执行 JS 文件，
 * 再用当前 node 直接运行，从而绕过 PATH 限制。
 *
 * 用法： node run-bin.mjs <bin-name> [args...]
 *   例： node run-bin.mjs vite build
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const [, , binName, ...args] = process.argv;
if (!binName) {
  console.error('usage: run-bin.mjs <bin-name> [args...]');
  process.exit(1);
}

// bin 名 -> 所属 npm 包名（多数一致，个别不同）
const PKG_OF_BIN = {
  tsc: 'typescript',
  tsserver: 'typescript',
  vite: 'vite',
  tsx: 'tsx',
};

const pkgName = PKG_OF_BIN[binName] ?? binName;
const cwd = process.cwd();
const require = createRequire(path.join(cwd, 'noop.js'));

function resolveBin() {
  // 读取包的 package.json，找到其声明的 bin 入口
  const pkgJsonPath = require.resolve(`${pkgName}/package.json`);
  const pkgDir = path.dirname(pkgJsonPath);
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

  let rel;
  if (typeof pkg.bin === 'string') rel = pkg.bin;
  else if (pkg.bin && pkg.bin[binName]) rel = pkg.bin[binName];
  else if (pkg.bin) rel = Object.values(pkg.bin)[0];

  if (!rel) throw new Error(`cannot find bin "${binName}" in package "${pkgName}"`);
  return path.join(pkgDir, rel);
}

let binPath;
try {
  binPath = resolveBin();
} catch (err) {
  console.error(`[run-bin] ${err.message}`);
  process.exit(1);
}

const child = spawn(process.execPath, [binPath, ...args], {
  stdio: 'inherit',
  cwd,
});
child.on('exit', (code) => process.exit(code ?? 0));
