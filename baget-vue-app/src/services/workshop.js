import { apiOrigin } from './auth.js'

async function request(token, path, options = {}) {
  const response = await fetch(`${apiOrigin}/api/orders${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!response.ok) {
    let message = 'Не вдалося виконати запит. Спробуйте ще раз.'
    try { message = (await response.json()).message || message } catch { /* No JSON error body. */ }
    if (response.status === 401) message = 'Сесія завершилася. Увійдіть ще раз.'
    if (response.status === 403) message = 'У вас немає доступу до цієї дії.'
    throw new Error(message)
  }
  const body = await response.text()
  return body ? JSON.parse(body) : null
}

export async function loadWorkshopOrders(token) {
  const orders = new Map()
  for (let page = 0; ; page++) {
    const data = await request(token, `/summary?size=200&page=${page}`)
    const rows = Array.isArray(data) ? data : data?.content
    if (!Array.isArray(rows)) throw new Error('Сервер повернув невірний список замовлень.')
    let added = 0
    for (const order of rows) {
      if (!orders.has(String(order.orderNo))) added++
      orders.set(String(order.orderNo), { ...order, statusOrder: Number(order.statusOrder) })
    }
    if (Array.isArray(data) || data.last === true || (Number.isFinite(data.totalPages) && page + 1 >= data.totalPages) || rows.length === 0) break
    if (!added) throw new Error('Сервер повторює сторінку замовлень. Не вдалося завантажити повну дошку.')
    if (rows.length < 200 && data.last !== false && !Number.isFinite(data.totalPages)) break
  }
  return [...orders.values()]
}
export const loadWorkshopOrder = (token, orderNo) => request(token, `/${encodeURIComponent(orderNo)}`)
export const saveWorkshopOrder = (token, order) => request(token, `/${encodeURIComponent(order.orderNo)}`, { method: 'PUT', body: JSON.stringify(order) })

export const workshopColumns = [
  { id: 'todo', title: 'Треба зробити', statuses: [1], color: '#cf943f' },
  { id: 'work', title: 'В роботі', statuses: [2], color: '#668bbd' },
  { id: 'done', title: 'Зроблено', statuses: [3], color: '#60a086' },
  { id: 'calculated', title: 'Розраховано', statuses: [6], color: '#9580bc' },
  { id: 'finance', title: 'Рахунки й оплата', statuses: [4, 7, 8, 9], color: '#9580bc' },
  { id: 'delivery', title: 'Передача', statuses: [11, 12], color: '#60a086' },
  { id: 'stopped', title: 'Відмова / неможливе виконання', statuses: [5, 10], color: '#b76767' },
]
export function millimeters(value) { return value == null ? '' : Math.round(Number(value) * 1000000) / 1000 }
export function urgency(order, now = new Date()) {
  if (![1, 2].includes(Number(order.statusOrder))) return ''
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const due = order.shipDate ? new Date(String(order.shipDate).slice(0, 10) + 'T00:00:00').getTime() : NaN
  if (Number.isFinite(due)) return due < today ? 'Прострочено' : due === today ? 'На сьогодні' : ''
  const age = (now.getTime() - new Date(order.saleDate).getTime()) / 86400000
  return age > 5 ? 'Понад 5 днів' : age > 3 ? 'Понад 3 дні' : ''
}
