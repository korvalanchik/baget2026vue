import { apiOrigin } from './auth.js'
export async function leadTimeSettings(token, body) {
 const r = await fetch(`${apiOrigin}/api/settings/lead-time`, { method: body ? 'PUT' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, cache: 'no-store', ...(body ? { body: JSON.stringify(body) } : {}) })
 const data = await r.json().catch(() => null)
 if (!r.ok) throw new Error(data?.message || `Не вдалося завантажити строки (HTTP ${r.status})`)
 return data
}
