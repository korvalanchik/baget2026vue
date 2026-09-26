import { test } from 'node:test'
import assert from 'node:assert/strict'
import { correctionPayload, productActions, productEditable, productDraft, draftKey } from '../src/calculation/workshop.js'
const make = () => productDraft({ id: 10, state: 'IN_PROGRESS', confirmed: false, widthMm: 300, heightMm: 400, note: 'Переміряв', lines: [{ itemNo: 1, actual: 0, unit: 'METER', widthMm: null, heightMm: null }] })
test('product correction carries only its lines and current order revision', () => {
  const payload = correctionPayload({ revision: 7 }, make())
  assert.deepEqual(payload, { expectedRevision: 7, widthMm: 300, heightMm: 400, note: 'Переміряв', lines: [{ itemNo: 1, quantity: 0, widthMm: null, heightMm: null }] })
})
test('measured dimensions and correction reason are required', () => {
  for (const bad of ['', 0, -1, Infinity]) { const p = make(); p.widthMm = bad; assert.throws(() => correctionPayload({ revision: 7 }, p)) }
  const p = make(); p.note = ' '; assert.throws(() => correctionPayload({ revision: 7 }, p))
})
test('piece quantities must be integers and line dimensions must be paired', () => {
  const p = make(); p.lines[0].unit = 'PIECE'; p.lines[0].actual = .5
  assert.throws(() => correctionPayload({ revision: 7 }, p))
  p.lines[0].actual = 1; p.lines[0].widthMm = 200
  assert.throws(() => correctionPayload({ revision: 7 }, p))
})
test('confirmed products have no editing or transition actions', () => {
  const p = make(); p.confirmed = true
  assert.equal(productEditable(p, true), false); assert.deepEqual(productActions(p), [])
})
test('waiting needs acceptance and paused needs resume', () => {
  const p = make(); p.state = 'WAITING'; assert.deepEqual(productActions(p).map(x => x[0]), ['ACCEPTED'])
  assert.equal(productEditable(p, true), false)
  p.state = 'PAUSED'; assert.deepEqual(productActions(p).map(x => x[0]), ['IN_PROGRESS']); assert.equal(productEditable(p, true), false)
})
test('draft changes are independent and zero consumption is preserved', () => {
  const a = make(), b = make(), before = draftKey(b)
  a.lines[0].actual = 3
  assert.equal(draftKey(b), before); assert.equal(b.lines[0].actual, 0)
  assert.notEqual(draftKey(a), before); assert.equal(productEditable(a, false), false)
})
