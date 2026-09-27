import test from 'node:test'
import assert from 'node:assert/strict'
import { measurementRequest, measurementStale, applyMeasurement } from '../src/calculation/measurement.js'
import { reworkDraft, reworkKey, reworkPayload } from '../src/calculation/rework.js'
const draft = { widthMm: 300, heightMm: 400 }
const original = [{ itemNo: 1, partNo: 27540, unit: 'SQUARE_METER', actual: 0.12, widthMm: '', heightMm: '', price: 100 }]
const result = { widthMm: 300, heightMm: 400, canApply: true, lines: [{ itemNo: 1, selectionIndex: 0, partNo: 27540, unit: 'SQUARE_METER', quantity: 0.4, widthMm: 400, heightMm: 500, note: 'З полями паспарту', segmentsPerProduct: [] }] }
test('normal calculation submits measured dimensions and revision only', () => {
 assert.deepEqual(measurementRequest(7, draft), { expectedRevision: 7, widthMm: 300, heightMm: 400 })
 assert.throws(() => measurementRequest(7, { widthMm: 0, heightMm: 400 }))
 assert.throws(() => measurementRequest(7, { widthMm: 100001, heightMm: 400 }))
})
test('calculated quantity and dimensions replace draft values without repricing', () => {
 const applied = applyMeasurement(original, result)
 assert.equal(applied[0].actual, 0.4); assert.equal(applied[0].widthMm, 400); assert.equal(applied[0].heightMm, 500)
 assert.equal(applied[0].price, 100); assert.equal(original[0].actual, 0.12)
})
test('changed composition cannot be silently applied', () => {
 assert.throws(() => applyMeasurement(original, { ...result, canApply: false }))
 assert.throws(() => applyMeasurement(original, { ...result, lines: [{ ...result.lines[0], partNo: 4460 }] }))
 assert.throws(() => applyMeasurement(original, { ...result, lines: [] }))
})
test('piece and cord dimensions clear stale rectangular dimensions', () => {
 const applied = applyMeasurement(original, { ...result, lines: [{ ...result.lines[0], widthMm: null, heightMm: null }] })
 assert.equal(applied[0].widthMm, ''); assert.equal(applied[0].heightMm, '')
})
test('rework only sends and updates selected additional positions', () => {
 const extras = [{ sourceItemNo: 1, partNo: 27540, unit: 'SQUARE_METER', quantity: 0.1, basis: 'ARTWORK', unitsPerProduct: 2 }]
 const request = measurementRequest(7, draft, extras)
 assert.equal(request.extras.length, 1); assert.equal(request.extras[0].unitsPerProduct, 2)
 assert.equal('quantity' in request.extras[0], false)
 const applied = applyMeasurement(extras, result, true)
 assert.equal(applied[0].quantity, 0.4); assert.equal(original[0].actual, 0.12)
})
test('changing dimensions makes preview stale', () => {
 assert.equal(measurementStale(result, draft), false)
 assert.equal(measurementStale(result, { ...draft, widthMm: 301 }), true)
})
test('rework basis and repetitions survive save payload and affect dirty detection', () => {
 const active = { ...draft, note: 'Обмір', lines: [{ sourceItemNo: null, partNo: 5130, unit: 'SQUARE_METER', quantity: 0.1, basis: 'ARTWORK', unitsPerProduct: 2, widthMm: '', heightMm: '' }] }
 const copy = reworkDraft(active), key = reworkKey(copy), payload = reworkPayload(7, copy)
 assert.equal(payload.lines[0].basis, 'ARTWORK'); assert.equal(payload.lines[0].unitsPerProduct, 2)
 copy.lines[0].unitsPerProduct = 3; assert.notEqual(reworkKey(copy), key)
})
test('empty additional selection does not repopulate original composition', () => {
 assert.deepEqual(measurementRequest(7, draft, []).extras, [])
 assert.deepEqual(applyMeasurement([], { ...result, lines: [] }, true), [])
})
