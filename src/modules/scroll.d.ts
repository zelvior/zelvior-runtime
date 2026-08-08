export interface ScrollInfo {
  x: number;
  y: number;
  target: EventTarget;
}

export function onScroll(
  fn: (info: ScrollInfo) => void,
  opts?: { capture?: boolean }
): () => void;
export function onScroll(
  target: EventTarget,
  fn: (info: ScrollInfo) => void,
  opts?: { capture?: boolean }
): () => void;
