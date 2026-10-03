<script setup>
import { ref, watch } from 'vue'
import EnterpriseCustomerFinancePanel from './EnterpriseCustomerFinancePanel.vue'
import PartnerCustomerFinancePanel from './PartnerCustomerFinancePanel.vue'
import { partnerPayments } from '../services/partnerPayments.js'
const props = defineProps({ session: { type: Object, required: true }, customerId: { type: Number, default: null }, branchNo: { type: Number, default: null }, orderNo: { type: Number, default: null }, invoiceId: { type: Number, default: null } })
const emit = defineEmits(['paid', 'busy'])
const context = ref(null), error = ref(''), busy = ref(false)
let generation = 0
async function load() {
 const current = ++generation
 busy.value = true; context.value = null; error.value = ''; emit('busy', true)
 try {
  const query = props.orderNo ? new URLSearchParams({ order: props.orderNo }) : new URLSearchParams({ customer: props.customerId, branch: props.branchNo || props.session.branch.id })
  const result = await partnerPayments(props.session.token, `/context?${query}`)
  if (current === generation) context.value = result
 } catch (e) { if (current === generation) error.value = e.message }
 finally { if (current === generation) { busy.value = false; emit('busy', false) } }
}
watch(() => [props.customerId, props.branchNo, props.orderNo, props.session.token], load, { immediate: true })
</script>
<template>
 <p v-if="busy" role="status">Визначаємо режим обліку коштів…</p>
 <p v-else-if="error" role="alert">{{ error }} <button type="button" @click="load">Повторити</button></p>
 <PartnerCustomerFinancePanel v-else-if="context?.mode === 'RESELLER'" :key="`${context.partnerId}-${context.customerId}-${context.branchNo}-${context.contextOrder || ''}`" :session="session" :context="context" @paid="emit('paid')" @busy="emit('busy', $event)" />
 <EnterpriseCustomerFinancePanel v-else-if="context" v-bind="props" @paid="emit('paid')" @busy="emit('busy', $event)" />
</template>
