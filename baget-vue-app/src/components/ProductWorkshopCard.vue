<script setup>
import WorkshopProductOverview from './WorkshopProductOverview.vue'
import { consumptionDifference, workshopPrintHtml } from '../calculation/workshopDocument.js'
import PriceApprovalPanel from './PriceApprovalPanel.vue'
import ProductConsumptionCost from './ProductConsumptionCost.vue'
import ProductTracking from './ProductTracking.vue'
import { branchDimensions, historyActualLabel } from '../calculation/workshopHistory.js'
import ProductRework from './ProductRework.vue'
import MeasurementResult from './MeasurementResult.vue'
import { measurementRequest, measurementStale, applyMeasurement } from '../calculation/measurement.js'
import { computed, onMounted, ref, watch } from 'vue'
import { productWorkshop } from '../services/production.js'
import { productStates, productEditable, productActions, correctionPayload, productDraft, draftKey } from '../calculation/workshop.js'
const props = defineProps({ session: { type: Object, required: true }, orderNo: { type: Number, required: true }, orderHeader: { type: Object, default: () => ({}) } })
const emit = defineEmits(['changed', 'dirty', 'busy'])
const view = ref(null), products = ref([]), baselines = ref({}), working = ref(false), error = ref(''), message = ref('')
const measurements = ref({})
const priceReady = ref({})
const reworkDirty = ref({}), childBusy = ref({})
const busy = computed(() => working.value || Object.values(childBusy.value).some(Boolean))
const changed = p => draftKey(p) !== baselines.value[p.id]
const dirty = computed(() => products.value.some(changed) || Object.values(reworkDirty.value).some(Boolean))
const completed = computed(() => products.value.filter(p => p.confirmed).length)
const units = { METER: 'м', SQUARE_METER: 'м²', PIECE: 'шт' }
const money = value => value == null ? '—' : Number(value).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const date = value => value ? String(value).replace('T', ' ').slice(0, 19) : '—'
const actions = { REWORK_OPEN: 'Відкрито доопрацювання', REWORK_SAVE: 'Збережено додаткові витрати', REWORK_COMPLETE: 'Завершено доопрацювання', CORRECTION: 'Збережено обмір і витрати', COMPLETE: 'Підтверджено завершення', STATE_ACCEPTED: 'Прийнято від філії', STATE_IN_PROGRESS: 'В роботі', STATE_PAUSED: 'Призупинено' }
watch(dirty, value => emit('dirty', value))
watch(busy, value => emit('busy', value), { flush: 'sync' })
function accept(data) {
  priceReady.value = {}
  reworkDirty.value = {}
  measurements.value = {}
  view.value = data
  products.value = data.products.map(productDraft)
  baselines.value = Object.fromEntries(products.value.map(p => [p.id, draftKey(p)]))
  emit('changed', data)
}
async function run(task) {
  if (busy.value) return
  working.value = true; error.value = ''; message.value = ''
  try { await task() } catch (e) { error.value = e.message } finally { working.value = false }
}
function reload() {
  if (dirty.value && !window.confirm('Відкинути незбережені зміни та оновити картку?')) return
  return run(async () => accept(await productWorkshop(props.session.token, props.orderNo)))
}
function othersDirty(p) { return products.value.some(other => other.id !== p.id && (changed(other) || reworkDirty.value[other.id])) }
function save(p) {
  if (othersDirty(p)) { error.value = 'Завершіть редагування одного виробу перед зміною іншого.'; return }
  return run(async () => {
    if (measurementStale(measurements.value[p.id], p)) throw new Error('Обмір змінено. Перерахуйте витрати перед збереженням.')
    const payload = correctionPayload(view.value, p)
    accept(await productWorkshop(props.session.token, props.orderNo, `/${p.id}`, 'PUT', payload))
    message.value = 'Обмір, розміри позицій і витрати збережено; резерв матеріалів оновлено. Списання — при завершенні виробу.'
  })
}
function transition(p, state) {
  let note = null
  if (state === 'PAUSED' || p.state === 'PAUSED') {
    note = window.prompt('Причина призупинення або відновлення роботи:')
    if (!note?.trim()) return
  }
  return run(async () => accept(await productWorkshop(props.session.token, props.orderNo, `/${p.id}/state`, 'POST', { expectedRevision: view.value.revision, state, note })))
}
function finish(p) {
  if (!window.confirm('Завершити цей виріб і підтвердити його фактичні витрати? Матеріали буде списано, редагування закриється.')) return
  return run(async () => {
    accept(await productWorkshop(props.session.token, props.orderNo, `/${p.id}/complete`, 'POST', { expectedRevision: view.value.revision }))
    message.value = 'Виріб завершено. Його витрати підтверджені; рахунок оформлюється окремо.'
  })
}
function calculate(p) {
  if (othersDirty(p)) return
  if (!window.confirm('Перерахувати й заповнити витрату та розміри позицій за новим обміром? Поточні ручні значення в таблиці буде замінено розрахунковими.')) return
  return run(async () => {
    const result = await productWorkshop(props.session.token, props.orderNo, `/${p.id}/calculate`, 'POST', measurementRequest(view.value.revision, p))
    measurements.value[p.id] = result
    p.lines = applyMeasurement(p.lines, result)
    message.value = 'Розрахунок заповнив таблицю. Перевірте фактичну витрату та збережіть.'
  })
}
function fill(p) {
  if (busy.value || !productEditable(p, view.value?.canEdit) || othersDirty(p)) return
  const hasActual = value => value !== '' && value != null
  if ((hasActual(p.widthMm) || hasActual(p.heightMm) || p.lines.some(l => [l.actual, l.widthMm, l.heightMm].some(hasActual))) &&
      !window.confirm('Замінити введені фактичні розміри й витрати плановими? Незбережені ручні значення буде замінено.')) return
  return run(async () => {
    const sizes = branchDimensions(p.configuration)
    if (!sizes.length || sizes.some(s => !s.widthMm || !s.heightMm) || sizes.some(s => s.widthMm !== sizes[0].widthMm || s.heightMm !== sizes[0].heightMm))
      throw new Error('Первісні розміри відсутні або відрізняються між складовими. Введіть обмір вручну.')
    if (!p.lines.length || p.lines.some(l => l.planned == null || String(l.planned).trim() === '' || !Number.isFinite(Number(l.planned)) || Number(l.planned) < 0))
      throw new Error('Для частини позицій немає коректної планової витрати. Перевірте склад виробу.')
    const draft = { ...p, widthMm: sizes[0].widthMm, heightMm: sizes[0].heightMm }
    const result = await productWorkshop(props.session.token, props.orderNo, `/${p.id}/calculate`, 'POST', measurementRequest(view.value.revision, draft))
    // Validate every mapping before changing the editable draft. Keep the original saved plan quantities.
    const lines = applyMeasurement(p.lines, result).map(line => ({ ...line, actual: line.planned }))
    p.widthMm = draft.widthMm; p.heightMm = draft.heightMm; p.lines = lines
    if (!p.note?.trim()) p.note = 'Обмір підтвердив розміри філії. Витрати заповнено за первісним планом.'
    delete measurements.value[p.id]
    message.value = 'Планові розміри й витрати перенесено у форму. Перевірте таблицю та натисніть «Зберегти обмір і витрати». Матеріали ще не списано.'
  })
}
async function printDocument(p, mode) {
  if (busy.value || dirty.value) return
  const popup = window.open('', '_blank')
  if (!popup) { error.value = 'Дозвольте відкриття вікна для друку.'; return }
  popup.opener = null; popup.document.body.textContent = 'Формування виробничої картки…'
  await run(async () => {
    try {
      const document = await productWorkshop(props.session.token, props.orderNo, `/${p.id}/document`)
      const html = workshopPrintHtml(document, mode)
      if (!popup.closed) { popup.document.open(); popup.document.write(html); popup.document.close() }
    } catch (e) { if (!popup.closed) popup.close(); throw e }
  })
}
onMounted(reload)
</script>
<template>
  <section class="product-workshop">
    <header><h3>Вироби майстерні</h3><button type="button" :disabled="busy" @click="reload">Оновити</button></header>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
    <template v-if="view">
      <p>Завершено {{ completed }} із {{ products.length }} виробів. Приймання, обмір і завершення ведуться окремо для кожного виробу.</p>
      <p v-if="!view.canEdit">Доступний перегляд. Виробничі дії виконує майстер або адміністратор.</p>
      <p v-if="dirty" class="notice">Є незбережені зміни.</p>
      <article v-for="(p, index) in products" :key="p.id" class="product">
        <header><h4>{{ p.name || `Виріб ${index + 1}` }} · Замовлення № {{ orderNo }}</h4><strong>{{ productStates[p.state] || p.state }}</strong></header>
        <p>Майстер: {{ p.master || 'ще не прийнято' }} · Прийнято: {{ date(p.acceptedAt) }}<span v-if="p.completedAt"> · Завершено: {{ date(p.completedAt) }}</span></p>
        <div class="document-actions"><button type="button" :disabled="busy || dirty" @click="printDocument(p, 'sheet')">Друк робочого листа / PDF</button><button v-if="p.confirmed && p.state === 'COMPLETED' && !p.rework?.active" type="button" :disabled="busy || dirty" @click="printDocument(p, 'label')">Етикетка з QR</button><small>Друк збережених даних. Етикетка — після завершення виробу.</small></div>
        <WorkshopProductOverview :product="p" :header="orderHeader" :dirty="changed(p)" />
        <PriceApprovalPanel :key="`${p.id}-${view.revision}`" :session="session" :product-id="Number(p.id)" :revision="Number(view.revision)" :disabled="busy || dirty" @ready="priceReady[p.id] = $event" @changed="reload" />
        <div class="measurements">
          <label>Обмір роботи без полів паспарту: ширина, мм<input v-model="p.widthMm" type="number" min="0.001" max="999999" step="0.001" :disabled="busy || !productEditable(p, view.canEdit) || othersDirty(p)"></label>
          <label>Висота роботи без полів паспарту, мм<input v-model="p.heightMm" type="number" min="0.001" max="999999" step="0.001" :disabled="busy || !productEditable(p, view.canEdit) || othersDirty(p)"></label>
        </div>
        <p>Розміри — результат обміру роботи клієнта. Кількість нижче — загальна фактична витрата на позицію, включно з усіма екземплярами та шарами. Натисніть «Розрахувати за обміром», щоб заповнити кількість і розміри позицій, потім уточніть фактичну витрату.</p>
        <button v-if="productEditable(p, view.canEdit)" type="button" :disabled="busy || othersDirty(p)" @click="calculate(p)">Розрахувати за обміром</button>
        <MeasurementResult :result="measurements[p.id]" :stale="measurementStale(measurements[p.id], p)" />
        <button v-if="productEditable(p, view.canEdit) && measurements[p.id]" type="button" :disabled="busy || othersDirty(p)" @click="delete measurements[p.id]">Продовжити з ручною витратою</button>
        <button v-if="productEditable(p, view.canEdit)" type="button" :disabled="busy || othersDirty(p)" @click="fill(p)">Розміри підтверджено — заповнити за планом</button>
        <h4 class="consumption-title">Матеріали та роботи · план / факт</h4><p class="difference-help">Відхилення = факт мінус план. Порожній факт не означає нуль. Підсвічено позиції зі зміненою витратою.</p>
        <div class="table-wrap"><table><thead><tr><th>Матеріал / робота</th><th>План</th><th>Факт</th><th>Відхилення</th><th>Ширина, мм</th><th>Висота, мм</th><th>Ціна / од.</th><th>Збережена сума</th></tr></thead><tbody>
          <tr v-for="line in p.lines" :key="line.itemNo" :class="{ 'quantity-changed': consumptionDifference(line)?.value }"><td data-label="Матеріал / робота">{{ line.description }}<small>{{ line.material ? 'Матеріал' : 'Робота' }} · {{ units[line.unit] || line.unit }}</small></td><td data-label="План">{{ line.planned ?? '—' }}</td>
            <td data-label="Факт"><input v-model="line.actual" type="number" min="0" :step="line.unit === 'PIECE' ? 1 : 0.000001" :aria-label="`Факт: ${line.description}`" :disabled="busy || !productEditable(p, view.canEdit) || othersDirty(p)"></td>
            <td data-label="Відхилення">{{ consumptionDifference(line)?.text ?? '—' }}</td><td data-label="Ширина, мм"><input v-model="line.widthMm" type="number" min="0.001" step="0.001" :aria-label="`Ширина: ${line.description}`" :disabled="busy || !productEditable(p, view.canEdit) || othersDirty(p)"></td>
            <td data-label="Висота, мм"><input v-model="line.heightMm" type="number" min="0.001" step="0.001" :aria-label="`Висота: ${line.description}`" :disabled="busy || !productEditable(p, view.canEdit) || othersDirty(p)"></td>
            <td data-label="Ціна / од.">{{ money(line.price) }}</td><td data-label="Збережена сума">{{ money(line.amount) }}</td></tr>
        </tbody></table></div>
        <details v-if="!p.rework?.active && p.rework?.reservations?.length"><summary>Потреба й резерв після останнього збереження</summary><p v-for="m in p.rework.reservations" :key="m.partNo">{{ m.description }}: потрібно {{ m.demand }}, зарезервовано {{ m.reserved }}, нестача {{ m.shortage }} {{ units[m.unit] }}<span v-if="!m.stockKnown"> · залишок складу невідомий</span>.</p></details>
        <label class="note">Примітка до обміру / причина коригування<textarea v-model="p.note" rows="2" maxlength="2000" :disabled="busy || !productEditable(p, view.canEdit) || othersDirty(p)"></textarea></label>
        <div v-if="view.canEdit" class="actions">
          <button v-for="[state, label] in productActions(p)" :key="state" type="button" :disabled="busy || dirty || (state === 'IN_PROGRESS' && priceReady[p.id] !== true)" @click="transition(p, state)">{{ label }}</button>
          <button v-if="productEditable(p, view.canEdit)" type="button" :disabled="busy || !changed(p) || othersDirty(p)" @click="save(p)">Зберегти обмір і витрати</button>
          <button v-if="p.state === 'IN_PROGRESS' && !p.confirmed && !p.rework?.active" type="button" :disabled="busy || dirty || !p.widthMm || !p.heightMm || p.lines.some(l => l.actual === '')" @click="finish(p)">Завершити виріб і підтвердити витрати</button>
        </div>
        <p v-if="p.confirmed"><strong>Підтверджена вартість: {{ money(p.total) }} грн.</strong> Виробничі дані зафіксовано.</p>
        <ProductConsumptionCost v-if="session.roles?.includes('ROLE_ADMIN')" :key="`cost-${p.id}-${p.revision}`" :session="session" :product-id="Number(p.id)" />
        <ProductTracking v-if="p.confirmed || p.rework?.active" :key="`${p.id}-${p.revision}`" :session="session" :product-id="p.id" :disabled="busy || dirty" @transferred="reload" />
        <ProductRework :session="session" :order-no="orderNo" :revision="view.revision" :product="p" :can-edit="view.canEdit" :disabled="busy || othersDirty(p) || changed(p)" @updated="accept" @dirty="reworkDirty[p.id] = $event" @busy="childBusy[p.id] = $event" />
        <details><summary>Історія дій ({{ p.events.length }})</summary>
          <p v-if="!p.events.length">Дій у новій майстерні ще немає.</p>
          <ol><li v-for="event in p.events" :key="event.revision"><strong>{{ actions[event.action] || event.action }}</strong> · {{ event.actor }} · {{ date(event.at) }}<p>{{ event.note }}</p>
            <details v-if="event.snapshot?.lines?.length"><summary>План і збережений обмір на момент події</summary>
              <p v-for="(size, si) in branchDimensions(event.snapshot.configuration)" :key="si">Від філії<span v-if="branchDimensions(event.snapshot.configuration).length > 1"> ({{ size.label }})</span>: {{ size.widthMm ?? '—' }} × {{ size.heightMm ?? '—' }} мм · Кількість: {{ size.quantity ?? 'не вказана' }}</p>
              <p v-if="event.snapshot.widthMm != null && event.snapshot.heightMm != null">Обмір майстра: {{ event.snapshot.widthMm }} × {{ event.snapshot.heightMm }} мм</p><p v-else>Обмір майстра на момент цієї події ще не збережений.</p>
              <ul><li v-for="line in event.snapshot.lines" :key="line.itemNo"><strong>{{ line.description }}</strong>: план — {{ line.planned ?? 'не вказано' }} {{ units[line.unit] || line.unit }}; {{ historyActualLabel(event.action) }} — <template v-if="line.actual != null">{{ line.actual }} {{ units[line.unit] || line.unit }}</template><template v-else>ще не внесена</template>.</li></ul>
              <p v-if="event.action === 'COMPLETE'">Матеріали списано при підтвердженні завершення.</p>
              <p v-else-if="!event.action.startsWith('REWORK_')">Збереження обміру та приймання самі по собі не списують матеріали зі складу.</p>
            </details>
            <details v-if="event.snapshot?.additionalLines?.length"><summary>Додаткові витрати на цей момент</summary><ul><li v-for="(line, li) in event.snapshot.additionalLines" :key="li">{{ line.description }}: {{ line.quantity }} {{ units[line.unit] || line.unit }}</li></ul></details>
          </li></ol>
        </details>
      </article>
    </template>
  </section>
</template>
<style scoped>
.branch-dimensions{background:#eef5fa;border:1px solid #cbdde9;border-radius:8px;padding:12px;margin:12px 0}.branch-dimensions p{margin:6px 0}
.product-workshop{font-size:13px}.product-workshop header,.actions{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}.product{border:1px solid #dfe5eb;border-radius:10px;padding:16px;margin:18px 0}.product h4{margin:0}.product p{line-height:1.6;color:#526278}.measurements{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0}label{display:grid;gap:6px}.note textarea{width:100%;box-sizing:border-box;resize:vertical}input,textarea,button{font:inherit;padding:8px;border:1px solid #cbd5df;border-radius:6px}input{width:105px}button{background:#f5f7fa;cursor:pointer}button:disabled,input:disabled{opacity:.6;cursor:default}.actions{justify-content:flex-start;margin:14px 0}.table-wrap{overflow:auto;margin:14px 0}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px;border-bottom:1px solid #e2e8ee}small{display:block;color:#69798a}details{margin:12px 0}summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:200px;overflow:auto}[role=alert]{color:#a32929}[role=status]{color:#22663b}.notice{color:#97601c}li{margin-bottom:10px}input:focus-visible,button:focus-visible,textarea:focus-visible{outline:2px solid #cf943f;outline-offset:2px}

.document-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0}.document-actions button{min-height:44px;background:#185c63;color:white}.document-actions small{flex-basis:100%}.consumption-title{margin-top:20px!important}.quantity-changed{background:#fff5df}.difference-help{font-size:12px}.table-wrap input{box-sizing:border-box;max-width:100%}
@media(max-width:650px){.product{padding:10px}.product-workshop button{min-height:44px}.measurements{display:grid;grid-template-columns:1fr;width:100%}.measurements input{width:100%;box-sizing:border-box}.table-wrap{overflow:visible}.table-wrap table,.table-wrap tbody{display:block}.table-wrap thead{display:none}.table-wrap tr{display:grid;grid-template-columns:1fr 1fr;gap:8px;border:1px solid #d8e2e8;border-radius:8px;padding:10px;margin-bottom:10px}.table-wrap td{display:block;padding:0;border:0;min-width:0}.table-wrap td:first-child{grid-column:1/-1;font-weight:600}.table-wrap td::before{content:attr(data-label);display:block;font-size:11px;color:#526571;font-weight:400;margin-bottom:4px}.table-wrap td:first-child::before{display:none}.table-wrap input{width:100%;min-height:44px;font-size:16px}.document-actions button{flex:1 1 180px}}
</style>
