import { apiOrigin } from './auth.js'

function pdfErrorMessage(response, data) {
  if (response.status === 401) return 'Сесія завершилася. Увійдіть до системи ще раз.'
  if (response.status === 403) return 'У вас немає доступу до цього рахунку або його філії.'
  return data?.message || 'Не вдалося сформувати PDF рахунку.'
}

/**
 * Opens a new tab synchronously so browsers don't block the window after the
 * authenticated fetch completes. The API remains the source of the document.
 */
export async function openCustomerInvoicePdf(token, invoiceId, { print = false } = {}) {
  const tab = window.open('about:blank', '_blank')
  if (!tab) throw new Error('Браузер заблокував нову вкладку. Дозвольте спливаючі вікна для цього сайту й повторіть.')

  tab.document.title = 'Рахунок клієнта'
  tab.document.body.innerHTML = '<p style="font:16px sans-serif;padding:24px">Формуємо PDF рахунку…</p>'

  let pdfUrl
  try {
    const response = await fetch(`${apiOrigin}/api/invoices/${encodeURIComponent(invoiceId)}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      let data = null
      try { data = await response.json() } catch { /* The server may return non-JSON error text. */ }
      throw new Error(pdfErrorMessage(response, data))
    }

    pdfUrl = URL.createObjectURL(await response.blob())
    if (!print) {
      tab.location.replace(pdfUrl)
    } else {
      const shell = `<!doctype html>
<html lang="uk">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Друк рахунку</title>
<style>
*{box-sizing:border-box}html,body{height:100%;margin:0;font:14px Arial,sans-serif;color:#233442}
header{height:48px;display:flex;align-items:center;gap:12px;padding:6px 14px;border-bottom:1px solid #dce4e9}
button{font:inherit;padding:8px 14px;border:1px solid #a9bbc6;border-radius:6px;background:#fff;cursor:pointer}
p{margin:0;color:#566976}iframe{display:block;border:0;width:100%;height:calc(100% - 48px)}
</style></head>
<body>
<header><button id="print">Надрукувати рахунок</button><p>Якщо діалог друку не відкрився автоматично, натисніть кнопку або скористайтеся Ctrl+P.</p></header>
<iframe id="document" title="Рахунок PDF" src="${pdfUrl}"></iframe>
<script>
const frame=document.getElementById('document');
document.getElementById('print').addEventListener('click',()=>{try{frame.contentWindow.focus();frame.contentWindow.print()}catch(e){window.print()}});
frame.addEventListener('load',()=>{setTimeout(()=>{try{frame.contentWindow.focus();frame.contentWindow.print()}catch(e){}},600)});
</script>
</body></html>`
      const shellUrl = URL.createObjectURL(new Blob([shell], { type: 'text/html;charset=utf-8' }))
      tab.location.replace(shellUrl)
      setTimeout(() => URL.revokeObjectURL(shellUrl), 120000)
    }
    // The PDF viewer may load lazily. Keep the object URL alive while the tab is open.
    setTimeout(() => URL.revokeObjectURL(pdfUrl), 10 * 60 * 1000)
  } catch (error) {
    if (!tab.closed) tab.close()
    throw error
  }
}
