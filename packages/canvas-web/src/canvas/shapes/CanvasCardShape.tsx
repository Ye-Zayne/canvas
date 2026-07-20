import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  T,
  type TLBaseShape,
  type RecordProps,
} from 'tldraw';
import type { NodeKind } from '@/lib/types';
import { CardBody } from './CardBody';

/**
 * 统一的画布卡片形状：一个形状类型承载所有内容 kind（text/markdown/image/video/audio/file）。
 * 相比为每种类型写独立 ShapeUtil，这样更易维护，且共享「加入对话」交互。
 */
export type CanvasCardShape = TLBaseShape<
  'canvas-card',
  {
    w: number;
    h: number;
    nodeId: string;
    kind: NodeKind;
    title: string;
    content: string;
    assetUrl: string;
    mime: string;
  }
>;

export class CanvasCardShapeUtil extends BaseBoxShapeUtil<CanvasCardShape> {
  static override type = 'canvas-card' as const;

  static override props: RecordProps<CanvasCardShape> = {
    w: T.number,
    h: T.number,
    nodeId: T.string,
    kind: T.literalEnum('text', 'markdown', 'image', 'video', 'audio', 'file'),
    title: T.string,
    content: T.string,
    assetUrl: T.string,
    mime: T.string,
  };

  override getDefaultProps(): CanvasCardShape['props'] {
    return {
      w: 320,
      h: 220,
      nodeId: '',
      kind: 'text',
      title: '',
      content: '',
      assetUrl: '',
      mime: '',
    };
  }

  override getGeometry(shape: CanvasCardShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override component(shape: CanvasCardShape) {
    return (
      <HTMLContainer
        style={{
          width: shape.props.w,
          height: shape.props.h,
          pointerEvents: 'all',
        }}
      >
        <CardBody shape={shape} />
      </HTMLContainer>
    );
  }

  override indicator(shape: CanvasCardShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />;
  }

  override canResize = () => true;
  override canEdit = () => false;
}
