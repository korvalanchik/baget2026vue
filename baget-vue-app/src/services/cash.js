import { apiOrigin } from './auth.js'
export async function cashApi(token, path = '', body) {
 const r = await fetch(`${apiOrigin}/api/cash${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, cache: 'no-store', ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
 const data = await r.json().catch(() => null)
 if (!r.ok) { const e = new Error(data?.message || `Не вдалося виконати касову операцію (HTTP ${r.status})`); e.status = r.status; throw e }
 return data
}
