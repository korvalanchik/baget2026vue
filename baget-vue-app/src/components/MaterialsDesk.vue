<script setup>
import { newRequestKey } from '../services/requestKey.js'
import { onMounted, ref } from 'vue'
import { warehouse } from '../services/warehouse.js'
import ProcurementDesk from './ProcurementDesk.vue'
import FrameSamplesDesk from './FrameSamplesDesk.vue'
import StocktakeDesk from './StocktakeDesk.vue'
import MaterialCard from './MaterialCard.vue'
import ProductTracking from './ProductTracking.vue'
const tab = ref('procurement')
const stocktakeDesk = ref(null), procurementDesk = ref(null), trackedProduct = ref(null)
async function openDocument(doc) {
  if (doc.kind === 'stocktake') { tab.value = 'inventory'; await stocktakeDesk.value.open(doc.id) }
  else if (doc.kind === 'supplier') { tab.value = 'procurement'; await procurementDesk.value.open(doc.id) }
  else { trackedProduct.value = Number(doc.id) }
}
const props = defineProps({ session: { type: Object, required: true } })
const rows = ref([]), selected = ref(null), q = ref(''), page = ref(0), shortage = ref(false), busy = ref(false), error = ref(''), message = ref('')
const action = ref('RECEIPT'), quantity = ref(''), note = ref('')
const units = { METER: 'м', SQUARE_METER: 'м²', PIECE: 'шт' }
const states = { OPEN: 'Заявлено', ORDERED: 'Замовлено постачальнику', CLOSED: 'Заявку виконано', CANCELLED: 'Скасовано' }
let retry = null
async function run(fn) { if (busy.value) return; busy.value = true; error.value = ''; message.value = ''; try { await fn() } catch (e) { error.value = e.message } finally { busy.value = false } }
async function list() { rows.value = await warehouse(props.session.token, `/materials?q=${encodeURIComponent(q.value)}&page=${page.value}&shortageOnly=${shortage.value}`) }
function refresh(reset = false) { if (reset) page.value = 0; return run(list) }
function open(id) { return run(async () => { selected.value = await warehouse(props.session.token, `/materials/${id}`); trackedProduct.value = null; quantity.value = ''; note.value = ''; retry = null }) }
function turn(n) { page.value += n; refresh() }
function submit() { return run(async () => {
  const qty = Number(quantity.value)
  if (quantity.value === '' || !Number.isFinite(qty) || qty < 0 || (action.value !== 'COUNT' && qty === 0) || qty > 999999999) throw new Error('Вкажіть коректну кількість.')
  if (selected.value.unit === 'PIECE' && !Number.isInteger(qty)) throw new Error('Потрібна ціла кількість штук.')
  if (!note.value.trim()) throw new Error('Вкажіть документ постачання, причину інвентаризації або примітку до заявки.')
  const request = action.value === 'REQUEST'
  const payload = { quantity: qty, note: note.value.trim(), ...(!request ? { operation: action.value, expectedStock: selected.value.onHand } : {}) }
  const signature = JSON.stringify([selected.value.partNo, action.value, payload])
  if (!retry || retry.signature !== signature) retry = { signature, key: newRequestKey() }
  if (action.value === 'COUNT' && !window.confirm(`Зафіксувати фактичний залишок ${qty} ${units[selected.value.unit] || ''}? Поточний залишок: ${selected.value.onHand ?? 'невідомий'}.`)) return
  selected.value = await warehouse(props.session.token, `/materials/${selected.value.partNo}/${request ? 'requests' : 'stock'}`, { ...payload, requestKey: retry.key })
  retry = null; quantity.value = ''; note.value = ''; message.value = request ? 'Заявку створено. Залишок не змінювався.' : 'Операцію збережено. Доступний матеріал розподілено в резерв.'
  await list()
}) }
function state(r, status) { return run(async () => { selected.value = await warehouse(props.session.token, `/materials/${selected.value.partNo}/requests/${r.id}`, { expectedRevision: r.revision, status }) }) }
onMounted(() => refresh())
</script>
<template>
  <nav class="material-tabs"><button :class="{ active: tab === 'inventory' }" @click="tab = 'inventory'">Акти інвентаризації</button><button :class="{ active: tab === 'samples' }" @click="tab = 'samples'">Зразки багету по філіях</button><button :class="{ active: tab === 'procurement' }" @click="tab = 'procurement'">Потреби та постачання</button><button :class="{ active: tab === 'stock' }" @click="tab = 'stock'; refresh()">Залишки та інвентаризація</button></nav>
  <StocktakeDesk ref="stocktakeDesk" v-show="tab === 'inventory'" :session="session" />
  <FrameSamplesDesk v-if="tab === 'samples'" :session="session" />
  <ProcurementDesk ref="procurementDesk" v-show="tab === 'procurement'" :session="session" :active="tab === 'procurement'" />
  <section v-show="tab === 'stock'" class="materials">
    <h1>Матеріали</h1><p>Спільний склад майстерні. Резерв формується із замовлень; нестача не скасовує замовлення.</p>
    <div class="tools"><input v-model="q" placeholder="Артикул або назва" @keydown.enter="refresh(true)"><label><input v-model="shortage" type="checkbox" :disabled="busy" @change="refresh(true)"> Тільки нестача</label><button :disabled="busy" @click="refresh(true)">Знайти / оновити</button></div>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
    <div class="table"><table><thead><tr><th>Матеріал</th><th>Од.</th><th>Залишок</th><th>Резерв</th><th>Вільно</th><th>Нестача</th></tr></thead><tbody><tr v-for="m in rows" :key="m.partNo"><td><button :disabled="busy" @click="open(m.partNo)">{{ m.description }}</button></td><td>{{ units[m.unit] || '—' }}</td><td>{{ m.onHand ?? 'Невідомо' }}</td><td>{{ m.reserved }}</td><td>{{ m.onHand == null ? '—' : Number((Number(m.onHand) - Number(m.reserved)).toFixed(6)) }}</td><td>{{ m.shortage }}</td></tr></tbody></table></div>
    <p v-if="!rows.length && !busy">Матеріалів за цими умовами не знайдено.</p>
    <div class="tools"><button :disabled="busy || page === 0" @click="turn(-1)">Назад</button><span>Сторінка {{ page + 1 }}</span><button :disabled="busy || rows.length < 100" @click="turn(1)">Далі</button></div>
    <article v-if="selected">
      <h2>{{ selected.description }}</h2><p>Фізичний залишок: {{ selected.onHand ?? 'невідомий' }} {{ units[selected.unit] }}</p>
      <div class="tools"><label>Операція<select v-model="action" :disabled="busy"><option value="RECEIPT">Прихід без замовлення постачальнику</option><option value="COUNT">Інвентаризація позиції</option><option value="REQUEST">Заявка на матеріал</option></select></label><label>{{ action === 'COUNT' ? 'Порахований залишок' : 'Кількість' }}<input v-model="quantity" type="number" min="0" :step="selected.unit === 'PIECE' ? 1 : 0.000001" :disabled="busy"></label></div>
      <p v-if="action === 'COUNT'">Вкажіть повний фактичний залишок цієї позиції. Для підрахунку кількох позицій або залишку нижче чинного резерву використовуйте «Акти інвентаризації».</p>
      <label>Документ / примітка<textarea v-model="note" maxlength="1000" :disabled="busy"></textarea></label><button :disabled="busy" @click="submit">Зберегти операцію</button>
      <MaterialCard :key="selected.partNo" :part-no="Number(selected.partNo)" :session="session" @document="openDocument" />
      <div v-if="trackedProduct"><button @click="trackedProduct = null">Закрити перегляд виробу</button><ProductTracking :key="trackedProduct" :product-id="trackedProduct" :session="session" disabled /></div>
      <h3>Попередні заявки</h3><p>Для нового замовлення постачальнику та часткового приходу використовуйте вкладку «Потреби та постачання».</p><p>Закриття заявки не оприбутковує матеріал. Приймання оформлюється окремою операцією з номером документа.</p>
      <div v-for="r in selected.requests" :key="r.id" class="request"><p>№ {{ r.id }} · {{ r.quantity }} {{ units[selected.unit] }} · {{ states[r.status] }} · {{ r.actor }} · {{ r.note }}</p><button v-if="r.status === 'OPEN'" :disabled="busy" @click="state(r, 'ORDERED')">Замовлено</button><button v-if="r.status === 'ORDERED'" :disabled="busy" @click="state(r, 'CLOSED')">Заявку виконано</button><button v-if="['OPEN','ORDERED'].includes(r.status)" :disabled="busy" @click="state(r, 'CANCELLED')">Скасувати заявку</button></div>
      <details><summary>Історія станів заявок (останні 100)</summary><p v-for="(e, i) in selected.requestEvents" :key="i">{{ e.createdAt }} · {{ e.actor }} · заявка № {{ e.requestId }}: {{ states[e.status] }}</p></details>


    </article>
  </section>
</template>
<style scoped>
.material-tabs{display:flex;gap:12px;padding:20px 24px;flex-wrap:wrap}.material-tabs .active{background:#e5f1fb;border-color:#6599ba}
.materials{padding:24px}.tools{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:14px 0}label{display:grid;gap:6px}input,select,textarea,button{font:inherit;padding:9px;border:1px solid #ccd5dd;border-radius:6px}button{cursor:pointer}button:disabled{opacity:.5}table{border-collapse:collapse;width:100%}.table{overflow:auto}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd}article{margin-top:24px;padding:20px;border:1px solid #ddd;border-radius:10px}textarea{max-width:650px;margin-bottom:12px}details{margin:15px 0}[role=alert]{color:#a22}[role=status]{color:#276039}.request{border-bottom:1px solid #ddd;padding:10px 0}.request button{margin-right:8px}
</style>
