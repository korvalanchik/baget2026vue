import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { newRequestKey } from '../src/services/requestKey.js'
test('native randomUUID retains its receiver', () => {
  const crypto = { randomUUID() { assert.equal(this, crypto); return 'native' } }
  assert.equal(newRequestKey(crypto), 'native')
})
test('HTTP fallback builds a canonical UUID v4 with zero bytes', () => {
  assert.equal(newRequestKey({ getRandomValues(bytes) { bytes.fill(0) } }), '00000000-0000-4000-8000-000000000000')
})
test('HTTP fallback sets version and variant without losing other bits', () => {
  assert.equal(newRequestKey({ getRandomValues(bytes) { bytes.fill(255) } }), 'ffffffff-ffff-4fff-bfff-ffffffffffff')
})
test('real random source works without randomUUID', () => {
  const source = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) }
  const keys = new Set()
  for (let i = 0; i < 1000; i++) {
    const key = newRequestKey(source)
    assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    keys.add(key)
  }
  assert.equal(keys.size, 1000)
})
test('missing secure random source gives a clear error', () => {
  assert.throws(() => newRequestKey({}), /Браузер не підтримує/)
})
