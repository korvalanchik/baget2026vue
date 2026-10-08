<script setup>
import { ref, watch } from 'vue'
import { cashApi } from '../services/cash.js'
const props = defineProps({ session: { type: Object, required: true }, branchNo: { type: [Number, String], default: null }, invoiceId: { type: [Number, String], default: null }, modelValue: { type: [Number, String], default: null }, disabled: Boolean })
const emit = defineEmits(['update:modelValue'])
const rows = ref([]), error = ref(''), busy = ref(false)
let generation = 0
async function load() {
 const current = ++generation; busy.value = true; error.value = ''; rows.value = []; emit('update:modelValue', null)
 try {
  if (!props.branchNo && !props.invoiceId) throw new Error('Не визначено філію приймання коштів')
  const query = props.branchNo ? `branch=${encodeURIComponent(props.branchNo)}` : `invoice=${encodeURIComponent(props.invoiceId)}`
  const data = await cashApi(props.session.token, '/payment-options?' + query)
  if (current === generation) { rows.value = data; if (!data.length) error.value = 'Немає налаштованої каси / рахунку. Адміністратор має створити їх і встановити початковий залишок.' }
 } catch (e) { if (current === generation) error.value = e.message } finally { if (current === generation) busy.value = false }
}
watch(() => [props.branchNo, props.invoiceId, props.session.token], load, { immediate: true })
</script>
<template><div class="cash-picker"><label>Куди отримано нові кошти<select :value="modelValue || ''" :disabled="disabled || busy" required @change="emit('update:modelValue', $event.target.value ? Number($event.target.value) : null)"><option value="">Оберіть касу або рахунок</option><option v-for="r in rows" :key="r.id" :value="r.id">{{ r.name }} · {{ r.kind === 'BANK' ? 'безготівково' : 'готівка' }}</option></select></label><p>Підтверджуйте лише фактично отримані кошти. Для рахунку перевірте зарахування в банку.</p><p v-if="error" role="alert">{{ error }} <button type="button" :disabled="busy || disabled" @click="load">Оновити</button></p></div></template>
<style scoped>.cash-picker{margin:12px 0}.cash-picker label{display:grid;gap:6px}.cash-picker select{font:inherit;min-height:44px;padding:9px;border:1px solid #a8bac8;border-radius:6px;max-width:100%;width:100%}.cash-picker p{font-size:13px}.cash-picker [role=alert]{color:#a22}</style>
