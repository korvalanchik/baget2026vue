import { apiOrigin } from './auth.js'

async function getData(response, fallback) {
  if (response.ok) return response.json()
  let message = fallback
  try { message = (await response.json()).message || message } catch { /* Сервер не повернув деталізовану помилку. */ }
  throw new Error(response.status === 401 ? 'Сесія завершилася. Увійдіть до системи ще раз.' : message)
}
function headers(token) { return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }

export async function loadOrderCatalog(token, configuredOnly = false) {
  const query = configuredOnly ? '?configuredOnly=true' : ''
  const response = await fetch(`${apiOrigin}/api/parts/profillist${query}`, { headers: headers(token) })
  return getData(response, 'Не вдалося завантажити каталог багетів.')
}
export async function searchCustomers(token, prefix) {
  const response = await fetch(`${apiOrigin}/api/customers/searchByPhonePrefix?prefix=${encodeURIComponent(prefix)}`, { headers: headers(token) })
  return getData(response, 'Не вдалося знайти клієнтів.')
}
export async function createOrder(token, order) {
  const numberResponse = await fetch(`${apiOrigin}/api/orders/next-order-number`, { headers: headers(token) })
  const orderNo = await getData(numberResponse, 'Не вдалося отримати номер замовлення.')
  const payload = { ...order, orderNo, saleDate: new Date().toISOString() }
  const response = await fetch(`${apiOrigin}/api/orders/batch`, { method: 'POST', headers: headers(token), body: JSON.stringify([payload]) })
  const result = await getData(response, 'Не вдалося зберегти замовлення.')
  const saved = Array.isArray(result) ? result[0] : result
  if (saved && saved.success === false) throw new Error(saved.message || 'Сервер не зміг зберегти замовлення.')
  return { orderNo, result: saved }
}
