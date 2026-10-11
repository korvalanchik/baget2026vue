// Calendar dates only; no local timezone or DST arithmetic.
function date(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null
  const d = new Date(value + 'T12:00:00Z')
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value ? d : null
}
export function kyivToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = type => parts.find(p => p.type === type).value
  return `${get('year')}-${get('month')}-${get('day')}`
}
export function addWorkingDays(start, count) {
  const d = date(start)
  if (!d || !Number.isInteger(count) || count < 0) return null
  while (count > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (![0, 6].includes(d.getUTCDay())) count--
  }
  return d.toISOString().slice(0, 10)
}
export function leadTime(due, start, shortage = false, settings = { minDays: 5, normalDays: 7, shortageDays: 10 }) {
  const earliest = addWorkingDays(start, settings.minDays), normal = addWorkingDays(start, settings.normalDays), extended = addWorkingDays(start, settings.shortageDays)
  const target = shortage ? extended : earliest
  return { earliest, normal, extended, target, warning: Boolean(date(due) && target && due < target) }
}
export function shortageMaterials(order) {
  return (order?.products || []).flatMap(p => (p.materials || [])
    .filter(m => Number(m.shortage) > 0)
    .map(m => ({ ...m, productId: p.id, productName: p.clientProductId })))
}
