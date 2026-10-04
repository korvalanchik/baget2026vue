<script setup>
import { onMounted, ref } from 'vue'
import { crm } from '../services/crm.js'
import { trackingToken } from '../calculation/tracking.js'
import { phoneLink } from '../calculation/crm.js'
import ProductQrScanner from './ProductQrScanner.vue'
import CrmIssuePanel from './CrmIssuePanel.vue'
const props = defineProps({ session: { type: Object, required: true }, initialToken: { type: String, default: '' } })
const emit = defineEmits(['issued', 'busy'])
const target = ref(null), busy = ref(false), locked = ref(false), error = ref('')
async function resolve(value) {
 if (busy.value || locked.value) return
 busy.value = true; emit('busy', true); error.value = ''; target.value = null
 try { target.value = await crm(props.session.token, '/issue-qr/' + encodeURIComponent(trackingToken(value))) }
 catch (e) { error.value = e.message }
 finally { busy.value = false; emit('busy', false) }
}
function lock(value) { locked.value = value; emit('busy', value) }
onMounted(() => { if (props.initialToken) resolve(props.initialToken) })
</script>
<template>
 <section class="qr-issue">
  <h2>Видача за QR-кодом</h2><p>Відскануйте етикетку, звірте клієнта й оплату та підтвердіть передачу.</p>
  <ProductQrScanner v-if="!target" :disabled="busy" @scan="resolve" />
  <p v-if="busy" role="status">Завантаження виробу…</p><p v-if="error" role="alert">{{ error }}</p>
  <template v-if="target">
   <p><strong>{{ target.company }}</strong> · <a v-if="phoneLink(target.mobile)" :href="phoneLink(target.mobile)">{{ target.mobile }}</a><span v-else>Телефон не вказано</span></p>
   <CrmIssuePanel :key="`${target.orderNo}-${target.productId}`" :session="session" :customer="target" :order-no="Number(target.orderNo)" :initial-product-id="Number(target.productId)" @locked="lock" @issued="emit('issued')" @close="target = null" />
   <button type="button" :disabled="locked" @click="target = null">Інше замовлення / клієнт</button>
  </template>
 </section>
</template>
<style scoped>
.qr-issue{max-width:900px;margin:auto}h2{font-size:21px}p{font-size:14px;line-height:1.5}button{min-height:44px;padding:10px;border:1px solid #b9cbd0;border-radius:7px;font:inherit}button:disabled{opacity:.5}[role=alert]{color:#922}a{color:#185c63}
</style>
