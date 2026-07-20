import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { stopEventPropagation } from 'tldraw';
import { FileText, ImageIcon, Video, Music, File, Plus, Download } from 'lucide-react';
import type { CanvasCardShape } from './CanvasCardShape';
import type { NodeKind } from '@/lib/types';

const ICONS: Record<NodeKind, React.ReactNode> = {
  text: <FileText size={13} />,
  markdown: <FileText size={13} />,
  image: <ImageIcon size={13} />,
  video: <Video size={13} />,
  audio: <Music size={13} />,
  file: <File size={13} />,
};

/** 触发「加入对话」：通过 window 事件与 App 解耦 */
function emitEnqueue(nodeId: string) {
  window.dispatchEvent(new CustomEvent('canvas-enqueue', { detail: { nodeId } }));
}

export function CardBody({ shape }: { shape: CanvasCardShape }) {
  const { kind, title, content, assetUrl, mime, nodeId } = shape.props;
  const [added, setAdded] = useState(false);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm">
      {/* 头部 */}
      <div className="flex items-center gap-1.5 border-b bg-secondary/60 px-2.5 py-1.5">
        <span className="text-muted-foreground">{ICONS[kind]}</span>
        <span className="flex-1 truncate text-xs font-medium" title={title}>
          {title || defaultTitle(kind)}
        </span>
        <button
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
            added
              ? 'bg-emerald-500 text-white'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          }`}
          title="加入对话"
          onPointerDown={stopEventPropagation}
          onClick={(e) => {
            e.stopPropagation();
            emitEnqueue(nodeId);
            setAdded(true);
            setTimeout(() => setAdded(false), 1500);
          }}
        >
          <Plus size={11} />
          {added ? '已加入' : '加入对话'}
        </button>
      </div>

      {/* 内容 */}
      <div className="min-h-0 flex-1 overflow-auto" onPointerDown={stopEventPropagation}>
        <Content kind={kind} content={content} assetUrl={assetUrl} mime={mime} title={title} />
      </div>
    </div>
  );
}

function defaultTitle(kind: NodeKind): string {
  return {
    text: '文本',
    markdown: 'Markdown',
    image: '图片',
    video: '视频',
    audio: '音频',
    file: '文件',
  }[kind];
}

function Content({
  kind,
  content,
  assetUrl,
  mime,
  title,
}: {
  kind: NodeKind;
  content: string;
  assetUrl: string;
  mime: string;
  title: string;
}) {
  switch (kind) {
    case 'markdown':
      return (
        <div className="prose-canvas p-2.5 text-xs leading-relaxed">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      );
    case 'text':
      return <pre className="whitespace-pre-wrap p-2.5 text-xs leading-relaxed">{content}</pre>;
    case 'image':
      return (
        <img
          src={assetUrl}
          alt={title}
          className="h-full w-full object-contain"
          draggable={false}
        />
      );
    case 'video':
      return <video src={assetUrl} controls className="h-full w-full bg-black object-contain" />;
    case 'audio':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-3">
          <Music className="text-muted-foreground" size={28} />
          <audio src={assetUrl} controls className="w-full" />
        </div>
      );
    case 'file':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
          <File className="text-muted-foreground" size={30} />
          <div className="truncate text-xs text-muted-foreground" title={mime}>
            {mime || '未知类型'}
          </div>
          <a
            href={assetUrl}
            download
            className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-1 text-xs hover:bg-secondary/80"
          >
            <Download size={12} /> 下载
          </a>
        </div>
      );
    default:
      return null;
  }
}
