<script setup>
import { computed, reactive, ref } from 'vue'
import { addAdvance, loadCustomerFinance, payInvoice } from '../services/customers.js'

import CrmDesk from './CrmDesk.vue'

const props = defineProps({ session: { type: Object, required: true } })
const view = ref('board')
const finance = ref(null)
const selected = ref(null)
const loading = ref(false)
const error = ref('')
const notice = ref('')
const payment = reactive({ invoice: null, amount: '', note: '', useAdvance: true })
const advance = reactive({ amount: '', note: '' })
const modal = ref('')
const money = new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH', minimumFractionDigits: 2 })
const formatMoney = (value) => money.format(Number(value || 0))
const formatDate = (value) => value ? new Date(value).toLocaleDateString('uk-UA') : '—'
const customerId = (customer) => customer?.customerId || customer?.custNo || customer?.id
const availableAdvance = computed(() => Number(finance.value?.availableAdvance || 0))
const selectedDebt = computed(() => Number(payment.invoice?.debt || 0))
const advanceUsed = computed(() => payment.useAdvance ? Math.min(availableAdvance.value, selectedDebt.value) : 0)
const totalPayment = computed(() => advanceUsed.value + Number(payment.amount || 0))

async function openCustomer(customer) {
  loading.value = true; error.value = ''; selected.value = customer
  try { finance.value = await loadCustomerFinance(props.session.token, customerId(customer)); view.value = 'finance' } catch (reason) { error.value = reason.message } finally { loading.value = false }
}
function backToBoard() { view.value = 'board'; finance.value = null; selected.value = null; error.value = '' }
function openPayment(invoice) { Object.assign(payment, { invoice, amount: Math.max(0, Number(invoice.debt || 0) - availableAdvance.value), note: '', useAdvance: true }); modal.value = 'payment' }
async function savePayment() {
  if (Number(payment.amount || 0) <= 0 && advanceUsed.value <= 0) { error.value = 'Вкажіть суму оплати або використайте аванс.'; return }
  loading.value = true; error.value = ''
  try {
    await payInvoice(props.session.token, { branchNo: selected.value?.branchNo || props.session.branch.id, invoiceId: payment.invoice.id, customerId: customerId(selected.value), amount: Number(payment.amount || 0), allocationAmount: advanceUsed.value, note: payment.note.trim() })
    modal.value = ''; notice.value = 'Оплату успішно збережено.'; await openCustomer(selected.value)
  } catch (reason) { error.value = reason.message } finally { loading.value = false }
}
async function saveAdvance() {
  if (Number(advance.amount || 0) <= 0) { error.value = 'Введіть коректну суму авансу.'; return }
  loading.value = true; error.value = ''
  try {
    await addAdvance(props.session.token, { branchNo: selected.value?.branchNo || props.session.branch.id, customerId: customerId(selected.value), amount: Number(advance.amount), note: advance.note.trim() })
    modal.value = ''; Object.assign(advance, { amount: '', note: '' }); notice.value = 'Аванс успішно зараховано.'; await openCustomer(selected.value)
  } catch (reason) { error.value = reason.message } finally { loading.value = false }
}
</script>

<template>
  <section class="customers-page">
    <CrmDesk v-show="view === 'board'" :session="session" @finance="openCustomer" />
    <p v-if="view === 'board' && error" class="form-message">{{ error }}</p>
    <template v-if="view === 'finance'">
      <header class="page-head"><div><button class="back-link" @click="backToBoard">← До клієнтів</button><h1>{{ finance?.customerName || selected?.company }}</h1><p>{{ finance?.customerPhone || selected?.mobile || 'Контакт не вказано' }}</p></div><button class="primary" @click="modal = 'advance'">＋ Прийняти аванс</button></header>
      <div class="customer-content"><p>Фінанси клієнта загалом. Нові оплати й аванси оформлюються через філію «{{ selected?.branchName || session.branch.name }}».</p><p v-if="error" class="form-message">{{ error }}</p><p v-if="notice" class="form-message success">{{ notice }}</p><section class="finance-metrics"><div><span>Баланс клієнта</span><strong :class="Number(finance?.balance) <= 0 ? 'positive' : 'negative'">{{ formatMoney(-(Number(finance?.balance || 0))) }}</strong></div><div><span>Борг за рахунками</span><strong class="negative">{{ formatMoney(finance?.totalDebt) }}</strong></div><div><span>Доступний аванс</span><strong class="positive">{{ formatMoney(finance?.availableAdvance) }}</strong></div></section>
        <section class="customer-table-card invoices"><header><div><span class="table-icon">▤</span><div><h2>Відкриті рахунки</h2><p>Оплата може бути частково закрита авансом</p></div></div></header><div class="table-wrap"><table><thead><tr><th>№ рахунку</th><th>Дата</th><th>Сума</th><th>Оплачено</th><th>Борг</th><th></th></tr></thead><tbody><tr v-for="invoice in finance?.invoices || []" :key="invoice.id"><td><strong>№ {{ invoice.invoiceNo }}</strong></td><td>{{ formatDate(invoice.createdAt) }}</td><td>{{ formatMoney(invoice.total) }}</td><td class="positive">{{ formatMoney(invoice.paid) }}</td><td class="negative">{{ formatMoney(invoice.debt) }}</td><td><button class="table-button orange-button" @click="openPayment(invoice)">Оплатити</button></td></tr><tr v-if="!finance?.invoices?.length"><td colspan="6" class="empty">Немає відкритих рахунків</td></tr></tbody></table></div></section>
        <section class="customer-table-card ledger"><header><div><span class="table-icon">↕</span><div><h2>Рух коштів</h2><p>Історія авансів та оплат клієнта</p></div></div></header><div class="table-wrap"><table><thead><tr><th>Дата</th><th>Надходження</th><th>Списання</th><th>Джерело</th><th>Коментар</th></tr></thead><tbody><tr v-for="entry in finance?.ledger || []" :key="`${entry.date}-${entry.amount}-${entry.comment}`"><td>{{ formatDate(entry.date) }}</td><td class="positive">{{ entry.direction === 'IN' ? formatMoney(entry.amount) : '—' }}</td><td class="negative">{{ entry.direction === 'OUT' ? formatMoney(entry.amount) : '—' }}</td><td>{{ entry.sourceType || '—' }}</td><td>{{ entry.comment || '—' }}</td></tr><tr v-if="!finance?.ledger?.length"><td colspan="5" class="empty">Руху коштів ще немає</td></tr></tbody></table></div></section>
      </div>
    </template>
    <div v-if="modal" class="modal-backdrop" @click.self="modal = ''"><form class="finance-modal" @submit.prevent="modal === 'payment' ? savePayment() : saveAdvance()"><header><div><h2>{{ modal === 'payment' ? `Оплата рахунку № ${payment.invoice?.invoiceNo}` : 'Прийняти аванс' }}</h2><p>{{ modal === 'payment' ? `Борг: ${formatMoney(selectedDebt)}` : 'Кошти будуть зараховані на баланс клієнта' }}</p></div><button type="button" @click="modal = ''">×</button></header><template v-if="modal === 'payment'"><div class="advance-info"><label><input v-model="payment.useAdvance" type="checkbox"> Використати доступний аванс</label><div><span>Аванс у погашення</span><strong>{{ formatMoney(advanceUsed) }}</strong></div><div><span>Нове надходження</span><strong>{{ formatMoney(payment.amount) }}</strong></div><div><span>Загальне погашення</span><strong>{{ formatMoney(totalPayment) }}</strong></div></div><label>Сума нового надходження<input v-model="payment.amount" type="number" min="0" step="0.01" required></label><label>Коментар<textarea v-model="payment.note" placeholder="Наприклад, готівка або номер платежу"></textarea></label></template><template v-else><label>Сума авансу<input v-model="advance.amount" type="number" min="0" step="0.01" required></label><label>Коментар<textarea v-model="advance.note" placeholder="Наприклад, готівка або номер платежу"></textarea></label></template><footer><button type="button" class="filter" @click="modal = ''">Скасувати</button><button class="primary" :disabled="loading">{{ loading ? 'Зберігаємо…' : 'Зберегти' }}</button></footer></form></div>
  </section>
</template>
