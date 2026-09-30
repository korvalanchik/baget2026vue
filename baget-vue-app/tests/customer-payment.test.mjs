import test from 'node:test'
import assert from 'node:assert/strict'
import { moneyCents, paymentAmounts } from '../src/calculation/customerPayment.js'
test('advance only', () => assert.deepEqual(paymentAmounts('500', 0, null, 0), { amount: 500, allocationAmount: 0 }))
test('partial payment leaves debt', () => assert.deepEqual(paymentAmounts(100, 200, 1000, 500), { amount: 100, allocationAmount: 200 }))
test('full settlement with advance and fresh money', () => assert.deepEqual(paymentAmounts(300, 700, 1000, 900), { amount: 300, allocationAmount: 700 }))
test('advance can cover invoice without new cash', () => assert.deepEqual(paymentAmounts(0, 500, 500, 800), { amount: 0, allocationAmount: 500 }))
test('decimal amounts use cents', () => assert.deepEqual(paymentAmounts('0.10', '0.20', '0.30', '0.20'), { amount: 0.1, allocationAmount: 0.2 }))
test('cannot spend more advance than available', () => assert.throws(() => paymentAmounts(0, 501, 1000, 500)))
test('cannot silently convert overpayment into advance', () => assert.throws(() => paymentAmounts(101, 100, 200, 100)))
test('empty, negative, fractional cents and nonfinite rejected', () => { for (const v of ['', -1, '1.001', 'NaN', Infinity, '1e3', '1000000000']) assert.throws(() => moneyCents(v)) })
test('zero operation rejected', () => assert.throws(() => paymentAmounts(0, 0, 100, 10)))
