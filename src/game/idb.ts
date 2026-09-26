import { TEST_MODE } from './testMode';

// A tiny key-value wrapper around IndexedDB for things too big for localStorage (photos).
// Like storage.ts it never throws: when IndexedDB is missing or blocked, nothing is kept.
// Test mode never touches it.

const DB_NAME = 'silly-park';
const VERSION = 1;
export const STORES = ['photos'] as const;
type StoreName = (typeof STORES)[number];

let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (TEST_MODE || typeof indexedDB === 'undefined') return Promise.resolve(null);
  opening ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        for (const name of STORES) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const tx = db.transaction(store, mode);
          const req = fn(tx.objectStore(store));
          tx.oncomplete = () => resolve(req ? req.result : undefined);
          tx.onerror = () => resolve(undefined);
          tx.onabort = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      })
  );
}

export async function idbAll<T>(store: StoreName): Promise<T[]> {
  return ((await run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)) ?? []) as T[];
}

export function idbPut(store: StoreName, value: { id: number }) {
  return run(store, 'readwrite', (s) => {
    s.put(value);
  });
}

export function idbDelete(store: StoreName, id: number) {
  return run(store, 'readwrite', (s) => {
    s.delete(id);
  });
}

export function idbClear(store: StoreName) {
  return run(store, 'readwrite', (s) => {
    s.clear();
  });
}
