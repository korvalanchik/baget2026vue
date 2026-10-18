<script setup>
import { newRequestKey } from '../services/requestKey.js'
import { computed, nextTick, onMounted, ref } from 'vue'
import ReceiptCostDesk from './ReceiptCostDesk.vue'
import { warehouse } from '../services/warehouse.js'
import ProcurementDesk from './ProcurementDesk.vue'
import FrameSamplesDesk from './FrameSamplesDesk.vue'
import StocktakeDesk from './StocktakeDesk.vue'
import MaterialCard from './MaterialCard.vue'
import ProductTracking from './ProductTracking.vue'
const receiptDesk=ref(null), receiptBusy=ref(false)
async function openPricedReceipt(id){if(receiptBusy.value)return;tab.value='receipts';await nextTick();await receiptDesk.value.start(id)}
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
const createOpen = ref(false), suppliers = ref([])
const emptyMaterial = () => ({
  description: '', vendorNo: '', calculationMethod: 'QUANTITY',
  profileWidthMm: '', marginWidthMm: '', marginHeightMm: '',
  allowanceMm: '', railWidthMm: '',
  cost: '', listPrice: '', listPrice1: '', listPrice3: '',
})
const newMaterial = ref(emptyMaterial())
const materialMethods = [
  { value: 'FRAME_PROFILE', label: 'Багетний профіль (периметр + ширина профілю)' },
  { value: 'PERIMETER', label: 'Периметр' },
  { value: 'WIDTH_PLUS_ALLOWANCE', label: 'Ширина + припуск' },
  { value: 'AREA', label: 'Площа' },
  { value: 'AREA_WITH_MARGIN', label: 'Площа з припусками' },
  { value: 'QUANTITY', label: 'Кількість на виріб' },
]
const unitForMethod = { FRAME_PROFILE: 'METER', PERIMETER: 'METER', WIDTH_PLUS_ALLOWANCE: 'METER', AREA: 'SQUARE_METER', AREA_WITH_MARGIN: 'SQUARE_METER', QUANTITY: 'PIECE' }
const units = { METER: 'м', SQUARE_METER: 'м²', PIECE: 'шт' }
const createUnit = computed(() => unitForMethod[newMaterial.value.calculationMethod] || 'PIECE')
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
function openCreate() {
  if (busy.value) return
  newMaterial.value = emptyMaterial()
  createOpen.value = true
  error.value = ''
  message.value = ''
  return run(async () => {
    suppliers.value = await warehouse(props.session.token, '/procurement/vendors')
  })
}
function createNumber(value, label) {
  const text = String(value ?? '').trim()
  const number = Number(text)
  if (!text || !Number.isFinite(number) || number < 0) throw new Error(`Вкажіть коректну ціну: ${label}.`)
  return number
}
function optionalNumber(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const number = Number(text)
  if (!Number.isFinite(number) || number < 0) throw new Error('Перевірте додаткові параметри розрахунку.')
  return number
}
function createMaterial() {
  return run(async () => {
    const form = newMaterial.value
    const description = form.description.trim()
    if (!description) throw new Error('Вкажіть артикул або назву матеріалу.')
    if (description.length > 30) throw new Error('Артикул / назва має бути не довше 30 символів.')
    const payload = {
      description,
      vendorNo: form.vendorNo ? Number(form.vendorNo) : null,
      calculationMethod: form.calculationMethod,
      unit: createUnit.value,
      profileWidthMm: form.calculationMethod === 'FRAME_PROFILE' ? optionalNumber(form.profileWidthMm) : null,
      marginWidthMm: form.calculationMethod === 'AREA_WITH_MARGIN' ? optionalNumber(form.marginWidthMm) : null,
      marginHeightMm: form.calculationMethod === 'AREA_WITH_MARGIN' ? optionalNumber(form.marginHeightMm) : null,
      allowanceMm: form.calculationMethod === 'WIDTH_PLUS_ALLOWANCE' ? optionalNumber(form.allowanceMm) : null,
      railWidthMm: form.calculationMethod === 'PERIMETER' ? optionalNumber(form.railWidthMm) : null,
      cost: createNumber(form.cost, 'Cost'),
      listPrice: createNumber(form.listPrice, 'ListPrice'),
      listPrice1: createNumber(form.listPrice1, 'ListPrice_1'),
      listPrice3: createNumber(form.listPrice3, 'ListPrice_3'),
    }
    if (payload.profileWidthMm != null && payload.profileWidthMm <= 0.3) throw new Error('Ширина профілю має бути понад 0,3 мм.')
    if (payload.calculationMethod === 'AREA_WITH_MARGIN' && (payload.marginWidthMm == null || payload.marginHeightMm == null)) throw new Error('Вкажіть обидва сумарні припуски для розрахунку площі.')
    if (payload.calculationMethod === 'WIDTH_PLUS_ALLOWANCE' && payload.allowanceMm == null) throw new Error('Вкажіть припуск у міліметрах.')
    const created = await warehouse(props.session.token, '/materials', payload)
    createOpen.value = false
    tab.value = 'stock'
    q.value = created.description
    page.value = 0
    shortage.value = false
    selected.value = null
    await list()
    selected.value = await warehouse(props.session.token, `/materials/${created.partNo}`)
    message.value = `Артикул «${created.description}» створено. Внутрішній номер: ${created.partNo}. Початковий залишок — 0; фактичну кількість зафіксуйте інвентаризацією або приходом.`
  })
}
onMounted(() => refresh())
</script>
<template>
  <nav class="material-tabs"><button :disabled="receiptBusy" :class="{ active: tab === 'receipts' }" @click="tab = 'receipts'">Прихід і собівартість</button><button :class="{ active: tab === 'inventory' }" @click="tab = 'inventory'">Акти інвентаризації</button><button :class="{ active: tab === 'samples' }" @click="tab = 'samples'">Зразки багету по філіях</button><button :class="{ active: tab === 'procurement' }" @click="tab = 'procurement'">Потреби та постачання</button><button :class="{ active: tab === 'stock' }" @click="tab = 'stock'; refresh()">Залишки та інвентаризація</button><button class="create-material-button" :disabled="busy" @click="openCreate">＋ Новий артикул</button></nav>
  <article v-if="createOpen" class="material-creator">
    <form @submit.prevent="createMaterial">
      <h2>Новий артикул матеріалу</h2>
      <p>Внутрішній номер призначить система. Новий матеріал буде створено з нульовим залишком, одиницею складу та налаштованим методом розрахунку.</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <fieldset :disabled="busy">
        <div class="material-create-grid">
          <label>Артикул / назва (до 30 символів)
            <input v-model="newMaterial.description" maxlength="30" required autocomplete="off" placeholder="Наприклад, 30010 або Клей для дзеркал">
          </label>
          <label>Постачальник за замовчуванням
            <select v-model="newMaterial.vendorNo"><option value="">Не задано</option><option v-for="v in suppliers" :key="v.id" :value="String(v.id)">{{ v.name }}</option></select>
          </label>
          <label>Метод розрахунку
            <select v-model="newMaterial.calculationMethod">
              <option v-for="method in materialMethods" :key="method.value" :value="method.value">{{ method.label }}</option>
            </select>
          </label>
          <label>Одиниця складу та витрати
            <input :value="units[createUnit]" readonly>
          </label>
          <label v-if="newMaterial.calculationMethod === 'FRAME_PROFILE'">Ширина багетного профілю, мм
            <input v-model="newMaterial.profileWidthMm" type="number" min="0.301" max="500" step="0.001" required>
          </label>
          <template v-if="newMaterial.calculationMethod === 'AREA_WITH_MARGIN'">
            <label>Сумарний припуск по ширині, мм<input v-model="newMaterial.marginWidthMm" type="number" min="0" max="1000" step="0.001" required></label>
            <label>Сумарний припуск по висоті, мм<input v-model="newMaterial.marginHeightMm" type="number" min="0" max="1000" step="0.001" required></label>
          </template>
          <label v-if="newMaterial.calculationMethod === 'WIDTH_PLUS_ALLOWANCE'">Припуск до ширини, мм
            <input v-model="newMaterial.allowanceMm" type="number" min="0" max="1000" step="0.001" required>
          </label>
          <label v-if="newMaterial.calculationMethod === 'PERIMETER'">Ширина рейки, мм (необов’язково)
            <input v-model="newMaterial.railWidthMm" type="number" min="0.001" max="1000" step="0.001">
          </label>
        </div>
        <h3>Ціни для калькулятора за одиницю ({{ units[createUnit] }})</h3>
        <p class="material-creator-hint">Це цінові рівні розрахунку, а не складська закупівельна собівартість. Порожні значення не дозволені; якщо для рівня матеріал справді безкоштовний, введіть 0. Складська собівартість окремо визначається у вкладці «Прихід і собівартість».</p>
        <div class="material-create-grid">
          <label>Cost · адміністратор
            <input v-model="newMaterial.cost" type="number" min="0" max="999999999" step="0.000001" required>
          </label>
          <label>ListPrice · менеджер Level 2
            <input v-model="newMaterial.listPrice" type="number" min="0" max="999999999" step="0.000001" required>
          </label>
          <label>ListPrice_1 · облік і замовлення
            <input v-model="newMaterial.listPrice1" type="number" min="0" max="999999999" step="0.000001" required>
          </label>
          <label>ListPrice_3 · стандартний рівень
            <input v-model="newMaterial.listPrice3" type="number" min="0" max="999999999" step="0.000001" required>
          </label>
        </div>
      </fieldset>
      <div class="tools"><button type="submit" :disabled="busy">Створити матеріал</button><button type="button" :disabled="busy" @click="createOpen = false">Скасувати</button></div>
    </form>
  </article>
  <ReceiptCostDesk ref="receiptDesk" v-show="tab === 'receipts'" :session="session" @busy="receiptBusy=$event" />
  <StocktakeDesk ref="stocktakeDesk" v-show="tab === 'inventory'" :session="session" />
  <FrameSamplesDesk v-if="tab === 'samples'" :session="session" />
  <ProcurementDesk ref="procurementDesk" v-show="tab === 'procurement'" :session="session" :active="tab === 'procurement'" @priced-receipt="openPricedReceipt" />
  <section v-show="tab === 'stock'" class="materials">
    <h1>Матеріали</h1><p>Спільний склад майстерні. Резерв формується із замовлень; нестача не скасовує замовлення.</p>
    <div class="tools"><input v-model="q" placeholder="Артикул або назва" @keydown.enter="refresh(true)"><label><input v-model="shortage" type="checkbox" :disabled="busy" @change="refresh(true)"> Тільки нестача</label><button :disabled="busy" @click="refresh(true)">Знайти / оновити</button></div>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
    <div class="table"><table><thead><tr><th>Матеріал</th><th>Од.</th><th>Залишок</th><th>Резерв</th><th>Вільно</th><th>Нестача</th></tr></thead><tbody><tr v-for="m in rows" :key="m.partNo"><td><button :disabled="busy" @click="open(m.partNo)">{{ m.description }}</button></td><td>{{ units[m.unit] || '—' }}</td><td>{{ m.onHand ?? 'Невідомо' }}</td><td>{{ m.reserved }}</td><td>{{ m.onHand == null ? '—' : Number((Number(m.onHand) - Number(m.reserved)).toFixed(6)) }}</td><td>{{ m.shortage }}</td></tr></tbody></table></div>
    <p v-if="!rows.length && !busy">Матеріалів за цими умовами не знайдено.</p>
    <div class="tools"><button :disabled="busy || page === 0" @click="turn(-1)">Назад</button><span>Сторінка {{ page + 1 }}</span><button :disabled="busy || rows.length < 100" @click="turn(1)">Далі</button></div>
    <article v-if="selected">
      <h2>{{ selected.description }}</h2><p>Фізичний залишок: {{ selected.onHand ?? 'невідомий' }} {{ units[selected.unit] }}</p>
      <div class="tools"><label>Операція<select v-model="action" :disabled="busy"><option value="RECEIPT">Прихід без цін (собівартість стане невідомою)</option><option value="COUNT">Інвентаризація позиції</option><option value="REQUEST">Заявка на матеріал</option></select></label><label>{{ action === 'COUNT' ? 'Порахований залишок' : 'Кількість' }}<input v-model="quantity" type="number" min="0" :step="selected.unit === 'PIECE' ? 1 : 0.000001" :disabled="busy"></label></div>
      <p v-if="action === 'RECEIPT'">Для закупівлі з цінами використовуйте «Прихід і собівартість». Прихід без ціни скине складську собівартість цього матеріалу до невідомої.</p>
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
.create-material-button{background:#185c63;color:#fff;border-color:#185c63}.material-creator{margin:0 24px 20px;padding:20px;border:1px solid #a9c8cd;border-radius:10px;background:#f7fbfc}.material-creator h2{margin-top:0}.material-creator fieldset{border:0;padding:0;min-width:0}.material-create-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:12px}.material-creator label{display:grid;gap:6px;align-content:start}.material-creator input,.material-creator select{width:100%;box-sizing:border-box}.material-creator-hint{color:#526875;font-size:13px}
.materials{padding:24px}.tools{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:14px 0}label{display:grid;gap:6px}input,select,textarea,button{font:inherit;padding:9px;border:1px solid #ccd5dd;border-radius:6px}button{cursor:pointer}button:disabled{opacity:.5}table{border-collapse:collapse;width:100%}.table{overflow:auto}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd}article{margin-top:24px;padding:20px;border:1px solid #ddd;border-radius:10px}textarea{max-width:650px;margin-bottom:12px}details{margin:15px 0}[role=alert]{color:#a22}[role=status]{color:#276039}.request{border-bottom:1px solid #ddd;padding:10px 0}.request button{margin-right:8px}
</style>
