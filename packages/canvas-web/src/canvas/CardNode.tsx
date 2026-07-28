/**
 * React Flow 自定义节点：内容卡片。
 * 渲染文本 / Markdown / 图片 / 视频 / 音频 / 文件，并提供「加入对话」按钮。
 */
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import { FileText, ImageIcon, Video, Music, File, Plus, Download, Send, Check } from 'lucide-react';
import { useCanvasMode, actionLabel } from '@/lib/mode';
import type { NodeKind } from '@/lib/types';

const ICONS: Record<NodeKind, React.ReactNode> = {
  text: <FileText size={13} />,
  markdown: <FileText size={13} />,
  image: <ImageIcon size={13} />,
  video: <Video size={13} />,
  audio: <Music size={13} />,
  file: <File size={13} />,
};

/** 卡片节点的数据结构 */
export interface CardNodeData extends Record<string, unknown> {
  nodeId: string;
  kind: NodeKind;
  title: string;
  content: string;
  assetUrl: string;
  mime: string;
}

/** 触发「加入对话」：通过 window 事件与 App 解耦 */
function emitEnqueue(nodeId: string) {
  window.dispatchEvent(new CustomEvent('canvas-enqueue', { detail: { nodeId } }));
}

export function CardNode({ data, selected }: NodeProps) {
  const { kind, title, content, assetUrl, mime, nodeId } = data as CardNodeData;
  const [added, setAdded] = useState(false);
  const { embedded } = useCanvasMode();
  const label = actionLabel(embedded);

  return (
    <>
      <NodeResizer isVisible={selected} minWidth={180} minHeight={120} />
      <Handle type="target" position={Position.Left} className="!h-2 !w-2" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2" />

      <div
        className={`flex h-full w-full flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm ${
          selected ? 'border-primary ring-1 ring-primary' : 'border-border'
        }`}
      >
        {/* 头部：拖拽把手 */}
        <div className="drag-handle flex cursor-move items-center gap-1.5 border-b bg-secondary/60 px-2.5 py-1.5">
          <span className="text-muted-foreground">{ICONS[kind]}</span>
          <span className="flex-1 truncate text-xs font-medium" title={title}>
            {title || defaultTitle(kind)}
          </span>
          <button
            className={`nodrag flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
              added
                ? 'bg-emerald-500 text-white'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
            title={embedded ? '直接发送到当前对话' : '引用，稍后在客户端取回'}
            onClick={(e) => {
              e.stopPropagation();
              emitEnqueue(nodeId);
              setAdded(true);
              setTimeout(() => setAdded(false), 1500);
            }}
          >
            {added ? <Check size={11} /> : embedded ? <Send size={11} /> : <Plus size={11} />}
            {added ? label.done : label.idle}
          </button>
        </div>

        {/* 内容区：nodrag/nowheel 保证内部可滚动与交互 */}
        <div className="nodrag nowheel min-h-0 flex-1 overflow-auto">
          <Content kind={kind} content={content} assetUrl={assetUrl} mime={mime} title={title} />
        </div>
      </div>
    </>
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
