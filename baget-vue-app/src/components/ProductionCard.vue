<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { production, issueProductionInvoice } from '../services/production.js'
import { actualsPayload, statusNames } from '../calculation/production.js'
const props = defineProps({ session: { type: Object, required: true }, orderNo: { type: Number, required: true } })
const emit = defineEmits(['changed', 'dirty', 'busy'])
const view = ref(null), rows = ref([]), busy = ref(false), error = ref(''), message = ref(''), baseline = ref('')
const canEdit = computed(() => view.value && !view.value.finalized && [2, 3].includes(view.value.status))
const dirty = computed(() => JSON.stringify(rows.value) !== baseline.value)
const productNumbers = computed(() => new Map([...new Set(rows.value.map(r => r.productId))].map((id, i) => [id, i + 1])))
const units = { METER: 'м', SQUARE_METER: 'м²', PIECE: 'шт' }
const money = value => Number(value || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
watch(dirty, value => emit('dirty', value))
watch(busy, value => emit('busy', value))
function accept(data) {
  view.value = data
  rows.value = data.lines.map(line => ({ ...line, actual: line.actual ?? '', widthMm: line.widthMm ?? '', heightMm: line.heightMm ?? '' }))
  baseline.value = JSON.stringify(rows.value)
  emit('changed', data)
}
async function run(task) {
  if (busy.value) return
  busy.value = true; error.value = ''; message.value = ''
  try { await task() } catch (e) { error.value = e.message } finally { busy.value = false }
}
function reload() {
  if (dirty.value && view.value && !window.confirm('Відкинути незбережені фактичні витрати?')) return
  return run(async () => accept(await production(props.session.token, props.orderNo)))
}
function fillPlanned() {
  rows.value = rows.value.map(row => ({ ...row, actual: row.planned }))
}
function save() { return run(async () => { accept(await production(props.session.token, props.orderNo, '', 'PUT', actualsPayload(view.value, rows.value))); message.value = 'Фактичні витрати збережено. Склад ще не списано.' }) }
function changeStatus(status) {
  let note = null
  if ([5, 10].includes(status)) {
    note = window.prompt('Причина припинення виконання. Кошти й майно клієнта оформлюються окремо:')
    if (!note?.trim()) return
  }
  return run(async () => accept(await production(props.session.token, props.orderNo, '/status', 'POST', { expectedRevision: view.value.revision, status, note })))
}
function finalize() {
  if (!window.confirm('Підтвердити фактичні витрати й списати матеріали зі складу? Після підтвердження редагування витрат закривається.')) return
  return run(async () => { accept(await production(props.session.token, props.orderNo, '/finalize', 'POST', { expectedRevision: view.value.revision })); message.value = 'Матеріали списано, невикористаний резерв звільнено. Можна створити рахунок.' })
}
function invoice() {
  return run(async () => { const result = await issueProductionInvoice(props.session.token, props.orderNo); accept(await production(props.session.token, props.orderNo)); message.value = `Створено рахунок № ${result.invoiceNo}. Оплата — через «Клієнти та інвойси».` })
}
onMounted(reload)
</script>
<template>
  <section class="production-card">
    <header><h3>Фактичні витрати майстра</h3><button type="button" :disabled="busy" @click="reload">Оновити</button></header>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
    <template v-if="view">
      <p><strong>{{ statusNames[view.status] }}</strong></p>
      <p>Кількість — загальна витрата на всю позицію, з урахуванням усіх виробів і шарів. Розміри зберігаються для майстра; фактичну витрату в м, м² або штуках вкажіть окремо.</p>
      <button v-if="canEdit" type="button" :disabled="busy" @click="fillPlanned">Заповнити кількості з попереднього розрахунку</button>
      <div class="table-wrap"><table><thead><tr><th>Виріб / матеріал</th><th>План</th><th>Факт</th><th>Ширина, мм</th><th>Висота, мм</th><th>Ціна / од.</th><th>Сума збережена</th></tr></thead>
        <tbody><tr v-for="row in rows" :key="row.itemNo"><td>Виріб {{ productNumbers.get(row.productId) }} · {{ row.description }}<small>{{ units[row.unit] || row.unit }}</small></td><td>{{ row.planned }}</td><td><input v-model="row.actual" type="number" min="0" :step="row.unit === 'PIECE' ? '1' : '0.000001'" :aria-label="`Фактична витрата: ${row.description}`" :disabled="busy || !canEdit"></td><td><input v-model="row.widthMm" type="number" min="0.001" step="0.001" :aria-label="`Ширина: ${row.description}`" :disabled="busy || !canEdit"></td><td><input v-model="row.heightMm" type="number" min="0.001" step="0.001" :aria-label="`Висота: ${row.description}`" :disabled="busy || !canEdit"></td><td>{{ money(row.price) }}</td><td>{{ row.amount == null ? '—' : money(row.amount) }}</td></tr></tbody>
      </table></div>
      <p v-if="dirty">Є незбережені зміни. Спочатку збережіть фактичні витрати.</p>
      <p v-if="view.invoiceNo">Рахунок № {{ view.invoiceNo }}</p>
      <p v-if="view.finalized"><strong>Остаточна вартість: {{ money(view.total) }} грн</strong></p>
      <div class="actions">
        <button v-if="view.status === 1" type="button" :disabled="busy" @click="changeStatus(2)">Прийняти в роботу</button>
        <button v-if="canEdit" type="button" :disabled="busy || !dirty" @click="save">Зберегти фактичні витрати</button>
        <button v-if="view.status === 2" type="button" :disabled="busy || dirty" @click="changeStatus(3)">Вироблено</button>
        <button v-if="view.status === 3" type="button" :disabled="busy || dirty" @click="changeStatus(2)">Повернути в роботу</button>
        <button v-if="view.status === 3 && !view.finalized" type="button" :disabled="busy || dirty || rows.some(r => r.actual === '')" @click="finalize">Підтвердити витрати й розрахувати</button>
        <button v-if="view.finalized && !view.invoiceNo && [6, 11, 12].includes(view.status)" type="button" :disabled="busy" @click="invoice">Створити рахунок</button>
        <button v-if="view.finalized && [6, 7, 8, 4, 9].includes(view.status)" type="button" :disabled="busy" @click="changeStatus(11)">Прийнято до філії</button>
        <button v-if="view.status === 11" type="button" :disabled="busy" @click="changeStatus(12)">Отримано клієнтом</button>
        <template v-if="!view.finalized && [1, 2, 3].includes(view.status)"><button type="button" :disabled="busy || dirty" @click="changeStatus(5)">Відмова клієнта</button><button type="button" :disabled="busy || dirty" @click="changeStatus(10)">Не можливе виконання</button></template>
      </div>
    </template>
  </section>
</template>
<style scoped>
.production-card{font-size:13px}.production-card header,.actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.production-card header{justify-content:space-between}.production-card p{line-height:1.6}.table-wrap{overflow:auto;margin:18px 0}table{border-collapse:collapse;width:100%}td,th{padding:9px;border-bottom:1px solid #ddd;text-align:left}small{display:block;color:#68788b}input{width:90px;padding:7px}button{padding:9px;border:1px solid #ccc;border-radius:6px;background:#f5f7fa;cursor:pointer}button:disabled{opacity:.5;cursor:default}[role=alert]{color:#a32929}[role=status]{color:#22663b}
</style>
