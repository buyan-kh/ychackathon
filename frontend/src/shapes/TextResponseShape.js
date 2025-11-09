import type { TLBaseShape } from 'tldraw';

export type TextResponseShapeProps = {
  w: number;
  h: number;
  prompt?: string;
  response?: string;
  isStreaming?: boolean;
};

export type TextResponseShape = TLBaseShape<'text-response', TextResponseShapeProps>;