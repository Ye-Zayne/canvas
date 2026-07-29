#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginRoot = path.join(root, 'plugins', 'ai-canvas');
const serverOut = path.join(pluginRoot, 'packages', 'bridge-server', 'dist');
const webOut = path.join(pluginRoot, 'packages', 'canvas-web', 'dist');
const webSource = path.join(root, 'packages', 'canvas-web', 'dist');

if (!fs.existsSync(path.join(webSource, 'index.html'))) {
  throw new Error('Canvas web build is missing. Run the full `pnpm build` command.');
}

fs.rmSync(path.join(pluginRoot, 'packages'), { recursive: true, force: true });
fs.mkdirSync(serverOut, { recursive: true });

await build({
  entryPoints: [path.join(root, 'packages', 'bridge-server', 'src', 'index.ts')],
  outfile: path.join(serverOut, 'index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'bundle',
  minify: true,
  legalComments: 'none',
  banner: {
    js: [
      '#!/usr/bin/env node',
      "import { createRequire } from 'node:module';",
      'const require = createRequire(import.meta.url);',
    ].join('\n'),
  },
});

fs.cpSync(webSource, webOut, { recursive: true });
console.log(`Codex plugin runtime built at ${path.relative(root, pluginRoot)}`);
