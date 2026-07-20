import { Wifi, WifiOff, Loader2, Inbox, MousePointerClick } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ConnStatus } from '@/hooks/useBridge';

interface ToolbarProps {
  status: ConnStatus;
  nodeCount: number;
  queueCount: number;
  onOpenQueue: () => void;
  onEnqueueSelection: () => void;
}

export function Toolbar({
  status,
  nodeCount,
  queueCount,
  onOpenQueue,
  onEnqueueSelection,
}: ToolbarProps) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-card/95 px-3 py-1.5 shadow-lg backdrop-blur">
        <span className="flex items-center gap-1.5 text-xs font-semibold">AI 对话画布</span>

        <span className="mx-1 h-4 w-px bg-border" />

        <StatusIndicator status={status} />

        <Badge variant="secondary" className="gap-1">
          <Inbox size={12} /> {nodeCount}
        </Badge>

        <span className="mx-1 h-4 w-px bg-border" />

        <Button size="sm" variant="outline" onClick={onEnqueueSelection}>
          <MousePointerClick size={13} /> 选中加入
        </Button>

        <Button size="sm" onClick={onOpenQueue} className="relative">
          对话队列
          {queueCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {queueCount}
            </span>
          )}
        </Button>
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
