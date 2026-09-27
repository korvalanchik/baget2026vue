import test from 'node:test'
import assert from 'node:assert/strict'
import { canOpenRework, reworkDraft, reworkKey, reworkPayload } from '../src/calculation/rework.js'
import { productActions, productEditable } from '../src/calculation/workshop.js'
const draft = () => ({ widthMm: 300, heightMm: 400, note: 'Замінено скло', lines: [{ sourceItemNo: 2, partNo: 27540, unit: 'SQUARE_METER', quantity: 0.12, widthMm: 300, heightMm: 400, price: 500 }] })
test('rework submits only extra quantities and does not trust UI prices', () => {
 const payload = reworkPayload(8, draft())
 assert.equal(payload.lines[0].quantity, 0.12)
 assert.equal(payload.lines[0].sourceItemNo, 2)
 assert.equal(payload.expectedRevision, 8)
 assert.equal('price' in payload.lines[0], false)
})
test('zero-extra completion is allowed with measured dimensions and explanation', () => {
 const d = draft(); d.lines = []
 assert.deepEqual(reworkPayload(8, d).lines, [])
 d.note = ' '; assert.throws(() => reworkPayload(8, d))
})
test('negative, zero and fractional piece usage rejected', () => {
 for (const quantity of [-1, 0, 0.0000001, 1000000000]) {
  const d = draft(); d.lines[0].quantity = quantity; assert.throws(() => reworkPayload(8, d))
 }
 const d = draft(); d.lines[0].unit = 'PIECE'; assert.throws(() => reworkPayload(8, d))
})
test('duplicate sources and partial dimensions rejected', () => {
 const d = draft(); d.lines.push({ ...d.lines[0] }); assert.throws(() => reworkPayload(8, d))
 const missing = draft(); missing.lines[0].heightMm = ''; assert.throws(() => reworkPayload(8, missing))
})
test('new catalog article can be submitted without a source item', () => {
 const d = draft(); d.lines[0].sourceItemNo = null
 assert.equal(reworkPayload(8, d).lines[0].sourceItemNo, null)
})
test('opening requires physical return, no pending transfer and no invoice', () => {
 const p = { confirmed: true, state: 'COMPLETED', rework: { location: 'WORKSHOP', pending: null, invoiced: false } }
 assert.equal(canOpenRework(p), true)
 for (const extra of [{ invoiced: true }, { location: 'WAREHOUSE' }, { pending: 'WAREHOUSE' }, { active: {} }]) assert.equal(canOpenRework({ ...p, rework: { ...p.rework, ...extra } }), false)
})
test('active rework cannot use original completion/edit actions', () => {
 const p = { state: 'IN_PROGRESS', confirmed: false, rework: { active: { id: 1 } } }
 assert.equal(productEditable(p, true), false)
 assert.deepEqual(productActions(p), [])
})
test('rework draft preserves saved data and tracks edits independently', () => {
 const original = draft(); const copy = reworkDraft(original); const key = reworkKey(copy)
 copy.lines[0].quantity = 2
 assert.equal(original.lines[0].quantity, 0.12)
 assert.notEqual(reworkKey(copy), key)
})
