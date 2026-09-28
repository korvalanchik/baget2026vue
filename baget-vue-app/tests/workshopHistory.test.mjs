import test from 'node:test'
import assert from 'node:assert/strict'
import { branchDimensions, historyActualLabel } from '../src/calculation/workshopHistory.js'
const product = (w = 300, h = 400) => ({ kind: 'PRODUCT', product: { widthMm: w, heightMm: h, productQuantity: 2 } })
test('branch components are authoritative even when form differs', () => {
  const config = { draft: { components: [product()], form: { widthMm: 999, heightMm: 888 } } }
  assert.deepEqual(branchDimensions(config), [{ label: 'Оформлення', widthMm: 300, heightMm: 400, quantity: 2 }])
})
test('same artwork in product and mounting is shown once', () => assert.equal(branchDimensions({ draft: { components: [product(), { kind: 'MOUNTING', mounting: product().product }] } }).length, 1))
test('different component dimensions remain visible', () => assert.equal(branchDimensions({ draft: { components: [product(), { kind: 'MOUNTING', mounting: { widthMm: 350, heightMm: 450, productQuantity: 2 } }] } }).length, 2))
test('mounting-only and legacy form supported', () => {
  assert.equal(branchDimensions({ draft: { components: [{ kind: 'MOUNTING', mounting: product().product }] } })[0].widthMm, 300)
  assert.equal(branchDimensions({ draft: { form: { widthMm: '250', heightMm: '350' } } })[0].heightMm, 350)
})
test('missing values are not invented and invalid sizes stay unknown', () => {
  assert.deepEqual(branchDimensions(null), [])
  assert.deepEqual(branchDimensions({ draft: { components: [product('', -2)] } })[0], { label: 'Оформлення', widthMm: null, heightMm: null, quantity: 2 })
})
test('event uses its own configuration and leaves snapshot unchanged', () => {
  const config = { draft: { components: [product()] } }, before = JSON.stringify(config)
  const result = branchDimensions(config); result[0].widthMm = 700
  assert.equal(JSON.stringify(config), before)
  assert.equal(branchDimensions({ draft: { components: [product(600, 800)] } })[0].widthMm, 600)
})
test('only completion labels usage as confirmed', () => {
  assert.equal(historyActualLabel('COMPLETE'), 'Підтверджена витрата')
  assert.equal(historyActualLabel('STATE_ACCEPTED'), 'Збережена витрата за обміром')
})
