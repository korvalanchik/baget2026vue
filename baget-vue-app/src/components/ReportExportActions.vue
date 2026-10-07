<script setup>
import { ref } from 'vue'
import { apiOrigin } from '../services/auth.js'
const props = defineProps({ session: { type: Object, required: true }, kind: { type: String, required: true }, filters: { type: Object, required: true }, disabled: Boolean })
const busy = ref(false), error = ref('')
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const display = value => typeof value === 'number' ? value.toLocaleString('uk-UA', { maximumFractionDigits: 4 }) : value
function printHtml(table) {
 const cells = (row, tag = 'td') => row.map(v => `<${tag}>${escape(display(v))}</${tag}>`).join('')
 return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>${escape(table.title)}</title><style>@page{size:A4 landscape;margin:10mm}body{font:12px Arial;color:#172b36;margin:20px}h1{font-size:20px}p{margin:6px 0}table{border-collapse:collapse;width:100%;margin:16px 0;table-layout:fixed}th,td{border:1px solid #abb9c1;padding:6px;text-align:left;overflow-wrap:anywhere;vertical-align:top}th{background:#edf2f4}thead{display:table-header-group}tr{break-inside:avoid}.summary{max-width:700px}button{padding:12px;margin:12px 0}@media print{button{display:none}body{margin:0}}</style></head><body><button onclick="window.print()">Друкувати / Зберегти PDF</button><h1>${escape(table.title)}</h1>${table.notes.map(n => `<p>${escape(n)}</p>`).join('')}<table class="summary"><tbody>${table.summary.map(r => `<tr>${cells(r)}</tr>`).join('')}</tbody></table><table><thead><tr>${cells(table.headers, 'th')}</tr></thead><tbody>${table.rows.map(r => `<tr>${cells(r)}</tr>`).join('')}</tbody></table><p>Рядків: ${table.rows.length}</p></body></html>`
}
async function exportReport(format) {
 if (busy.value || props.disabled) return
 error.value = ''; let popup
 if (format === 'json') { popup = window.open('', '_blank'); if (!popup) { error.value = 'Дозвольте відкриття вікна для друку.'; return } popup.opener = null; popup.document.body.textContent = 'Формування звіту…' }
 busy.value = true
 try {
  const q = new URLSearchParams({ from: props.filters.from, to: props.filters.to, format })
  for (const key of ['branch', 'partner']) if (props.filters[key]) q.set(key, props.filters[key])
  const response = await fetch(`${apiOrigin}/api/reports/export/${props.kind}?${q}`, { headers: { Authorization: `Bearer ${props.session.token}` } })
  if (!response.ok) { const data = await response.json().catch(() => null); throw new Error(data?.message || `Не вдалося сформувати звіт (HTTP ${response.status})`) }
  if (format === 'json') { const table = await response.json(); if (!popup.closed) { popup.document.open(); popup.document.write(printHtml(table)); popup.document.close() } }
  else { const url = URL.createObjectURL(await response.blob()); const a = document.createElement('a'); a.href = url; a.download = `report-${props.kind}-${props.filters.from}.xlsx`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000) }
 } catch (e) { if (popup && !popup.closed) popup.close(); error.value = e.message } finally { busy.value = false }
}
</script>
<template><div class="report-export"><div><button type="button" :disabled="disabled || busy" @click="exportReport('json')">Друк / PDF</button><button type="button" :disabled="disabled || busy" @click="exportReport('xlsx')">Експорт Excel</button></div><small>Усі рядки за застосованими фільтрами. Дані оновлюються під час формування.</small><p v-if="busy" role="status">Формування звіту…</p><p v-if="error" role="alert">{{ error }}</p></div></template>
<style scoped>.report-export{margin:14px 0}.report-export>div{display:flex;flex-wrap:wrap;gap:8px}.report-export button{font:inherit;min-height:44px;padding:10px 16px;border:1px solid #185c63;border-radius:7px;background:white;color:#185c63;cursor:pointer}.report-export button:disabled{opacity:.5;cursor:wait}.report-export small{display:block;margin-top:7px;color:#526571}.report-export [role=alert]{color:#a22}</style>
