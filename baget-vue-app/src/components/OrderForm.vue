<script setup>
import { computed, reactive, ref } from 'vue'

const form = reactive({ width: '', height: '', frame: '', framePrice: '', frameWidth: '', discount: 0, quantity: 1, branch: 'Центральна майстерня', phone: '', customer: '', address: '', note: '', dueDate: '' })
const options = [
  { id: 'glass', label: 'Скло', choices: [['Немає', 0], ['Глянсове 2 мм', 180], ['Антиблікове 2 мм', 330], ['Акрил 2 мм', 260], ['Дзеркало', 450]] },
  { id: 'back', label: 'Задня стінка', choices: [['Немає', 0], ['ДВП 2.5 мм', 95], ['ПВХ 3 мм', 145]] },
  { id: 'stretcher', label: 'Підрамник', choices: [['Немає', 0], ['Тонкий', 150], ['Середній', 210], ['Широкий', 290], ['Під принт', 180]] },
  { id: 'mat', label: 'Паспарту', choices: [['Немає', 0], ['Звичайне', 160], ['Металізоване', 235], ['Овальне', 290]] },
  { id: 'work', label: 'Виріб', choices: [['Немає', 0], ['Принт', 180], ['Полотно с.з.', 230], ['Полотно д.з.', 260], ['Аракал', 190]] },
  { id: 'stretch', label: 'Натяжка', choices: [['Немає', 0], ['На підрамник', 140], ['На площину', 120]] },
  { id: 'installation', label: 'Інсталяція', choices: [['Немає', 0], ['Годинник', 90], ['Кіот, короб', 350]] },
  { id: 'hanger', label: 'Вид підвісу', choices: [['Немає', 0], ['Шнурок', 45], ['Крокодил', 55], ['Посилений', 110], ['Силовий', 140], ['Лапка', 70]] },
  { id: 'delivery', label: 'Доставка', choices: [['Немає', 0], ['Автодоставка', 180], ['Нова пошта', 120]] },
]
const selections = reactive(Object.fromEntries(options.map((group) => [group.id, 0])))
const message = ref('')
const money = new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const frameCost = computed(() => { const perimeter = (Number(form.width) + Number(form.height)) * 2 / 1000; return perimeter > 0 ? perimeter * Number(form.framePrice || 0) : 0 })
const extrasCost = computed(() => options.reduce((sum, group) => sum + group.choices[selections[group.id]][1], 0))
const subtotal = computed(() => frameCost.value + extrasCost.value)
const discountAmount = computed(() => subtotal.value * Math.min(Math.max(Number(form.discount) || 0, 0), 100) / 100)
const total = computed(() => (subtotal.value - discountAmount.value) * Math.max(Number(form.quantity) || 1, 1))
const formatted = (value) => `${money.format(value)} ₴`
function resetForm() { Object.assign(form, { width: '', height: '', frame: '', framePrice: '', frameWidth: '', discount: 0, quantity: 1, branch: 'Центральна майстерня', phone: '', customer: '', address: '', note: '', dueDate: '' }); Object.keys(selections).forEach((key) => { selections[key] = 0 }); message.value = '' }
function submit() { if (!form.width || !form.height || !form.frame) { message.value = 'Заповніть ширину, висоту та код багета.'; return }; message.value = 'Замовлення підготовлено до збереження. Підключення до API додамо наступним кроком.' }
</script>

<template>
  <section class="order-page">
    <header class="page-head order-head"><div><div class="crumb">Замовлення <span>/</span> Нове замовлення</div><h1>Нове замовлення</h1><p>Розрахуйте вартість та оформіть замовлення для клієнта</p></div><div class="draft-status"><i></i> Чернетка зберігається автоматично</div></header>
    <form class="order-layout" @submit.prevent="submit">
      <div class="form-main">
        <section class="form-card"><div class="card-heading"><div class="heading-icon">▣</div><div><h2>Параметри рами</h2><p>Вкажіть розмір виробу та оберіть багет</p></div></div><div class="fields frame-fields"><label>Ширина, мм<input v-model="form.width" type="number" min="1" placeholder="Наприклад, 600"></label><label>Висота, мм<input v-model="form.height" type="number" min="1" placeholder="Наприклад, 800"></label><label class="field-wide">Код багета<input v-model="form.frame" placeholder="Наприклад, 1023-45"></label><label>Ціна багета, ₴/м<input v-model="form.framePrice" type="number" min="0" placeholder="0.00"></label><label>Ширина багета, мм<input v-model="form.frameWidth" type="number" min="0" placeholder="0"></label></div></section>
        <section class="form-card options-card"><div class="card-heading"><div class="heading-icon sand">✦</div><div><h2>Комплектація</h2><p>Оберіть додаткові матеріали та послуги</p></div></div><div class="option-list"><div v-for="group in options" :key="group.id" class="option-row"><span>{{ group.label }}</span><div class="option-buttons"><button v-for="(choice, index) in group.choices" :key="choice[0]" type="button" :class="{ selected: selections[group.id] === index }" @click="selections[group.id] = index">{{ choice[0] }}</button></div></div></div></section>
        <section class="form-card"><div class="card-heading"><div class="heading-icon green-icon">♙</div><div><h2>Дані клієнта</h2><p>Контактна інформація для оформлення</p></div></div><div class="fields customer-fields"><label>Філія<input v-model="form.branch" placeholder="Оберіть філію"></label><label>Телефон замовника<input v-model="form.phone" type="tel" placeholder="099 123 45 67"></label><label>Ім’я замовника<input v-model="form.customer" placeholder="Ім’я та прізвище"></label><label>Адреса<input v-model="form.address" placeholder="Місто, вулиця, будинок"></label><label>Бажана дата готовності<input v-model="form.dueDate" type="date"></label><label class="field-wide">Примітка<textarea v-model="form.note" placeholder="Особливі побажання клієнта, опис роботи…"></textarea></label></div></section>
      </div>
      <aside class="summary-panel"><section class="summary-card"><div class="summary-title"><h2>Підсумок замовлення</h2><span>Чернетка</span></div><div class="summary-size"><span>Розмір виробу</span><strong>{{ form.width || '—' }} × {{ form.height || '—' }} мм</strong></div><div class="summary-line"><span>Багет</span><strong>{{ formatted(frameCost) }}</strong></div><div class="summary-line"><span>Додаткові послуги</span><strong>{{ formatted(extrasCost) }}</strong></div><div class="summary-line discount-line"><span>Знижка, %</span><input v-model="form.discount" type="number" min="0" max="100"></div><div class="summary-line"><span>Кількість</span><input v-model="form.quantity" type="number" min="1"></div><div class="total"><span>До сплати</span><strong>{{ formatted(total) }}</strong><small>з урахуванням знижки</small></div><button class="submit-order" type="submit">Оформити замовлення <span>→</span></button><button class="clear-form" type="button" @click="resetForm">Очистити форму</button><p v-if="message" class="form-message" :class="{ success: message.startsWith('Замовлення') }">{{ message }}</p></section><section class="tip-card"><span>✦</span><p><strong>Порада</strong> Додайте телефон клієнта, щоб надсилати повідомлення про готовність замовлення.</p></section></aside>
    </form>
  </section>
</template>
