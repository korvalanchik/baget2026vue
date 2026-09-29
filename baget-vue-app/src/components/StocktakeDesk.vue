<script setup>
import { computed, onMounted, ref } from 'vue'
import { warehouse } from '../services/warehouse.js'
import { localDate, stockUnits } from '../calculation/procurement.js'
import { stocktakeStates, countPayload, stocktakeDraft, draftFingerprint, reservationReductions, printStocktake } from '../calculation/stocktake.js'
const props = defineProps({ session: { type: Object, required: true } })
const busy = ref(false), error = ref(''), message = ref(''), orders = ref([]), page = ref(0), materials = ref([]), query = ref(''), materialPage = ref(0)
const selected = ref([]), createNote = ref(''), createDate = ref(localDate()), doc = ref(null), draft = ref(null), baseline = ref(''), review = ref(null), approval = ref(false)
let creationRetry = null, postRetry = null
const dirty = computed(() => draft.value && draftFingerprint(draft.value) !== baseline.value)
const reductions = computed(() => reservationReductions(review.value))
const api = (path = '', body) => warehouse(props.session.token, `/stocktakes${path}`, body)
const fmt = value => value == null ? 'Невідомо' : Number(value).toLocaleString('uk-UA', { maximumFractionDigits: 6 })
function eventNote(event) {
  try { const s = typeof event.snapshot === 'string' ? JSON.parse(event.snapshot) : event.snapshot; return s?.reason || s?.request?.note || s?.note || '' } catch { return '' }
}
async function run(fn) { if (busy.value) return; busy.value = true; error.value = ''; message.value = ''; try { await fn() } catch (e) { error.value = e.message } finally { busy.value = false } }
async function list() { orders.value = await api(`?page=${page.value}`) }
async function search() { materials.value = await warehouse(props.session.token, `/materials?q=${encodeURIComponent(query.value)}&page=${materialPage.value}`) }
function find(reset = true) { if (reset) materialPage.value = 0; return run(search) }
function materialTurn(n) { materialPage.value += n; find(false) }
function turn(n) { page.value += n; return run(list) }
function setDoc(data) { doc.value = data; draft.value = stocktakeDraft(data); baseline.value = draftFingerprint(draft.value); review.value = null; approval.value = false; postRetry = null }
function open(id) { if (dirty.value && !window.confirm('Відкинути незбережений підрахунок?')) return; return run(async () => setDoc(await api(`/${id}`))) }
function add(m) {
  error.value = ''
  if (!stockUnits[m.unit]) { error.value = 'Спочатку налаштуйте складську одиницю матеріалу.'; return }
  if (doc.value?.status === 'DRAFT') {
    if (draft.value.lines.some(l => l.partNo === m.partNo)) return
    if (draft.value.lines.length >= 200) { error.value = 'Не більше 200 позицій в одному акті.'; return }
    draft.value.lines.push({ partNo: m.partNo, description: m.description, unit: m.unit, counted: '', baselineStock: m.onHand, note: '', new: true })
  } else {
    if (selected.value.some(l => l.partNo === m.partNo)) return
    if (selected.value.length >= 200) { error.value = 'Не більше 200 позицій в одному акті.'; return }
    selected.value.push(m)
  }
}
function newDocument() {
  if (dirty.value && !window.confirm('Відкинути незбережений підрахунок?')) return
  doc.value = null; draft.value = null; review.value = null; approval.value = false
}
function create() { return run(async () => {
  if (!createNote.value.trim() || !createDate.value || !selected.value.length) throw new Error('Оберіть матеріали, дату та підставу інвентаризації.')
  const r = { date: createDate.value, note: createNote.value.trim(), parts: selected.value.map(m => m.partNo).sort((a, b) => a - b) }, signature = JSON.stringify(r)
  if (!creationRetry || creationRetry.signature !== signature) creationRetry = { signature, key: crypto.randomUUID() }
  setDoc(await api('', { ...r, requestKey: creationRetry.key })); creationRetry = null; selected.value = []; await list(); message.value = 'Чернетку створено. Тепер внесіть фактичні залишки.'
}) }
function save() { return run(async () => {
  const payload = countPayload(doc.value, draft.value)
  setDoc(await api(`/${doc.value.id}/save`, payload)); await list(); message.value = 'Підрахунок збережено. Склад ще не змінено.'
}) }
function check() { return run(async () => {
  if (dirty.value) throw new Error('Спочатку збережіть підрахунок.')
  review.value = await api(`/${doc.value.id}/review`, { expectedRevision: doc.value.revision }); approval.value = false; postRetry = null
}) }
function recount(line) { return run(async () => {
  if (dirty.value) throw new Error('Спочатку збережіть або відкиньте незбережені зміни.')
  const reason = window.prompt('Причина повторного підрахунку:')
  if (!reason?.trim()) return
  if (!window.confirm('Зафіксувати поточний обліковий залишок і очистити підраховану кількість цієї позиції? Після цього потрібно порахувати її заново.')) return
  setDoc(await api(`/${doc.value.id}/recount`, { expectedRevision: doc.value.revision, reason: reason.trim(), parts: [line.partNo] })); await list()
}) }
function post() { return run(async () => {
  if (dirty.value || !review.value?.canPost) throw new Error('Збережіть і перевірте акт перед проведенням.')
  if (review.value.requiresApproval && !approval.value) throw new Error('Погодьте показане зменшення резервів.')
  const r = { expectedRevision: doc.value.revision, reviewToken: review.value.token, acceptReservationReduction: approval.value }, signature = JSON.stringify([doc.value.id, r])
  if (!postRetry || postRetry.signature !== signature) postRetry = { signature, key: crypto.randomUUID() }
  if (!window.confirm('Провести акт? Фактичні залишки й погоджені резерви зміняться. Проведений акт не можна редагувати.')) return
  setDoc(await api(`/${doc.value.id}/post`, { ...r, requestKey: postRetry.key })); await list(); message.value = 'Акт проведено. Залишки й резерви оновлено.'
}) }
function cancel() { return run(async () => {
  if (dirty.value) throw new Error('Спочатку збережіть або відкиньте незбережені зміни.')
  const reason = window.prompt('Причина скасування чернетки:'); if (!reason?.trim()) return
  setDoc(await api(`/${doc.value.id}/cancel`, { expectedRevision: doc.value.revision, reason: reason.trim() })); await list()
}) }
function print() { return run(async () => printStocktake(doc.value, stockUnits)) }
onMounted(() => run(async () => { await list(); await search() }))
defineExpose({ open })
</script>
<template>
  <section class="stocktake">
    <h2>Інвентаризація матеріалів</h2><p>Порахуйте повний фактичний залишок кожного матеріалу. Порожнє поле — ще не пораховано, нуль — матеріалу немає. Чернетка не змінює склад.</p>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
    <div class="tools"><button :disabled="busy" @click="newDocument">Новий акт</button><button :disabled="busy" @click="run(list)">Оновити журнал</button></div>
    <div class="journal"><button v-for="o in orders" :key="o.id" :disabled="busy" @click="open(o.id)">№ {{ o.id }} · {{ o.date }} · {{ stocktakeStates[o.status] }} · {{ o.note }}</button></div>
    <div class="tools"><button :disabled="busy || page === 0" @click="turn(-1)">Назад</button><span>Сторінка {{ page + 1 }}</span><button :disabled="busy || orders.length < 50" @click="turn(1)">Далі</button></div>
    <details v-if="!doc || doc.status === 'DRAFT'" open><summary>Додати матеріали до {{ doc ? 'чернетки' : 'нового акта' }}</summary>
      <div class="tools"><input v-model="query" :disabled="busy" placeholder="Артикул або назва" @keydown.enter="find()"><button :disabled="busy" @click="find()">Знайти</button></div>
      <div class="catalog"><button v-for="m in materials" :key="m.partNo" :disabled="busy || !stockUnits[m.unit]" @click="add(m)">{{ m.description }} · {{ stockUnits[m.unit] || 'Одиницю не задано' }} · на складі {{ fmt(m.onHand) }} · Додати</button></div>
      <div class="tools"><button :disabled="busy || materialPage === 0" @click="materialTurn(-1)">Попередні матеріали</button><button :disabled="busy || materials.length < 100" @click="materialTurn(1)">Наступні матеріали</button></div>
    </details>
    <article v-if="!doc"><h3>Новий акт</h3><label>Дата<input v-model="createDate" :disabled="busy" type="date"></label><label>Підстава<textarea v-model="createNote" :disabled="busy" maxlength="1000" placeholder="Початкові залишки / планова інвентаризація"></textarea></label><p v-for="(m, i) in selected" :key="m.partNo">{{ m.description }} <button :disabled="busy" @click="selected.splice(i, 1)">Прибрати</button></p><button :disabled="busy || !selected.length" @click="create">Створити чернетку й почати підрахунок</button></article>
    <article v-else>
      <h3>Акт № {{ doc.id }} · {{ stocktakeStates[doc.status] }}</h3><p>Склав: {{ doc.actor }} · {{ doc.createdAt }}<span v-if="doc.postedAt"> · Провів: {{ doc.postedBy }} · {{ doc.postedAt }}</span></p>
      <template v-if="doc.status === 'DRAFT'">
        <p v-if="dirty" class="warning">Є незбережені зміни. Попередня перевірка не придатна для проведення.</p>
        <div class="tools"><label>Дата<input v-model="draft.date" :disabled="busy" type="date"></label><button :disabled="busy" @click="open(doc.id)">Перечитати документ</button></div><label>Підстава<textarea v-model="draft.note" :disabled="busy" maxlength="1000"></textarea></label>
        <div v-for="(l, i) in draft.lines" :key="l.partNo" class="count-line"><strong>{{ l.description }}</strong><p>Обліковий залишок на початок: {{ fmt(l.baselineStock) }} {{ stockUnits[l.unit] }}</p><p v-if="l.new" class="warning">Збережіть додавання матеріалу, потім починайте його підрахунок.</p><div class="tools"><label>Фактичний залишок, {{ stockUnits[l.unit] }}<input v-model="l.counted" :disabled="busy || l.new" type="number" min="0" :step="l.unit === 'PIECE' ? 1 : 0.000001"></label><button :disabled="busy" @click="draft.lines.splice(i, 1)">Прибрати з акта</button></div><label>Причина різниці / початкового залишку<textarea v-model="l.note" :disabled="busy" maxlength="1000"></textarea></label></div>
        <div class="tools"><button :disabled="busy || !dirty" @click="save">Зберегти підрахунок</button><button :disabled="busy || dirty" @click="check">Перевірити перед проведенням</button><button :disabled="busy || dirty" @click="cancel">Скасувати чернетку</button></div>
        <section v-if="review && !dirty" class="review"><h4>Перевірка залишків та резервів</h4>
          <p>Старші резерви зберігаються першими. Вільний залишок розподіляється на непокриту потребу. Замовлення не скасовуються.</p>
          <div v-for="l in review.lines" :key="l.partNo" class="count-line"><strong>{{ l.description }}</strong><p>На початок {{ fmt(l.baseline.stock) }} · Зараз {{ fmt(l.current.stock) }} · Пораховано {{ fmt(l.counted) }} {{ stockUnits[l.unit] }} · Різниця {{ l.difference == null ? (l.counted == null ? 'ще не пораховано' : 'початковий залишок') : fmt(l.difference) }}</p><p v-if="l.changed" class="warning">Після початку підрахунку змінився залишок, одиниця, версія матеріалу або був складський рух.</p><p v-if="!l.configured" class="warning">Відновіть складські налаштування матеріалу.</p><p v-if="l.reasonMissing" class="warning">Вкажіть причину розбіжності або введення початкового залишку та збережіть акт.</p><button v-if="l.changed || l.counted != null" :disabled="busy" @click="recount(l)">Почати повторний підрахунок позиції</button><ul><li v-for="r in l.reservations" :key="r.id">Замовлення № {{ r.orderNo }}, виріб {{ r.productId }}: резерв {{ fmt(r.before) }} → {{ fmt(r.after) }}, нестача {{ fmt(r.shortageBefore) }} → {{ fmt(r.shortageAfter) }} {{ stockUnits[l.unit] }}</li></ul></div>
          <div v-if="review.requiresApproval" class="warning"><h4>Резерв зменшиться</h4><p v-for="(r, i) in reductions" :key="i">Замовлення № {{ r.orderNo }}, виріб {{ r.productId }} · {{ r.description }}: {{ fmt(r.before) }} → {{ fmt(r.after) }} {{ stockUnits[r.unit] }}</p><label><input v-model="approval" :disabled="busy" type="checkbox"> Погоджую зменшення резервів для перелічених замовлень.</label></div>
          <p v-if="!review.canPost" class="warning">Проведення заблоковано. Усуньте зазначені причини й повторіть перевірку.</p><button :disabled="busy || !review.canPost || (review.requiresApproval && !approval)" @click="post">Провести акт</button>
        </section>
      </template>
      <template v-else><p>{{ doc.note }}</p><button v-if="doc.status === 'POSTED'" :disabled="busy" @click="print">Друкувати акт / зберегти PDF</button><p v-if="doc.status === 'POSTED'">Акт зафіксовано. Для виправлення створіть новий акт із посиланням на цей номер у підставі.</p><div v-for="l in (doc.postedSnapshot?.lines || doc.lines)" :key="l.partNo" class="count-line"><strong>{{ l.description }}</strong><p>Було {{ fmt(l.current ? l.current.stock : l.baselineStock) }} · Пораховано {{ fmt(l.counted) }} {{ stockUnits[l.unit] }}<span v-if="doc.postedSnapshot"> · Різниця {{ l.difference == null ? 'початковий залишок' : fmt(l.difference) }}</span></p><p>{{ l.note }}</p><p v-for="r in l.reservations || []" :key="r.id">Замовлення № {{ r.orderNo }}, виріб {{ r.productId }}: резерв {{ fmt(r.before) }} → {{ fmt(r.after) }}; нестача після проведення {{ fmt(r.shortageAfter) }}.</p></div></template>
      <details><summary>Історія документа (останні 200 подій)</summary><p v-for="(e, i) in doc.events" :key="i">{{ e.createdAt }} · {{ e.actor }} · {{ ({ CREATE: 'Створено', SAVE: 'Збережено підрахунок', RECOUNT: 'Повторний підрахунок', CANCEL: 'Скасовано', POST: 'Проведено' })[e.action] }} · Ревізія {{ e.revision }}<span v-if="eventNote(e)"> · {{ eventNote(e) }}</span></p></details>
    </article>
  </section>
</template>
<style scoped>
.stocktake{padding:0 24px 24px}.tools{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin:14px 0}.tools label,article>label,.count-line>label{display:grid;gap:6px;margin:8px 0}input,textarea,button{font:inherit;padding:9px;border:1px solid #cbd5df;border-radius:6px;max-width:100%;box-sizing:border-box}button{cursor:pointer}button:disabled{opacity:.5}.journal,.catalog{display:grid;gap:8px}.catalog{grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));max-height:300px;overflow:auto}.journal button,.catalog button{text-align:left}textarea{width:100%;max-width:650px;min-height:65px}article{border:1px solid #ccd5dd;border-radius:9px;padding:16px;margin:16px 0}.count-line{border-bottom:1px solid #ddd;padding:12px 0}.review{padding:14px;background:#f2f6fa}p{line-height:1.5}.warning,[role=alert]{color:#9b3914}[role=status]{color:#276039}details{margin:16px 0}summary{cursor:pointer}
</style>
