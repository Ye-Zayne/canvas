/** 全局配置，可通过环境变量覆盖 */
export const config = {
  /** 偏好端口；被占用时 daemon 会改用系统分配的空闲端口 */
  port: Number(process.env.CANVAS_PORT ?? 4399),
  host: process.env.CANVAS_HOST ?? '127.0.0.1',
};

/**
 * daemon 启动后把真实端口写回，后续 canvasUrl() 才能给出正确地址
 * （多项目并存时偏好端口可能被占用）。
 */
export function setActualPort(port: number): void {
  config.port = port;
}

export function canvasUrl(): string {
  return `http://${config.host}:${config.port}`;
}
