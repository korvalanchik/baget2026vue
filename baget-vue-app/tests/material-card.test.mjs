import test from 'node:test'
import assert from 'node:assert/strict'
import { cardCsv, quantityText, movementNames, reserveReasons } from '../src/calculation/materialCard.js'
test('unknown balance is not displayed as zero', () => {
  assert.equal(quantityText(null), 'Невідомо')
  assert.equal(quantityText(0), '0')
})
test('CSV includes document references and preserves quoted text', () => {
  const csv = cardCsv([{ type: 'COUNT', stockBefore: null, stockAfter: 0, stocktakeId: 12, note: 'Причина "обмір"' }])
  assert.ok(csv.startsWith('\ufeff'))
  assert.ok(csv.includes('"12"'))
  assert.ok(csv.includes('"Причина ""обмір"""'))
  assert.ok(csv.includes('"Інвентаризація"'))
})
test('CSV neutralizes spreadsheet formulas in untrusted descriptions', () => {
  for (const note of ['=1+1', '+SUM(A1)', '-2+3', '@SUM(A1)', '\t=1']) {
    assert.ok(cardCsv([{ note }]).includes('"' + "'" + note + '"'))
  }
})
test('reservation operations have distinct label and known reasons', () => {
  assert.equal(movementNames.RESERVATION, 'Зміна резерву')
  assert.equal(reserveReasons.STOCKTAKE, 'Інвентаризація')
})
