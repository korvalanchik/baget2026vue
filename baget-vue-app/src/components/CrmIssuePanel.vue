<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { crm } from '../services/crm.js'
import { newRequestKey } from '../services/requestKey.js'
import ProductQrScanner from './ProductQrScanner.vue'
import { locations } from '../calculation/tracking.js'
import CustomerFinancePanel from './CustomerFinancePanel.vue'
const props = defineProps({ session: { type: Object, required: true }, customer: { type: Object, required: true }, orderNo: { type: Number, required: true }, initialProductId: { type: Number, default: null } })
const emit = defineEmits(['issued', 'busy', 'locked', 'close'])
const data = ref(null), chosen = ref([]), busy = ref(false), financeBusy = ref(false), error = ref(''), note = ref(''), checked = ref(false), pending = ref(null), finance = ref(null), confirm = ref(false), notice = ref('')
let refreshAfterPayment = false, initialApplied = false
const focused = ref(props.initialProductId), scanExpanded = ref(false)
const path = `/customers/${props.customer.customerId}/branches/${props.customer.branchNo}/orders/${props.orderNo}/issue`
const key = `baget.crm-issue.${props.session.nickname || props.session.username || 'session'}.${props.customer.customerId}.${props.customer.branchNo}.${props.orderNo}`
const blocked = computed(() => busy.value || financeBusy.value)
watch(() => blocked.value || !!pending.value || confirm.value, value => emit('locked', value), { immediate: true })
const selected = computed(() => (data.value?.products || []).filter(p => chosen.value.includes(p.id)))
const external = computed(() => selected.value.some(p => p.payment?.externalSettlement))
const money = n => Number(n || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const canSave = computed(() => selected.value.length > 0 && (!external.value || checked.value))
function setBusy(value) { busy.value = value; emit('busy', value || financeBusy.value) }
function paymentBusy(value) { financeBusy.value = value; emit('busy', value || busy.value); if (!value && refreshAfterPayment) { refreshAfterPayment = false; load() } }
function paymentSaved() { refreshAfterPayment = true; if (!financeBusy.value) { refreshAfterPayment = false; load() } }
async function refresh() {
 data.value = await crm(props.session.token, path)
 chosen.value = chosen.value.filter(id => data.value.products.some(p => p.id === id && p.canIssue))
 checked.value = false; confirm.value = false
 if (!finance.value) finance.value = data.value.products.find(p => p.payment)?.payment || null
 if (!initialApplied && props.initialProductId) { initialApplied = true; focusProduct(props.initialProductId) }
}
function focusProduct(id) {
 const p = data.value?.products.find(p => p.id === id)
 if (!p) { error.value = 'Виріб більше не входить до складу замовлення'; return }
 focused.value = id
 if (p.canIssue && !chosen.value.includes(id)) chosen.value.push(id)
 finance.value = p.payment || null
 confirm.value = false
}
async function scan(token) {
 if (blocked.value || pending.value || confirm.value) return
 setBusy(true); error.value = ''
 try {
  const target = await crm(props.session.token, '/issue-qr/' + encodeURIComponent(token))
  if (Number(target.orderNo) !== props.orderNo || Number(target.customerId) !== Number(props.customer.customerId) || Number(target.branchNo) !== Number(props.customer.branchNo)) throw new Error('Цей QR належить іншому замовленню. Завершіть поточну видачу й відкрийте його окремо.')
  await refresh(); focusProduct(Number(target.productId))
 } catch (e) { error.value = e.message } finally { setBusy(false) }
}
async function load() {
 if (blocked.value) return
 setBusy(true); error.value = ''
 try { pending.value = JSON.parse(sessionStorage.getItem(key) || 'null'); await refresh() } catch (e) { error.value = e.message } finally { setBusy(false) }
}
function review() { if (!blocked.value && canSave.value && !pending.value) confirm.value = true }
async function issue() {
 if (blocked.value) return
 setBusy(true); error.value = ''; notice.value = ''
 try {
  if (!pending.value) {
   if (!canSave.value || !confirm.value) throw new Error('Оберіть вироби та підтвердіть видачу')
   const request = { requestKey: newRequestKey(), products: selected.value.map(p => ({ productId: p.id, revision: p.revision })), externalPaymentChecked: checked.value, note: note.value.trim() }
   sessionStorage.setItem(key, JSON.stringify(request)); pending.value = request
  }
  await crm(props.session.token, path, pending.value)
  sessionStorage.removeItem(key); pending.value = null; chosen.value = []; finance.value = null; note.value = ''; confirm.value = false
  notice.value = 'Видачу записано. Вироби передані клієнту.'
  emit('issued'); await refresh()
 } catch (e) {
  error.value = e.message
  if ([400, 403, 404, 409, 422].includes(e.status)) { sessionStorage.removeItem(key); pending.value = null; confirm.value = false; await refresh().catch(() => {}) }
 } finally { setBusy(false) }
}
function openFinance(p) { finance.value = p.payment; confirm.value = false }
onMounted(load)
</script>
<template>
 <section class="issue-panel">
  <header><div><h3>Оплата та видача · замовлення № {{ orderNo }}</h3><p>{{ customer.company }} · {{ customer.branchName }}<span v-if="customer.mobile || customer.phone"> · {{ customer.mobile || customer.phone }}</span></p></div><button type="button" :disabled="blocked || !!pending" @click="emit('close')">Закрити видачу</button></header>
  <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p><p v-if="busy" role="status">Перевірка / збереження…</p>
  <div v-if="pending" class="confirmation"><p>Результат попередньої видачі ще не підтверджено. Повторіть той самий запит — повторного списання чи видачі не буде.</p><p>Вироби: {{ pending.products.map(p => p.productId).join(', ') }}</p><button :disabled="blocked" @click="issue">Перевірити результат видачі</button></div>
  <button :disabled="blocked" @click="load">Оновити готовність і оплату</button>
  <details v-if="data && !pending && !confirm" @toggle="scanExpanded = $event.target.open"><summary>Додати виріб цього замовлення за QR</summary><ProductQrScanner v-if="scanExpanded" :disabled="blocked" @scan="scan" /></details>
  <template v-if="data">
   <p v-if="!data.products.length">Для цього замовлення немає виробів нового формату. Автоматична видача старого замовлення тут недоступна.</p>
   <fieldset :disabled="blocked || !!pending || confirm"><legend>Що забирає клієнт</legend>
    <article v-for="p in data.products" :key="p.id" :class="['product', { focused: focused === p.id }]"><p v-if="focused === p.id" class="scan-mark">Виріб з QR-коду</p><p>Місце: {{ locations[p.location] || p.location }}<span v-if="p.pending"> → {{ locations[p.pending] || p.pending }} (передача не завершена)</span></p><label class="choice"><input v-model="chosen" type="checkbox" :value="p.id" :disabled="!p.canIssue"><strong>{{ p.productName }} · виріб № {{ p.id }}</strong></label><p v-if="p.widthMm && p.heightMm">{{ p.widthMm }} × {{ p.heightMm }} мм<span v-if="p.amount != null"> · вартість виробу {{ money(p.amount) }} грн</span></p><p v-if="p.blocked" class="muted">{{ p.blocked }}</p>
     <template v-if="p.payment"><p>{{ p.payment.message }}</p><p v-if="p.payment.invoiceNo"><strong>Рахунок № {{ p.payment.invoiceNo }} · залишок до оплати {{ money(p.payment.debt) }} грн</strong></p><p v-if="p.payment.deferred">Дозволено відстрочку до {{ p.payment.dueDate }}.</p><button v-if="!finance || finance.invoiceId !== p.payment.invoiceId || finance.customerId !== p.payment.customerId" type="button" @click="openFinance(p)">{{ p.payment.externalSettlement ? 'Розрахунок із посередником' : 'Відкрити оплату цього рахунку' }}</button></template>
    </article>
    <label v-if="external" class="choice"><input v-model="checked" type="checkbox"> Я перевірив розрахунок клієнта з посередником і підтверджую видачу</label>
    <label class="note">Примітка до видачі<input v-model="note" maxlength="1000" placeholder="Необов’язково"></label>
   </fieldset>
   <p class="muted">Залишок показано за рахунком, який може охоплювати кілька виробів. Доступний аванс потрібно явно зарахувати через оплату.</p>
   <div v-if="finance && !pending && !confirm" class="finance"><CustomerFinancePanel :key="`${finance.customerId}-${finance.invoiceId || orderNo}`" :session="session" :customer-id="Number(finance.customerId)" :branch-no="Number(customer.branchNo)" :order-no="orderNo" :invoice-id="finance.invoiceId ? Number(finance.invoiceId) : null" @busy="paymentBusy" @paid="paymentSaved" /></div>
   <div v-if="confirm && !pending" class="confirmation"><strong>Підтвердіть фактичну передачу клієнту</strong><ul><li v-for="p in selected" :key="p.id">{{ p.productName }} · № {{ p.id }}</li></ul><p>В історії буде збережено, хто й коли видав ці вироби.</p><button :disabled="blocked" @click="issue">Підтвердити видачу</button><button :disabled="blocked" @click="confirm = false">Повернутися до вибору</button></div>
   <button v-else-if="!pending" class="primary" :disabled="blocked || !canSave" @click="review">Видати клієнту ({{ selected.length }})</button>
  </template>
 </section>
</template>
<style scoped>
.issue-panel{padding:16px;border:1px solid #88afb2;border-radius:10px;background:#f8fcfc;margin-bottom:18px}header{display:flex;justify-content:space-between;gap:10px;align-items:start}h3{margin:0}p{font-size:13px;line-height:1.5}.focused{background:#e9f5f5;border-left:3px solid #185c63;padding-left:9px!important}.scan-mark{font-weight:700;color:#185c63}summary{cursor:pointer;min-height:44px;align-content:center}.product{padding:12px 0;border-bottom:1px solid #dce4e9}.choice{display:flex;gap:9px;align-items:start;font-size:13px;margin:8px 0}.choice input{width:18px;height:18px;flex-shrink:0}.note{display:grid;gap:5px;font-size:13px;margin-top:12px}fieldset{border:0;padding:0;min-width:0;margin-top:12px}legend{font-weight:600;font-size:14px}button,input{font:inherit;padding:9px;border:1px solid #bdccd4;border-radius:7px;max-width:100%;box-sizing:border-box}button{min-height:44px;font-size:13px;margin:3px;cursor:pointer}button:disabled{opacity:.5}.primary{background:#185c63;color:white}.muted{color:#62717d}.confirmation{padding:14px;margin-top:12px;background:#fff4d8;border-radius:8px}[role=alert]{color:#a22}[role=status]{color:#276039}@media(max-width:600px){header{flex-wrap:wrap}.issue-panel{padding:10px}input{font-size:16px}}
.issue-panel,.finance,.product{min-width:0;overflow-wrap:anywhere}.finance{margin:12px 0}.primary{width:100%;margin:12px 0}button{white-space:normal}@media(max-width:600px){button{width:100%;margin:5px 0}header{display:block}.choice strong{overflow-wrap:anywhere}}
</style>
