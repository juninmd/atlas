// Cache local (IndexedDB) do inventario e do indice de stack. Sem IndexedDB, cai para memoria.
const mem = new Map()
let dbp
function open() {
  if (!dbp) dbp = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open('atlas', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('kv')
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error)
    } catch (e) { reject(e) }
  })
  return dbp
}
async function tx(mode, fn) {
  const db = await open()
  return new Promise((resolve, reject) => { const t = db.transaction('kv', mode), r = fn(t.objectStore('kv')); t.oncomplete = () => resolve(r?.result); t.onerror = () => reject(t.error) })
}
export const db = {
  async get(key) { try { return await tx('readonly', s => s.get(key)) } catch { return mem.get(key) } },
  async set(key, value) { try { await tx('readwrite', s => s.put(value, key)) } catch { mem.set(key, value) } },
  async clear() { mem.clear(); try { await tx('readwrite', s => s.clear()) } catch { /* sem IndexedDB */ } },
}
