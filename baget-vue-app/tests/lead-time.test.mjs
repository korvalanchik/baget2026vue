import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../src/calculation/leadTime.js', import.meta.url), 'utf8')
const { addWorkingDays, leadTime, kyivToday, shortageMaterials } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
test('working days exclude start and weekends', () => {
 assert.equal(addWorkingDays('2026-10-01',5),'2026-10-08')
 assert.equal(addWorkingDays('2026-10-01',7),'2026-10-12')
 assert.equal(addWorkingDays('2026-10-01',10),'2026-10-15')
 assert.equal(addWorkingDays('2026-10-03',5),'2026-10-09')
 assert.equal(addWorkingDays('2026-12-31',5),'2027-01-07')
})
test('exactly five days allowed; past date warns', () => {
 assert.equal(leadTime('2026-10-08','2026-10-01').warning,false)
 assert.equal(leadTime('2026-10-07','2026-10-01').warning,true)
 assert.equal(leadTime('2026-09-30','2026-10-01').warning,true)
 assert.equal(leadTime('','2026-10-01').warning,false)
})
test('shortage extends target without shortening later dates', () => {
 assert.equal(leadTime('2026-10-14','2026-10-01',true).warning,true)
 assert.equal(leadTime('2026-10-15','2026-10-01',true).warning,false)
 assert.equal(leadTime('2026-10-20','2026-10-01',true).warning,false)
})
test('Kyiv date and invalid dates', () => {
 assert.equal(kyivToday(new Date('2026-09-30T22:30:00Z')),'2026-10-01')
 assert.equal(addWorkingDays('2026-02-30',5),null)
})
test('only positive shortages, across all products', () => {
 assert.equal(shortageMaterials(null).length,0)
 assert.deepEqual(shortageMaterials({products:[{id:1,materials:[{partNo:1,shortage:'0'},{partNo:2,shortage:'0.1'}]},{id:2,materials:[{partNo:3,shortage:2}]}]}).map(m=>m.partNo),[2,3])
})
