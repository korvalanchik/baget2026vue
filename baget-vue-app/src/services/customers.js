import { apiOrigin } from './auth.js'

function headers(token) { return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
async function getData(response, fallback) {
  if (response.ok) return response.json()
  let message = fallback
  try { message = (await response.json()).message || message } catch { /* Сервер не повернув повідомлення. */ }
  throw new Error(response.status === 401 ? 'Сесія завершилася. Увійдіть до системи ще раз.' : response.status === 403 ? 'У вас немає доступу до даних клієнтів.' : message)
}

export async function loadCustomerDashboard(token, filters) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value !== '' && value !== null && value !== undefined) params.set(key, value) })
  const response = await fetch(`${apiOrigin}/api/customers/dashboard?${params}`, { headers: headers(token) })
  return getData(response, 'Не вдалося завантажити список клієнтів.')
}
export async function loadBranches(token) {
  const response = await fetch(`${apiOrigin}/api/branch/manager`, { headers: headers(token) })
  return getData(response, 'Не вдалося завантажити філії.')
}
export async function loadCustomerFinance(token, customerId) {
  const response = await fetch(`${apiOrigin}/api/customers/${customerId}/finance`, { headers: headers(token) })
  return getData(response, 'Не вдалося завантажити фінанси клієнта.')
}
export async function addAdvance(token, payload) {
  const response = await fetch(`${apiOrigin}/api/customers/advance`, { method: 'POST', headers: headers(token), body: JSON.stringify(payload) })
  return getData(response, 'Не вдалося зберегти аванс.')
}
export async function payInvoice(token, payload) {
  const response = await fetch(`${apiOrigin}/api/customers/invoices/payments`, { method: 'POST', headers: headers(token), body: JSON.stringify(payload) })
  return getData(response, 'Не вдалося зберегти оплату.')
}
