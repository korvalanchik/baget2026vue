export const statusNames = {
  0: 'Не вказано', 1: 'Прийнято', 2: 'В роботі', 3: 'Вироблено', 4: 'Оплачено',
  5: 'Відмова клієнта', 6: 'Розраховано', 7: 'До оплати', 8: 'Рахунок-фактура',
  9: 'Частково оплачено', 10: 'Не можливе виконання', 11: 'Прийнято до філії', 12: 'Отримано клієнтом',
}
export function actualsPayload(view, rows) {
  const number = (value, optional = false) => {
    if (value === '' || value == null) {
      if (optional) return null
      throw new Error('Вкажіть фактичну витрату кожної позиції. Якщо не використано — 0.')
    }
    const n = Number(value)
    if (!Number.isFinite(n) || n < 0 || (optional && n === 0)) throw new Error('Перевірте кількість і розміри.')
    return n
  }
  return { expectedRevision: view.revision, lines: rows.map(row => {
    const widthMm = number(row.widthMm, true), heightMm = number(row.heightMm, true)
    if ((widthMm == null) !== (heightMm == null)) throw new Error('Вкажіть обидва розміри або залиште обидва порожніми.')
    const quantity = number(row.actual)
    if (row.unit === 'PIECE' && !Number.isInteger(quantity)) throw new Error('Штучні позиції потребують цілої кількості.')
    return { itemNo: row.itemNo, quantity, widthMm, heightMm }
  }) }
}
