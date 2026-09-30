import { apiOrigin } from './auth.js'
export async function customerCredit(token, path, payload) {
 const response = await fetch(`${apiOrigin}/api/customer-credit${path}`, { method: payload ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}) })
 if (response.ok) return response.json()
 let message = 'Не вдалося завантажити або змінити умови відстрочки.'
 try { message = (await response.json()).message || message } catch { /* Keep message. */ }
 throw new Error(message)
}
