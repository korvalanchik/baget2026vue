import test from 'node:test'
import assert from 'node:assert/strict'
import { contactPayload, groupedOrders, phoneLink } from '../src/calculation/crm.js'
const form = { outcome: 'NOTE', note: ' Текст ', orderNo: '', invoiceId: '', nextContactDate: '' }
test('blank note is rejected', () => assert.throws(() => contactPayload({ ...form, note: ' ' }, 'key', 0)))
test('callback requires date', () => assert.throws(() => contactPayload({ ...form, outcome: 'CALL_BACK' }, 'key', 0)))
test('done clears reminder but retains history payload', () => {
  assert.equal(contactPayload({ ...form, outcome: 'DONE', nextContactDate: '2026-10-01' }, 'key', 3).nextContactDate, null)
})
test('empty references stay null; invalid references rejected', () => {
  assert.equal(contactPayload(form, 'key', 0).orderNo, null)
  for (const orderNo of ['abc', '-1', '0', '1.5']) assert.throws(() => contactPayload({ ...form, orderNo }, 'key', 0))
})
test('phone link contains only phone characters', () => assert.equal(phoneLink('+38 (066) 123-45-67'), 'tel:+380661234567'))
test('partial readiness requires ready and unfinished products', () => {
  const rows = [{ orderNo: 1, productId: 1, state: 'COMPLETED', location: 'BRANCH' }, { orderNo: 1, productId: 2, state: 'IN_PROGRESS', location: 'WORKSHOP' }]
  assert.equal(groupedOrders(rows)[0].partial, true)
  assert.equal(groupedOrders([{ ...rows[0], location: 'CUSTOMER' }, rows[1]])[0].partial, false)
})
test('legacy order survives grouping without invented products', () => assert.equal(groupedOrders([{ orderNo: 1, status: 3 }])[0].products.length, 0))
