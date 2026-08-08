export function passiveOpts(capture?: boolean): AddEventListenerOptions | boolean;

export interface CancelableFn<T extends (...args: any[]) => void> {
  (...args: Parameters<T>): void;
  cancel(): void;
}

export function throttleRaf<T extends (...args: any[]) => void>(fn: T): CancelableFn<T>;
export function debounce<T extends (...args: any[]) => void>(fn: T, wait: number): CancelableFn<T>;
export function onFrame(fn: FrameRequestCallback): () => void;
export function onIdle(fn: IdleRequestCallback, opts?: IdleRequestOptions): () => void;

export function delegate(
  root: EventTarget,
  selector: string,
  type: string,
  handler: (event: Event, matchedElement: Element) => void,
  opts?: AddEventListenerOptions | boolean
): () => void;
