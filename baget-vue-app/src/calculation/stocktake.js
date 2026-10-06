import { stockQuantity } from './procurement.js'
export const stocktakeStates = { DRAFT: 'Чернетка', POSTED: 'Проведено', CANCELLED: 'Скасовано' }
export function countPayload(doc, draft) {
  if (!draft.date || !draft.note.trim()) throw new Error('Вкажіть дату й підставу інвентаризації.')
  if (!draft.lines.length || draft.lines.length > 200) throw new Error('У документі має бути від 1 до 200 матеріалів.')
  const seen = new Set()
  return { expectedRevision: doc.revision, date: draft.date, note: draft.note.trim(), lines: draft.lines.map(l => {
    if (seen.has(l.partNo)) throw new Error('Матеріал повторюється.')
    seen.add(l.partNo)
    const quantity = l.counted == null || String(l.counted).trim() === '' ? null : stockQuantity(l.counted, l.unit, true)
    if (l.new && (quantity != null || l.countInput)) throw new Error('Спочатку збережіть додавання нового матеріалу.')
    return { partNo: l.partNo, quantity, note: (l.note || '').trim(), ...(l.countInput ? { countInput: l.countInput } : {}) }
  }) }
}
export function stocktakeDraft(doc) {
  return { date: doc.date, note: doc.note, lines: doc.lines.map(l => ({ ...l, counted: l.counted ?? '', countInput: l.countBreakdown?.input ?? null, new: false })) }
}
export function draftFingerprint(draft) {
  return JSON.stringify([draft.date, draft.note, draft.lines.map(l => [l.partNo, l.counted, l.note || '', l.countInput || null])])
}
export function reservationReductions(review) {
  return (review?.lines || []).flatMap(l => (l.reservations || []).filter(r => Number(r.after) < Number(r.before)).map(r => ({ ...r, description: l.description, unit: l.unit })))
}
// Build with DOM textContent, never interpolate material names or notes into HTML.
export function printStocktake(doc, units) {
  if (doc.status !== 'POSTED' || !doc.postedSnapshot) throw new Error('Друк акта доступний після проведення.')
  const frame = window.document.createElement('iframe')
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0'; window.document.body.append(frame)
  const d = frame.contentDocument
  const add = (tag, text, parent = d.body) => { const e = d.createElement(tag); e.textContent = text; parent.append(e); return e }
  add('title', `Акт інвентаризації № ${doc.id}`, d.head)
  add('style', 'body{font:12px sans-serif;margin:15mm}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #777;padding:5px;text-align:left}thead{display:table-header-group}tr{break-inside:avoid}', d.head)
  add('h1', `Акт інвентаризації № ${doc.id}`)
  add('p', `Дата: ${doc.date}. Склав: ${doc.actor}. Провів: ${doc.postedBy}, ${doc.postedAt}.`)
  add('p', doc.note)
  const table = add('table', ''), head = add('tr', '', add('thead', '', table)), body = add('tbody', '', table)
  for (const name of ['Матеріал', 'Од.', 'Було', 'Пораховано', 'Різниця', 'Причина', 'Як пораховано']) add('th', name, head)
  for (const l of doc.postedSnapshot.lines) {
    const row = add('tr', '', body)
    for (const text of [l.description, units[l.unit] || l.unit, l.current.stock ?? 'Невідомо', l.counted, l.difference ?? 'Початковий залишок', l.note, countBreakdownText(l.countBreakdown)]) add('td', text, row)
  }
  const reductions = reservationReductions(doc.postedSnapshot)
  if (reductions.length) {
    add('h2', 'Погоджене зменшення резервів')
    for (const r of reductions) add('p', `Замовлення № ${r.orderNo}, виріб ${r.productId}: ${r.description}, резерв ${r.before} → ${r.after} ${units[r.unit] || r.unit}, нестача ${r.shortageAfter}.`)
  }
  add('p', 'Підпис відповідального: ____________________')
  frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 1000)
}

export function countBreakdownText(b) {
 if (!b) return ''
 return [...(b.entries || []).map(e => `${e.label}: ${e.count} × ${e.factor} = ${e.subtotal}`), `Залишок: ${b.input?.remainder ?? 0}`, `Разом: ${b.total}`].join('; ')
}
