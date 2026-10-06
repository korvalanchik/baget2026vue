import { apiOrigin } from './auth.js'
export async function warehouse(token, path, body) {
  const r = await fetch(`${apiOrigin}/api/warehouse${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const data = await r.json().catch(() => null)
  if (!r.ok) { const error = new Error(data?.message || 'Не вдалося виконати операцію. Оновіть дані.'); error.status = r.status; throw error }
  return data
}
export { locations, trackingToken } from '../calculation/tracking.js'
