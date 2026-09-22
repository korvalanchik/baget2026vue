import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actualsPayload, statusNames } from '../src/calculation/production.js'
test('status 5 is refusal and delivery has distinct stages', () => {
  assert.equal(statusNames[5], 'Відмова клієнта')
  assert.equal(statusNames[11], 'Прийнято до філії')
  assert.equal(statusNames[12], 'Отримано клієнтом')
})
test('actual quantity is total consumption, no repeated multiplication by products or layers', () => {
  assert.deepEqual(actualsPayload({revision: 3}, [{itemNo: 1, actual: '5.5', widthMm: '400', heightMm: '500', unit: 'METER'}]),
    {expectedRevision: 3, lines: [{itemNo: 1, quantity: 5.5, widthMm: 400, heightMm: 500}]})
})
test('empty consumption is not silently treated as zero', () => {
  assert.throws(() => actualsPayload({revision: 1}, [{itemNo: 1, actual: ''}]))
})
test('explicit zero is accepted for unused material', () => {
  assert.equal(actualsPayload({revision: 1}, [{itemNo: 1, actual: 0}]).lines[0].quantity, 0)
})
test('negative consumption and fractional pieces are rejected', () => {
  for (const row of [{actual: -1}, {actual: 1.5, unit: 'PIECE'}]) assert.throws(() => actualsPayload({revision: 1}, [row]))
})
test('partial dimensions are rejected', () => {
  assert.throws(() => actualsPayload({revision: 1}, [{itemNo: 1, actual: 1, widthMm: 400, heightMm: ''}]))
})
