// Type definitions for Zelvior Runtime
// Project: https://github.com/zelvior/zelvior-runtime

export interface FeatureFlags {
  raf: boolean;
  ric: boolean;
  moc: boolean;
  ioc: boolean;
  vis: boolean;
  perf: boolean;
  po: boolean;
  mem: boolean;
  cle: boolean;
  ma: boolean;
}

export interface OptimizerProfile {
  reducedMotion: boolean;
  saveData: boolean;
  effectiveType: string;
  slow: boolean;
}

export interface OptimizerConfig {
  rootMargin: string;
  chunk: number;
  reduceAnim: boolean;
  observeAttrs: boolean;
  pollInterval: number;
  idleBoost: boolean;
}

export interface Scheduler {
  add(fn: () => void, priority?: 'high' | 'low'): () => void;
  addIdle(fn: () => void): () => void;
  nextFrame(fn: FrameRequestCallback): number;
  whenIdle(fn: IdleRequestCallback): number;
  clear(): void;
  pending(): number;
}

export interface Observer {
  on(type: string, fn: (detail: unknown) => void): void;
  off(type: string, fn: (detail: unknown) => void): void;
  start(): void;
  stop(): void;
  watch(el: Element, cb: (el: Element, visible: boolean) => void, opts?: { rootMargin?: string }): void;
  unwatch(el: Element): void;
}

export interface Optimizer {
  profile: OptimizerProfile;
  config: OptimizerConfig;
  setConfig(cfg: Partial<OptimizerConfig>): void;
  deferImages(root?: ParentNode): void;
  reduceAnimations(force?: boolean): boolean;
  restoreAnimations(): void;
  split<T>(items: T[], work: (item: T, index: number) => void, chunk?: number): void;
  batch(fn: () => void): void;
  isSlow(): boolean;
  shouldDefer(): boolean;
}

export interface AdaptiveLevel {
  name: string;
  rootMargin: string;
  chunk: number;
  reduceAnim: 0 | 1;
  observeAttrs: 0 | 1;
  pollInterval: number;
  idleBoost: 0 | 1;
}

export interface Adaptive {
  readonly LEVELS: AdaptiveLevel[];
  readonly level: number;
  readonly name: string;
  readonly busyRatio: number;
  readonly lastProbeDelay: number;
  readonly fpsAvg: number;
  /** True after force() until start() is next called; while true, decide() will not auto-adjust the level. */
  readonly pinned: boolean;
  start(): void;
  stop(): void;
  /** Manually pin the adaptive level. Auto-tuning (decide()) is suppressed until start() is called again. */
  force(level: number): void;
  onMetrics(snapshot: MetricsSnapshot): void;
  onLongTask(): void;
  snapshot(): { level: number; name: string; fpsAvg: number; busyRatio: number; probeDelay: number; escStreak: number; relStreak: number; pinned: boolean };
}

export interface Recycler {
  acquire(tag?: string): HTMLElement;
  release(node: Element): void;
  poolSize(tag?: string): number;
  clear(): void;
}

export interface Memory {
  set(key: string, value: unknown, ttl?: number): void;
  get(key: string): unknown;
  has(key: string): boolean;
  del(key: string): boolean;
  clear(): void;
  size(): number;
  track(node: Node): void;
  isTracked(node: Node): boolean;
  leaks(): { tracked: number; detached: number; attached: number; cacheSize: number };
  sweep(): number;
}

export interface MetricsSnapshot {
  fps: number;
  fpsMin: number;
  fpsMax: number;
  memory: number;
  memoryPeak: number;
  domCount: number;
  longTasks: number;
  longTaskTotal: number;
  paintTime: number;
  cls: number;
  uptime: number;
  samples: { fps: number[]; mem: number[] };
}

export interface Metrics {
  start(): void;
  stop(): void;
  snapshot(): MetricsSnapshot;
  inc(key: string, n?: number): void;
}

export interface Plugin {
  name: string;
  init?: (ctx: { Z: ZelviorRuntime }) => void;
}

export interface Plugins {
  register(plugin: Plugin): boolean;
  on(name: string, fn: (payload: unknown) => void): void;
  emit(name: string, payload?: unknown): void;
  list(): string[];
}

export interface EnableOptions {
  adaptive?: boolean;
  enhance?: boolean;
}

export interface ZelviorRuntime {
  version: string;
  enable(opts?: EnableOptions): ZelviorRuntime;
  disable(): ZelviorRuntime;
  isEnabled(): boolean;
  features: FeatureFlags;
  scheduler: Scheduler;
  observer: Observer;
  optimizer: Optimizer;
  recycler: Recycler;
  memory: Memory;
  metrics: Metrics;
  plugins: Plugins;
  adaptive: Adaptive;
  onerror?: (err: unknown) => void;
}

export const Scheduler: Scheduler;
export const Observer: Observer;
export const Optimizer: Optimizer;
export const Adaptive: Adaptive;
export const Recycler: Recycler;
export const Memory: Memory;
export const Metrics: Metrics;
export const Plugins: Plugins;

declare const Zelvior: ZelviorRuntime;
export default Zelvior;
