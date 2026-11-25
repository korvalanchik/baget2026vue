import { apiOrigin } from './auth.js'

/** Opens the current informational PDF for a saved reseller-branch order. */
export async function openPreliminaryOrderInvoice(token, orderNo) {
  const tab = window.open('about:blank', '_blank')
  if (!tab) throw new Error('Браузер заблокував нову вкладку. Дозвольте спливаючі вікна для цього сайту й повторіть.')
  tab.document.title = 'Попередній рахунок'
  tab.document.body.innerHTML = '<p style="font:16px sans-serif;padding:24px">Формуємо попередній рахунок…</p>'
  let url
  try {
    const response = await fetch(`${apiOrigin}/api/calculated-orders/${encodeURIComponent(orderNo)}/preliminary-invoice.pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      let data = null
      try { data = await response.json() } catch { /* Non-JSON error response. */ }
      throw new Error(data?.message || 'Не вдалося сформувати попередній рахунок.')
    }
    url = URL.createObjectURL(await response.blob())
    tab.location.replace(url)
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000)
  } catch (error) {
    if (!tab.closed) tab.close()
    throw error
  }
}
