import { apiOrigin } from './auth.js'
export async function productInvoices(token, path = '', body) {
 const r = await fetch(`${apiOrigin}/api/product-invoices${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
 const data = await r.json().catch(() => null)
 if (!r.ok) { const error = new Error(data?.message || (body ? 'Не вдалося виконати операцію з рахунком. Оновіть список і перевірте результат.' : `Не вдалося завантажити дані рахунків (HTTP ${r.status}). Спробуйте оновити вкладку.`)); error.status = r.status; throw error }
 return data
}

/**
 * Downloads or opens the same product-invoice PDF used by the accounting desk.
 * The endpoint and authenticated Blob download flow are shared by CRM.
 */
export async function productInvoicePdf(token, id, { open = false, print = false, filename = `Invoice-${id}.pdf`, format = 'general' } = {}) {
 const tab = (open || print) ? window.open('about:blank', '_blank') : null
 if ((open || print) && !tab) throw new Error('Браузер заблокував нову вкладку. Дозвольте спливаючі вікна для цього сайту й повторіть.')
 try {
  const r = await fetch(`${apiOrigin}/api/product-invoices/${encodeURIComponent(id)}/pdf?format=${encodeURIComponent(format)}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) {
   const error = new Error('Не вдалося сформувати PDF.')
   error.status = r.status
   throw error
  }
  const url = URL.createObjectURL(await r.blob())
  if (!open && !print) {
   const link = document.createElement('a')
   link.href = url
   link.download = filename
   document.body.appendChild(link)
   link.click()
   link.remove()
   setTimeout(() => URL.revokeObjectURL(url), 30000)
   return
  }
  tab.location.replace(url)
  if (print) {
   // Let the browser's native PDF viewer load the document; the user can print
   // with its toolbar or Ctrl+P without an intermediate HTML/iframe wrapper.
   tab.addEventListener('load', () => {
    try { tab.focus(); tab.print() } catch { /* Native PDF viewer may own printing. */ }
   }, { once: true })
  }
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000)
 } catch (error) {
  if (tab && !tab.closed) tab.close()
  throw error
 }
}
