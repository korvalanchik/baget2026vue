import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// Execute the actual component's setup logic with lightweight Vue lifecycle/transport doubles.
const source = readFileSync(new URL('../src/components/ProductTracking.vue', import.meta.url), 'utf8')
const setup = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
const tick = () => new Promise(resolve => setImmediate(resolve))
function mount(disabled, transport) {
  const props = { session: { token: 'token' }, productId: 17, initialToken: '', disabled }
  const calls = [], emitted = []
  let onMount
  const context = vm.createContext({
    defineProps: () => props, defineEmits: () => (...args) => emitted.push(args),
    ref: value => ({ value }), onMounted: fn => { onMount = fn },
    warehouse: async (...args) => { calls.push(args); return transport(...args) },
    locations: {}, trackingToken: v => v,
  })
  vm.runInContext(setup + '\nglobalThis.api = { load, move, cancelTransfer, printLabel, data, error, busy, note };', context)
  onMount()
  return { props, calls, emitted, api: context.api }
}
const product = () => ({ trackingId: 'qr', state: 'COMPLETED', revision: 2, location: 'WORKSHOP', pending: null, canWarehouse: true })
test('initial read works while parent is busy, so tracking does not remain empty', async () => {
  const c = mount(true, async () => product()); await tick()
  assert.equal(c.calls.length, 1)
  assert.equal(c.calls[0][1], '/products/by-id/17')
  assert.equal(c.api.data.value.state, 'COMPLETED')
  assert.equal(c.api.busy.value, false)
})
test('dirty/busy parent still prevents transfer and label actions', async () => {
  const c = mount(true, async () => product()); await tick()
  await c.api.move(false, 'WAREHOUSE'); await c.api.printLabel(); await c.api.cancelTransfer()
  assert.equal(c.calls.length, 1)
  assert.equal(c.emitted.length, 0)
})
test('transfer becomes available when parent is ready', async () => {
  const c = mount(true, async () => product()); await tick()
  c.props.disabled = false
  await c.api.move(false, 'WAREHOUSE')
  assert.equal(c.calls.length, 2)
  assert.equal(c.calls[1][1], '/products/qr/send')
  assert.equal(c.calls[1][2].destination, 'WAREHOUSE')
  assert.equal(c.emitted[0][0], 'transferred')
})
test('failed initial request can be retried even with disabled parent', async () => {
  let attempt = 0
  const c = mount(true, async () => { if (++attempt === 1) throw new Error('Network error'); return product() }); await tick()
  assert.equal(c.api.error.value, 'Network error')
  assert.equal(c.api.data.value, null)
  await c.api.load()
  assert.equal(c.api.data.value.state, 'COMPLETED')
  assert.equal(c.api.error.value, '')
})
test('concurrent read is ignored while existing request is in flight', async () => {
  let resolve
  const pending = new Promise(r => { resolve = r })
  const c = mount(true, () => pending)
  await c.api.load()
  assert.equal(c.calls.length, 1)
  resolve(product()); await tick()
  assert.equal(c.api.busy.value, false)
})
