/**
 * 本地文件资产代理：把磁盘上的图片/音视频/文件通过 /assets/:id 暴露给浏览器。
 * 浏览器无法直接读本地磁盘，所有本地媒体都要经此代理。
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import mime from 'mime-types';
import { store } from './store.js';
import { canvasUrl } from './config.js';

/**
 * 把一个本地文件路径注册为可访问的资产，返回对外 URL。
 * 若传入的已经是 http(s) URL，则原样返回。
 */
export function toAssetUrl(pathOrUrl: string): { url: string; mime: string } {
  if (/^https?:\/\//i.test(pathOrUrl) || /^data:/i.test(pathOrUrl)) {
    return { url: pathOrUrl, mime: mime.lookup(pathOrUrl) || 'application/octet-stream' };
  }
  const abs = path.resolve(pathOrUrl);
  const m = mime.lookup(abs) || 'application/octet-stream';
  const entry = store.registerAsset(abs, m);
  return { url: `${canvasUrl()}/assets/${entry.id}`, mime: m };
}

/** Express 处理器：按 assetId 返回文件流，支持 Range（音视频拖动） */
export function serveAsset(req: Request, res: Response): void {
  const entry = store.getAsset(req.params.id);
  if (!entry || !fs.existsSync(entry.path)) {
    res.status(404).send('asset not found');
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
