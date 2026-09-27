function dimension(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0 || n > 100000 || !/^\d+(?:\.\d{1,3})?$/.test(String(value))) throw new Error('Для перерахунку введіть обмір роботи: додатні розміри до 100000 мм, до 3 знаків після коми.')
  return n
}
export function measurementRequest(revision, draft, extras = null) {
  const request = { expectedRevision: revision, widthMm: dimension(draft.widthMm), heightMm: dimension(draft.heightMm) }
  if (extras !== null) request.extras = extras.map(l => {
    const unitsPerProduct = Number(l.unitsPerProduct ?? 1), basis = l.basis ?? 'OUTER'
    if (!Number.isInteger(unitsPerProduct) || unitsPerProduct < 1 || unitsPerProduct > 10000 || !['ARTWORK', 'OUTER'].includes(basis)) throw new Error('Оберіть основу розміру та цілу кількість повторів від 1 до 10000.')
    return { sourceItemNo: l.sourceItemNo ?? null, partNo: l.partNo, basis, unitsPerProduct }
  })
  return request
}
export function measurementStale(result, draft) {
  return !!result && (Number(result.widthMm) !== Number(draft.widthMm) || Number(result.heightMm) !== Number(draft.heightMm))
}
export function applyMeasurement(lines, result, rework = false) {
  if (!result.canApply) throw new Error('Новий обмір потребує зміни складу. Перегляньте розрахунок і узгодьте матеріали.')
  if (result.lines.length !== lines.length) throw new Error('Склад таблиці змінився. Повторіть розрахунок.')
  const mapped = new Map(result.lines.map(l => [rework ? l.selectionIndex : l.itemNo, l]))
  if (mapped.size !== lines.length) throw new Error('Розрахунок містить дублікати позицій.')
  const replacements = lines.map((l, i) => {
    const calculated = mapped.get(rework ? i : l.itemNo)
    if (!calculated || calculated.partNo !== l.partNo || (calculated.unit && l.unit !== calculated.unit)) throw new Error('Розрахунок не відповідає матеріалам у таблиці.')
    return { ...l, [rework ? 'quantity' : 'actual']: calculated.quantity, widthMm: calculated.widthMm ?? '', heightMm: calculated.heightMm ?? '', calculationNote: calculated.note, segmentsPerProduct: calculated.segmentsPerProduct }
  })
  return replacements
}
