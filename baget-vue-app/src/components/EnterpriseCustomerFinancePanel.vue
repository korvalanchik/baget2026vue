<script setup>
import CashAccountPicker from './CashAccountPicker.vue'
import CustomerCreditPanel from './CustomerCreditPanel.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { customerPayments } from '../services/customerPayments.js'
import { newRequestKey } from '../services/requestKey.js'
import { paymentAmounts } from '../calculation/customerPayment.js'
const props = defineProps({ session: { type: Object, required: true }, customerId: { type: Number, default: null }, branchNo: { type: Number, default: null }, orderNo: { type: Number, default: null }, invoiceId: { type: Number, default: null } })
const emit = defineEmits(['paid', 'busy'])
const context = ref(null), data = ref(null), busy = ref(false), error = ref(''), notice = ref(''), opened = ref(false)
const cashAccount = ref(null)
const invoice = ref(null), amount = ref('0'), allocation = ref('0'), note = ref(''), pending = ref(null)
const money = value => new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH' }).format(Number(value || 0))
const key = computed(() => `baget.payment.${props.session.nickname || props.session.username || 'session'}.${context.value?.customerId}.${context.value?.branchNo}`)
const paymentForm = ref(null)
let initialPaymentOpened = false
const highlighted = computed(() => data.value?.invoices?.find(i => i.id === props.invoiceId))
async function refresh() { data.value = await customerPayments(props.session.token, `/${context.value.customerId}?branch=${context.value.branchNo}`) }
async function load() {
  if (busy.value) return
  busy.value = true; error.value = ''; emit('busy', true)
  try {
    context.value = props.orderNo ? await customerPayments(props.session.token, `/orders/${props.orderNo}/context`) : { customerId: props.customerId, branchNo: props.branchNo || props.session.branch.id }
    const saved = sessionStorage.getItem(key.value)
    pending.value = saved ? JSON.parse(saved) : null
    await refresh()
  } catch (e) { error.value = e.message } finally { busy.value = false; emit('busy', false) }
  if (!initialPaymentOpened && highlighted.value && !pending.value) { initialPaymentOpened = true; if (Number(highlighted.value.debt) > 0) open(highlighted.value, false) }
}
function open(i = null, focus = true) {
  if (busy.value || pending.value) return
  invoice.value = i; allocation.value = String(i ? Math.min(Number(i.debt), Number(data.value.availableAdvance)) : 0)
  amount.value = String(i ? Math.max(0, Math.round((Number(i.debt) - Number(allocation.value)) * 100) / 100) : 0)
  cashAccount.value = null; note.value = ''; error.value = ''; notice.value = ''; opened.value = true
  if (focus) nextTick(() => paymentForm.value?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }))
}
function remainder() { amount.value = String(Math.max(0, Math.round((Number(invoice.value.debt) - Number(allocation.value || 0)) * 100) / 100)) }
async function save() {
  if (busy.value) return
  busy.value = true; error.value = ''; emit('busy', true)
  try {
    if (!pending.value) {
      const sums = paymentAmounts(amount.value, invoice.value ? allocation.value : 0, invoice.value?.debt, data.value.availableAdvance)
      if (Number(sums.amount) > 0 && !cashAccount.value) throw new Error('Оберіть касу або рахунок для нових коштів')
      const request = { cashAccountId: Number(sums.amount) > 0 ? cashAccount.value : null, requestKey: newRequestKey(), branchNo: Number(context.value.branchNo), invoiceId: invoice.value?.id || null, ...sums, note: note.value.trim() }
      // Persist BEFORE sending. A lost response can be retried with the same key/body.
      sessionStorage.setItem(key.value, JSON.stringify(request)); pending.value = request
    }
    await customerPayments(props.session.token, `/${context.value.customerId}`, pending.value)
    pending.value = null; sessionStorage.removeItem(key.value); opened.value = false
    notice.value = 'Кошти проведено. Залишок авансу доступний для наступних оплат.'
    emit('paid')
    await refresh()
  } catch (e) {
    error.value = e.message
    // Only a definitive application rejection allows editing a new request.
    if ([400, 403, 404, 409, 422].includes(e.status)) { sessionStorage.removeItem(key.value); pending.value = null }
  } finally { busy.value = false; emit('busy', false) }
}
watch(() => [props.customerId, props.branchNo, props.orderNo, props.invoiceId], () => { initialPaymentOpened = false; data.value = null; opened.value = false; pending.value = null; load() }, { immediate: true })
</script>
<template>
  <section class="customer-finance">
    <header><h3>Фінанси клієнта<span v-if="data"> · {{ data.customerName }}</span></h3><button type="button" :disabled="busy" @click="load">Оновити</button></header>
    <p v-if="busy" role="status">Виконуємо операцію…</p><p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <div v-if="pending" class="pending"><p>Результат платежу ще не підтверджено. Нові гроші: {{ money(pending.amount) }}; з авансу: {{ money(pending.allocationAmount) }}. Повторний запит не створить другий платіж.</p><button type="button" :disabled="busy" @click="save">Перевірити / повторити цей платіж</button></div>

    <template v-if="data">
      <p>Аванс належить клієнту й доступний для оплати його рахунків. До виставлення остаточного рахунку прийняті гроші залишаються авансом.</p>
      <div class="metrics"><p>Доступний аванс<strong>{{ money(data.availableAdvance) }}</strong></p><p>Борг за рахунками<strong>{{ money(data.totalDebt) }}</strong></p><p>Баланс (плюс — кошти клієнта)<strong>{{ money(-Number(data.balance || 0)) }}</strong></p></div>
      <button type="button" :disabled="busy || !!pending" @click="open()">Прийняти аванс на баланс клієнта</button>
      <p v-if="invoiceId && !highlighted && !busy">Рахунок виробу відсутній у списку відкритих рахунків. Перевірте стан оплати у картці видачі.</p>
      <p v-if="highlighted">За цим виробом: рахунок № {{ highlighted.invoiceNo }}, до сплати {{ money(highlighted.debt) }}.</p>
      <form ref="paymentForm" v-if="opened && !pending" @submit.prevent="save"><fieldset :disabled="busy"><legend>{{ invoice ? `Оплата рахунку № ${invoice.invoiceNo}` : 'Аванс на баланс клієнта' }}</legend>
        <template v-if="invoice"><p>Сума рахунку: {{ money(invoice.total) }} · оплачено: {{ money(invoice.paid) }}.</p><p>Рахунок може охоплювати кілька виробів. Оплата зараховується на весь рахунок.</p><p>До сплати: {{ money(invoice.debt) }}. Доступний аванс: {{ money(data.availableAdvance) }}.</p><label>Використати з авансу<input v-model="allocation" type="number" min="0" :max="Math.min(Number(invoice.debt), Number(data.availableAdvance))" step="0.01" required></label><button type="button" @click="remainder">Доплатити решту новими коштами</button></template>
        <label>{{ invoice ? 'Прийняти нових коштів' : 'Сума авансу' }}<input v-model="amount" type="number" min="0" step="0.01" required></label>
        <CashAccountPicker v-if="Number(amount) > 0" v-model="cashAccount" :session="session" :branch-no="context.branchNo" :disabled="busy" />
        <label>Примітка<input v-model="note" maxlength="2000" placeholder="Спосіб оплати / номер платежу"></label>
        <p v-if="invoice">Погашення: {{ money(Number(amount || 0) + Number(allocation || 0)) }}. Залишиться борг: {{ money(Math.max(0, Number(invoice.debt) - Number(amount || 0) - Number(allocation || 0))) }}.</p>
        <button type="submit">Провести оплату</button><button type="button" @click="opened = false">Скасувати</button>
      </fieldset></form>
      <details :open="!invoiceId"><summary>Рахунки клієнта · {{ data.invoices.length }}</summary>
        <article v-for="i in data.invoices" :key="i.id" class="invoice-card" :class="{ selected: i.id === invoiceId }">
          <strong>Рахунок № {{ i.invoiceNo }}</strong>
          <dl><div><dt>Сума</dt><dd>{{ money(i.total) }}</dd></div><div><dt>Оплачено</dt><dd>{{ money(i.paid) }}</dd></div><div><dt>До сплати</dt><dd>{{ money(i.debt) }}</dd></div></dl>
          <button type="button" :disabled="busy || !!pending || Number(i.debt) <= 0" @click="open(i)">Оплатити / зарахувати аванс</button>
        </article>
      </details>
      <p v-if="!data.invoices.length">Відкритих рахунків немає. Це не означає, що всі замовлення вже розраховано.</p>

      <details><summary>Умови відстрочки</summary><CustomerCreditPanel v-if="context" :session="session" :customer-id="Number(context.customerId)" :branch-no="Number(context.branchNo)" @changed="emit('paid')" /></details>
      <details><summary>Історія руху коштів</summary><div class="table-scroll"><table><thead><tr><th>Дата</th><th>Напрям</th><th>Сума</th><th>Операція</th><th>Примітка</th></tr></thead><tbody><tr v-for="(e, index) in data.ledger" :key="index"><td>{{ new Date(e.date).toLocaleString('uk-UA') }}</td><td>{{ e.direction === 'IN' ? 'Надходження' : 'Списання / нарахування' }}</td><td>{{ money(e.amount) }}</td><td>{{ e.sourceType }}</td><td>{{ e.comment }}</td></tr></tbody></table></div></details>
    </template>
  </section>
</template>
<style scoped>
.customer-finance{border:1px solid #ccd8e0;border-radius:10px;padding:16px;margin:12px 0;background:#fff;color:#23313d}header,.metrics{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}h3{margin:0}.metrics strong{display:block;margin-top:6px}button,input{font:inherit;padding:9px;border:1px solid #a8bac8;border-radius:6px}button{cursor:pointer;margin:4px}button:disabled{opacity:.5}label{display:grid;gap:6px;margin:12px 0}fieldset{border:1px solid #ccd8e0;margin-top:16px;min-width:0}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{text-align:left;padding:10px;border-bottom:1px solid #e1e8ed;white-space:nowrap}details{margin-top:16px}[role=alert]{color:#b3261e}.pending{padding:12px;background:#fff3cd}.selected{background:#edf6ff}input{min-width:0;max-width:100%;box-sizing:border-box}
.invoice-card{padding:12px;border:1px solid #dce4e9;border-radius:8px;margin:10px 0}dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}dt{font-size:12px;color:#62717d}dd{margin:4px 0;font-weight:600;overflow-wrap:anywhere}.customer-finance{min-width:0;overflow-wrap:anywhere}button{min-height:44px;white-space:normal;max-width:100%;box-sizing:border-box}summary{cursor:pointer;padding:10px 0}form{background:#f3f8f7;border-radius:8px;padding:8px}form button[type=submit]{background:#185c63;color:white;width:100%}@media(max-width:600px){.customer-finance{padding:10px}.metrics{display:grid;grid-template-columns:1fr;gap:0}.metrics p{margin:6px 0;display:flex;justify-content:space-between;gap:10px}input{font-size:16px;width:100%}button{width:100%;margin:5px 0}header{display:block}dl{grid-template-columns:1fr}dl div{display:flex;justify-content:space-between;gap:8px}dd{margin:0}}
</style>
