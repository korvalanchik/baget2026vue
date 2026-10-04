import { apiOrigin } from './auth.js'
export async function crm(token, path, body) {
  const response = await fetch(`${apiOrigin}/api/crm${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) { const error = new Error(data?.message || (response.status === 403 ? 'Сервер повернув 403 без пояснення. Перевірте сесію та журнал бекенду.' : 'Не вдалося виконати операцію CRM.')); error.status = response.status; throw error }
  return data
}
