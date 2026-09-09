export function schedule(fn: (ts: number) => void): (ts: number) => void;
export function unschedule(fn: (ts: number) => void): void;
export function clear(): void;
export function pending(): number;
