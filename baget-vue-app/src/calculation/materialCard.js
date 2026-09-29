export const movementNames = { RECEIPT: 'Прихід', COUNT: 'Інвентаризація', PRODUCTION: 'Списання на виріб', REWORK: 'Витрати на переробку', RESERVATION: 'Зміна резерву' }
export const reserveReasons = { DEMAND: 'Створення потреби', ALLOCATE: 'Виділення резерву', RELEASE: 'Звільнення резерву', PRODUCTION: 'Завершення виробництва', REWORK_DEMAND: 'Потреба переробки', ACTUAL_DEMAND: 'Уточнення фактичної потреби', STOCKTAKE: 'Інвентаризація' }
export const quantityText = value => value == null ? 'Невідомо' : Number(value).toLocaleString('uk-UA', { maximumFractionDigits: 6 })
export function cardCsv(events) {
  const cell = value => {
    let text = String(value ?? '')
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text
    return '"' + text.replaceAll('"', '""') + '"'
  }
  const rows = [['Дата', 'Операція', 'Зміна', 'До', 'Після', 'Замовлення', 'Виріб', 'Акт', 'Постачання', 'Накладна', 'Виконавець', 'Примітка'],
    ...events.map(e => [e.createdAt, movementNames[e.type] || e.type, e.delta, e.stockBefore, e.stockAfter, e.orderNo, e.productId, e.stocktakeId, e.supplierOrderId, e.receiptNo, e.actor, reserveReasons[e.note] || e.note])]
  return '\ufeff' + rows.map(row => row.map(cell).join(';')).join('\r\n')
}
