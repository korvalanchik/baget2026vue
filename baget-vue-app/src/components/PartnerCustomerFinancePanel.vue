<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { partnerPayments } from '../services/partnerPayments.js'
import { newRequestKey } from '../services/requestKey.js'
import { paymentAmounts } from '../calculation/customerPayment.js'
const props = defineProps({ session: { type: Object, required: true }, context: { type: Object, required: true } })
const emit = defineEmits(['paid', 'busy'])
const data = ref(null), busy = ref(false), error = ref(''), notice = ref(''), pending = ref(null)
const paymentForm = ref(null)
let initialPaymentOpened = false
const page = ref(0), historyPage = ref(0), opened = ref(false), selected = ref(null)
const amount = ref('0'), allocation = ref('0'), note = ref('')
const adjustment = ref(null), adjustmentAmount = ref('0'), reason = ref(''), pendingAdjustment = ref(null)
const hasPending = computed(() => !!pending.value || !!pendingAdjustment.value)
const operationName = e => ({ ADVANCE: 'Аванс', PAYMENT: 'Оплата', REVERSAL: 'Скасування помилкового платежу', TRANSFER: 'Переплата → аванс' }[e.operation] || e.operation)
const isReversed = e => e.reversed === true || Number(e.reversed) === 1
const ctx = props.context
const storageKey = `baget.partner-payment.${props.session.nickname || props.session.username || 'session'}.${ctx.partnerId}.${ctx.customerId}.${ctx.branchNo}.${ctx.contextOrder || ''}`
const adjustmentStorageKey = `${storageKey}.adjustment`
const money = value => new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH' }).format(Number(value || 0))
const orders = computed(() => {
 const rows = data.value?.orders || [], selected = data.value?.selectedOrder
 return selected && !rows.some(o => o.orderNo === selected.orderNo) ? [selected, ...rows] : rows
})
async function refresh() {
 const q = new URLSearchParams({ branch: ctx.branchNo, partner: ctx.partnerId, page: page.value, historyPage: historyPage.value })
 if (ctx.contextOrder) q.set('contextOrder', ctx.contextOrder)
 data.value = await partnerPayments(props.session.token, `/${ctx.customerId}?${q}`)
}
async function load() {
 if (busy.value) return
 busy.value = true; error.value = ''; emit('busy', true)
 try { const saved = sessionStorage.getItem(storageKey); pending.value = saved ? JSON.parse(saved) : null; const correction = sessionStorage.getItem(adjustmentStorageKey); pendingAdjustment.value = correction ? JSON.parse(correction) : null; await refresh() }
 catch (e) { error.value = e.message }
 finally { busy.value = false; emit('busy', false) }
 const target = orders.value.find(o => Number(o.orderNo) === Number(ctx.contextOrder))
 if (!initialPaymentOpened && target && !hasPending.value) { initialPaymentOpened = true; if (target.canPay && Number(target.debt) > 0) open(target, false) }
}
function open(order = null, focus = true) {
 if (busy.value || hasPending.value) return
 adjustment.value = null; selected.value = order; opened.value = true; note.value = ''; notice.value = ''; error.value = ''
 allocation.value = String(order ? Math.min(Number(order.debt), Number(data.value.availableAdvance)) : 0)
 remainder()
 if (focus) nextTick(() => paymentForm.value?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }))
}
function remainder() { amount.value = String(selected.value ? Math.max(0, Math.round((Number(selected.value.debt) - Number(allocation.value || 0)) * 100) / 100) : 0) }
async function save() {
 if (busy.value) return
 busy.value = true; emit('busy', true); error.value = ''; notice.value = ''
 try {
  if (!pending.value) {
   const sums = paymentAmounts(amount.value, selected.value ? allocation.value : 0, selected.value?.debt, data.value.availableAdvance)
   const request = { requestKey: newRequestKey(), branchNo: Number(ctx.branchNo), partnerId: Number(ctx.partnerId), contextOrder: ctx.contextOrder || null, orderNo: selected.value?.orderNo || null, ...sums, expectedTotal: selected.value?.total ?? null, expectedPaid: selected.value?.paid ?? null, note: note.value.trim() }
   sessionStorage.setItem(storageKey, JSON.stringify(request)); pending.value = request
  }
  await partnerPayments(props.session.token, `/${ctx.customerId}`, pending.value)
  sessionStorage.removeItem(storageKey); pending.value = null; opened.value = false
  notice.value = 'Записано кошти фірми-посередника. Каса підприємства не змінювалася.'
  await refresh(); emit('paid')
 } catch (e) {
  error.value = e.message
  if ([400, 403, 404, 409, 422].includes(e.status)) { sessionStorage.removeItem(storageKey); pending.value = null; opened.value = false; await refresh().catch(() => {}) }
 } finally { busy.value = false; emit('busy', false) }
}
function openAdjustment(operation, target) {
 if (busy.value || hasPending.value || !data.value?.canAdjust) return
 opened.value = false; error.value = ''; notice.value = ''; reason.value = ''
 adjustment.value = { operation, target }; adjustmentAmount.value = operation === 'TRANSFER' ? String(target.overpayment) : '0'
}
async function saveAdjustment() {
 if (busy.value) return
 busy.value = true; emit('busy', true); error.value = ''; notice.value = ''
 try {
  if (!pendingAdjustment.value) {
   if (!reason.value.trim()) throw new Error('Вкажіть причину коригування')
   const { operation, target } = adjustment.value
   const request = { requestKey: newRequestKey(), branchNo: Number(ctx.branchNo), partnerId: Number(ctx.partnerId), contextOrder: ctx.contextOrder || null, operation, sourcePaymentId: operation === 'REVERSAL' ? target.id : null, orderNo: operation === 'TRANSFER' ? target.orderNo : null, amount: operation === 'TRANSFER' ? Number(adjustmentAmount.value) : 0, expectedTotal: operation === 'TRANSFER' ? target.total : null, expectedPaid: operation === 'TRANSFER' ? target.paid : null, note: reason.value.trim() }
   if (!Number.isFinite(request.amount) || request.amount < 0 || (operation === 'TRANSFER' && request.amount === 0)) throw new Error('Вкажіть додатну суму перенесення')
   sessionStorage.setItem(adjustmentStorageKey, JSON.stringify(request)); pendingAdjustment.value = request
  }
  await partnerPayments(props.session.token, `/${ctx.customerId}/adjustments`, pendingAdjustment.value)
  sessionStorage.removeItem(adjustmentStorageKey); pendingAdjustment.value = null; adjustment.value = null
  notice.value = 'Коригування записано. Початковий платіж збережено в історії.'
  await refresh(); emit('paid')
 } catch (e) {
  error.value = e.message
  if ([400, 403, 404, 409, 422].includes(e.status)) { sessionStorage.removeItem(adjustmentStorageKey); pendingAdjustment.value = null; adjustment.value = null; await refresh().catch(() => {}) }
 } finally { busy.value = false; emit('busy', false) }
}
function turn(delta, history = false) { if (busy.value) return; if (history) historyPage.value += delta; else page.value += delta; load() }
onMounted(load)
</script>
<template>
 <section class="partner-finance">
  <header><div><h3>Кошти фірми-посередника</h3><strong>{{ ctx.partnerName }}</strong></div><button type="button" :disabled="busy" @click="load">Оновити</button></header>
  <p>Довідковий облік розрахунків клієнта з посередником. Ці кошти не надходять у касу підприємства та не погашають рахунки, виставлені самій фірмі.</p>
  <p v-if="busy" role="status">Завантаження / запис…</p><p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
  <div v-if="pending" class="warning"><p>Результат операції ще не підтверджено. Нові кошти: {{ money(pending.amount) }}, з авансу: {{ money(pending.allocationAmount) }}.</p><button type="button" :disabled="busy" @click="save">Перевірити / повторити той самий платіж</button></div>
  <div v-if="pendingAdjustment" class="warning"><p>Результат коригування ще не підтверджено: {{ operationName(pendingAdjustment) }}<span v-if="pendingAdjustment.sourcePaymentId">, платіж № {{ pendingAdjustment.sourcePaymentId }}</span><span v-else>, замовлення № {{ pendingAdjustment.orderNo }}, {{ money(pendingAdjustment.amount) }}</span>. Причина: {{ pendingAdjustment.note }}</p><button type="button" :disabled="busy" @click="saveAdjustment">Перевірити / повторити те саме коригування</button></div>
  <template v-if="data">
   <h4>{{ data.customerName }} · доступний аванс: {{ money(data.availableAdvance) }}</h4>
   <p>Аванс спільний для цього клієнта у філіях цієї фірми. Замовлення та історія нижче — лише з доступних вам філій.</p>
   <button type="button" :disabled="busy || hasPending" @click="open()">Прийняти аванс на баланс</button>
   <form ref="paymentForm" v-if="opened && !hasPending" @submit.prevent="save"><fieldset :disabled="busy"><legend>{{ selected ? `Оплата замовлення № ${selected.orderNo}` : 'Аванс клієнта у посередника' }}</legend>
    <p>Отримувач коштів: <strong>{{ ctx.partnerName }}</strong></p>
    <template v-if="selected"><p>Сума: {{ money(selected.total) }} · сплачено: {{ money(selected.paid) }} · залишок: {{ money(selected.debt) }}</p><label>Використати аванс<input v-model="allocation" type="number" min="0" :max="Math.min(Number(selected.debt), Number(data.availableAdvance))" step="0.01" required></label><button type="button" @click="remainder">Доплатити решту</button></template>
    <label>Прийняти нових коштів<input v-model="amount" type="number" min="0" step="0.01" required></label>
    <label>Примітка<input v-model="note" maxlength="2000" placeholder="Готівка / переказ / номер документа"></label>
    <p v-if="selected">Після оплати залишиться: {{ money(Math.max(0, Number(selected.debt) - Number(amount || 0) - Number(allocation || 0))) }}</p>
    <button type="submit">Записати кошти посередника</button><button type="button" @click="opened = false">Скасувати</button>
   </fieldset></form>
   <h4>Оплата замовлень за роздрібною ціною</h4>
   <details :open="!ctx.contextOrder"><summary>Замовлення клієнта · {{ orders.length }}</summary>
   <article v-for="o in orders" :key="o.orderNo" class="order-card" :class="{selected: Number(o.orderNo) === Number(ctx.contextOrder)}">
    <strong>№ {{ o.orderNo }} · {{ o.branchName }}</strong>
    <p v-if="[5,10].includes(Number(o.status))">Скасоване — кошти збережено в історії</p><p v-else-if="Number(o.pricePending)">Ціна очікує погодження</p><p v-else-if="Number(o.unfinished)">Попередня сума до завершення майстернею</p>
    <p>Сума: {{ o.total == null ? 'Немає розрахунку' : money(o.total) }} · Сплачено: {{ money(o.paid) }}</p><p><strong>До сплати: {{ o.debt == null ? '—' : money(o.debt) }}</strong></p>
    <p v-if="Number(o.overpayment) > 0">Переплата: {{ money(o.overpayment) }}<span v-if="!o.canTransfer"> · перенесення поки недоступне</span></p>
    <button type="button" :disabled="busy || hasPending || !o.canPay" @click="open(o)">Оплатити / зарахувати аванс</button>
    <button v-if="data.canAdjust && o.canTransfer" type="button" :disabled="busy || hasPending" @click="openAdjustment('TRANSFER',o)">Перенести переплату в аванс</button>
   </article></details>
   <p v-if="!orders.length">Замовлень цього клієнта у цієї фірми не знайдено.</p>
   <div class="actions"><button type="button" :disabled="busy || page === 0" @click="turn(-1)">Назад</button><span>Сторінка {{ page + 1 }}</span><button type="button" :disabled="busy || data.orders.length < 50" @click="turn(1)">Далі</button></div>

   <form v-if="adjustment && !hasPending" @submit.prevent="saveAdjustment"><fieldset :disabled="busy"><legend>{{ operationName(adjustment) }}</legend>
    <template v-if="adjustment.operation === 'REVERSAL'"><p>Помилковий платіж № {{ adjustment.target.id }}: {{ operationName(adjustment.target) }}<span v-if="adjustment.target.orderNo">, замовлення № {{ adjustment.target.orderNo }}</span>.</p><p>Буде скасовано весь запис: нові кошти {{ money(adjustment.target.cashDelta) }}, зміна авансу {{ money(adjustment.target.advanceDelta) }}, зміна оплати {{ money(adjustment.target.paidDelta) }}. Використаний для цієї оплати аванс повернеться на баланс.</p><p><strong>Це виправлення помилкового запису, а не повернення грошей клієнту.</strong></p></template>
    <template v-else><p>Замовлення № {{ adjustment.target.orderNo }}. Кошти залишаються авансом цього клієнта у {{ ctx.partnerName }}.</p><label>Сума перенесення<input v-model="adjustmentAmount" type="number" min="0.01" :max="Math.min(Number(adjustment.target.overpayment), 999999999.99)" step="0.01" required></label></template>
    <label>Причина коригування<textarea v-model="reason" required maxlength="2000" rows="2" placeholder="Поясніть помилку або підставу перенесення"></textarea></label>
    <button type="submit">{{ adjustment.operation === 'REVERSAL' ? 'Підтвердити скасування запису' : 'Підтвердити перенесення' }}</button><button type="button" @click="adjustment = null">Закрити</button>
   </fieldset></form>
   <details><summary>Історія коштів посередника</summary><div class="table-scroll"><table><thead><tr><th>Дата / користувач</th><th>Операція</th><th>Зміна коштів</th><th>Зміна авансу</th><th>Зміна оплати</th><th>Примітка / дії</th></tr></thead><tbody><tr v-for="e in data.history" :key="`${e.entryType}-${e.id}`"><td>{{ new Date(e.createdAt).toLocaleString('uk-UA') }} · {{ e.actor }}<small>Філія № {{ e.branchNo }}</small></td><td>{{ operationName(e) }} № {{ e.id }}<small v-if="e.orderNo">Замовлення № {{ e.orderNo }}</small><small v-if="e.sourcePaymentId">До платежу № {{ e.sourcePaymentId }}</small><strong v-if="isReversed(e)">Скасовано окремим записом</strong></td><td>{{ money(e.cashDelta) }}</td><td>{{ money(e.advanceDelta) }}</td><td>{{ money(e.paidDelta) }}</td><td>{{ e.note }}<button v-if="data.canAdjust && e.entryType === 'PAYMENT' && !isReversed(e)" type="button" :disabled="busy || hasPending" @click="openAdjustment('REVERSAL', e)">Скасувати помилковий запис</button></td></tr></tbody></table></div><div class="actions"><button type="button" :disabled="busy || historyPage === 0" @click="turn(-1, true)">Назад</button><span>{{ historyPage + 1 }}</span><button type="button" :disabled="busy || data.history.length < 50" @click="turn(1, true)">Далі</button></div></details>
  </template>
 </section>
</template>
<style scoped>
.partner-finance{border:1px solid #d6c29c;border-radius:10px;padding:16px;margin:12px 0;background:#fffdf7;color:#343321}header,.actions{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}h3{margin:0 0 6px}p{line-height:1.5;font-size:13px}button,input,textarea{font:inherit;padding:10px;border:1px solid #b8b4a2;border-radius:7px;max-width:100%;box-sizing:border-box}button{cursor:pointer;margin:4px;min-height:44px}button:disabled{opacity:.5}label{display:grid;gap:6px;margin:10px 0}fieldset{min-width:0;margin-top:12px;border:1px solid #d6c29c;border-radius:8px}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:10px;border-bottom:1px solid #e4ded0}small{display:block;margin-top:4px}.selected{background:#fff0cc}.warning{background:#fff0cc;padding:10px}[role=alert]{color:#a32420}details{margin-top:14px}@media(max-width:600px){.partner-finance{padding:10px}input,textarea{font-size:16px}}
.partner-finance{min-width:0;overflow-wrap:anywhere}.order-card{padding:12px;border:1px solid #d6c29c;border-radius:8px;margin:10px 0}summary{cursor:pointer;padding:10px 0}button{white-space:normal}form button[type=submit]{width:100%;background:#185c63;color:white}@media(max-width:600px){button{width:100%;margin:5px 0}input,textarea{width:100%}header{display:block}}
</style>
