import { apiOrigin } from './auth.js'
export async function commercial(token, path, body, method = 'POST') {
 const response = await fetch(`${apiOrigin}/api/commercial${path}`, { method: body ? method : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
 let data
 try { data = await response.json() } catch { /* Fallback below. */ }
 if (!response.ok) throw new Error(data?.message || 'Не вдалося виконати дію. Перевірте доступ і оновіть дані.')
 return data
}
