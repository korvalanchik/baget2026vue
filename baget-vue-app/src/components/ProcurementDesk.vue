<script setup>
import { onMounted, ref, watch } from 'vue'
import { warehouse } from '../services/warehouse.js'
import { supplierStates, stockUnits, stockQuantity, draftPayload, receiptPayload, localDate, supplierCsv } from '../calculation/procurement.js'
const props = defineProps({ session: { type: Object, required: true }, active: { type: Boolean, default: true } })
const rows = ref([]), vendors = ref([]), orders = ref([]), q = ref(''), onlyNeeded = ref(true), page = ref(0), orderPage = ref(0)
const busy = ref(false), error = ref(''), message = ref(''), selected = ref(null), policy = ref(null), document = ref(null)
const draft = ref({ id: null, revision: 0, vendorNo: '', expectedDate: '', note: '', lines: [] })
const receiving = ref({ documentNo: '', receivedDate: localDate(), note: '', quantities: {} })
const closeReason = ref(''), newDate = ref(''), dateReason = ref('')
let createRetry = null, receiptRetry = null
const api = (path, body) => warehouse(props.session.token, `/procurement${path}`, body)
const fmt = v => v == null ? 'Невідомо' : Number(v).toLocaleString('uk-UA', { maximumFractionDigits: 6 })
async function run(fn) { if (busy.value) return; busy.value = true; error.value = ''; message.value = ''; try { await fn() } catch (e) { error.value = e.message } finally { busy.value = false } }
async function loadNeeds() { rows.value = await api(`/needs?q=${encodeURIComponent(q.value)}&page=${page.value}&onlyNeeded=${onlyNeeded.value}`) }
async function loadOrders() { orders.value = await api(`/orders?page=${orderPage.value}`) }
function refresh(reset = false) { if (reset) page.value = 0; return run(loadNeeds) }
function turn(n) { page.value += n; refresh() }
function turnOrders(n) { orderPage.value += n; return run(loadOrders) }
function detail(m) { return run(async () => { selected.value = await api(`/needs/${m.partNo}`); policy.value = { minimum: selected.value.minimum, target: selected.value.target } }) }
function savePolicy() { return run(async () => {
  const m = selected.value
  const minimum = stockQuantity(policy.value.minimum, m.unit, true), target = stockQuantity(policy.value.target, m.unit, true)
  if (target < minimum) throw new Error('Бажаний запас менший за мінімальний.')
  selected.value = await api(`/needs/${m.partNo}/policy`, { expectedRevision: m.policyRevision, minimum, target }); await loadNeeds(); message.value = 'Норми запасу збережено.'
}) }
function add(m) {
  if (draft.value.lines.some(l => l.partNo === m.partNo)) { error.value = 'Матеріал уже є у чернетці.'; return }
  if (draft.value.lines.length >= 200) { error.value = 'У документі може бути не більше 200 позицій.'; return }
  if (!draft.value.vendorNo && m.vendorNo) draft.value.vendorNo = m.vendorNo
  draft.value.lines.push({ partNo: m.partNo, description: m.description, unit: m.unit, quantity: Number(m.recommended) > 0 ? m.recommended : '', vendorNo: m.vendorNo })
}
function resetDraft() {
  if (draft.value.lines.length && !window.confirm('Очистити редактор чернетки? Збережений документ залишиться в журналі.')) return
  draft.value = { id: null, revision: 0, vendorNo: '', expectedDate: '', note: '', lines: [] }; createRetry = null
}
function editDocument() {
  if (draft.value.lines.length && !window.confirm('Замінити поточну чернетку даними документа?')) return
  const o = document.value
  draft.value = { id: o.id, revision: o.revision, vendorNo: o.vendorNo, expectedDate: o.expectedDate || '', note: o.note, lines: o.lines.map(l => ({ ...l, quantity: l.ordered })) }; createRetry = null
}
function saveDraft() { return run(async () => {
  const payload = draftPayload(draft.value, 'pending')
  const signature = JSON.stringify(payload)
  if (!createRetry || createRetry.signature !== signature) createRetry = { signature, key: crypto.randomUUID() }
  payload.requestKey = createRetry.key
  const result = draft.value.id ? await api(`/orders/${draft.value.id}/edit`, { expectedRevision: draft.value.revision, draft: payload }) : await api('/orders', payload)
  setDocument(result); draft.value.id = result.id; draft.value.revision = result.revision; createRetry = null
  message.value = 'Чернетку збережено. Для обліку очікуваної поставки підтвердіть замовлення.'; await loadOrders()
}) }
function setDocument(o) { document.value = o; closeReason.value = ''; newDate.value = o.expectedDate || ''; dateReason.value = ''; receiving.value = { documentNo: '', receivedDate: localDate(), note: '', quantities: {} }; receiptRetry = null }
function open(id) { return run(async () => { setDocument(await api(`/orders/${id}`)) }) }
function place() { return run(async () => {
  if (!window.confirm('Підтвердити збережені позиції замовлення? Після цього його кількості будуть враховані як очікувана поставка.')) return
  const o = document.value
  setDocument(await api(`/orders/${o.id}/place`, { expectedRevision: o.revision, note: 'Підтверджено замовлення постачальнику' }))
  if (draft.value.id === o.id) draft.value = { id: null, revision: 0, vendorNo: '', expectedDate: '', note: '', lines: [] }
  await loadNeeds(); await loadOrders(); message.value = 'Замовлення підтверджено. Фізичний склад не змінився.'
}) }
function reschedule() { return run(async () => {
  if (!newDate.value || !dateReason.value.trim()) throw new Error('Вкажіть нову дату та причину перенесення.')
  const o = document.value
  setDocument(await api(`/orders/${o.id}/schedule`, { expectedRevision: o.revision, expectedDate: newDate.value, note: dateReason.value.trim() }))
  await loadNeeds(); await loadOrders(); message.value = 'Очікувану дату поставки оновлено.'
}) }
function downloadOrder() {
  const o = document.value, url = URL.createObjectURL(new Blob([supplierCsv(o)], { type: 'text/csv;charset=utf-8' }))
  const link = window.document.createElement('a'); link.href = url; link.download = `supplier-order-${o.id}.csv`; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
watch(() => props.active, active => { if (active) run(async () => { await loadNeeds(); await loadOrders() }) })
function close() { return run(async () => {
  if (!closeReason.value.trim()) throw new Error('Вкажіть причину закриття залишку або скасування.')
  if (!window.confirm('Закрити непоставлений залишок? Уже отримані матеріали залишаться на складі.')) return
  const o = document.value
  setDocument(await api(`/orders/${o.id}/close`, { expectedRevision: o.revision, note: closeReason.value.trim() }))
  if (draft.value.id === o.id) draft.value = { id: null, revision: 0, vendorNo: '', expectedDate: '', note: '', lines: [] }
  await loadNeeds(); await loadOrders(); message.value = 'Документ закрито. Фізичний склад не змінювався.'
}) }
function fillReceipt() { for (const l of document.value.lines) receiving.value.quantities[l.id] = Number(l.remaining) > 0 ? l.remaining : '' }
function receive() { return run(async () => {
  const payload = receiptPayload(document.value, receiving.value, 'pending'), signature = JSON.stringify([document.value.id, payload])
  if (!receiptRetry || receiptRetry.signature !== signature) receiptRetry = { signature, key: crypto.randomUUID() }
  payload.requestKey = receiptRetry.key
  if (!window.confirm('Провести прихід? Залишки складу збільшаться, а матеріал буде розподілено в резерв.')) return
  const result = await api(`/orders/${document.value.id}/receipts`, payload)
  setDocument(result); await loadNeeds(); await loadOrders(); message.value = 'Прихід проведено. Резерви перераховано.'
}) }
onMounted(() => run(async () => { vendors.value = await api('/vendors'); await loadNeeds(); await loadOrders() }))
</script>
<template>
  <section class="procurement">
    <h2>Потреби та постачання</h2>
    <p>Очікувані поставки допомагають планувати закупівлю. Використати матеріал можна після фактичного приходу.</p>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
    <div class="tools"><input v-model="q" :disabled="busy" placeholder="Артикул або назва" @keydown.enter="refresh(true)"><label><input v-model="onlyNeeded" type="checkbox" :disabled="busy" @change="refresh(true)"> Потребують уваги</label><button :disabled="busy" @click="refresh(true)">Оновити потреби</button></div>
    <p class="hint">Рекомендація враховує всю незакриту потребу виробництва, бажаний запас, фізичний залишок і непоставлену частину підтверджених замовлень. Поповнення запасу пропонується, коли прогнозований вільний залишок нижчий за мінімум. Невідомий залишок потребує інвентаризації.</p>
    <div class="needs">
      <article v-for="m in rows" :key="m.partNo" class="material">
        <button class="title" :disabled="busy" @click="detail(m)">{{ m.description }}</button><span>{{ stockUnits[m.unit] || 'Одиницю не налаштовано' }}</span>
        <dl><div><dt>На складі</dt><dd>{{ fmt(m.onHand) }}</dd></div><div><dt>Резерв / вільно</dt><dd>{{ fmt(m.reserved) }} / {{ fmt(m.free) }}</dd></div><div><dt>Потрібно для робіт</dt><dd>{{ fmt(m.demand) }}</dd></div><div><dt>Нестача зараз</dt><dd>{{ fmt(m.shortage) }}</dd></div><div><dt>Очікуємо</dt><dd>{{ fmt(m.incoming) }}</dd></div><div><dt>Мінімум / бажаний запас</dt><dd>{{ fmt(m.minimum) }} / {{ fmt(m.target) }}</dd></div><div><dt>До закупівлі</dt><dd><strong>{{ fmt(m.recommended) }}</strong></dd></div></dl>
        <p v-if="m.expectedDate">Найближча поставка: {{ m.expectedDate }}</p><p v-if="Number(m.overdue) > 0" class="warning">Прострочена поставка: {{ fmt(m.overdue) }}. Уточніть дату у постачальника перед повторною закупівлею.</p>
        <p v-if="Number(m.legacyOrdered) > 0" class="warning">Старі заявки «Замовлено»: {{ fmt(m.legacyOrdered) }}. Вони не включені в очікувані поставки. Звірте їх перед створенням нового замовлення.</p>
        <button :disabled="busy || !stockUnits[m.unit]" @click="add(m)">Додати до чернетки</button>
      </article>
    </div>
    <p v-if="!rows.length">Матеріалів за цими умовами не знайдено.</p><div class="tools"><button :disabled="busy || page === 0" @click="turn(-1)">Назад</button><span>{{ page + 1 }}</span><button :disabled="busy || rows.length < 100" @click="turn(1)">Далі</button></div>
    <article v-if="selected" class="panel">
      <h3>{{ selected.description }} — норми запасу</h3>
      <div class="tools"><label>Мінімальний вільний запас<input v-model="policy.minimum" :disabled="busy" type="number" min="0" :step="selected.unit === 'PIECE' ? 1 : 0.000001"></label><label>Бажаний вільний запас<input v-model="policy.target" :disabled="busy" type="number" min="0" :step="selected.unit === 'PIECE' ? 1 : 0.000001"></label><button :disabled="busy" @click="savePolicy">Зберегти норми</button><button :disabled="busy" @click="selected = null">Закрити</button></div>
      <p v-for="r in selected.reservations" :key="r.productId">Замовлення № {{ r.orderNo }}, виріб {{ r.productId }}: потрібно {{ fmt(r.demand) }}, резерв {{ fmt(r.reserved) }}.</p>
      <p v-for="d in selected.deliveries" :key="d.id">Поставка № {{ d.id }} · {{ d.vendorName }} · {{ d.expectedDate || 'Без дати' }} · {{ fmt(d.quantity) }} {{ stockUnits[selected.unit] }}</p>
    </article>
    <article class="panel">
      <h3>{{ draft.id ? `Редагування чернетки № ${draft.id}` : 'Нове замовлення постачальнику' }}</h3>
      <div class="tools"><label>Постачальник<select v-model="draft.vendorNo" :disabled="busy"><option value="">Оберіть</option><option v-for="v in vendors" :key="v.id" :value="v.id">{{ v.name || `Постачальник ${v.id}` }}</option></select></label><label>Очікувана дата<input v-model="draft.expectedDate" :disabled="busy" type="date"></label></div>
      <p v-if="!vendors.length">Додайте постачальника у чинному довіднику постачальників.</p>
      <p>Додайте матеріали зі списку потреб вище. Щоб замовити інші позиції, вимкніть «Потребують уваги».</p>
      <div v-for="(l, i) in draft.lines" :key="l.partNo" class="draft-line"><span>{{ l.description }} <small v-if="l.vendorNo && Number(l.vendorNo) !== Number(draft.vendorNo)">У каталозі вказано іншого постачальника</small></span><label>Кількість, {{ stockUnits[l.unit] }}<input v-model="l.quantity" :disabled="busy" type="number" min="0" :step="l.unit === 'PIECE' ? 1 : 0.000001"></label><button :disabled="busy" @click="draft.lines.splice(i, 1)">Прибрати</button></div>
      <label>Примітка<textarea v-model="draft.note" :disabled="busy" maxlength="1000"></textarea></label><div class="tools"><button :disabled="busy || !draft.lines.length" @click="saveDraft">Зберегти чернетку</button><button :disabled="busy" @click="resetDraft">Нова чернетка</button></div>
    </article>
    <h3>Замовлення постачальникам</h3>
    <div class="orders"><button v-for="o in orders" :key="o.id" :disabled="busy" @click="open(o.id)">№ {{ o.id }} · {{ o.vendorName }} · {{ supplierStates[o.status] }} · {{ o.expectedDate || 'Дата не задана' }}</button></div>
    <div class="tools"><button :disabled="busy || orderPage === 0" @click="turnOrders(-1)">Назад</button><span>{{ orderPage + 1 }}</span><button :disabled="busy || orders.length < 100" @click="turnOrders(1)">Далі</button><button :disabled="busy" @click="run(loadOrders)">Оновити журнал</button></div>
    <article v-if="document" class="panel">
      <h3>Замовлення № {{ document.id }} — {{ document.vendorName }}</h3><button :disabled="busy" @click="downloadOrder">Завантажити CSV для постачальника</button><p>{{ supplierStates[document.status] }} · Очікувана дата: {{ document.expectedDate || 'не задана' }}</p><p>{{ document.note }}</p>
      <div v-for="l in document.lines" :key="l.id" class="saved-line"><strong>{{ l.description }}</strong><span>Замовлено {{ fmt(l.ordered) }} · Отримано {{ fmt(l.received) }} · {{ ['CLOSED','CANCELLED'].includes(document.status) ? 'Закрито без поставки' : 'Залишилось' }} {{ fmt(l.remaining) }} {{ stockUnits[l.unit] }}</span><label v-if="['ORDERED','PARTIAL'].includes(document.status) && Number(l.remaining) > 0">Отримано зараз<input v-model="receiving.quantities[l.id]" :disabled="busy" type="number" min="0" :max="l.remaining" :step="l.unit === 'PIECE' ? 1 : 0.000001"></label></div>
      <div v-if="document.status === 'DRAFT'" class="tools"><button :disabled="busy" @click="editDocument">Редагувати чернетку</button><button :disabled="busy" @click="place">Підтвердити замовлення</button></div>
      <fieldset v-if="['ORDERED','PARTIAL'].includes(document.status)" :disabled="busy"><legend>Прихід матеріалів</legend><p>Порожні поля та нулі означають, що позиція ще не надійшла. Вказуйте кількість у складських одиницях, а не кількість листів чи упаковок.</p><button @click="fillReceipt">Заповнити весь залишок</button><div class="tools"><label>Номер накладної<input v-model="receiving.documentNo" maxlength="120"></label><label>Дата приходу<input v-model="receiving.receivedDate" type="date"></label></div><label>Примітка<textarea v-model="receiving.note" maxlength="1000"></textarea></label><button @click="receive">Провести прихід</button></fieldset>
      <details v-if="['ORDERED','PARTIAL'].includes(document.status)"><summary>Перенести очікувану дату</summary><label>Нова дата<input v-model="newDate" :disabled="busy" type="date"></label><label>Причина<textarea v-model="dateReason" :disabled="busy" maxlength="1000"></textarea></label><button :disabled="busy" @click="reschedule">Зберегти дату</button></details>
      <details v-if="['DRAFT','ORDERED','PARTIAL'].includes(document.status)"><summary>Скасування / закриття недопоставки</summary><label>Причина<textarea v-model="closeReason" :disabled="busy" maxlength="1000"></textarea></label><button :disabled="busy" @click="close">Закрити непоставлений залишок</button></details>
      <h4>Приходи</h4><p v-if="!document.receipts.length">Приходів ще немає.</p><details v-for="r in document.receipts" :key="r.id"><summary>№ {{ r.documentNo }} · {{ r.receivedDate }} · {{ r.actor }}</summary><p>{{ r.note }}</p><p v-for="l in document.receiptLines.filter(l => l.receiptId === r.id)" :key="l.lineId">{{ document.lines.find(x => x.id === l.lineId)?.description }}: {{ fmt(l.quantity) }} {{ stockUnits[document.lines.find(x => x.id === l.lineId)?.unit] }}</p></details>
      <details><summary>Історія документа</summary><p v-for="(e, i) in document.events" :key="i">{{ e.createdAt }} · {{ e.actor }} · {{ ({ CREATE: 'Створено', EDIT: 'Змінено', ORDERED: 'Замовлено', RECEIPT: 'Прихід', CLOSE_REMAINDER: 'Закрито залишок', RESCHEDULE: 'Перенесено дату' })[e.action] || e.action }}<span v-if="e.action === 'CLOSE_REMAINDER'"> · {{ typeof e.snapshot === 'string' ? JSON.parse(e.snapshot).note : e.snapshot?.note }}</span></p></details>
    </article>
  </section>
</template>
<style scoped>
.procurement{padding:0 24px 24px}.tools{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin:14px 0}.tools label{display:flex;gap:6px;flex-direction:column}.tools label:has(input[type=checkbox]){flex-direction:row;align-items:center}input,select,textarea,button{font:inherit;padding:9px;border:1px solid #ccd5dd;border-radius:6px;max-width:100%;box-sizing:border-box}button{cursor:pointer}button:disabled{opacity:.5}.needs{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,310px),1fr));gap:12px}.material,.panel{padding:16px;border:1px solid #ccd5dd;border-radius:9px;margin:12px 0}.material .title{display:block;text-align:left;font-weight:600;margin-bottom:8px}dl{margin:12px 0}dl>div{display:flex;justify-content:space-between;gap:10px;margin:6px 0}dd{margin:0;text-align:right}.hint{color:#54616c}.warning,[role=alert]{color:#9b3914}[role=status]{color:#276039}label{display:grid;gap:6px}textarea{width:100%;max-width:700px;min-height:65px}.draft-line,.saved-line{display:flex;gap:12px;flex-wrap:wrap;align-items:center;padding:12px 0;border-bottom:1px solid #ddd}.draft-line>span,.saved-line>strong{flex:1;min-width:150px}.draft-line input{width:150px}.draft-line small{display:block;color:#9b3914}.orders{display:flex;flex-direction:column;gap:8px}.orders button{text-align:left}fieldset{border:1px solid #ccd5dd;border-radius:8px;margin:16px 0}details{margin:16px 0}summary{cursor:pointer}
</style>
