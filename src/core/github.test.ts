import test from 'node:test'
import assert from 'node:assert/strict'
import { createClient, type ApiError } from './github.ts'

// Records every delay the client asks for and fires the timer at once, so tests never actually wait.
function withInstantTimers<T>(run: (waits: number[]) => Promise<T>): Promise<T> {
  const waits: number[] = []
  const original = globalThis.setTimeout
  globalThis.setTimeout = ((fn: () => void, ms?: number) => { waits.push(ms ?? 0); return original(fn, 0) }) as typeof setTimeout
  return run(waits).finally(() => { globalThis.setTimeout = original })
}

function fakeFetch(responses: Response[]): typeof fetch {
  return (async () => responses.shift() ?? new Response('[]', { status: 200 })) as typeof fetch
}

test('a long Retry-After fails fast as rate limited instead of blocking the request for an hour', async () => {
  const original = globalThis.fetch
  globalThis.fetch = fakeFetch([new Response('', { status: 429, headers: { 'retry-after': '3600' } })])
  try {
    await withInstantTimers(async waits => {
      const before = Date.now()
      const error = await createClient().api('user').then(() => null, (e: ApiError) => e)
      assert.ok(error, 'expected the call to reject')
      assert.equal(error.rateLimited, true)
      assert.ok(Date.parse(error.resetAt ?? '') >= before + 3600_000)
      assert.ok(waits.every(ms => ms <= 30000), `waited ${waits.join(',')} ms`)
    })
  } finally { globalThis.fetch = original }
})

test('a short Retry-After is honoured and the request is retried', async () => {
  const original = globalThis.fetch
  globalThis.fetch = fakeFetch([
    new Response('', { status: 429, headers: { 'retry-after': '2' } }),
    new Response('{"login":"x"}', { status: 200 }),
  ])
  try {
    await withInstantTimers(async waits => {
      assert.deepEqual(await createClient().api('user'), { login: 'x' })
      assert.deepEqual(waits, [2000])
    })
  } finally { globalThis.fetch = original }
})
