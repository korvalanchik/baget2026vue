<script setup>
import { computed, ref, watch } from 'vue'
import MeasurementResult from './MeasurementResult.vue'
import { measurementRequest, measurementStale, applyMeasurement } from '../calculation/measurement.js'
import { productWorkshop } from '../services/production.js'
import { reworkModes, reworkDraft, reworkKey, reworkPayload, canOpenRework } from '../calculation/rework.js'
const props = defineProps({ session: { type: Object, required: true }, orderNo: { type: Number, required: true }, revision: { type: Number, required: true }, product: { type: Object, required: true }, canEdit: Boolean, disabled: Boolean })
const emit = defineEmits(['updated', 'busy', 'dirty'])
const draft = ref(reworkDraft(null)), baseline = ref(''), busy = ref(false), error = ref(''), reason = ref(''), mode = ref('WORKSHOP'), query = ref(''), results = ref([])
const measurement = ref(null), calculatedSelection = ref('')
const selectionKey = () => JSON.stringify(draft.value.lines.map(l => [l.sourceItemNo ?? null, l.partNo, l.basis ?? 'OUTER', Number(l.unitsPerProduct ?? 1)]))
const staleCalculation = computed(() => measurementStale(measurement.value, draft.value) || (!!measurement.value && selectionKey() !== calculatedSelection.value))
const active = computed(() => props.product.rework?.active)
const dirty = computed(() => !!active.value && reworkKey(draft.value) !== baseline.value)
const money = n => n == null ? 'після збереження' : Number(n).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const units = { METER: 'м', SQUARE_METER: 'м²', PIECE: 'шт' }
const extraCharge = computed(() => active.value?.additionalCharge ?? 0)
watch(() => props.product, () => { draft.value = reworkDraft(active.value); baseline.value = reworkKey(draft.value); results.value = []; measurement.value = null }, { immediate: true })
watch(dirty, v => emit('dirty', v), { flush: 'sync' })
watch(busy, v => emit('busy', v), { flush: 'sync' })
async function run(fn) { if (busy.value || props.disabled) return; busy.value = true; error.value = ''; try { await fn() } catch (e) { error.value = e.message } finally { busy.value = false } }
function open() { return run(async () => {
  if (!reason.value.trim()) throw new Error('Вкажіть причину доопрацювання.')
  if (!window.confirm(`${reworkModes[mode.value]}. Відкрити нову ревізію? Попередні витрати збережуться; після завершення потрібне повторне приймання на склад.`)) return
  const data = await productWorkshop(props.session.token, props.orderNo, `/${props.product.id}/rework`, 'POST', { expectedRevision: props.revision, chargeMode: mode.value, reason: reason.value.trim() })
  emit('updated', data); reason.value = ''
}) }
function save() { return run(async () => {
  if (staleCalculation.value) throw new Error('Обмір або параметри позицій змінено. Повторіть розрахунок.')
  emit('updated', await productWorkshop(props.session.token, props.orderNo, `/${props.product.id}/rework`, 'PUT', reworkPayload(props.revision, draft.value)))
}) }
function calculate() { return run(async () => {
  if (!window.confirm('Заповнити витрату та розміри тільки обраних додаткових позицій? Поточні кількості буде замінено розрахунковими.')) return
  const result = await productWorkshop(props.session.token, props.orderNo, `/${props.product.id}/calculate`, 'POST', measurementRequest(props.revision, draft.value, draft.value.lines))
  measurement.value = result; calculatedSelection.value = selectionKey()
  draft.value.lines = applyMeasurement(draft.value.lines, result, true)
}) }
function complete() { return run(async () => {
  if (dirty.value) throw new Error('Спочатку збережіть додаткові витрати.')
  if (!window.confirm(`Завершити доопрацювання? Будуть списані тільки додаткові матеріали. Доплата клієнта: ${money(extraCharge.value)} грн.`)) return
  emit('updated', await productWorkshop(props.session.token, props.orderNo, `/${props.product.id}/rework/complete`, 'POST', { expectedRevision: props.revision }))
}) }
function add(part, sourceItemNo = null) {
  if (draft.value.lines.some(l => sourceItemNo ? l.sourceItemNo === sourceItemNo : !l.sourceItemNo && l.partNo === part.partNo)) { error.value = 'Цю позицію вже додано.'; return }
  draft.value.lines.push({ partNo: part.partNo, sourceItemNo, description: part.description, unit: part.unit, price: part.price ?? null, quantity: '', widthMm: '', heightMm: '', basis: 'OUTER', unitsPerProduct: 1 })
}
function search() { return run(async () => { results.value = await productWorkshop(props.session.token, props.orderNo, `/rework-catalog?q=${encodeURIComponent(query.value)}`) }) }
</script>
<template>
 <section v-if="active || product.confirmed || product.rework?.history?.length" class="rework">
  <h4>Доопрацювання до виставлення рахунку</h4>
  <p v-if="error" role="alert">{{ error }}</p>
  <template v-if="!active && product.confirmed">
   <p v-if="product.rework?.invoiced">За виробом уже оформлено рахунок. Повернення потребує фінансового коригування, яке буде додано окремим етапом.</p>
   <template v-else-if="canEdit">
    <p v-if="!canOpenRework(product)">Спочатку передайте виріб до майстерні через QR-картку та підтвердьте його приймання майстром.</p>
    <fieldset v-else :disabled="busy || disabled"><legend>Відкрити нову ревізію</legend>
     <label>Підстава<select v-model="mode"><option v-for="(label, value) in reworkModes" :key="value" :value="value">{{ label }}</option></select></label>
     <label>Причина<textarea v-model="reason" maxlength="2000"></textarea></label><button type="button" @click="open">Відкрити доопрацювання</button>
    </fieldset>
   </template>
  </template>
  <template v-if="active">
   <p><strong>{{ reworkModes[active.chargeMode] }}</strong> · {{ active.actor }} · {{ active.reason }}</p>
   <p>Попередня підтверджена вартість: {{ money(active.baselineTotal) }} грн. Уже списані матеріали та роботи наведено вище. Тут вводьте лише додаткові витрати на всі екземпляри виробу.</p>
   <fieldset :disabled="!canEdit || busy || disabled">
    <div class="row"><label>Новий обмір роботи без полів: ширина, мм<input v-model="draft.widthMm" type="number" min="0.001" step="0.001"></label><label>Висота, мм<input v-model="draft.heightMm" type="number" min="0.001" step="0.001"></label></div>
    <button v-if="canEdit" type="button" @click="calculate">Розрахувати додаткові витрати за обміром</button>
    <MeasurementResult :result="measurement" :stale="staleCalculation" />
    <button v-if="canEdit && measurement" type="button" @click="measurement = null">Продовжити з ручною витратою</button>
    <details v-if="canEdit"><summary>Додати позицію з попереднього складу</summary><div class="choices"><button v-for="l in product.lines" :key="l.itemNo" type="button" @click="add(l, l.itemNo)">{{ l.description }} · {{ money(l.price) }} грн/{{ units[l.unit] }}</button></div></details>
    <div v-if="canEdit" class="row"><label>Інший матеріал або робота<input v-model="query" placeholder="Назва чи артикул, від 2 символів" @keydown.enter.prevent="search"></label><button type="button" @click="search">Знайти</button></div>
    <div class="choices"><button v-for="p in results" :key="p.partNo" type="button" @click="add(p)">{{ p.description }} · {{ units[p.unit] }}</button></div>
    <p>Для початкової позиції зберігається її ціна. Для нового артикулу сервер визначає ціну за вашим рівнем каталогу при першому збереженні. Перед завершенням перевірте збережені суми.</p>
    <div class="extras"><article v-for="(l, i) in draft.lines" :key="`${l.sourceItemNo || 'new'}-${l.partNo}`"><strong>{{ l.description }}</strong><span> {{ money(l.price) }} грн/{{ units[l.unit] }}</span><div class="row">
     <template v-if="!l.sourceItemNo || product.lines.find(x => x.itemNo === l.sourceItemNo)?.role?.startsWith('REWORK_')">
      <label>Розмір для розрахунку<select v-model="l.basis"><option value="OUTER">З полями паспарту</option><option value="ARTWORK">Обмір роботи без полів</option></select></label>
      <label>Шарів / штук / повторів на екземпляр<input v-model="l.unitsPerProduct" type="number" min="1" max="10000" step="1"></label>
     </template>
     <label>Додатково, {{ units[l.unit] }}<input v-model="l.quantity" type="number" min="0.000001" :step="l.unit === 'PIECE' ? 1 : 0.000001"></label>
     <label>Ширина, мм<input v-model="l.widthMm" type="number" min="0.001" step="0.001"></label><label>Висота, мм<input v-model="l.heightMm" type="number" min="0.001" step="0.001"></label>
     <button v-if="canEdit" type="button" @click="draft.lines.splice(i, 1)">Прибрати</button></div></article></div>
    <p v-if="!draft.lines.length">Додаткових витрат немає. Можна зберегти лише новий обмір та опис виконаного.</p>
    <label>Результат обміру та опис змін<textarea v-model="draft.note" maxlength="2000"></textarea></label>
    <p>{{ active.chargeMode === 'WORKSHOP' ? 'Вартість для клієнта не збільшується.' : `Додаткова вартість за збереженими даними: ${money(extraCharge)} грн.` }}</p>
    <p v-if="active.chargeMode === 'WORKSHOP'">Додаткові матеріали списуються зі складу; їх витрата та собівартість зберігаються за майстернею.</p>
    <div v-if="canEdit" class="row"><button type="button" @click="save">Зберегти обмір і додаткові витрати</button><button type="button" :disabled="dirty || !active.saved" @click="complete">Завершити доопрацювання</button></div>
   </fieldset>
   <p v-if="dirty" role="status">Є незбережені зміни доопрацювання.</p>
   <details v-if="product.rework?.reservations?.length" open><summary>Резерв додаткових матеріалів</summary><p v-for="m in product.rework.reservations" :key="m.partNo">{{ m.description }}: потрібно {{ m.demand }}, зарезервовано {{ m.reserved }}, нестача {{ m.shortage }} {{ units[m.unit] }}.</p></details>
   <p>Повернення виробу не повертає матеріали на склад. Демонтовані матеріали та брак не віднімайте з додаткової витрати; їх окреме оформлення не входить у цей етап.</p>
  </template>
  <details v-if="product.rework?.history?.length"><summary>Ревізії доопрацювання ({{ product.rework.history.length }})</summary>
   <article v-for="r in product.rework.history" :key="r.id"><strong>{{ r.state === 'OPEN' ? 'Відкрито' : 'Завершено' }} · {{ reworkModes[r.chargeMode] }}</strong><p>{{ r.createdAt }} · {{ r.actor }} · {{ r.reason }}</p><p>До: {{ money(r.baselineTotal) }} грн<span v-if="r.finalConfirmation"> → після: {{ money(r.finalConfirmation.total) }} грн</span></p><p>{{ r.note }}</p>
    <details><summary>Попередній підтверджений розрахунок</summary><p>{{ r.sourceConfirmation.widthMm }} × {{ r.sourceConfirmation.heightMm }} мм</p><p v-for="l in r.sourceConfirmation.lines" :key="l.itemNo">{{ l.description }}: {{ l.actual }} {{ units[l.unit] }} · {{ money(l.amount) }} грн</p></details>
    <p v-for="l in r.lines" :key="l.lineNo">Додатково: {{ l.description }} · {{ l.quantity }} {{ units[l.unit] }}</p>
   </article>
  </details>
 </section>
</template>
<style scoped>
.rework{border:1px solid #d5a55c;border-radius:8px;padding:14px;margin:14px 0}.row,.choices{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:12px 0}label{display:grid;gap:6px}input,button,select,textarea{font:inherit;padding:8px;border:1px solid #cbd5df;border-radius:6px}input{width:140px}textarea{width:100%;min-height:55px;box-sizing:border-box}fieldset{border:0;padding:0}article{padding:12px 0;border-bottom:1px solid #ddd}button{cursor:pointer}button:disabled{opacity:.5}p{line-height:1.6}[role=alert]{color:#a22}details{margin:12px 0}
</style>
