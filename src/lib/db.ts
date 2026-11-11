// Cache local (IndexedDB) do inventario e do indice de stack. Sem IndexedDB, cai para memoria.
const mem = new Map<string, unknown>()
let dbp: Promise<IDBDatabase> | undefined
function open(): Promise<IDBDatabase> {
  if (!dbp) dbp = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open('atlas', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('kv')
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error)
    } catch (e) { reject(e) }
  })
  return dbp
}
async function tx<T = unknown>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | undefined): Promise<T | undefined> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction('kv', mode), r = fn(t.objectStore('kv'))
    t.oncomplete = () => resolve(r?.result); t.onerror = () => reject(t.error)
  })
}
export const db = {
  async get<T = unknown>(key: string): Promise<T | undefined> { try { return await tx<T>('readonly', s => s.get(key) as IDBRequest<T>) } catch { return mem.get(key) as T | undefined } },
  async set(key: string, value: unknown): Promise<void> { try { await tx('readwrite', s => s.put(value, key) as IDBRequest) } catch { mem.set(key, value) } },
  async clear(): Promise<void> { mem.clear(); try { await tx('readwrite', s => s.clear() as IDBRequest) } catch { /* sem IndexedDB */ } },
}
