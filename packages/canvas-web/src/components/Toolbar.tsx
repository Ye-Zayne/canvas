import { Wifi, WifiOff, Loader2, Inbox, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCanvasMode } from '@/lib/mode';
import type { ConnStatus } from '@/hooks/useBridge';

interface ToolbarProps {
  status: ConnStatus;
  nodeCount: number;
  queueCount: number;
  onOpenQueue: () => void;
}

export function Toolbar({ status, nodeCount, queueCount, onOpenQueue }: ToolbarProps) {
  const { embedded, clientEnv } = useCanvasMode();

  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-card/95 px-3 py-1.5 shadow-lg backdrop-blur">
        <span className="flex items-center gap-1.5 text-xs font-semibold">AI 对话画布</span>

        <span className="mx-1 h-4 w-px bg-border" />

        <StatusIndicator status={status} />

        {/* 内嵌模式下标明可直接发送，让用户知道无需再执行命令 */}
        {embedded && (
          <span className="flex items-center gap-1 text-xs text-primary">
            <Sparkles size={12} /> 直连 {clientEnv.label}
          </span>
        )}

        <Badge variant="secondary" className="gap-1" title="画布上的卡片数量">
          <Inbox size={12} /> {nodeCount}
        </Badge>

        {/* 浏览器模式才需要队列：内容要等客户端来取 */}
        {!embedded && (
          <>
            <span className="mx-1 h-4 w-px bg-border" />
            <Button size="sm" variant="outline" onClick={onOpenQueue} className="relative">
              待取回
              {queueCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {queueCount}
                </span>
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function StatusIndicator({ status }: { status: ConnStatus }) {
  if (status === 'open')
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-600">
        <Wifi size={13} /> 已连接
      </span>
    );
  if (status === 'connecting')
    return (
      <span className="flex items-center gap-1 text-xs text-amber-600">
        <Loader2 size={13} className="animate-spin" /> 连接中
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <WifiOff size={13} /> 未连接
    </span>
  );
}
