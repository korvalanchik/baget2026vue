<script setup>
import { newRequestKey } from '../services/requestKey.js'
import { ref } from 'vue'
import { crm } from '../services/crm.js'
const props = defineProps({ session: { type: Object, required: true }, customer: { type: Object, required: true }, order: { type: Object, required: true }, disabled: Boolean })
const emit = defineEmits(['saved', 'busy'])
const action = ref(''), note = ref(''), date = ref(''), busy = ref(false), error = ref('')
const labels = { NEEDS_NOTICE: 'Потрібно повідомити', NO_ANSWER: 'Не відповів', AGREED: 'Домовлено про отримання', OVERDUE: 'Дата отримання минула', NOTIFIED: 'Повідомлено' }
const places = { BRANCH: 'Філія', WAREHOUSE: 'Склад', WORKSHOP: 'Майстерня', CUSTOMER: 'Клієнт', UNKNOWN: 'Потрібно уточнити' }
const place = value => value.split(' → ').map(p => places[p] || p).join(' → ')
let retry = null
function choose(value) { action.value = value; date.value = props.order.pickupDate || ''; error.value = '' }
async function save() {
  if (busy.value || props.disabled) return
  busy.value = true; emit('busy', true); error.value = ''
  try {
    if (action.value === 'PICKUP_AGREED' && !date.value) throw new Error('Вкажіть дату отримання.')
    const body = { expectedRevision: props.order.revision, readySignature: props.order.readySignature, outcome: action.value, note: note.value.trim(), pickupDate: action.value === 'PICKUP_AGREED' ? date.value : null }
    const path = `/customers/${props.customer.customerId}/branches/${props.customer.branchNo}/orders/${props.order.orderNo}/pickup`
    const signature = JSON.stringify([path, body])
    if (!retry || retry.signature !== signature) retry = { signature, key: newRequestKey() }
    const result = await crm(props.session.token, path, { ...body, requestKey: retry.key })
    retry = null; action.value = ''; note.value = ''; emit('saved', result)
  } catch (e) { error.value = e.message } finally { busy.value = false; emit('busy', false) }
}
</script>
<template>
  <section class="pickup">
    <strong>Замовлення № {{ order.orderNo }} · {{ labels[order.pickupStatus] || order.pickupStatus }}</strong>
    <p v-if="order.needsNotice && order.pickupStatus !== 'NEEDS_NOTICE'">Потребу повідомлення про поточні готові вироби ще не закрито.</p>
    <p v-if="order.legacy">Старе замовлення: готовність і місце видачі потрібно уточнити.</p>
    <template v-else>
      <p>Готових невиданих виробів: {{ order.readyCount }}<span v-if="order.workingCount"> · Частково готове: ще в роботі {{ order.workingCount }}</span></p>
      <p v-if="order.branchReady"><strong>Можна забирати: {{ order.branchReady }} із {{ order.readyCount }} готових виробів.</strong></p>
      <p v-else>Готових виробів, доступних для отримання на філії, ще немає.</p>
      <p>{{ order.places.map(place).join(', ') }}</p>
    </template>
    <p v-if="order.pickupDate">Обіцяна дата отримання: <strong>{{ order.pickupDate.split('-').reverse().join('.') }}</strong><span v-if="order.pickupOverdue"> · Дата минула</span></p>
    <div class="buttons">
      <button :disabled="busy || disabled" @click="choose('PICKUP_NOTIFIED')">Повідомлено</button>
      <button :disabled="busy || disabled" @click="choose('PICKUP_NO_ANSWER')">Не відповів</button>
      <button :disabled="busy || disabled" @click="choose('PICKUP_AGREED')">Домовитися про отримання</button>
      <button v-if="order.pickupDate" :disabled="busy || disabled" @click="choose('PICKUP_CLEAR')">Прибрати дату отримання</button>
    </div>
    <form v-if="action" @submit.prevent="save">
      <p>{{ { PICKUP_NOTIFIED: 'Записати успішне повідомлення про поточні готові вироби', PICKUP_NO_ANSWER: 'Записати невдалу спробу зв’язку', PICKUP_AGREED: 'Записати домовленість про отримання', PICKUP_CLEAR: 'Прибрати поточну дату, зберігши попередню домовленість в історії' }[action] }}</p>
      <label v-if="action === 'PICKUP_AGREED'">Дата отримання<input v-model="date" type="date" required :disabled="busy || disabled"></label>
      <label>Коротка примітка<input v-model="note" maxlength="2000" :disabled="busy || disabled" placeholder="Необов’язково"></label>
      <button :disabled="busy || disabled">Зберегти</button><button type="button" :disabled="busy" @click="action = ''">Скасувати</button>
    </form>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.pickup{margin:12px 0;padding:12px;border-left:3px solid #81a9bd;background:#f2f7fa}.buttons{display:flex;gap:8px;flex-wrap:wrap}button,input{font:inherit;padding:7px;border:1px solid #bdccd3;border-radius:5px}button{cursor:pointer}button:disabled{opacity:.5}form{margin-top:12px}label{display:grid;gap:5px;margin:8px 0}form button{margin-right:8px}[role=alert]{color:#a22}
</style>
