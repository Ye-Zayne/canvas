import { Tldraw, Editor, createShapeId, type TLShapeId } from 'tldraw';
import 'tldraw/tldraw.css';
import { CanvasCardShapeUtil, type CanvasCardShape } from './shapes/CanvasCardShape';
import type { CanvasNode } from '@/lib/types';

const customShapeUtils = [CanvasCardShapeUtil];

/** 依据节点 kind 给出默认卡片尺寸 */
function sizeFor(kind: CanvasNode['kind']): { w: number; h: number } {
  switch (kind) {
    case 'image':
      return { w: 320, h: 260 };
    case 'video':
      return { w: 400, h: 260 };
    case 'audio':
      return { w: 300, h: 140 };
    case 'file':
      return { w: 240, h: 160 };
    default:
      return { w: 340, h: 220 };
  }
}

interface CanvasBoardProps {
  /** 把 editor 实例暴露给父组件，用于外部驱动增删 */
  onEditorReady: (editor: Editor) => void;
}

export function CanvasBoard({ onEditorReady }: CanvasBoardProps) {
  return (
    <Tldraw
      shapeUtils={customShapeUtils}
      onMount={(editor) => {
        onEditorReady(editor);
      }}
    />
  );
}

/** 把 nodeId 稳定映射到 tldraw shapeId */
export function shapeIdForNode(nodeId: string): TLShapeId {
  return createShapeId(`card-${nodeId}`);
}

/** 在编辑器中创建/更新一个卡片形状 */
export function upsertCard(editor: Editor, node: CanvasNode) {
  const id = shapeIdForNode(node.id);
  const existing = editor.getShape(id);
  const size = sizeFor(node.kind);

  const props = {
    nodeId: node.id,
    kind: node.kind,
    title: node.title ?? '',
    content: node.content ?? '',
    assetUrl: node.assetUrl ?? '',
    mime: node.mime ?? '',
  };

  if (existing) {
    editor.updateShape<CanvasCardShape>({ id, type: 'canvas-card', props });
    return;
  }

  // 新卡片：在当前视口中心附近错开摆放
  const vb = editor.getViewportPageBounds();
  const count = editor.getCurrentPageShapes().length;
  const x = vb.minX + 60 + (count % 4) * 40;
  const y = vb.minY + 60 + (count % 4) * 40;

  editor.createShape<CanvasCardShape>({
    id,
    type: 'canvas-card',
    x,
    y,
    props: { ...props, ...size },
  });
}

export function removeCard(editor: Editor, nodeId: string) {
  const id = shapeIdForNode(nodeId);
  if (editor.getShape(id)) editor.deleteShape(id);
}
