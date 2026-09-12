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

export interface AdaptiveScrollInfo {
  x: number;
  y: number;
  target: EventTarget;
  lowEndDevice: boolean;
  reducedMotion: boolean;
  underPressure: boolean;
  read(fn: () => void): void;
  write(fn: () => void): void;
}
export interface AdaptiveScrollController {
  stop(): void;
  isIdle(): boolean;
  isLowEndDevice(): boolean;
  isReducedMotion(): boolean;
}
export function createAdaptiveScroll(
  fn: (info: AdaptiveScrollInfo) => void,
  opts?: {
    target?: EventTarget;
    capture?: boolean;
    settleMs?: number;
    reducedMotionAware?: boolean;
    longTaskAware?: boolean;
  }
): AdaptiveScrollController;
