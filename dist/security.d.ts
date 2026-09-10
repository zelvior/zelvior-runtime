export function sanitizeHTML(html: string): string;
export function isSafeURL(url: string): boolean;
export function isFramed(): boolean;
export function preventClickjacking(opts?: {
  breakout?: boolean;
  onDetected?: () => void;
}): boolean;
export function freezePrototypes(): void;
export function generateCSRFToken(key?: string): string;
export function verifyCSRFToken(token: string, key?: string): boolean;
