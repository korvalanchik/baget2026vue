import { apiOrigin } from './auth.js'
export async function telegramSettings(token, body, retryId) {
 const suffix = retryId ? `/deliveries/${retryId}/retry` : ''
 const r = await fetch(`${apiOrigin}/api/settings/telegram${suffix}`, { method: retryId ? 'POST' : body ? 'PUT' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, cache: 'no-store', ...(body ? { body: JSON.stringify(body) } : {}) })
 const data = await r.json().catch(() => null)
 if (!r.ok) throw new Error(data?.message || `Не вдалося виконати операцію Telegram (HTTP ${r.status}). Оновіть дані та перевірте отримувачів.`)
 return data
}
