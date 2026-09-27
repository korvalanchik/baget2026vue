import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paymentAmounts } from '../src/calculation/billing.js'
test('cash and advance jointly settle debt', () => assert.deepEqual(paymentAmounts('20', '30', '50.00', 40), { cash: 20, allocated: 30 }))
test('advance alone is valid', () => assert.deepEqual(paymentAmounts('', '10', 20, 15), { cash: 0, allocated: 10 }))
test('overpayment, unavailable advance and negative values rejected', () => {
 for (const args of [[30,30,50,100],[0,20,100,10],[-1,20,100,100],[0,0,100,100],[Infinity,0,100,100],[0.001,0,100,100]]) assert.throws(() => paymentAmounts(...args))
})
test('cent arithmetic does not reject 0.10 plus 0.20', () => assert.deepEqual(paymentAmounts('.10','.20','.30',1), { cash: .1, allocated: .2 }))
