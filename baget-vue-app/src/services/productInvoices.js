import { apiOrigin } from './auth.js'

/**
 * Downloads or opens the same product-invoice PDF used by the accounting desk.
 * The endpoint and authenticated Blob download flow are shared by CRM.
 */
export async function productInvoicePdf(token, id, { open = false, print = false } = {}) {
 const tab = (open || print) ? window.open('about:blank', '_blank') : null
 if ((open || print) && !tab) throw new Error('Браузер заблокував нову вкладку. Дозвольте спливаючі вікна для цього сайту й повторіть.')
 try {
  const r = await fetch(`${apiOrigin}/api/product-invoices/${encodeURIComponent(id)}/pdf`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) {
   const error = new Error('Не вдалося сформувати PDF.')
   error.status = r.status
   throw error
  }
  const url = URL.createObjectURL(await r.blob())
  if (!open && !print) {
   const link = document.createElement('a')
   link.href = url
   link.download = `invoice-${id}.pdf`
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
