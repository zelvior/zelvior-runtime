export interface TierInfo {
  tier: 'low' | 'mid' | 'high';
  cores: number | null;
  memory: number | null;
  connection: string | null;
  saveData: boolean;
  legacy: boolean;
  reasons: string[];
}
export function detectTier(): TierInfo;
