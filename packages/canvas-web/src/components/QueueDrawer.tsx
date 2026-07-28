import { X, Trash2, FileText, ImageIcon, Video, Music, File } from 'lucide-react';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useCanvasMode, actionLabel } from '@/lib/mode';
import type { CanvasNode, NodeKind } from '@/lib/types';

const ICONS: Record<NodeKind, React.ReactNode> = {
  text: <FileText size={14} />,
  markdown: <FileText size={14} />,
  image: <ImageIcon size={14} />,
  video: <Video size={14} />,
  audio: <Music size={14} />,
  file: <File size={14} />,
};

interface QueueDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queue: CanvasNode[];
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function QueueDrawer({ open, onOpenChange, queue, onRemove, onClear }: QueueDrawerProps) {
  const { embedded, clientEnv } = useCanvasMode();
  const label = actionLabel(embedded);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="待取回的内容"
      description={`回到 ${clientEnv.label}，输入 ${clientEnv.pullCommand} 即可把这些内容带入对话。`}
    >
      {queue.length === 0 ? (
        <div className="mt-10 text-center text-sm text-muted-foreground">
          还没有待取回的内容。
          <br />
          在画布上点卡片的「{label.idle}」按钮即可。
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onClick={onClear}>
              <Trash2 size={13} /> 清空
            </Button>
          </div>
          {queue.map((n) => (
            <div
              key={n.id}
              className="flex items-start gap-2 rounded-md border bg-background p-2.5 text-sm"
            >
              <span className="mt-0.5 text-muted-foreground">{ICONS[n.kind]}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{n.title || n.kind}</div>
                {n.content && (
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {n.content}
                  </div>
                )}
                {n.assetUrl && !n.content && (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{n.assetUrl}</div>
                )}
              </div>
              <button
                className="rounded p-1 text-muted-foreground hover:bg-secondary"
                onClick={() => onRemove(n.id)}
                title="移除"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
