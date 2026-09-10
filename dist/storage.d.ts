export interface StorageOptions {
  name?: string;
  mode?: 'auto' | 'idb' | 'local';
}

export interface ZStore {
  backend: 'idb' | 'local' | 'none';
  get<T = any>(key: string): Promise<T | undefined>;
  set<T = any>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}

export function createStore(opts?: StorageOptions): ZStore;
export function defaultStore(): ZStore;
export function createEncryptedStore(store: ZStore, passphrase: string): ZStore;
export const capabilities: { indexedDB: boolean; localStorage: boolean };
