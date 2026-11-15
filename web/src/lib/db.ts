// The phone's own storage. Everything the app keeps (recipes, collections, voice recordings) lives here.
export type Store = 'recordings' | 'recipes' | 'collections';
const STORES: Store[] = ['recordings', 'recipes', 'collections'];

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('recipe-book', 2);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function tx<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => { db.close(); resolve(req ? (req.result as T) : undefined); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export const all = async <T>(store: Store): Promise<T[]> => ((await tx<T[]>(store, 'readonly', (s) => s.getAll())) ?? []);
export const put = (store: Store, value: unknown) => tx(store, 'readwrite', (s) => s.put(value));
