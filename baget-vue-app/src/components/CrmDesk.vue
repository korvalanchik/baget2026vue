<script setup>
import OrderHistory from './OrderHistory.vue'
import CrmQrIssueDesk from './CrmQrIssueDesk.vue'
import CrmIssuePanel from './CrmIssuePanel.vue'
import CustomerCreditPanel from './CustomerCreditPanel.vue'

import { newRequestKey } from '../services/requestKey.js'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import PickupActions from './PickupActions.vue'
import { crm } from '../services/crm.js'
import { canAcceptCustomerPayment } from '../services/customerPayments.js'
import { outcomes, locations, productionStates, orderStates, phoneLink, contactPayload, groupedOrders } from '../calculation/crm.js'
const props = defineProps({ session: { type: Object, required: true }, initialCustomer: { type: Object, default: null } })
const emit = defineEmits(['finance'])
const cardElement = ref(null), listElement = ref(null), cardTab = ref('contact'), showLinks = ref(false)
const qrOpen = ref(false), qrBusy = ref(false)
const issueOrder = ref(null), issueLocked = ref(false)
const branches = ref([]), rows = ref([]), hasMore = ref(false), page = ref(0), historyPage = ref(0)
const loading = ref(false), saving = ref(false), error = ref(''), notice = ref(''), selected = ref(null), detail = ref(null)
const filters = reactive({ branch: '', tab: 'WORK', q: '', all: false, due: false })
const form = reactive({ outcome: 'NOTE', note: '', orderNo: '', invoiceId: '', nextContactDate: '' })
const formBaseline = ref('')
const dirty = computed(() => JSON.stringify(form) !== formBaseline.value)
const pickupByOrder = computed(() => new Map((detail.value?.pickupOrders || []).map(o => [String(o.orderNo), o])))
const orders = computed(() => {
 const list = groupedOrders((detail.value?.orders || []).slice(0, 200))
 const visible = new Set(list.map(o => String(o.orderNo)))
 // Keep ready orders accessible even if their product rows fall outside the detail limit.
 for (const o of detail.value?.pickupOrders || []) {
  if (!visible.has(String(o.orderNo))) list.push({ orderNo: o.orderNo, products: [], partial: false, pickupOnly: true, legacy: o.legacy })
 }
 return list
})
const pickupLabels = { NEEDS_NOTICE: 'потрібно повідомити', NO_ANSWER: 'не відповів', AGREED: 'домовлено про отримання', OVERDUE: 'дата отримання минула', NOTIFIED: 'повідомлено' }
async function toggleIssue(orderNo, event) {
 if (saving.value || issueLocked.value) return
 const button = event.currentTarget, top = button.getBoundingClientRect().top
 issueOrder.value = issueOrder.value === orderNo ? null : orderNo
 await nextTick()
 // Collapsing a previous card must not move the clicked order out of view.
 if (button.isConnected) window.scrollBy({ top: button.getBoundingClientRect().top - top, behavior: 'instant' })
}
function closeIssue() { issueOrder.value = null; issueLocked.value = false }
const financeAllowed = computed(() => canAcceptCustomerPayment(props.session))
const contactOutcomes = Object.fromEntries(Object.entries(outcomes).filter(([key]) => key !== 'PARTNER' && !key.startsWith('PICKUP_')))
const invoiceStates = { DRAFT: 'Чернетка', ISSUED: 'Виставлено', PAID: 'Оплачено', PARTIALLY_PAID: 'Частково оплачено', CANCELLED: 'Скасовано', ACTIVE: 'Діючий', MERGED: 'Об’єднано' }
const tabs = computed(() => ({ WORK: 'У роботі', READY: 'До видачі', ...(financeAllowed.value ? { SETTLEMENT: 'Розрахунки' } : {}) }))
const settlementFilter = ref('SETTLEMENT')
const isSettlement = computed(() => filters.tab === 'SETTLEMENT')
const yes = value => value === true || Number(value) === 1
const cardTabs = { contact: 'Контакт', orders: 'Замовлення й видача', invoices: 'Рахунки', history: 'Історія' }
const tabHint = computed(() => ({ WORK: 'Клієнти із замовленнями в роботі', READY: 'Клієнти, чиї замовлення очікують видачі', SETTLEMENT: 'Клієнти з боргом або доступним авансом. Кошти посередника позначені як довідкові; суми не змішуються. Фірми-посередники — у бухгалтерському розділі.' })[filters.tab])
function linkContact(key, value) { form[key] = value; showLinks.value = true; cardTab.value = 'contact' }
function contactTiming(value) {
 if (!value) return ''
 const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
 const part = key => parts.find(p => p.type === key).value
 const today = `${part('year')}-${part('month')}-${part('day')}`
 return value < today ? 'Контакт пропущено' : value === today ? 'Зв’язатися сьогодні' : 'Наступний контакт'
}
let boardGeneration = 0, retry = null
const fmtDate = value => value ? new Date(value.length === 10 ? value + 'T12:00:00' : value).toLocaleString('uk-UA', value.length === 10 ? { day: '2-digit', month: '2-digit', year: '2-digit' } : { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const api = (path, body) => crm(props.session.token, path, body)
const cardPath = () => `/customers/${selected.value.customerId}/branches/${selected.value.branchNo}`
async function board(reset = false) {
  if (reset) page.value = 0
  const generation = ++boardGeneration; loading.value = true; error.value = ''
  try {
    const query = new URLSearchParams({ ...filters, tab: isSettlement.value ? settlementFilter.value : filters.tab, page: page.value })
    if (!filters.branch) query.delete('branch')
    const result = await api('/customers?' + query)
    if (generation === boardGeneration) { rows.value = result.rows; hasMore.value = result.hasMore }
  } catch (e) { if (generation === boardGeneration) error.value = e.message } finally { if (generation === boardGeneration) loading.value = false }
}
async function pickupSaved(customer, result) {
  if (selected.value?.customerId === customer.customerId && selected.value?.branchNo === customer.branchNo) {
    detail.value.pickupOrders = result.pickupOrders
    detail.value.history = result.history
    detail.value.hasMore = result.hasMore
    historyPage.value = 0
  }
  notice.value = 'Дію збережено в історії. Дату наступного дзвінка не змінено.'
  await board()
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
    closeIssue(); selected.value = row; detail.value = result; historyPage.value = 0; resetForm(); cardTab.value = filters.tab === 'READY' ? 'orders' : isSettlement.value ? 'invoices' : 'contact'; showLinks.value = false; await nextTick(); cardElement.value?.focus({ preventScroll: true }); cardElement.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (e) { error.value = e.message } finally { saving.value = false }
}
function close() { if (saving.value || (dirty.value && !window.confirm('Відкинути незбережений запис?'))) return; selected.value = null; detail.value = null; nextTick(() => listElement.value?.focus()) }
async function history(delta) {
  if (saving.value) return
  saving.value = true; error.value = ''
  try { const next = historyPage.value + delta; const result = await api(cardPath() + '?page=' + next); detail.value.history = result.history; detail.value.hasMore = result.hasMore; historyPage.value = next } catch (e) { error.value = e.message } finally { saving.value = false }
}
async function save() {
  if (saving.value) return
  saving.value = true; error.value = ''; notice.value = ''
  try {
    const payload = contactPayload(form, '', detail.value.profile.revision)
    if (detail.value.profile.nextContactDate && !payload.nextContactDate && !window.confirm('Завершити поточну домовленість і прибрати дату наступного контакту?')) return
    const signature = JSON.stringify([cardPath(), payload])
    if (!retry || retry.signature !== signature) retry = { signature, key: newRequestKey() }
    payload.requestKey = retry.key
    const result = await api(cardPath() + '/contacts', payload)
    detail.value = result; historyPage.value = 0; retry = null
    resetForm()
    notice.value = 'Контакт збережено в історії.'
    await board()
  } catch (e) { error.value = e.message } finally { saving.value = false }
}
async function issued() {
 if (!selected.value) { await board(); return }
 try {
  const result = await api(cardPath())
  detail.value.orders = result.orders; detail.value.pickupOrders = result.pickupOrders; detail.value.history = result.history; detail.value.hasMore = result.hasMore; historyPage.value = 0
  notice.value = 'Видачу збережено в історії клієнта.'
  await board()
 } catch (e) { error.value = e.message }
}
defineExpose({ refresh: () => board() })
function preventLeave(event) { if (selected.value && dirty.value) { event.preventDefault(); event.returnValue = '' } }
onBeforeUnmount(() => window.removeEventListener('beforeunload', preventLeave))
onMounted(async () => {
  window.addEventListener('beforeunload', preventLeave)
  formBaseline.value = JSON.stringify(form)
  try { branches.value = await api('/branches') } catch (e) { error.value = e.message; return }
  if (props.initialCustomer) {
    filters.branch = String(props.initialCustomer.branchNo); filters.all = true
  }
  await board()
  if (props.initialCustomer) await open(props.initialCustomer)
})
</script>
<template>
 <section class="crm" :class="{ 'has-selection': selected && detail }">
  <header class="page-heading"><div><span class="eyebrow">Робота з клієнтами</span><h1>Клієнти CRM</h1></div></header>
  <button v-if="financeAllowed" type="button" :disabled="saving || qrBusy || !!issueOrder" @click="qrOpen = !qrOpen; if (!qrOpen) board()">{{ qrOpen ? '← До CRM' : 'Видати за QR-кодом' }}</button>
  <CrmQrIssueDesk v-if="qrOpen" :session="session" @busy="qrBusy = $event" @issued="issued" />
  <div v-show="!qrOpen">
  <div>
   <div class="board-controls">
    <nav class="segment" aria-label="Групи клієнтів"><button v-for="(name, key) in tabs" :key="key" :aria-pressed="filters.tab === key" :class="{ active: filters.tab === key }" :disabled="loading" @click="filters.tab = key; filters.all = false; board(true)">{{ name }}</button></nav>
    <form class="filters" @submit.prevent="board(true)">
     <label class="search-field"><span>Пошук клієнта</span><input v-model="filters.q" maxlength="100" placeholder="Ім’я, телефон або № замовлення"></label>
     <label class="branch-field"><span>Філія</span><select v-model="filters.branch" :disabled="loading" @change="board(true)"><option value="">Усі доступні</option><option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option></select></label>
     <button class="primary" :disabled="loading">{{ loading ? 'Пошук…' : 'Знайти' }}</button>
     <label v-if="isSettlement" class="settlement-filter">Розрахунки<select v-model="settlementFilter" :disabled="loading" @change="board(true)"><option value="SETTLEMENT">Борг або аванс</option><option value="DEBT">Є борг</option><option value="ADVANCE">Є аванс</option><option value="OVERDUE">Минув строк оплати рахунку</option></select></label>
     <div class="filter-options"><label class="check"><input v-model="filters.due" type="checkbox" :disabled="loading" @change="board(true)"> Контакт сьогодні / пропущено</label><label v-if="!isSettlement" class="check"><input v-model="filters.all" type="checkbox" :disabled="loading" @change="board(true)"> Усі клієнти філії</label></div>
    </form>
    <p class="muted filter-description">{{ filters.all ? 'Пошук серед усіх клієнтів доступних філій, незалежно від групи.' : tabHint }}</p>
   </div>
   <p v-if="error" class="feedback error" role="alert">{{ error }}</p><p v-if="notice" class="feedback success" role="status">{{ notice }}</p>
   <div class="workspace">
    <aside ref="listElement" class="list-pane" tabindex="-1" aria-label="Список клієнтів">
     <div class="list-heading"><strong>Клієнти</strong><span class="muted">{{ rows.length }} на сторінці<span v-if="loading"> · Оновлення…</span></span></div>
     <div class="client-list" :aria-busy="loading">
      <article v-for="c in rows" :key="c.customerId + '-' + c.branchNo" class="client-row" :class="{ chosen: selected?.customerId === c.customerId && selected?.branchNo === c.branchNo }">
       <button class="client-name" :disabled="saving" :aria-label="`Відкрити картку: ${c.company}, ${c.branchName}`" @click="open(c)">{{ c.company }}</button>
       <div class="client-meta"><span>{{ c.branchName }}</span></div>
       <div v-if="isSettlement" class="settlement-flags"><span v-if="yes(c.ownDebt)">Борг за рахунком</span><span v-if="yes(c.ownAdvance)">Доступний аванс</span><span v-if="yes(c.referenceDebt)">Борг клієнта посереднику · довідково</span><span v-if="yes(c.referenceAdvance)">Аванс у посередника · довідково</span></div>
       <a v-if="phoneLink(c.mobile)" class="phone" :href="phoneLink(c.mobile)">{{ c.mobile }}</a><span v-else class="muted small">Телефон не вказано</span>
       <div class="counts"><span>У роботі <b>{{ c.workingOrders }}</b></span><span :class="{ ready: Number(c.readyOrders) > 0 }">До видачі <b>{{ c.readyOrders }}</b></span></div>
       <p v-if="c.nextContactDate" class="next-contact" :class="{ attention: contactTiming(c.nextContactDate) !== 'Наступний контакт' }">{{ contactTiming(c.nextContactDate) }} · {{ fmtDate(c.nextContactDate) }}</p>
       <p v-if="c.lastContact" class="last-contact"><span>{{ fmtDate(c.lastContact) }} · {{ outcomes[c.lastOutcome] || c.lastOutcome }}</span><span v-if="c.lastNote" class="note-preview" :title="c.lastNote">{{ c.lastNote }}</span></p>
       <button class="text-button" :disabled="saving" @click="open(c)">Відкрити картку →</button>
      </article>
     </div>
     <p v-if="!loading && !rows.length" class="empty">Клієнтів за цими умовами немає. Змініть пошук або фільтри.</p>
     <nav class="pagination" aria-label="Сторінки клієнтів"><button :disabled="loading || !page" @click="page--; board()">← Назад</button><span>{{ page + 1 }}</span><button :disabled="loading || !hasMore" @click="page++; board()">Далі →</button></nav>
    </aside>
    <section v-if="selected && detail" ref="cardElement" class="customer-card" tabindex="-1" aria-label="Картка клієнта">
     <header class="card-heading"><div><span class="eyebrow">{{ selected.branchName }}</span><h2>{{ selected.company }}</h2><a v-if="phoneLink(selected.mobile)" class="phone" :href="phoneLink(selected.mobile)">{{ selected.mobile }}</a><span v-else class="muted">Телефон не вказано</span></div><div class="card-actions"><button :disabled="saving" @click="close">← До списку</button><button :disabled="saving" @click="open(selected)">Оновити</button></div></header>
     <div class="card-summary"><span v-if="detail.profile.nextContactDate" class="reminder">{{ contactTiming(detail.profile.nextContactDate) }}: <strong>{{ fmtDate(detail.profile.nextContactDate) }}</strong></span><span v-else class="muted">Наступний контакт не заплановано</span><span v-if="dirty" class="unsaved">Незбережений запис</span></div>
     <div class="finance-action"><button v-if="financeAllowed" class="primary" :disabled="saving" @click="emit('finance', selected)">Оплата, аванс і фінансовий стан</button></div>
     <nav class="card-nav" aria-label="Розділи картки"><button v-for="(name, key) in cardTabs" :key="key" :class="{ active: cardTab === key }" :aria-pressed="cardTab === key" :disabled="saving" @click="cardTab = key">{{ name }}<span v-if="key === 'orders'"> · {{ orders.length }}</span></button></nav>
     <div class="card-content">
      <section v-show="cardTab === 'contact'">
       <h3>Новий контакт</h3>
       <form class="contact-form" @submit.prevent="save()">
        <div class="form-pair"><label>Результат<select v-model="form.outcome" :disabled="saving"><option v-for="(name, key) in contactOutcomes" :key="key" :value="key">{{ name }}</option></select></label><label>Наступний контакт<input v-model="form.nextContactDate" :disabled="saving || form.outcome === 'DONE'" type="date"></label></div>
        <label>Про що домовилися<textarea v-model="form.note" :disabled="saving" maxlength="2000" required rows="3" placeholder="Коротко: результат розмови та наступна дія"></textarea></label>
        <details :open="showLinks" @toggle="showLinks = $event.target.open"><summary>Пов’язати із замовленням або рахунком<span v-if="form.orderNo || form.invoiceId"> · вибрано</span></summary><div class="form-pair"><label>№ замовлення<input v-model="form.orderNo" :disabled="saving" inputmode="numeric" placeholder="Необов’язково"></label><label>Рахунок<select v-model="form.invoiceId" :disabled="saving"><option value="">Без прив’язки</option><option v-for="i in detail.invoices" :key="i.id" :value="i.id">№ {{ i.invoiceNo }}</option></select></label></div></details>
        <div class="save-row"><button class="primary" :disabled="saving">{{ saving ? 'Збереження…' : 'Зберегти контакт' }}</button><span class="muted small">Дзвінок за номером телефону не записує контакт автоматично.</span></div>
       </form>
       <details class="help"><summary>Нагадування</summary><p>Залиште чинну дату, щоб зберегти нагадування. «Домовленість завершено» прибере його з поточного плану, але збереже історію.</p><p>Для повідомлення про готовність відкрийте «Замовлення й видача».</p></details>
      </section>
      <section v-if="cardTab === 'orders'">
       <h3>Замовлення й видача</h3>
       <p v-if="detail.orders.length > 200" class="muted">Показано останні 200 позицій та готові замовлення з діями отримання.</p>
       <p v-if="!orders.length" class="empty">Невиданих замовлень немає. Завершені видачі — у вкладці «Історія».</p>
       <article v-for="o in orders" :key="o.orderNo" class="order-row" :class="{ 'order-open': issueOrder === o.orderNo }">
        <header><strong>Замовлення № {{ o.orderNo }}</strong><span v-if="o.partial" class="badge">Частково готове</span></header>
        <p v-if="o.commerceMode === 'RESELLER'" class="muted">Розрахунки через {{ o.partnerName || 'фірму-посередника' }} · довідковий облік оплати клієнта</p>
        <p v-if="!o.products.length" class="muted">{{ o.pickupOnly && !o.legacy ? 'Склад виробів — у формі видачі нижче.' : `Старе замовлення: ${orderStates[o.status] || 'готовність і місце видачі потрібно уточнити'}.` }}</p>
        <div v-for="p in o.products" :key="p.productId" class="product-row"><span>{{ p.productName }}</span><span>{{ productionStates[p.state] || p.state }}</span><span class="muted">{{ locations[p.location] || p.location }}<strong v-if="p.pending"> → {{ locations[p.pending] || p.pending }} (очікує передачі)</strong></span></div>
        <OrderHistory :session="session" :order-no="o.orderNo" />
        <div class="order-actions">
         <button v-if="financeAllowed && (o.products.length || (o.pickupOnly && !o.legacy))" class="primary" :disabled="saving || issueLocked" :aria-expanded="issueOrder === o.orderNo" :aria-controls="`issue-order-${o.orderNo}`" @click="toggleIssue(o.orderNo, $event)">{{ issueOrder === o.orderNo ? 'Згорнути видачу / оплату' : 'Видача / оплата' }}</button>
         <button :disabled="saving || issueLocked" @click="linkContact('orderNo', o.orderNo)">Записати контакт</button>
        </div>
        <div v-if="issueOrder === o.orderNo" :id="`issue-order-${o.orderNo}`" class="inline-issue">
         <CrmIssuePanel :show-history="false" :key="`${selected.customerId}-${selected.branchNo}-${o.orderNo}`" :session="session" :customer="selected" :order-no="Number(o.orderNo)" @busy="saving = $event" @locked="issueLocked = $event" @issued="issued" @close="closeIssue" />
        </div>
        <details v-if="pickupByOrder.has(String(o.orderNo))" class="order-pickup">
         <summary>Зв’язок щодо отримання · {{ pickupLabels[pickupByOrder.get(String(o.orderNo)).pickupStatus] || 'дії з клієнтом' }}</summary>
         <PickupActions :session="session" :customer="selected" :order="pickupByOrder.get(String(o.orderNo))" :disabled="saving || issueLocked" @busy="saving = $event" @saved="pickupSaved(selected, $event)" />
        </details>
       </article>
      </section>
      <section v-if="cardTab === 'invoices'">
       <h3>Рахунки клієнта</h3><p class="muted small">Оплати, аванс і залишок доступні за кнопкою фінансового стану вгорі картки.</p><p v-if="detail.invoices.length > 200">Показано останні 200 рахунків.</p><p v-if="!detail.invoices.length" class="empty">Рахунків немає.</p>
       <article v-for="i in detail.invoices.slice(0, 200)" :key="i.id" class="invoice-row"><div><strong>№ {{ i.invoiceNo }}</strong><p class="muted">{{ invoiceStates[i.status] || i.status }} · {{ invoiceStates[i.lifecycle] || i.lifecycle }}</p></div><button :disabled="saving" @click="linkContact('invoiceId', i.id)">Записати контакт</button></article>
       <details v-if="financeAllowed"><summary>Умови видачі та кредиту</summary><CustomerCreditPanel :key="`${selected.customerId}-${selected.branchNo}`" :session="session" :customer-id="Number(selected.customerId)" :branch-no="Number(selected.branchNo)" @busy="saving = $event" /></details>
      </section>
      <section v-show="cardTab === 'history'">
       <h3>Історія контактів</h3><p v-if="!detail.history.length" class="empty">Записів ще немає.</p>
       <div class="timeline"><article v-for="e in detail.history" :key="e.id" class="history-entry"><header><strong>{{ outcomes[e.outcome] || e.outcome }}</strong><span class="muted small">{{ fmtDate(e.createdAt) }} · {{ e.actor }}</span></header><p class="note">{{ e.note }}</p><div class="history-meta"><span v-if="e.orderNo">Замовлення № {{ e.orderNo }}</span><span v-if="e.invoiceId">Рахунок № {{ e.invoiceNo || e.invoiceId }}</span><span v-if="e.pickupDate">Отримання: {{ fmtDate(e.pickupDate) }}</span><span v-if="e.nextContactDate">Наступний контакт: {{ fmtDate(e.nextContactDate) }}</span></div></article></div>
       <nav class="pagination" aria-label="Сторінки історії"><button :disabled="saving || !historyPage" @click="history(-1)">Новіші</button><span>{{ historyPage + 1 }}</span><button :disabled="saving || !detail.hasMore" @click="history(1)">Старіші</button></nav>
      </section>
     </div>
    </section>
    <div v-else class="card-placeholder"><span class="eyebrow">Картка клієнта</span><h2>Оберіть клієнта зі списку</h2><p>Тут будуть контакт, замовлення, рахунки та історія домовленостей.</p></div>
   </div>
  </div>
  </div>
 </section>
</template>
<style scoped>
.settlement-filter{grid-column:1/-1}.settlement-flags{display:flex;gap:5px;flex-wrap:wrap;font-size:11px;margin:6px 0}.settlement-flags span{background:#edf4f6;border-radius:5px;padding:4px 6px}
.order-open{border-color:#81a9ad!important}.order-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.inline-issue{margin-top:12px}.inline-issue :deep(.issue-panel){margin-bottom:0}.order-pickup{margin-bottom:0!important}.order-pickup summary{min-height:44px;align-content:center;font-size:12px}.order-pickup :deep(.pickup){margin-bottom:0}.order-actions button{min-height:44px}@media(max-width:700px){.order-actions>.primary{flex:1}.order-row{padding:10px}}

.crm{--line:#dce4e9;--muted:#62717d;--accent:#185c63;padding:24px;max-width:1440px;margin:auto;color:#233442;box-sizing:border-box}.crm *{box-sizing:border-box}.page-heading,.card-heading{display:flex;justify-content:space-between;gap:16px;align-items:center}.page-heading{margin-bottom:20px}h1{font-size:26px;margin:3px 0}h2{font-size:21px;margin:4px 0 8px;overflow-wrap:anywhere}h3{font-size:17px;margin:0 0 14px}h4{margin:0 0 10px}.eyebrow{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700}.muted{color:var(--muted)}.small{font-size:12px}p{line-height:1.5;margin:8px 0}button,input,select,textarea{font:inherit;border:1px solid #bdccd4;border-radius:8px;padding:9px 11px;max-width:100%;min-width:0}button{min-height:40px;background:#fff;color:inherit;cursor:pointer;font-size:13px;font-weight:600}button:disabled{opacity:.5;cursor:default}button:hover:not(:disabled){background:#eef5f6}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid #79bbc4;outline-offset:2px}.primary{background:var(--accent);border-color:var(--accent);color:white}.primary:hover:not(:disabled){background:#12474c}.secondary{background:#f2f6f8}input,select,textarea{width:100%;background:#fff;min-height:40px}textarea{resize:vertical;min-height:82px;max-height:300px}label{display:grid;gap:5px;font-size:12px;font-weight:600}.segment{display:flex;gap:4px;flex-wrap:wrap;background:#edf2f5;padding:5px;border-radius:10px;width:fit-content;margin-bottom:14px}.segment button,.card-nav button{border-color:transparent;background:transparent}.segment .active{background:#fff;box-shadow:0 1px 3px #1e344214;color:var(--accent)}.filters{display:grid;grid-template-columns:minmax(180px,1fr) minmax(170px,260px) auto;align-items:end;gap:12px}.filter-options{grid-column:1/-1;display:flex;gap:20px;flex-wrap:wrap}.check{display:flex;gap:7px;align-items:center;font-weight:400}.check input{width:16px;min-height:16px;height:16px;margin:0;accent-color:var(--accent)}.filter-description{font-size:12px;margin:10px 0 16px}.workspace{display:grid;grid-template-columns:minmax(280px,350px) minmax(0,1fr);gap:18px;align-items:start}.list-pane,.customer-card{border:1px solid var(--line);border-radius:12px;background:white;min-width:0;overflow:hidden}.list-heading{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:#f7f9fa;font-size:12px;border-bottom:1px solid var(--line)}.client-list{max-height:72vh;overflow-y:auto;overscroll-behavior:contain}.client-row{padding:12px 16px;border-bottom:1px solid var(--line);border-left:3px solid transparent;overflow-wrap:anywhere}.client-row.chosen{background:#edf7f7;border-left-color:var(--accent)}.client-name{display:block;text-align:left;padding:0;min-height:30px;font-size:15px;border:0;background:none;width:100%;overflow-wrap:anywhere}.client-meta{display:flex;gap:8px;align-items:center;font-size:12px;color:var(--muted);margin:2px 0 5px}.phone{display:inline-flex;align-items:center;min-height:32px;font-size:14px;color:var(--accent);text-decoration:none;font-weight:600}.counts{display:flex;gap:8px;flex-wrap:wrap;font-size:11px;margin:7px 0}.counts>span{background:#f0f3f5;border-radius:5px;padding:4px 7px}.counts b{margin-left:4px}.counts .ready{background:#e2f0e8;color:#24593d}.badge{font-size:11px;background:#e8edf8;color:#41568a;border-radius:5px;padding:4px 7px}.next-contact{font-size:12px;color:var(--accent);font-weight:600}.attention{color:#946015}.last-contact{font-size:11px;color:var(--muted)}.note-preview{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:3px}.text-button{padding:2px 0;min-height:30px;color:var(--accent);border:0;background:none;font-size:12px}.pagination{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:12px 16px;font-size:12px}.card-heading{padding:18px 20px 10px;align-items:start}.card-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.card-actions button{font-size:12px}.card-summary{padding:0 20px 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12px}.unsaved{color:#946015;font-weight:600}.finance-action{padding:0 20px 14px}.finance-action:empty{display:none}.card-nav{display:flex;gap:2px;padding:0 14px;border-bottom:1px solid var(--line);overflow:auto}.card-nav button{white-space:nowrap;border-radius:0;min-height:44px;border-bottom:3px solid transparent}.card-nav .active{border-bottom-color:var(--accent);color:var(--accent);background:#f0f8f8}.card-content{padding:20px}.form-pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}.contact-form>label{margin-top:12px}.save-row{display:flex;gap:12px;align-items:center;margin-top:14px}.save-row .primary{flex-shrink:0}details{margin:14px 0;border-top:1px solid var(--line);padding-top:12px}summary{font-size:13px;cursor:pointer;font-weight:600;line-height:1.5}details .form-pair{margin-top:12px}.help{color:var(--muted);font-size:12px}.help button{margin-top:5px}.order-row{border:1px solid var(--line);border-radius:9px;margin:10px 0;padding:12px}.order-row>header{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px}.order-row>header>button{margin-left:auto;font-size:12px}.product-row{display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:12px;padding:9px 0;border-bottom:1px solid #eef1f3}.product-row:last-child{border:0}.product-row>span:last-child{grid-column:1/-1}.pickup-block{padding:12px;background:#f3f8f5;border-radius:9px}.invoice-row{display:flex;gap:12px;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--line);font-size:13px}.invoice-row p{font-size:12px;margin-bottom:0}.history-entry{border-left:2px solid #bad6d9;padding:0 0 20px 15px;margin-left:4px;overflow-wrap:anywhere}.history-entry header{display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap;font-size:13px}.note{white-space:pre-wrap;font-size:13px}.history-meta{display:flex;gap:8px;flex-wrap:wrap;color:var(--muted);font-size:11px}.card-placeholder{border:1px dashed #c7d6dc;border-radius:12px;text-align:center;padding:70px 25px;color:var(--muted);background:#fafcfd}.card-placeholder h2{font-size:19px}.card-placeholder p{font-size:13px}.empty{padding:16px;color:var(--muted);font-size:13px}.feedback{padding:10px 14px;border-radius:8px;font-size:13px;margin:10px 0}.error{color:#912b31;background:#fff1f1}.success{color:#276039;background:#edf7ef}
@media(min-width:1100px){.customer-card{position:sticky;top:16px;scroll-margin-top:16px}}
@media(max-width:900px){.crm{padding:16px}.workspace{grid-template-columns:minmax(245px,300px) minmax(0,1fr);gap:12px}.card-heading{flex-direction:column}.card-actions{justify-content:flex-start}.card-content{padding:16px}.form-pair{grid-template-columns:1fr}.card-nav{padding:0 8px}.card-nav button{font-size:12px;padding:9px 8px}}
@media(max-width:700px){.crm{padding:12px}.page-heading{align-items:start;margin-bottom:14px}.page-heading h1{font-size:22px}.page-heading>button{max-width:48%;font-size:12px}.workspace{display:block}.card-placeholder{display:none}.client-list{max-height:none;overflow:visible}.has-selection .list-pane,.has-selection .board-controls{display:none}.filters{grid-template-columns:1fr auto;gap:10px}.search-field{grid-column:1/-1}.branch-field{min-width:0}.filter-options{gap:8px;flex-direction:column}.segment{width:100%;flex-wrap:nowrap}.segment button{flex:1;padding:8px 6px;font-size:12px}.customer-card{border-radius:10px}.card-heading{padding:14px}.card-summary,.finance-action{padding-left:14px;padding-right:14px}.form-pair{grid-template-columns:1fr 1fr}.save-row{align-items:start;flex-direction:column}.save-row .primary{width:100%}input,select,textarea{font-size:16px}button,.phone,.client-name,.text-button,summary{min-height:44px}summary{padding-top:8px;padding-bottom:8px}.check{min-height:36px}.client-row{padding:10px 14px}.card-nav button{font-size:12px}.history-entry header{flex-direction:column}.invoice-row{align-items:start}.invoice-row button{max-width:45%}.customer-card h2{font-size:20px}}
@media(max-width:380px){.form-pair{grid-template-columns:1fr}.card-actions{width:100%}.card-actions button{flex:1}}
.customer-card,.card-content,.order-row,.inline-issue{min-width:0;overflow-wrap:anywhere}.finance-action button{white-space:normal;max-width:100%;box-sizing:border-box}@media(max-width:700px){.card-content{padding:10px}.order-row{padding:8px}.order-actions{display:grid;gap:6px}.order-actions button,.finance-action button{width:100%;white-space:normal}.card-nav{display:grid;grid-template-columns:1fr 1fr;overflow:visible}.card-nav button{white-space:normal}.inline-issue :deep(.issue-panel){padding:8px;margin-top:10px}}
</style>
