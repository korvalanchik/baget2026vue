import { apiOrigin } from './auth.js'
export async function customerPayments(token, path, payload) {
  const response = await fetch(`${apiOrigin}/api/customer-payments${path}`, {
    method: payload ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  })
  if (response.ok) return response.json()
  let message = response.status === 403 ? 'Немає доступу до фінансів цього клієнта чи філії.' : 'Не вдалося виконати операцію. Перевірте дані та повторіть.'
  try { message = (await response.json()).message || message } catch { /* Keep status message. */ }
  const error = new Error(message); error.status = response.status; throw error
}

export function canAcceptCustomerPayment(session) {
  return Boolean(session?.roles?.some(role => ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_SELLER', 'ROLE_LEVEL2', 'ROLE_COUNTER', 'ROLE_ACCOUNTANT', 'ROLE_BOOKKEEPER'].includes(role)))
}
