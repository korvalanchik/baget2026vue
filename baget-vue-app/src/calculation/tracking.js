export const locations = { BRANCH: 'Філія замовлення', WORKSHOP: 'Майстерня', WAREHOUSE: 'Склад готових виробів', CUSTOMER: 'Клієнт' }
export function trackingToken(value) {
  const text = value.trim()
  let token = text
  try { token = new URL(text).searchParams.get('product') || text } catch { /* Allow a label identifier. */ }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) throw new Error('Відскануйте QR або вставте посилання з етикетки.')
  return token
}
