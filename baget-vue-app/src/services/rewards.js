import { apiOrigin } from './auth.js'
export async function rewards(token, path = '', body) {
 const response = await fetch(`${apiOrigin}/api/rewards${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
 const data = await response.json().catch(() => null)
 if (!response.ok) { const error = new Error(data?.message || `Не вдалося виконати операцію винагород (HTTP ${response.status})`); error.status = response.status; throw error }
 return data
}
