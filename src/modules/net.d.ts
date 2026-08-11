export interface ConnectionInfo {
  effectiveType: string | null;
  saveData: boolean;
  downlink: number | null;
  rtt: number | null;
}

export function getConnectionInfo(): ConnectionInfo | null;
export function onConnectionChange(fn: (info: ConnectionInfo | null) => void): () => void;

export interface DedupeFetchOptions extends RequestInit {
  ttl?: number;
  dedupeKey?: string;
}

export function dedupeFetch(url: string, opts?: DedupeFetchOptions): Promise<Response>;
export function clearDedupeCache(): void;

export function preconnect(origin: string, opts?: { crossorigin?: boolean }): void;
