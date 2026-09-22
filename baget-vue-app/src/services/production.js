import { apiOrigin } from './auth.js'
async function request(token, path, method = 'GET', payload) {
  const response = await fetch(`${apiOrigin}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.message || 'Не вдалося виконати дію. Оновіть картку й перевірте результат.')
  return data
}
export const production = (token, id, suffix = '', method = 'GET', payload) => request(token, `/api/calculated-orders/${id}/production${suffix}`, method, payload)
export const issueProductionInvoice = (token, id) => request(token, `/api/orders/${id}/issue-invoice`, 'POST', { invoice: { reference: 'За підтвердженою фактичною витратою' } })
