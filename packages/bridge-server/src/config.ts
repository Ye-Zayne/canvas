/** 全局配置，可通过环境变量覆盖 */
export const config = {
  /** HTTP + WS + 静态托管端口 */
  port: Number(process.env.CANVAS_PORT ?? 4399),
  host: process.env.CANVAS_HOST ?? '127.0.0.1',
};

export function canvasUrl(): string {
  return `http://${config.host}:${config.port}`;
}
