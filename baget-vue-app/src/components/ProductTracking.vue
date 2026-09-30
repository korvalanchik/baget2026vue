<script setup>
import CustomerFinancePanel from './CustomerFinancePanel.vue'
import { canAcceptCustomerPayment } from '../services/customerPayments.js'

import { onMounted, ref } from 'vue'
import { warehouse, locations, trackingToken } from '../services/warehouse.js'
const props = defineProps({ session: { type: Object, required: true }, productId: { type: Number, default: null }, initialToken: { type: String, default: '' }, disabled: Boolean })
const emit = defineEmits(['transferred'])
const paymentBusy = ref(false)
const data = ref(null), input = ref(props.initialToken), error = ref(''), busy = ref(false), label = ref(null), note = ref('')
async function run(fn, readOnly = false) { if (busy.value || (!readOnly && (props.disabled || paymentBusy.value))) return; busy.value = true; error.value = ''; try { await fn() } catch (e) { error.value = e.message } finally { busy.value = false } }
function load() { return run(async () => { label.value = null; data.value = null; data.value = await warehouse(props.session.token, props.productId ? `/products/by-id/${props.productId}` : `/products/${trackingToken(input.value)}`) }, true) }
function move(accept, destination) { return run(async () => { data.value = await warehouse(props.session.token, `/products/${data.value.trackingId}/${accept ? 'accept' : 'send'}`, { expectedRevision: data.value.revision, destination, note: note.value }); note.value = ''; emit('transferred') }) }
function cancelTransfer() { return run(async () => {
  if (!note.value.trim()) throw new Error('Вкажіть причину відкликання в примітці.')
  data.value = await warehouse(props.session.token, `/products/${data.value.trackingId}/cancel`, { expectedRevision: data.value.revision, destination: data.value.pending, note: note.value }); note.value = ''; emit('transferred')
}) }
function printLabel() { return run(async () => { label.value = await warehouse(props.session.token, `/products/${data.value.trackingId}/label`) }) }
function print() {
  const frame = document.createElement('iframe'); frame.style.position = 'fixed'; frame.style.width = '0'; frame.style.height = '0'; frame.style.border = '0'; document.body.append(frame)
  const doc = frame.contentDocument
  const style = doc.createElement('style'); style.textContent = 'body{font:16px sans-serif;padding:10mm}img{width:45mm}p{margin:4mm 0}'; doc.head.append(style)
  for (const text of [`Замовлення № ${data.value.orderNo} · ${data.value.productName}`, data.value.branchName, ...data.value.materials.slice(0, 3).map(m => m.description)]) { const p = doc.createElement('p'); p.textContent = text; doc.body.append(p) }
  const img = doc.createElement('img'); img.alt = 'QR виробу'; img.onload = () => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 1000) }; img.src = label.value.image; doc.body.append(img)
}
onMounted(() => { if (props.productId || input.value) load() })
</script>
<template>
  <section class="tracking">
    <h4>Переміщення готового виробу</h4>
    <p v-if="busy" role="status">Завантаження / виконання операції…</p>
    <div v-if="productId && !data && !busy" class="actions"><span>Дані переміщення не завантажено.</span><button type="button" @click="load">Завантажити дані передачі</button></div>
    <div v-if="!productId" class="actions"><label>QR або посилання виробу<input v-model="input" placeholder="Відскануйте сканером або вставте посилання" @keydown.enter.prevent="load"></label><button type="button" :disabled="busy" @click="load">Відкрити</button></div>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="data">
      <h4>Замовлення № {{ data.orderNo }} · {{ data.productName }}</h4>
      <p>{{ data.branchName }} · {{ data.state === 'COMPLETED' ? 'Виготовлено' : 'Виробництво ще не завершене' }}</p>
      <p>Місце: <strong>{{ locations[data.location] }}</strong><span v-if="data.pending"> → Очікує приймання: {{ locations[data.pending] }} (передав {{ data.transferActor }})</span></p>
      <div v-if="data.payment"><p>{{ data.payment.message }}<strong v-if="data.payment.dueDate"> · Сплатити до {{ data.payment.dueDate }}</strong><strong v-if="data.payment.overdue"> · Строк оплати прострочено</strong><span v-if="data.payment.invoiceNo"> · Рахунок № {{ data.payment.invoiceNo }} · Борг: {{ data.payment.debt }} грн</span></p>
        <CustomerFinancePanel v-if="data.location === 'BRANCH' && canAcceptCustomerPayment(session)" :key="`${data.payment.customerId}-${data.payment.branchNo}`" :session="session" :customer-id="Number(data.payment.customerId)" :branch-no="Number(data.payment.branchNo)" :invoice-id="data.payment.invoiceId ? Number(data.payment.invoiceId) : null" @paid="paymentBusy = false; load()" @busy="paymentBusy = $event" />
      </div>
      <label>Примітка до передачі<input v-model="note" maxlength="1000" :disabled="busy || disabled || paymentBusy"></label>
      <div class="actions">
        <button type="button" :disabled="busy" @click="load">Оновити</button>
        <template v-if="data.state === 'COMPLETED'">
          <button v-if="data.canCancel" type="button" :disabled="busy || disabled || paymentBusy" @click="cancelTransfer">Відкликати передачу</button>
          <button type="button" :disabled="busy || disabled || paymentBusy" @click="printLabel">Етикетка з QR</button>
          <button v-if="data.pending && (data.pending !== 'WAREHOUSE' || data.canWarehouse) && (data.pending !== 'WORKSHOP' || data.canReceiveWorkshop)" type="button" :disabled="busy || disabled || paymentBusy || (data.pending === 'CUSTOMER' && !data.payment?.canIssue)" @click="move(true, data.pending)">{{ data.pending === 'CUSTOMER' ? 'Підтвердити видачу клієнту' : 'Підтвердити приймання' }}</button>
          <button v-if="!data.pending && data.location === 'WORKSHOP' && data.canWarehouse" type="button" :disabled="busy || disabled || paymentBusy" @click="move(false, 'WAREHOUSE')">Передати на склад</button>
          <button v-if="!data.pending && data.location === 'WAREHOUSE' && data.canWarehouse" type="button" :disabled="busy || disabled || paymentBusy" @click="move(false, 'BRANCH')">Передати до філії</button>
          <button v-if="!data.pending && data.canReturnWorkshop && (data.location === 'BRANCH' || data.canWarehouse)" type="button" :disabled="busy || disabled || paymentBusy" @click="move(false, 'WORKSHOP')">Повернути до майстерні</button>
          <button v-if="!data.pending && data.location === 'BRANCH'" type="button" :disabled="busy || disabled || paymentBusy || !data.payment?.canIssue" @click="move(false, 'CUSTOMER')">Передати клієнту</button>
        </template>
      </div>
      <div v-if="label" class="label"><img :src="label.image" alt="QR виробу"><p>{{ data.orderNo }} · {{ data.productName }}</p><button type="button" @click="print">Друкувати етикетку</button></div>
      <details><summary>Історія переміщень</summary><p v-if="!data.history.length">Переміщень ще немає.</p><p v-for="(e, i) in data.history" :key="i">{{ e.createdAt }} · {{ e.actor }} · {{ e.action === 'SEND' ? 'Передав' : e.action === 'CANCEL' ? 'Відкликав' : 'Прийняв' }}: {{ locations[e.fromLocation] }} → {{ locations[e.toLocation] }}. {{ e.note }}</p></details>
    </template>
  </section>
</template>
<style scoped>
.tracking{padding:16px;border:1px solid #dae2e8;border-radius:8px;margin:12px 0;font-size:13px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}label{display:grid;gap:6px;flex:1}input,button{padding:9px;border:1px solid #ccd5dd;border-radius:6px;font:inherit}input{min-width:220px}button{cursor:pointer}button:disabled{opacity:.5}.label img{width:160px}[role=alert]{color:#a22}details{margin-top:14px}
</style>
