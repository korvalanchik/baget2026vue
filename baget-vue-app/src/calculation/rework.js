export const reworkModes = { WORKSHOP: 'Виправлення за рахунок майстерні', CUSTOMER: 'Платна зміна клієнта' }
export function reworkDraft(active) {
  return {
    widthMm: active?.widthMm ?? '', heightMm: active?.heightMm ?? '', note: active?.note ?? '',
    lines: (active?.lines || []).map(l => ({ ...l, basis: l.basis ?? 'OUTER', unitsPerProduct: l.unitsPerProduct ?? 1, widthMm: l.widthMm ?? '', heightMm: l.heightMm ?? '' })),
  }
}
export function reworkKey(draft) {
  return JSON.stringify([draft.widthMm, draft.heightMm, draft.note, draft.lines.map(l => [l.sourceItemNo ?? null, l.partNo, l.quantity, l.widthMm, l.heightMm, l.basis, l.unitsPerProduct])])
}
function dimension(v) {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0 || n > 999999 || !/^\d+(?:\.\d{1,3})?$/.test(String(v))) throw new Error('Розміри мають бути додатними, до 3 знаків після коми.')
  return n
}
export function reworkPayload(revision, draft) {
  const note = draft.note.trim()
  if (!note || note.length > 2000) throw new Error('Вкажіть результат обміру та опис виконаних змін (до 2000 символів).')
  if (draft.lines.length > 200) throw new Error('Дозволено до 200 додаткових позицій.')
  const seen = new Set()
  const lines = draft.lines.map(l => {
    const key = l.sourceItemNo ? `item:${l.sourceItemNo}` : `part:${l.partNo}`
    if (seen.has(key)) throw new Error('Дубль позиції. Об’єднайте її додаткову витрату в одному рядку.')
    seen.add(key)
    const quantity = Number(l.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999999999 || !/^\d+(?:\.\d{1,6})?$/.test(String(l.quantity)) || (l.unit === 'PIECE' && !Number.isInteger(quantity)))
      throw new Error('Додаткова витрата має бути додатною; штучні позиції — цілими. Видаліть невикористані рядки.')
    const hasWidth = l.widthMm !== '' && l.widthMm != null, hasHeight = l.heightMm !== '' && l.heightMm != null
    if (hasWidth !== hasHeight) throw new Error('Вкажіть обидва розміри позиції або залиште їх порожніми.')
    const basis = l.basis ?? 'OUTER', unitsPerProduct = Number(l.unitsPerProduct ?? 1)
    if (!['ARTWORK', 'OUTER'].includes(basis) || !Number.isInteger(unitsPerProduct) || unitsPerProduct < 1 || unitsPerProduct > 10000) throw new Error('Некоректна основа розміру або кількість повторів.')
    return { basis, unitsPerProduct, sourceItemNo: l.sourceItemNo ?? null, partNo: l.partNo, quantity, widthMm: hasWidth ? dimension(l.widthMm) : null, heightMm: hasHeight ? dimension(l.heightMm) : null }
  })
  return { expectedRevision: revision, widthMm: dimension(draft.widthMm), heightMm: dimension(draft.heightMm), note, lines }
}
export function canOpenRework(product) {
  return product.confirmed && product.state === 'COMPLETED' && !product.rework?.invoiced && !product.rework?.active
    && product.rework?.location === 'WORKSHOP' && !product.rework?.pending
}
