export function upperBound(prefix: number[], y: number): number;

export interface VirtualListOptions {
  container: HTMLElement;
  itemCount: number;
  itemHeight: number | ((index: number) => number);
  renderItem: (index: number, recycledNode: HTMLElement | null) => HTMLElement;
  recycleItem?: (node: HTMLElement) => void;
  overscan?: number;
}

export interface VirtualList {
  refresh(): void;
  setItemCount(n: number): void;
  destroy(): void;
}

export function createVirtualList(opts: VirtualListOptions): VirtualList;
