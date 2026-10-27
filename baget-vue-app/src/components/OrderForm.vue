<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { createOrder, loadOrderCatalog, searchCustomers } from '../services/orders.js'

const props = defineProps({ session: { type: Object, required: true } })
const initialForm = () => ({ width: '', height: '', frame: '', framePrice: '', frameWidth: '', framePartNo: '', discount: 0, quantity: 1, phone: '', customer: '', customerNo: '', address: '', note: '', dueDate: '' })
const form = reactive(initialForm())
const options = [
  { id: 'glass', label: 'Скло', dimensions: true, choices: [{ label: 'Немає' }, { label: 'Глянсове 2 мм', partNo: 27540, price: 180 }, { label: 'Антиблікове 2 мм', partNo: 27510, price: 330 }, { label: 'Акрил 2 мм', partNo: 27470, price: 260 }, { label: 'Дзеркало', partNo: 27760, price: 450 }] },
  { id: 'back', label: 'Задня стінка', dimensions: true, choices: [{ label: 'Немає' }, { label: 'ДВП 2.5 мм', partNo: 4460, price: 95 }, { label: 'ПВХ 3 мм', partNo: 27520, price: 145 }] },
  { id: 'stretcher', label: 'Підрамник', dimensions: true, choices: [{ label: 'Немає' }, { label: 'Тонкий', partNo: 28060, price: 150 }, { label: 'Середній', partNo: 28020, price: 210 }, { label: 'Широкий', partNo: 28210, price: 290 }, { label: 'Під принт', partNo: 29720, price: 180 }] },
  { id: 'mat', label: 'Паспарту', dimensions: true, choices: [{ label: 'Немає' }, { label: 'Звичайне', partNo: 5160, price: 160 }, { label: 'Металізоване', partNo: 28010, price: 235 }, { label: 'Овальне', partNo: 29500, price: 290 }] },
  { id: 'work', label: 'Виріб', dimensions: true, choices: [{ label: 'Немає' }, { label: 'Принт', partNo: 28330, price: 180 }, { label: 'Полотно с.з.', partNo: 27980, price: 230 }, { label: 'Полотно д.з.', partNo: 27970, price: 260 }, { label: 'Аракал', partNo: 31710, price: 190 }] },
  { id: 'stretch', label: 'Натяжка', dimensions: true, choices: [{ label: 'Немає' }, { label: 'На підрамник', partNo: 5140, price: 140 }, { label: 'На площину', partNo: 5130, price: 120 }] },
  { id: 'installation', label: 'Інсталяція', choices: [{ label: 'Немає' }, { label: 'Годинник', partNo: 33230, price: 90 }, { label: 'Кіот, короб', partNo: 29780, price: 350 }] },
  { id: 'hanger', label: 'Вид підвісу', choices: [{ label: 'Немає' }, { label: 'Шнурок', partNo: 14460, price: 45, multiplier: 2 }, { label: 'Крокодил', partNo: 14450, price: 55 }, { label: 'Посилений', partNo: 14260, price: 110, multiplier: 2 }, { label: 'Силовий', partNo: 29650, price: 140, multiplier: 2 }, { label: 'Лапка', partNo: 23080, price: 70 }] },
  { id: 'delivery', label: 'Доставка', choices: [{ label: 'Немає' }, { label: 'Доставка авто', partNo: 33240, price: 180 }, { label: 'Нова пошта', partNo: 33250, price: 120 }] },
]
const selections = reactive(Object.fromEntries(options.map((group) => [group.id, 0])))
const profiles = ref([])
const accessoryPrices = ref({})
const customers = ref([])
const isLoadingCatalog = ref(true)
const isSubmitting = ref(false)
const message = ref('')
const messageType = ref('')
let searchTimer
let customerSearchRequestId = 0
const money = new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const currentQuantity = computed(() => Math.max(Number(form.quantity) || 1, 1))
const frameCost = computed(() => { const perimeter = (Number(form.width) + Number(form.height)) * 2 / 1000; return perimeter > 0 ? perimeter * Number(form.framePrice || 0) : 0 })
const priceOf = (choice) => Number(accessoryPrices.value[choice.partNo] ?? choice.price ?? 0)
const extrasCost = computed(() => options.reduce((sum, group) => sum + priceOf(group.choices[selections[group.id]]), 0))
const subtotal = computed(() => frameCost.value + extrasCost.value)
const discountAmount = computed(() => subtotal.value * Math.min(Math.max(Number(form.discount) || 0, 0), 100) / 100)
const total = computed(() => (subtotal.value - discountAmount.value) * currentQuantity.value)
const formatted = (value) => `${money.format(value)} ₴`

async function loadCatalog() {
  isLoadingCatalog.value = true
  try {
    const catalog = await loadOrderCatalog(props.session.token)
    profiles.value = catalog.profileParts || []
    accessoryPrices.value = Object.fromEntries((catalog.accessoryParts || []).map((part) => [part.partNo, part.listPrice]))
  } catch (error) { showMessage(error.message, 'error') } finally { isLoadingCatalog.value = false }
}
function showMessage(text, type) { message.value = text; messageType.value = type }
function onFrameInput() {
  const profile = profiles.value.find((item) => item.description === form.frame)
  Object.assign(form, profile ? { framePrice: profile.listPrice, frameWidth: profile.profilWidth, framePartNo: profile.partNo } : { framePrice: '', frameWidth: '', framePartNo: '' })
}
function selectCustomer(customer) {
  if (!customer) return
  customerSearchRequestId += 1
  clearTimeout(searchTimer)
  Object.assign(form, {
    phone: customer.mobile || customer.phone || '',
    customer: customer.company || '',
    address: customer.addr1 || '',
    note: customer.comment || '',
    customerNo: customer.custNo || '',
  })
  customers.value = []
}
function searchCustomerInput() {
  form.customerNo = ''
  clearTimeout(searchTimer)
  const query = form.phone.trim()
  const requestId = ++customerSearchRequestId
  if (query.length < 2) { customers.value = []; return }
  searchTimer = setTimeout(async () => {
    try {
      const results = await searchCustomers(props.session.token, query)
      if (requestId === customerSearchRequestId) customers.value = results
    } catch {
      if (requestId === customerSearchRequestId) customers.value = []
    }
  }, 350)
}
function buildItems() {
  const width = Number(form.width) / 1000
  const height = Number(form.height) / 1000
  const discount = Number(form.discount) || 0
  const items = [{ partNo: Number(form.framePartNo), estimationWidth: width, estimationHeight: height, sellPrice: Number(form.framePrice), profilWidth: Number(form.frameWidth) / 1000, quantity: currentQuantity.value, discount }]
  options.forEach((group) => {
    const choice = group.choices[selections[group.id]]
    if (!choice.partNo) return
    const item = { partNo: choice.partNo, sellPrice: priceOf(choice), quantity: currentQuantity.value * (choice.multiplier || 1), discount }
    if (group.dimensions) Object.assign(item, { estimationWidth: width, estimationHeight: height })
    items.push(item)
  })
  if (items.length) items.push({ partNo: 33720, sellPrice: 1, quantity: 1 })
  return items
}
async function submit() {
  if (!form.width || !form.height || !form.framePartNo) { showMessage('Вкажіть розмір та оберіть багет із каталогу.', 'error'); return }
  if (Boolean(form.phone.trim()) !== Boolean(form.customer.trim())) { showMessage('Ім’я та телефон замовника потрібно заповнити разом.', 'error'); return }
  isSubmitting.value = true
  showMessage('', '')
  try {
    const saved = await createOrder(props.session.token, { branchName: props.session.branch.name, custNo: form.customerNo, phone: form.phone.trim(), company: form.customer.trim(), addr1: form.address.trim(), notice: form.note.trim(), itemsTotal: total.value, statusOrder: '1', items: buildItems() })
    showMessage(`Замовлення №${saved.orderNo} успішно оформлено.`, 'success')
    resetForm(false)
  } catch (error) { showMessage(error.message, 'error') } finally { isSubmitting.value = false }
}
function resetForm(clearMessage = true) {
  Object.assign(form, initialForm())
  Object.keys(selections).forEach((key) => { selections[key] = 0 })
  clearTimeout(searchTimer)
  customerSearchRequestId += 1
  customers.value = []
  if (clearMessage) showMessage('', '')
}
onMounted(loadCatalog)
onBeforeUnmount(() => clearTimeout(searchTimer))
</script>

<template>
  <section class="order-page">
    <header class="page-head order-head"><div><div class="crumb">Замовлення <span>/</span> Нове замовлення</div><h1>Нове замовлення</h1><p>Розрахуйте вартість та оформіть замовлення для клієнта</p></div><div class="draft-status"><i></i> Дані захищені активною сесією</div></header>
    <form class="order-layout" @submit.prevent="submit">
      <div class="form-main">
        <section class="form-card"><div class="card-heading"><div class="heading-icon">▣</div><div><h2>Параметри рами</h2><p>Вкажіть розмір виробу та оберіть багет із каталогу</p></div></div><p v-if="isLoadingCatalog" class="catalog-status">Завантажуємо каталог багетів…</p><div class="fields frame-fields"><label>Ширина, мм<input v-model="form.width" type="number" min="1" placeholder="Наприклад, 600"></label><label>Висота, мм<input v-model="form.height" type="number" min="1" placeholder="Наприклад, 800"></label><label class="field-wide">Код багета<input v-model="form.frame" list="frame-catalog" :disabled="isLoadingCatalog" placeholder="Почніть вводити код або назву" @input="onFrameInput"><datalist id="frame-catalog"><option v-for="profile in profiles" :key="profile.partNo" :value="profile.description"></option></datalist></label><label>Ціна багета, ₴/м<input v-model="form.framePrice" type="number" readonly placeholder="Обирається з каталогу"></label><label>Ширина багета, мм<input v-model="form.frameWidth" type="number" readonly placeholder="Обирається з каталогу"></label></div></section>
        <section class="form-card options-card"><div class="card-heading"><div class="heading-icon sand">✦</div><div><h2>Комплектація</h2><p>Ціни додаткових матеріалів завантажуються з каталогу</p></div></div><div class="option-list"><div v-for="group in options" :key="group.id" class="option-row"><span>{{ group.label }}</span><div class="option-buttons"><button v-for="(choice, index) in group.choices" :key="choice.label" type="button" :disabled="isLoadingCatalog" :class="{ selected: selections[group.id] === index }" @click="selections[group.id] = index">{{ choice.label }}</button></div></div></div></section>
        <section class="form-card"><div class="card-heading"><div class="heading-icon green-icon">♙</div><div><h2>Дані клієнта</h2><p>Шукайте клієнта за телефоном, ім’ям або назвою компанії</p></div></div><div class="fields customer-fields"><label>Філія<input :value="props.session.branch.name" readonly></label><div class="customer-search-field"><label for="customer-phone-search">Телефон або ім’я / компанія<input id="customer-phone-search" v-model="form.phone" type="text" autocomplete="off" placeholder="Телефон, ім’я чи назва компанії" @input="searchCustomerInput"></label><div v-if="customers.length" class="customer-search-results"><button v-for="customer in customers" :key="customer.custNo" type="button" @pointerdown.prevent="selectCustomer(customer)"><strong>{{ customer.company || customer.contact || ('Клієнт №' + customer.custNo) }}</strong><span>{{ [customer.contact, customer.mobile || customer.phone, customer.addr1].filter(Boolean).join(' · ') }}</span></button></div></div><label>Ім’я замовника<input v-model="form.customer" placeholder="Ім’я та прізвище"></label><label>Адреса<input v-model="form.address" placeholder="Місто, вулиця, будинок"></label><label>Бажана дата готовності<input v-model="form.dueDate" type="date"></label><label class="field-wide">Примітка<textarea v-model="form.note" placeholder="Особливі побажання клієнта, опис роботи…"></textarea></label></div></section>
      </div>
      <aside class="summary-panel"><section class="summary-card"><div class="summary-title"><h2>Підсумок замовлення</h2><span>Нове</span></div><div class="summary-size"><span>Розмір виробу</span><strong>{{ form.width || '—' }} × {{ form.height || '—' }} мм</strong></div><div class="summary-line"><span>Багет</span><strong>{{ formatted(frameCost) }}</strong></div><div class="summary-line"><span>Додаткові послуги</span><strong>{{ formatted(extrasCost) }}</strong></div><div class="summary-line discount-line"><span>Знижка, %</span><input v-model="form.discount" type="number" min="0" max="100"></div><div class="summary-line"><span>Кількість</span><input v-model="form.quantity" type="number" min="1"></div><div class="total"><span>До сплати</span><strong>{{ formatted(total) }}</strong><small>з урахуванням знижки</small></div><button class="submit-order" type="submit" :disabled="isSubmitting || isLoadingCatalog">{{ isSubmitting ? 'Оформлюємо…' : 'Оформити замовлення' }} <span>→</span></button><button class="clear-form" type="button" :disabled="isSubmitting" @click="resetForm()">Очистити форму</button><p v-if="message" class="form-message" :class="{ success: messageType === 'success' }">{{ message }}</p></section><section class="tip-card"><span>✦</span><p><strong>Активна філія</strong> {{ props.session.branch.name }}. Замовлення буде оформлено саме для неї.</p></section></aside>
    </form>
  </section>
</template>
