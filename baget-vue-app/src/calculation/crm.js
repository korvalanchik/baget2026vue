export const outcomes = { PICKUP_ISSUED: 'Видано клієнту', NOTIFIED: 'Повідомлено', NO_ANSWER: 'Не відповів', CALL_BACK: 'Передзвонити', AGREEMENT: 'Домовленість', NOTE: 'Примітка', DONE: 'Домовленість завершено', PARTNER: 'Зміна колишньої позначки «Партнер»', PICKUP_NOTIFIED: 'Повідомлено про готовність', PICKUP_NO_ANSWER: 'Не відповів щодо отримання', PICKUP_AGREED: 'Домовлено про отримання', PICKUP_CLEAR: 'Дату отримання прибрано' }
export const locations = { BRANCH: 'На філії', WORKSHOP: 'У майстерні', WAREHOUSE: 'На складі', CUSTOMER: 'Отримано клієнтом' }
export const productionStates = { WAITING: 'Очікує приймання', ACCEPTED: 'Прийнято майстром', IN_PROGRESS: 'У роботі', PAUSED: 'Призупинено', COMPLETED: 'Готовий', STOPPED: 'Зупинено' }
export const orderStates = { 0: 'Не вказано', 1: 'Прийнято', 2: 'У роботі', 3: 'Вироблено', 4: 'Оплачено', 5: 'Відмова клієнта', 6: 'Розраховано', 7: 'До оплати', 8: 'Рахунок-фактура', 9: 'Частково оплачено', 10: 'Неможливе виконання', 11: 'На філії', 12: 'Отримано клієнтом' }
export function phoneLink(value) { const number = String(value || '').replace(/[^+0-9]/g, ''); return /\d/.test(number) ? 'tel:' + number : null }
export function contactPayload(form, key, revision) {
  const note = form.note.trim()
  if (!note || note.length > 2000) throw new Error('Вкажіть примітку до 2000 символів.')
  if (form.outcome === 'CALL_BACK' && !form.nextContactDate) throw new Error('Вкажіть дату наступного дзвінка.')
  const reference = value => {
    if (value === '' || value == null) return null
    const id = Number(value)
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Некоректний номер документа.')
    return id
  }
  return { requestKey: key, expectedRevision: revision, outcome: form.outcome, note, orderNo: reference(form.orderNo), invoiceId: reference(form.invoiceId), nextContactDate: form.outcome === 'DONE' ? null : form.nextContactDate || null }
}
export function groupedOrders(rows) {
  const groups = new Map()
  for (const row of rows) {
    if (!groups.has(row.orderNo)) groups.set(row.orderNo, { orderNo: row.orderNo, status: row.status, commerceMode: row.commerceMode, partnerName: row.partnerName, products: [], partial: false })
    if (row.productId) groups.get(row.orderNo).products.push(row)
  }
  for (const order of groups.values()) {
    const ready = order.products.filter(p => p.state === 'COMPLETED' && p.location !== 'CUSTOMER').length
    const working = order.products.filter(p => !['COMPLETED', 'STOPPED'].includes(p.state) && p.location !== 'CUSTOMER').length
    order.partial = ready > 0 && working > 0
  }
  return [...groups.values()]
}
