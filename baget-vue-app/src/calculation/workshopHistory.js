// Read the saved branch configuration, never the master's mutable measurement draft.
export function branchDimensions(configuration) {
  const draft = configuration?.draft
  const components = Array.isArray(draft?.components) ? draft.components : []
  const positive = value => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null
  const size = (value, label) => ({ label, widthMm: positive(value?.widthMm), heightMm: positive(value?.heightMm), quantity: positive(value?.productQuantity) })
  const rows = components.flatMap(c => {
    if (c.kind === 'PRODUCT' && c.product) return [size(c.product, 'Оформлення')]
    if (c.kind === 'MOUNTING' && c.mounting) return [size(c.mounting, 'Натяжка')]
    return []
  })
  if (!rows.length && draft?.form) rows.push(size(draft.form, 'Виріб'))
  // Equal dimensions and count for product/mounting describe the same physical artwork.
  return rows.filter((r, i) => !rows.slice(0, i).some(p => p.widthMm === r.widthMm && p.heightMm === r.heightMm && p.quantity === r.quantity))
}
export function historyActualLabel(action) {
  return action === 'COMPLETE' ? 'Підтверджена витрата' : 'Збережена витрата за обміром'
}
