import test from 'node:test'
import assert from 'node:assert/strict'
import { countPayload, stocktakeDraft, draftFingerprint, reservationReductions, printStocktake } from '../src/calculation/stocktake.js'
const doc = () => ({ revision: 3, date: '2026-09-29', note: 'Інвентаризація', lines: [{ partNo: 10, unit: 'METER', counted: null, note: '' }, { partNo: 20, unit: 'PIECE', counted: 0, note: 'Немає' }] })
test('unknown count stays empty and zero remains counted', () => { const d = stocktakeDraft(doc()); assert.equal(d.lines[0].counted, ''); assert.equal(d.lines[1].counted, 0); const p = countPayload(doc(), d); assert.equal(p.lines[0].quantity, null); assert.equal(p.lines[1].quantity, 0) })
test('partial counts can be saved without treating empty as zero', () => { const d = stocktakeDraft(doc()); d.lines[0].counted = '1.234567'; assert.equal(countPayload(doc(), d).lines[0].quantity, 1.234567) })
test('negative and fractional pieces are rejected', () => { const d = stocktakeDraft(doc()); d.lines[1].counted = '1.5'; assert.throws(() => countPayload(doc(), d)); d.lines[1].counted = '-1'; assert.throws(() => countPayload(doc(), d)) })
test('duplicate material rejected', () => { const d = stocktakeDraft(doc()); d.lines.push(d.lines[0]); assert.throws(() => countPayload(doc(), d)) })
test('new line must establish baseline before entering count', () => { const d = stocktakeDraft(doc()); d.lines[0].new = true; d.lines[0].counted = 2; assert.throws(() => countPayload(doc(), d)); d.lines[0].counted = ''; assert.equal(countPayload(doc(), d).lines[0].quantity, null) })
test('count and reason changes invalidate fingerprint', () => { const d = stocktakeDraft(doc()), key = draftFingerprint(d); d.lines[0].note = 'Знайдено'; assert.notEqual(draftFingerprint(d), key); d.lines[0].note = ''; d.lines[0].counted = 0; assert.notEqual(draftFingerprint(d), key) })
test('only reduced reservations require explicit acknowledgment', () => { const r = { lines: [{ description: 'Frame', unit: 'METER', reservations: [{ id: 1, before: 5, after: 2 }, { id: 2, before: 0, after: 3 }, { id: 3, before: 1, after: 1 }] }] }; assert.deepEqual(reservationReductions(r).map(x => x.id), [1]) })
test('empty acts and missing date or reason rejected', () => { const d = stocktakeDraft(doc()); d.lines = []; assert.throws(() => countPayload(doc(), d)); const emptyNote = stocktakeDraft(doc()); emptyNote.note = ' '; assert.throws(() => countPayload(doc(), emptyNote)) })
test('draft cannot be printed as posted act', () => assert.throws(() => printStocktake({ status: 'DRAFT' }, {})))
