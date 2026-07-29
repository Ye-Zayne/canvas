/**
 * 项目根目录解析：决定 .aicanvas/ 落在哪里。
 *
 * 优先级：
 *  1. 环境变量 CANVAS_PROJECT_DIR（显式指定，daemon 阶段会用到）
 *  2. 启动时的工作目录（cwd）
 *
 * 说明：当前服务由用户手动启动或被 AI 客户端 spawn，cwd 即为项目目录。
 * 后续 daemon 阶段会改为对接「当前任务的项目目录」。
 */
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR_NAME = '.aicanvas';
const DOC_FILE_NAME = 'canvas.json';

/** 项目根目录（绝对路径） */
export function projectRoot(): string {
  const explicit = process.env.CANVAS_PROJECT_DIR;
  return path.resolve(explicit && explicit.trim() ? explicit : process.cwd());
}

/** 画布数据目录 <项目根>/.aicanvas */
export function dataDir(): string {
  return path.join(projectRoot(), DATA_DIR_NAME);
}

/** 画布文档路径 <项目根>/.aicanvas/canvas.json */
export function docPath(): string {
  return path.join(dataDir(), DOC_FILE_NAME);
}

/** 确保数据目录存在 */
export function ensureDataDir(): void {
  fs.mkdirSync(dataDir(), { recursive: true });
}
