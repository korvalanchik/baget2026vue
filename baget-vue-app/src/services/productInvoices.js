import { apiOrigin } from './auth.js'
export async function productInvoices(token, path = '', body) {
 const r = await fetch(`${apiOrigin}/api/product-invoices${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
 const data = await r.json().catch(() => null)
 if (!r.ok) throw new Error(data?.message || 'Не вдалося виконати операцію з рахунком. Оновіть список і перевірте результат.')
 return data
}
export async function productInvoicePdf(token, id) {
 const r = await fetch(`${apiOrigin}/api/product-invoices/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } })
 if (!r.ok) throw new Error('Не вдалося сформувати PDF.')
 const url = URL.createObjectURL(await r.blob()), link = document.createElement('a')
 link.href = url; link.download = `invoice-${id}.pdf`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000)
}
