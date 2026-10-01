import { apiOrigin } from './auth.js'

export async function previewEstimate(token, payload, signal, branch, orderNo) {
  const query = new URLSearchParams()
  if (branch) query.set('branch', branch)
  if (orderNo) query.set('orderNo', orderNo)
  const response = await fetch(`${apiOrigin}/api/calculations/estimate-preview?${query}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal,
  })
  let data
  try { data = await response.json() } catch { /* Повідомлення нижче для відповіді без JSON. */ }
  if (!response.ok) {
    const message = response.status === 401 ? 'Сесія завершилася. Увійдіть знову.'
      : response.status === 403 ? 'Недостатньо прав для розрахунку.'
      : data?.message || 'Не вдалося розрахувати кошторис. Перевірте підключення та налаштування матеріалів.'
    const error = new Error(message)
    error.clientItemId = data?.clientItemId
    error.code = data?.code
    throw error
  }
  if (!Array.isArray(data?.items) || data?.total == null) throw new Error('Сервер повернув некоректний кошторис.')
  return data
}
