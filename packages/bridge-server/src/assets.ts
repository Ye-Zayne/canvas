/**
 * 本地文件资产代理：把磁盘上的图片/音视频/文件通过 /assets/:id 暴露给浏览器。
 * 浏览器无法直接读本地磁盘，所有本地媒体都要经此代理。
 *
 * 持久化相关：canvas.json 只保存 sourcePath（磁盘路径），
 * assetUrl 是运行时派生物，每次加载需按 sourcePath 重新注册。
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import mime from 'mime-types';
import { store } from './store.js';
import { canvasUrl } from './config.js';

/** 是否为外部 URL（无需注册，浏览器可直接访问） */
export function isExternalUrl(s: string): boolean {
  return /^https?:\/\//i.test(s) || /^data:/i.test(s);
}

/**
 * 把一个本地文件路径注册为可访问的资产，返回对外 URL。
 * 若传入的已经是 http(s)/data URL，则原样返回。
 */
export function toAssetUrl(pathOrUrl: string): { url: string; mime: string } {
  if (isExternalUrl(pathOrUrl)) {
    return { url: pathOrUrl, mime: mime.lookup(pathOrUrl) || 'application/octet-stream' };
  }
  const abs = path.resolve(pathOrUrl);
  const m = mime.lookup(abs) || 'application/octet-stream';
  const entry = store.registerAsset(abs, m);
  return { url: `${canvasUrl()}/assets/${entry.id}`, mime: m };
}

/**
 * 按 sourcePath 解析出运行时可访问信息。
 * 用于从 canvas.json 恢复画布时重新注册资产，并检测文件是否丢失。
 */
export function resolveSource(sourcePath: string): {
  assetUrl?: string;
  mime: string;
  missing: boolean;
} {
  if (isExternalUrl(sourcePath)) {
    return {
      assetUrl: sourcePath,
      mime: mime.lookup(sourcePath) || 'application/octet-stream',
      missing: false,
    };
  }
  const abs = path.resolve(sourcePath);
  const m = mime.lookup(abs) || 'application/octet-stream';
  if (!fs.existsSync(abs)) {
    // 素材已丢失：不注册，交由前端显示占位并提供重新指定入口
    return { mime: m, missing: true };
  }
  const entry = store.registerAsset(abs, m);
  return { assetUrl: `${canvasUrl()}/assets/${entry.id}`, mime: m, missing: false };
}

/** Express 处理器：按 assetId 返回文件流，支持 Range（音视频拖动） */
export function serveAsset(req: Request, res: Response, next: NextFunction): void {
  const entry = store.getAsset(req.params.id);
  if (!entry || !fs.existsSync(entry.path)) {
    // 不是已注册的资产：放行给后续中间件（如 Vite 构建产物 /assets/index-xxx.js）
    next();
    return;
  }
  const stat = fs.statSync(entry.path);
  const range = req.headers.range;
  res.setHeader('Content-Type', entry.mime);
  res.setHeader('Accept-Ranges', 'bytes');

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match && match[1] ? parseInt(match[1], 10) : 0;
    const end = match && match[2] ? parseInt(match[2], 10) : stat.size - 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Content-Length', end - start + 1);
    fs.createReadStream(entry.path, { start, end }).pipe(res);
  } else {
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(entry.path).pipe(res);
  }
}
