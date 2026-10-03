import { apiOrigin } from './auth.js'
export async function partnerPayments(token, path, payload) {
 const response = await fetch(`${apiOrigin}/api/partner-payments${path}`, {
  method: payload ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  ...(payload ? { body: JSON.stringify(payload) } : {}),
 })
 const data = await response.json().catch(() => null)
 if (!response.ok) { const error = new Error(data?.message || `Не вдалося завантажити або записати кошти посередника (HTTP ${response.status}).`); error.status = response.status; throw error }
 return data
}
