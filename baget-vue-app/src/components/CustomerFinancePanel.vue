<script setup>
import CustomerCreditPanel from './CustomerCreditPanel.vue'
import { computed, ref, watch } from 'vue'
import { customerPayments } from '../services/customerPayments.js'
import { newRequestKey } from '../services/requestKey.js'
import { paymentAmounts } from '../calculation/customerPayment.js'
const props = defineProps({ session: { type: Object, required: true }, customerId: { type: Number, default: null }, branchNo: { type: Number, default: null }, orderNo: { type: Number, default: null }, invoiceId: { type: Number, default: null } })
const emit = defineEmits(['paid', 'busy'])
const context = ref(null), data = ref(null), busy = ref(false), error = ref(''), notice = ref(''), opened = ref(false)
const invoice = ref(null), amount = ref('0'), allocation = ref('0'), note = ref(''), pending = ref(null)
const money = value => new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH' }).format(Number(value || 0))
const key = computed(() => `baget.payment.${props.session.nickname || props.session.username || 'session'}.${context.value?.customerId}.${context.value?.branchNo}`)
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
}
function open(i = null) {
  if (busy.value || pending.value) return
  invoice.value = i; allocation.value = String(i ? Math.min(Number(i.debt), Number(data.value.availableAdvance)) : 0)
  amount.value = String(i ? Math.max(0, Math.round((Number(i.debt) - Number(allocation.value)) * 100) / 100) : 0)
  note.value = ''; error.value = ''; notice.value = ''; opened.value = true
}
function remainder() { amount.value = String(Math.max(0, Math.round((Number(invoice.value.debt) - Number(allocation.value || 0)) * 100) / 100)) }
async function save() {
  if (busy.value) return
  busy.value = true; error.value = ''; emit('busy', true)
  try {
    if (!pending.value) {
      const sums = paymentAmounts(amount.value, invoice.value ? allocation.value : 0, invoice.value?.debt, data.value.availableAdvance)
      const request = { requestKey: newRequestKey(), branchNo: Number(context.value.branchNo), invoiceId: invoice.value?.id || null, ...sums, note: note.value.trim() }
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
watch(() => [props.customerId, props.branchNo, props.orderNo], () => { data.value = null; opened.value = false; pending.value = null; load() }, { immediate: true })
</script>
<template>
  <section class="customer-finance">
    <header><h3>Фінанси клієнта<span v-if="data"> · {{ data.customerName }}</span></h3><button type="button" :disabled="busy" @click="load">Оновити</button></header>
    <p v-if="busy" role="status">Виконуємо операцію…</p><p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <div v-if="pending" class="pending"><p>Результат платежу ще не підтверджено. Нові гроші: {{ money(pending.amount) }}; з авансу: {{ money(pending.allocationAmount) }}. Повторний запит не створить другий платіж.</p><button type="button" :disabled="busy" @click="save">Перевірити / повторити цей платіж</button></div>
    <CustomerCreditPanel v-if="context" :session="session" :customer-id="Number(context.customerId)" :branch-no="Number(context.branchNo)" @changed="emit('paid')" />
    <template v-if="data">
      <p>Аванс належить клієнту й доступний для оплати його рахунків. До виставлення остаточного рахунку прийняті гроші залишаються авансом.</p>
      <div class="metrics"><p>Доступний аванс<strong>{{ money(data.availableAdvance) }}</strong></p><p>Борг за рахунками<strong>{{ money(data.totalDebt) }}</strong></p><p>Баланс (плюс — кошти клієнта)<strong>{{ money(-Number(data.balance || 0)) }}</strong></p></div>
      <button type="button" :disabled="busy || !!pending" @click="open()">Прийняти аванс на баланс клієнта</button>
      <p v-if="highlighted">За цим виробом: рахунок № {{ highlighted.invoiceNo }}, до сплати {{ money(highlighted.debt) }}.</p>
      <div class="table-scroll"><table><thead><tr><th>Рахунок</th><th>Сума</th><th>Оплачено</th><th>Борг</th><th></th></tr></thead><tbody><tr v-for="i in data.invoices" :key="i.id" :class="{ selected: i.id === invoiceId }"><td>№ {{ i.invoiceNo }}</td><td>{{ money(i.total) }}</td><td>{{ money(i.paid) }}</td><td>{{ money(i.debt) }}</td><td><button type="button" :disabled="busy || !!pending" @click="open(i)">Оплатити</button></td></tr></tbody></table></div>
      <p v-if="!data.invoices.length">Відкритих рахунків немає. Це не означає, що всі замовлення вже розраховано.</p>
      <form v-if="opened && !pending" @submit.prevent="save"><fieldset :disabled="busy"><legend>{{ invoice ? `Оплата рахунку № ${invoice.invoiceNo}` : 'Аванс на баланс клієнта' }}</legend>
        <template v-if="invoice"><p>До сплати: {{ money(invoice.debt) }}. Доступний аванс: {{ money(data.availableAdvance) }}.</p><label>Використати з авансу<input v-model="allocation" type="number" min="0" :max="Math.min(Number(invoice.debt), Number(data.availableAdvance))" step="0.01" required></label><button type="button" @click="remainder">Доплатити решту новими коштами</button></template>
        <label>{{ invoice ? 'Прийняти нових коштів' : 'Сума авансу' }}<input v-model="amount" type="number" min="0" step="0.01" required></label>
        <label>Примітка<input v-model="note" maxlength="2000" placeholder="Спосіб оплати / номер платежу"></label>
        <p v-if="invoice">Погашення: {{ money(Number(amount || 0) + Number(allocation || 0)) }}. Залишиться борг: {{ money(Math.max(0, Number(invoice.debt) - Number(amount || 0) - Number(allocation || 0))) }}.</p>
        <button type="submit">Провести оплату</button><button type="button" @click="opened = false">Скасувати</button>
      </fieldset></form>
      <details><summary>Історія руху коштів</summary><div class="table-scroll"><table><thead><tr><th>Дата</th><th>Напрям</th><th>Сума</th><th>Операція</th><th>Примітка</th></tr></thead><tbody><tr v-for="(e, index) in data.ledger" :key="index"><td>{{ new Date(e.date).toLocaleString('uk-UA') }}</td><td>{{ e.direction === 'IN' ? 'Надходження' : 'Списання / нарахування' }}</td><td>{{ money(e.amount) }}</td><td>{{ e.sourceType }}</td><td>{{ e.comment }}</td></tr></tbody></table></div></details>
    </template>
  </section>
</template>
<style scoped>
.customer-finance{border:1px solid #ccd8e0;border-radius:10px;padding:16px;margin:12px 0;background:#fff;color:#23313d}header,.metrics{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}h3{margin:0}.metrics strong{display:block;margin-top:6px}button,input{font:inherit;padding:9px;border:1px solid #a8bac8;border-radius:6px}button{cursor:pointer;margin:4px}button:disabled{opacity:.5}label{display:grid;gap:6px;margin:12px 0}fieldset{border:1px solid #ccd8e0;margin-top:16px;min-width:0}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{text-align:left;padding:10px;border-bottom:1px solid #e1e8ed;white-space:nowrap}details{margin-top:16px}[role=alert]{color:#b3261e}.pending{padding:12px;background:#fff3cd}.selected{background:#edf6ff}input{min-width:0;max-width:100%;box-sizing:border-box}
</style>
