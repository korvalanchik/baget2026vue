export const supplierStates = { DRAFT: 'Чернетка', ORDERED: 'Замовлено', PARTIAL: 'Частково отримано', RECEIVED: 'Отримано', CANCELLED: 'Скасовано', CLOSED: 'Залишок закрито' }
export const stockUnits = { METER: 'м', SQUARE_METER: 'м²', PIECE: 'шт' }
export function stockQuantity(value, unit, allowZero = false) {
  const text = String(value ?? '').trim()
  if (!/^\d+(\.\d{1,6})?$/.test(text)) throw new Error('Вкажіть кількість з точністю до 6 знаків після крапки.')
  const n = Number(text)
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0) || n > 999999999 || (unit === 'PIECE' && !Number.isInteger(n))) throw new Error('Перевірте кількість; штуки мають бути цілими.')
  return n
}
export function draftPayload(draft, key) {
  if (!Number.isSafeInteger(Number(draft.vendorNo)) || Number(draft.vendorNo) <= 0) throw new Error('Оберіть постачальника.')
  if (!draft.lines.length || draft.lines.length > 200) throw new Error('Додайте від 1 до 200 матеріалів.')
  const seen = new Set()
  return { requestKey: key, vendorNo: Number(draft.vendorNo), expectedDate: draft.expectedDate || null, note: draft.note.trim(), lines: draft.lines.map(l => {
    if (seen.has(l.partNo)) throw new Error('Матеріал повторюється.')
    seen.add(l.partNo)
    return { partNo: l.partNo, quantity: stockQuantity(l.quantity, l.unit) }
  }) }
}
export function receiptPayload(order, form, key) {
  if (!['ORDERED', 'PARTIAL'].includes(order.status)) throw new Error('Замовлення не відкрите для приходу.')
  if (!form.documentNo.trim() || !form.receivedDate) throw new Error('Вкажіть номер накладної та дату приходу.')
  const lines = order.lines.filter(l => String(form.quantities[l.id] ?? '').trim() !== '' && Number(form.quantities[l.id]) !== 0).map(l => {
    const quantity = stockQuantity(form.quantities[l.id], l.unit)
    if (quantity > Number(l.remaining)) throw new Error(`Прихід перевищує залишок замовлення: ${l.description}.`)
    return { lineId: l.id, quantity }
  })
  if (!lines.length) throw new Error('Вкажіть отриману кількість хоча б одного матеріалу.')
  return { requestKey: key, expectedRevision: order.revision, documentNo: form.documentNo.trim(), receivedDate: form.receivedDate, note: form.note.trim(), lines }
}
export function localDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function supplierCsv(order) {
  const cell = value => {
    let text = String(value ?? '')
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text
    return '"' + text.replaceAll('"', '""') + '"'
  }
  const rows = [
    ['Замовлення постачальнику', order.id], ['Постачальник', order.vendorName],
    ['Стан', supplierStates[order.status]], ['Очікувана дата', order.expectedDate], ['Примітка', order.note], [],
    ['Матеріал', 'Одиниця', 'Замовлено', 'Отримано', 'Непоставлено'],
    ...order.lines.map(l => [l.description, stockUnits[l.unit], l.ordered, l.received, l.remaining]),
  ]
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n')
}
