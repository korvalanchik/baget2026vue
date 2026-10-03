<script setup>
import { computed, onMounted, ref } from 'vue'
import { partnerPayments } from '../services/partnerPayments.js'
import { newRequestKey } from '../services/requestKey.js'
import { paymentAmounts } from '../calculation/customerPayment.js'
const props = defineProps({ session: { type: Object, required: true }, context: { type: Object, required: true } })
const emit = defineEmits(['paid', 'busy'])
const data = ref(null), busy = ref(false), error = ref(''), notice = ref(''), pending = ref(null)
const page = ref(0), historyPage = ref(0), opened = ref(false), selected = ref(null)
const amount = ref('0'), allocation = ref('0'), note = ref('')
const ctx = props.context
const storageKey = `baget.partner-payment.${props.session.nickname || props.session.username || 'session'}.${ctx.partnerId}.${ctx.customerId}.${ctx.branchNo}.${ctx.contextOrder || ''}`
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
 try { const saved = sessionStorage.getItem(storageKey); pending.value = saved ? JSON.parse(saved) : null; await refresh() }
 catch (e) { error.value = e.message }
 finally { busy.value = false; emit('busy', false) }
}
function open(order = null) {
 if (busy.value || pending.value) return
 selected.value = order; opened.value = true; note.value = ''; notice.value = ''; error.value = ''
 allocation.value = String(order ? Math.min(Number(order.debt), Number(data.value.availableAdvance)) : 0)
 remainder()
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
function turn(delta, history = false) { if (busy.value) return; if (history) historyPage.value += delta; else page.value += delta; load() }
onMounted(load)
</script>
<template>
 <section class="partner-finance">
  <header><div><h3>Кошти фірми-посередника</h3><strong>{{ ctx.partnerName }}</strong></div><button type="button" :disabled="busy" @click="load">Оновити</button></header>
  <p>Довідковий облік розрахунків клієнта з посередником. Ці кошти не надходять у касу підприємства та не погашають рахунки, виставлені самій фірмі.</p>
  <p v-if="busy" role="status">Завантаження / запис…</p><p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
  <div v-if="pending" class="warning"><p>Результат операції ще не підтверджено. Нові кошти: {{ money(pending.amount) }}, з авансу: {{ money(pending.allocationAmount) }}.</p><button type="button" :disabled="busy" @click="save">Перевірити / повторити той самий платіж</button></div>
  <template v-if="data">
   <h4>{{ data.customerName }} · доступний аванс: {{ money(data.availableAdvance) }}</h4>
   <p>Аванс спільний для цього клієнта у філіях цієї фірми. Замовлення та історія нижче — лише з доступних вам філій.</p>
   <button type="button" :disabled="busy || !!pending" @click="open()">Прийняти аванс на баланс</button>
   <h4>Оплата замовлень за роздрібною ціною</h4>
   <div class="table-scroll"><table><thead><tr><th>Замовлення / філія</th><th>Сума</th><th>Сплачено</th><th>Залишок</th><th></th></tr></thead><tbody>
    <tr v-for="o in orders" :key="o.orderNo" :class="{ selected: o.orderNo === ctx.contextOrder }"><td>№ {{ o.orderNo }} · {{ o.branchName }}<small v-if="[5,10].includes(Number(o.status))">Скасоване — прийняті кошти збережено в історії</small><small v-else-if="Number(o.pricePending)">Ціна очікує погодження</small><small v-else-if="Number(o.unfinished)">Попередня сума до завершення майстернею</small></td><td>{{ o.total == null ? 'Немає розрахунку' : money(o.total) }}</td><td>{{ money(o.paid) }}</td><td>{{ o.debt == null ? '—' : money(o.debt) }}<small v-if="Number(o.overpayment) > 0">Переплата {{ money(o.overpayment) }} — потрібне узгодження, до авансу не перенесена</small></td><td><button type="button" :disabled="busy || !!pending || !o.canPay" @click="open(o)">Оплатити / доплатити</button></td></tr>
   </tbody></table></div>
   <p v-if="!orders.length">Замовлень цього клієнта у цієї фірми не знайдено.</p>
   <div class="actions"><button type="button" :disabled="busy || page === 0" @click="turn(-1)">Назад</button><span>Сторінка {{ page + 1 }}</span><button type="button" :disabled="busy || data.orders.length < 50" @click="turn(1)">Далі</button></div>
   <form v-if="opened && !pending" @submit.prevent="save"><fieldset :disabled="busy"><legend>{{ selected ? `Оплата замовлення № ${selected.orderNo}` : 'Аванс клієнта у посередника' }}</legend>
    <p>Отримувач коштів: <strong>{{ ctx.partnerName }}</strong></p>
    <template v-if="selected"><p>Залишок: {{ money(selected.debt) }}</p><label>Використати аванс<input v-model="allocation" type="number" min="0" :max="Math.min(Number(selected.debt), Number(data.availableAdvance))" step="0.01" required></label><button type="button" @click="remainder">Доплатити решту</button></template>
    <label>Прийняти нових коштів<input v-model="amount" type="number" min="0" step="0.01" required></label>
    <label>Примітка<input v-model="note" maxlength="2000" placeholder="Готівка / переказ / номер документа"></label>
    <button type="submit">Записати кошти посередника</button><button type="button" @click="opened = false">Скасувати</button>
   </fieldset></form>
   <details><summary>Історія коштів посередника</summary><div class="table-scroll"><table><thead><tr><th>Дата / користувач</th><th>Операція</th><th>Нові кошти</th><th>З авансу</th><th>Примітка</th></tr></thead><tbody><tr v-for="e in data.history" :key="e.id"><td>{{ new Date(e.createdAt).toLocaleString('uk-UA') }} · {{ e.actor }}<small>Філія № {{ e.branchNo }}</small></td><td>{{ e.operation === 'ADVANCE' ? 'Аванс' : `Оплата № ${e.orderNo}` }}</td><td>{{ money(e.amount) }}</td><td>{{ money(e.allocationAmount) }}</td><td>{{ e.note }}</td></tr></tbody></table></div><div class="actions"><button type="button" :disabled="busy || historyPage === 0" @click="turn(-1, true)">Назад</button><span>{{ historyPage + 1 }}</span><button type="button" :disabled="busy || data.history.length < 50" @click="turn(1, true)">Далі</button></div></details>
  </template>
 </section>
</template>
<style scoped>
.partner-finance{border:1px solid #d6c29c;border-radius:10px;padding:16px;margin:12px 0;background:#fffdf7;color:#343321}header,.actions{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}h3{margin:0 0 6px}p{line-height:1.5;font-size:13px}button,input{font:inherit;padding:10px;border:1px solid #b8b4a2;border-radius:7px;max-width:100%;box-sizing:border-box}button{cursor:pointer;margin:4px;min-height:44px}button:disabled{opacity:.5}label{display:grid;gap:6px;margin:10px 0}fieldset{min-width:0;margin-top:12px;border:1px solid #d6c29c;border-radius:8px}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:10px;border-bottom:1px solid #e4ded0}small{display:block;margin-top:4px}.selected{background:#fff0cc}.warning{background:#fff0cc;padding:10px}[role=alert]{color:#a32420}details{margin-top:14px}@media(max-width:600px){.partner-finance{padding:10px}input{font-size:16px}}
</style>
