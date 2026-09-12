export interface AutoRejectController {
  stop(): void;
}
export function autoRejectCookieBanners(opts?: {
  timeout?: number;
  onHandled?: (vendor: string) => void;
}): AutoRejectController;

export function metrics(): { handledCount: number; lastHandledVendor: string | null };
