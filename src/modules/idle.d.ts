export function onIdle(fn: (deadline: { didTimeout: boolean; timeRemaining(): number }) => void, opts?: { timeout?: number }): () => void;
export function idleEach<T>(items: T[], work: (item: T, index: number) => void, onDone?: () => void): void;
export const supported: boolean;
