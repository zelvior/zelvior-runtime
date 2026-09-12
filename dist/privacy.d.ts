export function sendDoNotSellSignal(): boolean;
export function isDoNotSellSignalActive(): boolean;

export function blockPopups(opts?: { onBlocked?: (info: { url: string; origin: string | null }) => void }): void;
export function restorePopups(): void;
export function allowPopupsFrom(origin: string): void;
export function isBlockingPopups(): boolean;

export function removeMetaRefresh(root?: Document): number;

export function enableStealthMode(): void;
export function disableStealthMode(): void;
export function isStealthModeActive(): boolean;

export interface PrivacyMetrics {
  popupsBlocked: number;
  metaRefreshRemoved: number;
  fingerprintCallsBlocked: number;
}
export function metrics(): PrivacyMetrics;
