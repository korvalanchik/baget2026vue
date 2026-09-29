<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { crm } from '../services/crm.js'
import { canAccess } from '../services/auth.js'
import { outcomes, locations, productionStates, orderStates, phoneLink, contactPayload, groupedOrders } from '../calculation/crm.js'
const props = defineProps({ session: { type: Object, required: true } })
const emit = defineEmits(['finance'])
const cardElement = ref(null)
const branches = ref([]), rows = ref([]), hasMore = ref(false), page = ref(0), historyPage = ref(0)
const loading = ref(false), saving = ref(false), error = ref(''), notice = ref(''), selected = ref(null), detail = ref(null)
const filters = reactive({ branch: '', tab: 'WORK', q: '', all: false, due: false })
const form = reactive({ outcome: 'NOTE', note: '', orderNo: '', invoiceId: '', nextContactDate: '' })
const formBaseline = ref('')
const dirty = computed(() => JSON.stringify(form) !== formBaseline.value)
const orders = computed(() => groupedOrders((detail.value?.orders || []).slice(0, 200)))
const financeAllowed = computed(() => canAccess(props.session, 'customers:finance:read'))
const invoiceStates = { DRAFT: 'Чернетка', ISSUED: 'Виставлено', PAID: 'Оплачено', PARTIALLY_PAID: 'Частково оплачено', CANCELLED: 'Скасовано', ACTIVE: 'Діючий', MERGED: 'Об’єднано' }
const tabs = { WORK: 'Замовлення в роботі', READY: 'Очікують видачі', PARTNER: 'Партнери / рахунки' }
let boardGeneration = 0, retry = null
const fmtDate = value => value ? new Date(value.length === 10 ? value + 'T12:00:00' : value).toLocaleString('uk-UA', value.length === 10 ? { day: '2-digit', month: '2-digit', year: '2-digit' } : { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const api = (path, body) => crm(props.session.token, path, body)
const cardPath = () => `/customers/${selected.value.customerId}/branches/${selected.value.branchNo}`
async function board(reset = false) {
  if (reset) page.value = 0
  const generation = ++boardGeneration; loading.value = true; error.value = ''
  try {
    const query = new URLSearchParams({ ...filters, page: page.value })
    if (!filters.branch) query.delete('branch')
    const result = await api('/customers?' + query)
    if (generation === boardGeneration) { rows.value = result.rows; hasMore.value = result.hasMore }
  } catch (e) { if (generation === boardGeneration) error.value = e.message } finally { if (generation === boardGeneration) loading.value = false }
}
function resetForm() {
  Object.assign(form, { outcome: 'NOTE', note: '', orderNo: '', invoiceId: '', nextContactDate: detail.value?.profile.nextContactDate || '' })
  formBaseline.value = JSON.stringify(form); retry = null
}
async function open(row) {
  if (saving.value || (selected.value && dirty.value && !window.confirm('Відкинути незбережений запис контакту?'))) return
  saving.value = true; error.value = ''; notice.value = ''
  try {
    const result = await api(`/customers/${row.customerId}/branches/${row.branchNo}`)
    selected.value = row; detail.value = result; historyPage.value = 0; resetForm(); await nextTick(); cardElement.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (e) { error.value = e.message } finally { saving.value = false }
}
function close() { if (saving.value || (dirty.value && !window.confirm('Відкинути незбережений запис?'))) return; selected.value = null; detail.value = null }
async function history(delta) {
  if (saving.value) return
  saving.value = true; error.value = ''
  try { const next = historyPage.value + delta; const result = await api(cardPath() + '?page=' + next); detail.value.history = result.history; detail.value.hasMore = result.hasMore; historyPage.value = next } catch (e) { error.value = e.message } finally { saving.value = false }
}
async function save(partner = false) {
  if (saving.value) return
  saving.value = true; error.value = ''; notice.value = ''
  try {
    const payload = partner ? { requestKey: '', expectedRevision: detail.value.profile.revision, partner: !detail.value.profile.partner } : contactPayload(form, '', detail.value.profile.revision)
    if (!partner && detail.value.profile.nextContactDate && !payload.nextContactDate && !window.confirm('Завершити поточну домовленість і прибрати дату наступного контакту?')) return
    const signature = JSON.stringify([cardPath(), partner, payload])
    if (!retry || retry.signature !== signature) retry = { signature, key: crypto.randomUUID() }
    payload.requestKey = retry.key
    const result = await api(cardPath() + (partner ? '/partner' : '/contacts'), payload)
    detail.value = result; historyPage.value = 0; retry = null
    if (!partner) resetForm()
    notice.value = partner ? 'Ознаку партнера збережено для цієї філії.' : 'Контакт збережено в історії.'
    await board()
  } catch (e) { error.value = e.message } finally { saving.value = false }
}
function preventLeave(event) { if (selected.value && dirty.value) { event.preventDefault(); event.returnValue = '' } }
onBeforeUnmount(() => window.removeEventListener('beforeunload', preventLeave))
onMounted(async () => {
  window.addEventListener('beforeunload', preventLeave)
  formBaseline.value = JSON.stringify(form)
  try { branches.value = await api('/branches') } catch (e) { error.value = e.message; return }
  await board()
})
</script>
<template>
  <section class="crm">
    <h1>Клієнти CRM</h1>
    <p>Робота із замовленнями, видачею та домовленостями. Один клієнт може бути у кількох списках.</p>
    <nav class="tools"><button v-for="(name, key) in tabs" :key="key" :class="{ active: filters.tab === key }" :disabled="loading" @click="filters.tab = key; filters.all = false; board(true)">{{ name }}</button></nav>
    <form class="tools" @submit.prevent="board(true)">
      <label>Філія<select v-model="filters.branch" :disabled="loading" @change="board(true)"><option value="">Усі доступні</option><option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option></select></label>
      <label>Пошук<input v-model="filters.q" maxlength="100" placeholder="Ім’я, телефон або № замовлення"></label>
      <label class="check"><input v-model="filters.all" type="checkbox"> Шукати серед усіх клієнтів філії</label>
      <label class="check"><input v-model="filters.due" type="checkbox"> Контакт сьогодні або прострочений</label>
      <button :disabled="loading">Знайти / оновити</button>
    </form>
    <p v-if="filters.all">Показано всіх клієнтів із замовленнями або рахунками у вибраних філіях, незалежно від вкладки. Тут можна знайти й позначити партнера.</p>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p><p v-if="loading">Завантаження…</p>
    <div class="client-list">
      <article v-for="c in rows" :key="c.customerId + '-' + c.branchNo">
        <strong>{{ c.company }}</strong> · {{ c.branchName }} <span v-if="c.partner"> · Партнер</span>
        <p><a v-if="phoneLink(c.mobile)" :href="phoneLink(c.mobile)">{{ c.mobile }}</a><span v-else>Телефон не вказано</span> · У роботі: {{ c.workingOrders }} · Очікують видачі: {{ c.readyOrders }}</p>
        <p v-if="c.lastContact">Останній контакт: {{ fmtDate(c.lastContact) }} · {{ outcomes[c.lastOutcome] || c.lastOutcome }} · {{ c.lastActor }}<br>{{ c.lastNote }}</p>
        <p v-if="c.nextContactDate"><strong>Наступний контакт: {{ fmtDate(c.nextContactDate) }}</strong></p>
        <button :disabled="saving" @click="open(c)">Відкрити картку</button>
      </article>
    </div>
    <p v-if="!loading && !rows.length">Клієнтів за цими умовами немає.</p>
    <div class="tools"><button :disabled="loading || !page" @click="page--; board()">Назад</button><span>Сторінка {{ page + 1 }}</span><button :disabled="loading || !hasMore" @click="page++; board()">Далі</button></div>
    <section v-if="selected && detail" ref="cardElement" class="customer-card">
      <header class="tools"><h2>{{ selected.company }} · {{ selected.branchName }}</h2><button :disabled="saving" @click="close">Закрити картку</button><button :disabled="saving" @click="open(selected)">Оновити картку</button></header>
      <a v-if="phoneLink(selected.mobile)" :href="phoneLink(selected.mobile)">{{ selected.mobile }}</a>
      <div class="tools">
        <button :disabled="saving" @click="save(true)">{{ detail.profile.partner ? 'Зняти ознаку партнера' : 'Позначити як партнера' }}</button>
        <button v-if="financeAllowed" :disabled="saving" @click="emit('finance', selected)">Рахунки, оплата та аванс</button>
      </div>
      <p>Ознака партнера та домовленості зберігаються для цієї філії. Натискання номера телефону не записує контакт автоматично.</p>
      <details open><summary>Замовлення та готовність</summary>
        <p v-if="detail.orders.length > 200">Показано останні 200 позицій. Для давнішого замовлення використайте його номер у записі контакту.</p>
        <article v-for="o in orders" :key="o.orderNo">
          <strong>Замовлення № {{ o.orderNo }}</strong><span v-if="o.partial"> · Частково готове</span>
          <p v-if="!o.products.length">Старе замовлення: {{ orderStates[o.status] || o.status }}. Готовність і місце видачі потрібно уточнити.</p>
          <p v-for="p in o.products" :key="p.productId">{{ p.productName }} · {{ productionStates[p.state] || p.state }} · {{ locations[p.location] || p.location }}<strong v-if="p.pending"> · Очікує передачі: {{ locations[p.pending] || p.pending }}</strong></p>
          <button :disabled="saving" @click="form.orderNo = o.orderNo">Пов’язати контакт</button>
        </article>
      </details>
      <details><summary>Рахунки</summary>
        <p v-if="detail.invoices.length > 200">Показано останні 200 рахунків.</p>
        <p v-if="!detail.invoices.length">Рахунків немає.</p>
        <p v-for="i in detail.invoices.slice(0, 200)" :key="i.id">№ {{ i.invoiceNo }} · {{ invoiceStates[i.status] || i.status }} · {{ invoiceStates[i.lifecycle] || i.lifecycle }} <button :disabled="saving" @click="form.invoiceId = i.id">Пов’язати контакт</button></p>
      </details>
      <h3>Запис контакту</h3>
      <form @submit.prevent="save(false)">
        <div class="tools">
          <label>Результат<select v-model="form.outcome" :disabled="saving"><option v-for="(name, key) in outcomes" v-show="key !== 'PARTNER'" :key="key" :value="key" :disabled="key === 'PARTNER'">{{ name }}</option></select></label>
          <label>Наступний контакт<input v-model="form.nextContactDate" :disabled="saving || form.outcome === 'DONE'" type="date"></label>
          <label>№ замовлення (необов’язково)<input v-model="form.orderNo" :disabled="saving" inputmode="numeric"></label>
          <label>Рахунок<select v-model="form.invoiceId" :disabled="saving"><option value="">Без прив’язки</option><option v-for="i in detail.invoices" :key="i.id" :value="i.id">№ {{ i.invoiceNo }}</option></select></label>
        </div>
        <label>Примітка<textarea v-model="form.note" :disabled="saving" maxlength="2000" required rows="3" placeholder="Що обговорили та про що домовилися"></textarea></label>
        <p>Залиште чинну дату, щоб зберегти нагадування. «Домовленість завершено» прибере його з поточного плану, але збереже історію.</p>
        <button :disabled="saving">{{ saving ? 'Збереження…' : 'Зберегти контакт' }}</button>
      </form>
      <h3>Історія роботи з клієнтом</h3>
      <p v-if="!detail.history.length">Записів ще немає.</p>
      <article v-for="e in detail.history" :key="e.id"><strong>{{ fmtDate(e.createdAt) }} · {{ e.actor }} · {{ outcomes[e.outcome] || e.outcome }}</strong><p class="note">{{ e.note }}</p><p v-if="e.orderNo">Замовлення № {{ e.orderNo }}</p><p v-if="e.invoiceId">Рахунок № {{ e.invoiceNo || e.invoiceId }}</p><p v-if="e.nextContactDate">Домовлено про наступний контакт: {{ fmtDate(e.nextContactDate) }}</p></article>
      <div class="tools"><button :disabled="saving || !historyPage" @click="history(-1)">Новіші</button><span>Сторінка {{ historyPage + 1 }}</span><button :disabled="saving || !detail.hasMore" @click="history(1)">Старіші</button></div>
    </section>
  </section>
</template>
<style scoped>
.crm{padding:24px;max-width:1300px;margin:auto}.tools{display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin:14px 0}.tools h2{margin:0;margin-right:auto}label{display:grid;gap:6px}.check{display:flex;align-items:center}input,select,textarea,button{font:inherit;padding:9px;border:1px solid #bccbd4;border-radius:6px}button{cursor:pointer}button:disabled{opacity:.55}.active{background:#ddecf9;border-color:#498bb7}.client-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));gap:12px}article{border:1px solid #d4dde2;border-radius:8px;padding:14px;margin:8px 0;overflow-wrap:anywhere}.customer-card{margin-top:24px;padding:20px;background:#f7f9fb;border:1px solid #bccbd4;border-radius:10px}textarea{width:100%;box-sizing:border-box}.note{white-space:pre-wrap}[role=alert]{color:#a22}[role=status]{color:#276039}details{margin:18px 0}summary{cursor:pointer;font-weight:bold}
</style>
