import test from 'node:test'
import assert from 'node:assert/strict'
import { draftPayload, receiptPayload, stockQuantity } from '../src/calculation/procurement.js'
const draft = () => ({ vendorNo: 5, expectedDate: '', note: '', lines: [{ partNo: 10, unit: 'METER', quantity: '3.25' }] })
const order = () => ({ status: 'PARTIAL', revision: 3, lines: [{ id: 1, unit: 'METER', remaining: 4, description: 'Багет' }, { id: 2, unit: 'PIECE', remaining: 2, description: 'Кліпса' }] })
const form = quantities => ({ documentNo: '  Н-1 ', receivedDate: '2026-09-28', note: '', quantities })
test('draft uses stock quantities and nullable date', () => assert.deepEqual(draftPayload(draft(), 'key'), { requestKey: 'key', vendorNo: 5, expectedDate: null, note: '', lines: [{ partNo: 10, quantity: 3.25 }] }))
test('duplicate parts rejected', () => { const d = draft(); d.lines.push(d.lines[0]); assert.throws(() => draftPayload(d, 'key')) })
test('supplier and positive quantity required', () => { const d = draft(); d.vendorNo = ''; assert.throws(() => draftPayload(d, 'key')); d.vendorNo = 5; d.lines[0].quantity = '0'; assert.throws(() => draftPayload(d, 'key')) })
test('receipt sends only received lines, blank and zero remain open', () => assert.deepEqual(receiptPayload(order(), form({ 1: '1.25', 2: '0' }), 'key').lines, [{ lineId: 1, quantity: 1.25 }]))
test('whole pieces and overdelivery validated', () => { assert.throws(() => receiptPayload(order(), form({ 1: '4.1' }), 'key')); assert.throws(() => receiptPayload(order(), form({ 2: '1.5' }), 'key')) })
test('empty receipt and closed documents rejected', () => { assert.throws(() => receiptPayload(order(), form({}), 'key')); assert.throws(() => receiptPayload({ ...order(), status: 'CLOSED' }, form({ 1: '1' }), 'key')) })
test('reference and date required', () => { assert.throws(() => receiptPayload(order(), { ...form({ 1: '1' }), documentNo: ' ' }, 'key')); assert.throws(() => receiptPayload(order(), { ...form({ 1: '1' }), receivedDate: '' }, 'key')) })
test('policy permits zero while consumption does not', () => { assert.equal(stockQuantity('0', 'METER', true), 0); assert.throws(() => stockQuantity('0', 'METER')); assert.throws(() => stockQuantity('1.0000001', 'METER')); assert.throws(() => stockQuantity('', 'METER', true)) })
test('supplier CSV escapes spreadsheet formulas and multiline notes', async () => {
  const { supplierCsv } = await import('../src/calculation/procurement.js')
  const csv = supplierCsv({ id: 2, vendorName: '=1+2', status: 'ORDERED', note: 'Рядок "1"\n2', lines: [{ description: '+formula', unit: 'METER', ordered: 2, received: 0, remaining: 2 }] })
  assert.ok(csv.startsWith('\uFEFF'))
  assert.ok(csv.includes('"\'=1+2"'))
  assert.ok(csv.includes('"\'+formula"'))
  assert.ok(csv.includes('"Рядок ""1""\n2"'))
})
