import { apiOrigin } from './auth.js'

export async function workPrices(token, path = '', body = null) {
  const response = await fetch(`${apiOrigin}/api/work-prices${path}`, {
    method: body ? 'PUT' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.message || 'Не вдалося зберегти ціни робіт.')
    error.status = response.status
    throw error
  }
  return data
}
