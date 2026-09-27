export function paymentAmounts(amount, allocation, debt, available) {
 const cash = Number(amount || 0), advance = Number(allocation || 0)
 if (![cash, advance].every(n => Number.isFinite(n) && n >= 0 && Math.abs(n * 100 - Math.round(n * 100)) < 0.00001) || cash + advance <= 0)
  throw new Error('Вкажіть додатну оплату або суму зарахування авансу, до двох знаків після коми.')
 if (advance > Number(available)) throw new Error('Недостатньо доступного авансу платника.')
 if (Math.round(cash * 100) + Math.round(advance * 100) > Math.round(Number(debt) * 100))
  throw new Error('Сума перевищує залишок цього рахунку. Окремий аванс оформлюється у фінансах клієнта.')
 return { cash, allocated: advance }
}
