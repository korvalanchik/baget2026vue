export function moneyCents(value) {
  const text = String(value ?? '').trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Вкажіть невід’ємну суму, до двох знаків після коми.')
  const [whole, fraction = ''] = text.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents > 99999999999) throw new Error('Сума завелика.')
  return cents
}
export function paymentAmounts(amount, allocation, debt, available) {
  const cash = moneyCents(amount), advance = moneyCents(allocation)
  if (cash + advance <= 0) throw new Error('Вкажіть суму нового надходження або авансу.')
  if (advance > moneyCents(available)) throw new Error('Недостатньо доступного авансу.')
  if (debt != null && cash + advance > moneyCents(debt)) throw new Error('Сума перевищує борг. Надлишок внесіть окремим авансом.')
  return { amount: cash / 100, allocationAmount: advance / 100 }
}
