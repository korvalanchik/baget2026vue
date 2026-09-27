import { actualsPayload } from './production.js'

export const productStates = {
  WAITING: 'Очікує приймання', ACCEPTED: 'Прийнято майстром', IN_PROGRESS: 'В роботі',
  PAUSED: 'Призупинено', COMPLETED: 'Виготовлено', STOPPED: 'Виконання припинено',
}
export function productEditable(product, canEdit) {
  return canEdit && !product.confirmed && !product.rework?.active && ['ACCEPTED', 'IN_PROGRESS'].includes(product.state)
}
export function productActions(product) {
  if (product.confirmed || product.rework?.active) return []
  const choices = {
    WAITING: [['ACCEPTED', 'Прийняти від філії']],
    ACCEPTED: [['IN_PROGRESS', 'Почати роботу'], ['PAUSED', 'Призупинити']],
    IN_PROGRESS: [['PAUSED', 'Призупинити']],
    PAUSED: [['IN_PROGRESS', 'Відновити роботу']],
  }
  return choices[product.state] || []
}
export function correctionPayload(view, product) {
  const widthMm = Number(product.widthMm), heightMm = Number(product.heightMm)
  if (![widthMm, heightMm].every(v => Number.isFinite(v) && v > 0 && v <= 999999))
    throw new Error('Вкажіть додатні фактичні ширину й висоту виробу в міліметрах.')
  const note = product.note?.trim()
  if (!note || note.length > 2000) throw new Error('Додайте примітку до обміру або причину коригування (до 2000 символів).')
  return { ...actualsPayload(view, product.lines), widthMm, heightMm, note }
}
export function productDraft(product) {
  return { ...product, widthMm: product.widthMm ?? '', heightMm: product.heightMm ?? '', note: product.note ?? '',
    lines: product.lines.map(line => ({ ...line, actual: line.actual ?? '', widthMm: line.widthMm ?? '', heightMm: line.heightMm ?? '' })) }
}
export function draftKey(product) {
  return JSON.stringify({ widthMm: product.widthMm, heightMm: product.heightMm, note: product.note,
    lines: product.lines.map(l => [l.itemNo, l.actual, l.widthMm, l.heightMm]) })
}
