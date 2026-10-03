<script setup>
import { onMounted, ref } from 'vue'
import { partnerReconciliation } from '../services/partnerReconciliation.js'
const props = defineProps({ session: { type: Object, required: true }, initialPartner: { type: Number, default: null } })
const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
const dayPart = name => parts.find(p => p.type === name).value
const today = `${dayPart('year')}-${dayPart('month')}-${dayPart('day')}`
const from = ref(`${today.slice(0, 7)}-01`), to = ref(today), partner = ref(props.initialPartner || ''), options = ref([]), report = ref(null), busy = ref(false), error = ref('')
const money = n => Number(n || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
async function run(action) { if (busy.value) return; busy.value = true; error.value = ''; try { await action() } catch (e) { error.value = e.message } finally { busy.value = false } }
function loadOptions() { return run(async () => { options.value = await partnerReconciliation(props.session.token, '/options'); if (!partner.value && options.value.length === 1) partner.value = options.value[0].id }) }
function load() { return run(async () => { report.value = null; report.value = await partnerReconciliation(props.session.token, `?${new URLSearchParams({ partner: partner.value, from: from.value, to: to.value })}`) }) }
function pdf() { return run(async () => {
 const current = report.value
 const blob = await partnerReconciliation(props.session.token, `/pdf?${new URLSearchParams({ partner: current.partnerId, from: current.from, to: current.to })}`)
 const url = URL.createObjectURL(blob), link = document.createElement('a')
 link.href = url; link.download = `reconciliation-${current.partnerId}-${current.from}-${current.to}.pdf`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000)
}) }
onMounted(async () => { await loadOptions(); if (props.initialPartner && options.value.some(p => Number(p.id) === props.initialPartner)) await load() })
</script>
<template>
 <section class="reconciliation">
  <h2>Звірка з фірмою-посередником</h2>
  <p>Розрахунки фірми з вашим підприємством за всіма її філіями. Довідкові платежі кінцевих клієнтів у цей звіт не входять.</p>
  <form class="filters" @submit.prevent="load"><fieldset :disabled="busy"><label>Фірма<select v-model="partner" required><option value="">Оберіть фірму</option><option v-for="p in options" :key="p.id" :value="p.id">{{ p.name }}</option></select></label><label>Від<input v-model="from" type="date" required :max="to"></label><label>До, включно<input v-model="to" type="date" required :min="from"></label><button type="submit" :disabled="!partner">Сформувати звірку</button></fieldset></form>
  <p v-if="busy" role="status">Формування звірки…</p><p v-if="error" role="alert">{{ error }}</p>
  <p v-if="!busy && !options.length">Немає доступних фірм. Для повної звірки потрібні бухгалтерські права та доступ до всіх пов’язаних філій. <button @click="loadOptions">Оновити список</button></p>
  <article v-if="report">
   <header><div><h3>{{ report.partnerName }}</h3><p>{{ report.from }} — {{ report.to }} · час за Києвом</p></div><button :disabled="busy" @click="pdf">Завантажити PDF</button></header>
   <p>Сформовано {{ new Date(report.generatedAt).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' }) }}. PDF формується повторно за актуальними проводками за цей самий період.</p>
   <div class="summary"><div>Сальдо на початок<strong>{{ money(report.totals.opening) }}</strong></div><div>Нараховано за рахунками<strong>{{ money(report.totals.invoiced) }}</strong></div><div>Отримано коштів<strong>{{ money(report.totals.received) }}</strong></div><div>Повернено коштів<strong>{{ money(report.totals.refunded) }}</strong></div><div>Інші зміни сальдо<strong>{{ money(report.totals.otherChange) }}</strong></div><div>Сальдо на кінець<strong>{{ money(report.totals.closing) }}</strong></div></div>
   <p><strong>Борг після врахування коштів на балансі: {{ money(report.totals.closingDebt) }} грн. Кредитове сальдо: {{ money(report.totals.closingCredit) }} грн.</strong></p>
   <p>Доступний аванс зараз: <strong>{{ money(report.availableAdvanceNow) }} грн</strong>. Сальдо проводок без рахунку на кінець періоду: {{ money(report.unallocatedLedgerAtEnd) }} грн (усі проводки без рахунку, не обов’язково доступний аванс).</p>
   <p v-for="warning in report.warnings" :key="warning" class="hint">{{ warning }}</p>
   <h3>Проводки за період</h3><div class="scroll"><table><thead><tr><th>Дата / філія</th><th>Операція</th><th>Документ</th><th>Збільшення боргу</th><th>Зменшення боргу</th><th>Сальдо</th></tr></thead><tbody><tr v-for="e in report.entries" :key="e.id"><td>{{ e.date.replace('T', ' ') }}<small>{{ e.branchName }}</small></td><td>{{ e.label }}<small>{{ e.note }}</small></td><td>{{ e.invoiceNo ? `Рахунок № ${e.invoiceNo}` : e.reference }}</td><td>{{ e.direction === 'OUT' ? money(e.amount) : '—' }}</td><td>{{ e.direction === 'IN' ? money(e.amount) : '—' }}</td><td>{{ money(e.balance) }}</td></tr></tbody></table></div>
   <p v-if="!report.entries.length">Проводок у цьому періоді немає. Початкове сальдо перенесено без змін.</p>
   <p>Обороти з внутрішніми перенесеннями: збільшення {{ money(report.totals.debit) }} грн; зменшення {{ money(report.totals.credit) }} грн.</p>
   <h3>Рахунки з проводок періоду</h3><p>Деталізація пояснює документи. Їх суми не додаються до сальдо повторно; об’єднання переносить вже наявний борг.</p>
   <details v-for="i in report.invoices" :key="i.id"><summary>№ {{ i.invoiceNo }} · сума документа {{ money(i.amount) }} грн · сальдо рахунку на кінець періоду {{ money(i.ledgerBalanceAtEnd) }} грн</summary><p>Поточний стан: {{ ({ ACTIVE: 'активний', MERGED: 'об’єднаний' })[i.currentLifecycle] || i.currentLifecycle }}. {{ i.commercialOwner ? 'Збережено належність рахунку фірмі.' : 'Старий рахунок / без збереженої ознаки посередника.' }}</p><div class="scroll"><table><thead><tr><th>Філія</th><th>Замовлення</th><th>Виріб</th><th>До рахунку</th><th>Походження</th></tr></thead><tbody><tr v-for="(line, index) in i.lines" :key="index"><td>{{ line.branchName }}</td><td>{{ line.orderNo }}</td><td>{{ line.productId || 'Старий формат — ціле замовлення' }}</td><td>{{ money(line.amount) }}</td><td>{{ line.sourceInvoiceNo ? `Залишок з № ${line.sourceInvoiceNo}` : 'Первинне виставлення' }}</td></tr></tbody></table></div><p v-if="!i.lines.length">Деталізація відсутня.</p></details>
  </article>
 </section>
</template>
<style scoped>
.reconciliation{max-width:1400px;margin:20px auto}fieldset,header{display:flex;gap:12px;flex-wrap:wrap;align-items:end}fieldset{border:0;padding:0}header{justify-content:space-between}label{display:grid;gap:6px}input,select,button{font:inherit;padding:10px;border:1px solid #cdd6df;border-radius:7px;min-height:44px;box-sizing:border-box;max-width:100%}button{cursor:pointer}button:disabled{opacity:.5}p{line-height:1.5}h3{margin-bottom:8px}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.summary>div{padding:14px;background:#f0f5fa;border-radius:8px}.summary strong{display:block;font-size:20px;margin-top:6px}.scroll{overflow:auto}table{width:100%;border-collapse:collapse}th,td{padding:10px;text-align:left;border-bottom:1px solid #dce2e8;vertical-align:top}small{display:block;max-width:400px;overflow-wrap:anywhere}details{padding:12px;border:1px solid #dce2e8;border-radius:8px;margin:10px 0}summary{cursor:pointer;line-height:1.6}.hint{font-size:13px;color:#536171}[role=alert]{color:#a22}@media(max-width:600px){label{width:100%}input,select{font-size:16px;width:100%}.summary{grid-template-columns:1fr 1fr}.summary strong{font-size:17px}}
</style>
