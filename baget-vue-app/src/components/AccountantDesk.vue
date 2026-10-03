<script setup>
import { newRequestKey } from '../services/requestKey.js'
import { computed, onMounted, ref } from 'vue'
import { paymentAmounts } from '../calculation/billing.js'
import { productInvoices, productInvoicePdf } from '../services/productInvoices.js'
const props = defineProps({ session: { type: Object, required: true } })
const tab = ref('ready'), ready = ref([]), invoices = ref([]), page = ref(0), picked = ref([]), chosenInvoices = ref([])
const busy = ref(false), error = ref(''), message = ref(''), detail = ref(null), options = ref({ branches: [], payers: [], partners: [] })
const partnerFilter = ref('')
const payerSearch = ref(''), payer = ref(null), branch = ref(''), note = ref(''), amount = ref(''), advance = ref(''), paymentPending = ref(false)
let retry = null, paymentRetry = null
const money = n => Number(n || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const status = { ISSUED: 'Виставлено', PARTIALLY_PAID: 'Частково оплачено', PAID: 'Оплачено', CANCELLED: 'Скасовано' }
const selectedTotal = computed(() => ready.value.filter(p => picked.value.includes(p.productId)).reduce((s, p) => s + Number(p.amount), 0))
const selectedRows = computed(() => ready.value.filter(p => picked.value.includes(p.productId)))
const resellerOwner = computed(() => tab.value === 'ready'
  ? selectedRows.value.find(p => p.commerceMode === 'RESELLER')?.partnerId
  : invoices.value.find(i => chosenInvoices.value.includes(i.id) && i.partnerId)?.partnerId)
const billingBranches = computed(() => resellerOwner.value ? options.value.branches.filter(b => b.mode === 'OWN') : options.value.branches)
function choosePartner() {
  page.value = 0
  const partner = options.value.partners?.find(p => Number(p.id) === Number(partnerFilter.value))
  payer.value = partner || null
  if (partner) branch.value = options.value.branches.find(b => b.mode === 'OWN')?.id || ''
  refresh()
}
const mergeTotal = computed(() => invoices.value.filter(i => chosenInvoices.value.includes(i.id)).reduce((s, i) => s + Number(i.debt), 0))
async function run(fn) { if (busy.value) return; busy.value = true; error.value = ''; message.value = ''; try { await fn() } catch (e) { error.value = e.message } finally { busy.value = false } }
async function load() { if (tab.value === 'ready') ready.value = await productInvoices(props.session.token, `/ready?page=${page.value}${partnerFilter.value ? `&partnerId=${partnerFilter.value}` : ''}`); else invoices.value = await productInvoices(props.session.token, `?page=${page.value}`) }
function refresh() { picked.value = []; chosenInvoices.value = []; return run(load) }
function changeTab(t) { if (busy.value) return; tab.value = t; page.value = 0; refresh() }
function turn(n) { page.value += n; refresh() }
function findPayer() { return run(async () => { options.value = await productInvoices(props.session.token, `/options?q=${encodeURIComponent(payerSearch.value)}`) }) }
function useOwner(p) {
 if (p.commerceMode === 'RESELLER') {
  payer.value = options.value.partners?.find(v => Number(v.id) === Number(p.partnerId)) || { id: p.partnerId, name: `Фірма № ${p.partnerId}` }
  branch.value = options.value.branches.find(b => b.mode === 'OWN')?.id || ''
 } else { payer.value = { id: p.customerId, name: p.customerName }; branch.value = p.branchNo }
}
function open(id) { return run(async () => { detail.value = await productInvoices(props.session.token, `/${id}`); amount.value = ''; advance.value = ''; paymentPending.value = false }) }
function submit(merge = false) { return run(async () => {
  if (!payer.value || !branch.value) throw new Error('Оберіть платника та філію обліку.')
  if ((!merge && !picked.value.length) || (merge && chosenInvoices.value.length < 2)) throw new Error(merge ? 'Оберіть щонайменше два рахунки з боргом.' : 'Оберіть вироби.')
  if (resellerOwner.value) {
    if (Number(payer.value.id) !== Number(resellerOwner.value)) throw new Error('Платником має бути фірма-посередник обраних виробів або рахунків.')
    if (!billingBranches.value.some(b => Number(b.id) === Number(branch.value))) throw new Error('Оберіть власну філію обліку підприємства.')
    const selected = merge ? invoices.value.filter(i => chosenInvoices.value.includes(i.id)) : selectedRows.value
    if (selected.some(p => Number(p.partnerId) !== Number(resellerOwner.value))) throw new Error('Оберіть позиції лише однієї фірми-посередника.')
  }
  const payload = { payerId: Number(payer.value.id), branchNo: Number(branch.value), note: note.value, ...(merge ? { invoiceIds: [...chosenInvoices.value].sort((a, b) => a - b) } : { products: ready.value.filter(p => picked.value.includes(p.productId)).map(p => ({ productId: p.productId, confirmedRevision: p.confirmedRevision })) }) }
  const signature = JSON.stringify([merge, payload]); if (!retry || retry.signature !== signature) retry = { signature, requestKey: newRequestKey() }
  if (!window.confirm(`${merge ? 'Перенести залишки боргу в об’єднаний рахунок' : 'Виставити рахунок'} для «${payer.value.name}»? Сума за поточними даними: ${money(merge ? mergeTotal.value : selectedTotal.value)} грн.`)) return
  detail.value = await productInvoices(props.session.token, merge ? '/merge' : '', { ...payload, requestKey: retry.requestKey })
  retry = null; picked.value = []; chosenInvoices.value = []; message.value = `Створено рахунок № ${detail.value.invoiceNo}.`; paymentPending.value = false; amount.value = ''; advance.value = ''; await load()
}) }
function payment() { return run(async () => {
  const { cash, allocated } = paymentAmounts(amount.value, advance.value, detail.value.debt, detail.value.availableAdvance)
  if (!window.confirm(`Підтвердити оплату ${money(cash)} грн і зарахування авансу ${money(allocated)} грн?`)) return
  paymentPending.value = true
  const payload = { amount: cash, allocationAmount: allocated, expectedDebt: detail.value.debt, note: note.value }
  const signature = JSON.stringify([detail.value.id, payload]); if (!paymentRetry || paymentRetry.signature !== signature) paymentRetry = { signature, requestKey: newRequestKey() }
  detail.value = await productInvoices(props.session.token, `/${detail.value.id}/payment`, { ...payload, requestKey: paymentRetry.requestKey }); paymentRetry = null; paymentPending.value = false; amount.value = ''; advance.value = ''; message.value = 'Операцію проведено.'; await load()
}) }
function pdf() { return run(() => productInvoicePdf(props.session.token, detail.value.id)) }
onMounted(() => run(async () => { options.value = await productInvoices(props.session.token, '/options'); if (options.value.branches.length === 1) branch.value = options.value.branches[0].id; await load() }))
</script>
<template>
 <section class="accountant">
  <h1>Рахунки за виробами</h1><p>Готові вироби з підтвердженими витратами та прийманням на склад. Старі рахунки залишаються у розділі клієнтів.</p>
  <div class="tools"><button :disabled="busy" @click="changeTab('ready')">Готові до рахунку</button><button :disabled="busy" @click="changeTab('invoices')">Рахунки / об’єднання</button><button :disabled="busy" @click="refresh">Оновити</button></div>
  <p v-if="error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
  <div v-if="tab === 'ready'" class="tools"><label>Фірма-посередник<select v-model="partnerFilter" :disabled="busy" @change="choosePartner"><option value="">Усі доступні вироби</option><option v-for="p in options.partners" :key="p.id" :value="p.id">{{ p.name }}</option></select></label><p>Роздрібна сума — для клієнта. До рахунку фірмі — реселлерська вартість за підтвердженими витратами.</p></div>
  <div class="table"><table v-if="tab === 'ready'"><thead><tr><th>Обрати</th><th>Замовлення / виріб</th><th>Клієнт</th><th>Філія</th><th>Роздрібна сума</th><th>До рахунку</th></tr></thead><tbody><tr v-for="p in ready" :key="p.productId"><td><input v-model="picked" type="checkbox" :value="p.productId" :disabled="busy || Boolean(p.billingError)" :aria-label="`Вибрати виріб ${p.productName} замовлення ${p.orderNo}`"></td><td>{{ p.orderNo }} · {{ p.productName }}</td><td>{{ p.customerName }} <button :disabled="busy" @click="useOwner(p)">{{ p.commerceMode === 'RESELLER' ? 'Фірма — платник' : 'Цей клієнт — платник' }}</button></td><td>{{ p.branchName }}</td><td>{{ money(p.retailAmount) }}</td><td><template v-if="!p.billingError">{{ money(p.amount) }}<small v-if="p.commerceMode === 'RESELLER'"> · реселлерська</small></template><span v-else role="alert">{{ p.billingError }}</span></td></tr></tbody></table>
  <table v-else><thead><tr><th>Об’єднати</th><th>Рахунок</th><th>Платник</th><th>Сума</th><th>Борг</th><th>Стан</th></tr></thead><tbody><tr v-for="i in invoices" :key="i.id"><td><input v-model="chosenInvoices" type="checkbox" :value="i.id" :disabled="busy || i.lifecycle !== 'ACTIVE' || Number(i.debt) <= 0 || i.status === 'CANCELLED'" :aria-label="`Обрати рахунок ${i.invoiceNo}`"></td><td><button :disabled="busy" @click="open(i.id)">{{ i.invoiceNo }}</button></td><td>{{ i.payerName }}</td><td>{{ money(i.amount) }}</td><td>{{ money(i.debt) }}</td><td>{{ i.lifecycle === 'MERGED' ? 'Об’єднаний (архів)' : status[i.status] }}</td></tr></tbody></table></div>
  <p v-if="!busy && !error && !(tab === 'ready' ? ready.length : invoices.length)">На цій сторінці записів немає.</p>
  <div class="tools"><button :disabled="busy || !page" @click="turn(-1)">Назад</button><span>{{ page + 1 }}</span><button :disabled="busy || (tab === 'ready' ? ready.length : invoices.length) < 100" @click="turn(1)">Далі</button></div>
  <fieldset :disabled="busy"><legend>{{ tab === 'ready' ? 'Оформлення рахунку' : 'Об’єднання залишків боргу' }}</legend>
   <p>Обрано на суму: {{ money(tab === 'ready' ? selectedTotal : mergeTotal) }} грн. Вибір діє в межах поточної сторінки.</p>
   <div class="tools"><label>Платник / фірма-посередник<input v-model="payerSearch" placeholder="Назва або телефон, від 2 символів" @keydown.enter.prevent="findPayer"></label><button @click="findPayer">Знайти платника</button></div>
   <div class="tools"><button v-for="p in options.payers" :key="p.id" @click="payer = p">{{ p.name }} · {{ p.phone }}</button></div>
   <p>Платник: <strong>{{ payer?.name || 'не обрано' }}</strong>. Борг і використання авансу належатимуть цьому платнику.</p>
   <p v-if="resellerOwner">Оплата фірми надходить вашому підприємству. Оберіть власну філію обліку. Розрахунки клієнтів із посередником у цей рахунок не входять.</p>
   <label>Філія обліку<select v-model="branch"><option value="">Оберіть філію</option><option v-for="b in billingBranches" :key="b.id" :value="b.id">{{ b.name }}</option></select></label>
   <label>Примітка<textarea v-model="note" maxlength="1000"></textarea></label><button @click="submit(tab !== 'ready')">{{ tab === 'ready' ? 'Виставити рахунок за вибраними виробами' : 'Об’єднати вибрані рахунки' }}</button>
  </fieldset>
  <article v-if="detail"><h2>Рахунок № {{ detail.invoiceNo }}</h2><p v-if="detail.partnerId"><strong>Рахунок фірмі-посереднику за реселлерською вартістю</strong></p><p>Платник: {{ detail.payerName }} · {{ detail.lifecycle === 'MERGED' ? 'Архівний, об’єднаний' : status[detail.status] }}</p><p>Сума: {{ money(detail.amount) }} грн · залишок: {{ money(detail.debt) }} грн</p><button :disabled="busy" @click="pdf">Завантажити PDF</button><button :disabled="busy" @click="open(detail.id)">Оновити рахунок</button>
   <div class="table"><table><thead><tr><th>Замовлення / виріб</th><th>{{ detail.partnerId ? 'Реселлерська вартість' : 'Підтверджена вартість' }}</th><th>До цього рахунку</th><th>Походження</th></tr></thead><tbody><tr v-for="p in detail.products" :key="p.productId"><td>{{ p.orderNo }} · виріб {{ p.productId }} ({{ p.snapshot.widthMm }} × {{ p.snapshot.heightMm }} мм, {{ p.snapshot.configuration?.draft?.form?.productQuantity || 1 }} екз.)</td><td>{{ money(p.originalAmount) }}</td><td>{{ money(p.amount) }}</td><td><button v-if="p.sourceInvoiceId" :disabled="busy" @click="open(p.sourceInvoiceId)">Рахунок {{ p.sourceInvoiceNo }}</button><span v-else>Первинне виставлення</span></td></tr></tbody></table></div>
   <p v-for="target in detail.mergedInto" :key="target.id">Залишок перенесено до <button :disabled="busy" @click="open(target.id)">рахунку № {{ target.invoiceNo }}</button></p>
   <details><summary>Історія рахунку</summary><p v-for="(e, index) in detail.history" :key="index">{{ e.createdAt }} · {{ ({ INVOICE: 'Виставлення', PAYMENT: 'Оплата', ADVANCE_ALLOCATION: 'Зарахування авансу', INVOICE_MERGE_IN: 'Перенесення до нового рахунку', INVOICE_MERGE_OUT: 'Прийнятий борг' })[e.type] || e.type }}: {{ money(e.amount) }} грн. {{ e.note }}</p></details>
   <p>При об’єднанні залишок боргу розподіляється пропорційно між позиціями. Це розподіл залишку для нового документа, а не історія оплати конкретного виробу.</p>
   <fieldset v-if="detail.lifecycle === 'ACTIVE' && detail.status !== 'CANCELLED' && Number(detail.debt) > 0" :disabled="busy || paymentPending"><legend>Оплата / зарахування авансу</legend><p>Доступний аванс платника: {{ money(detail.availableAdvance) }} грн.</p><div class="tools"><label>Нова оплата, грн<input v-model="amount" type="number" min="0" step="0.01"></label><label>Зарахувати аванс, грн<input v-model="advance" type="number" min="0" step="0.01"></label></div><button @click="payment">Провести операцію</button></fieldset>
   <p v-if="paymentPending" role="alert">Перед повторною оплатою оновіть рахунок і перевірте результат попередньої операції.</p>
  </article>
 </section>
</template>
<style scoped>
.accountant{padding:24px}.tools{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:14px 0}.table{overflow:auto}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left}button,input,select,textarea{font:inherit;padding:9px;border:1px solid #cdd6df;border-radius:6px}button{cursor:pointer}button:disabled{opacity:.5}label{display:grid;gap:6px;margin:10px 0}fieldset,article{margin:22px 0;padding:18px;border:1px solid #dce2e8;border-radius:10px}textarea{max-width:650px}p{line-height:1.6}[role=alert]{color:#a22}[role=status]{color:#276039}
</style>
