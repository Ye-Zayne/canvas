import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * 轻量右侧抽屉（不依赖 Radix）。受控组件：open + onOpenChange。
 */
interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  side?: 'right' | 'left';
  className?: string;
}

export function Sheet({
  open,
  onOpenChange,
  children,
  title,
  description,
  side = 'right',
  className,
}: SheetProps) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  return (
    <>
      {/* 遮罩 */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/40 transition-opacity',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={() => onOpenChange(false)}
      />
      {/* 面板 */}
      <div
        className={cn(
          'fixed top-0 z-50 flex h-full w-[360px] max-w-[90vw] flex-col border-l bg-card shadow-xl transition-transform duration-300',
          side === 'right' ? 'right-0' : 'left-0',
          open ? 'translate-x-0' : side === 'right' ? 'translate-x-full' : '-translate-x-full',
          className
        )}
      >
        {(title || description) && (
          <div className="border-b px-4 py-3">
            {title && <div className="text-sm font-semibold">{title}</div>}
            {description && (
              <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-3">{children}</div>
      </div>
    </>
  );
}
