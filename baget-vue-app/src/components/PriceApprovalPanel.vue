<script setup>
import { computed, ref, watch } from 'vue'
import { commercial } from '../services/commercial.js'
const props = defineProps({ session: { type: Object, required: true }, productId: { type: Number, required: true }, revision: { type: Number, default: 0 }, disabled: Boolean })
const emit = defineEmits(['changed', 'ready', 'busy'])
const data = ref(null), busy = ref(false), error = ref(''), note = ref('')
const difference = computed(() => {
 const pricing = data.value?.pricing
 if (pricing?.retail == null || pricing?.baseline == null) return null
 const baseline = Number(pricing.baseline), actual = Number(pricing.retail)
 if (!Number.isFinite(baseline) || !Number.isFinite(actual)) return null
 const amount = actual - baseline
 const signed = value => (value > 0 ? '+' : '') + value.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
 return signed(amount) + ' грн · ' + (baseline === 0 ? (amount === 0 ? '0,00%' : 'початкова ціна 0 грн') : signed(amount / baseline * 100) + '%')
})
const states = { UNMEASURED: 'Потрібно зберегти обмір', WAITING: 'Очікує погодження ціни — виготовлення заблоковано', AUTO: 'У межах 5% — виготовлення дозволено', APPROVED: 'Ціну погоджено — виготовлення дозволено', REJECTED: 'Повернуто на уточнення — виготовлення заблоковано' }
async function run(fn) { if (busy.value) return; busy.value = true; emit('busy', true); error.value = ''; try { data.value = await fn(); emit('ready', !data.value.pricing || ['AUTO', 'APPROVED'].includes(data.value.pricing.state)) } catch (e) { error.value = e.message; emit('ready', false) } finally { busy.value = false; emit('busy', false) } }
function load() { return run(() => commercial(props.session.token, `/products/${props.productId}`)) }
async function decide(approve) {
 if (props.disabled) return
 if (!note.value.trim()) { error.value = 'Запишіть результат погодження з клієнтом.'; return }
 await run(() => commercial(props.session.token, `/products/${props.productId}/decision`, { expectedRevision: data.value.pricing.revision, approve, note: note.value.trim() }))
 if (!error.value) { note.value = ''; emit('changed') }
}
watch(() => [props.productId, props.revision], load, { immediate: true })
</script>
<template><section class="price-approval"><p v-if="error" role="alert">{{ error }}</p><template v-if="data?.pricing"><h4>{{ states[data.pricing.state] }}</h4><p>Початкова роздрібна: {{ data.pricing.baseline }} грн · За обміром: {{ data.pricing.retail ?? '—' }} грн</p><p v-if="difference">Зміна ціни: {{ difference }}</p><p v-if="data.mode === 'RESELLER'">Реселлерський розрахунок: первісний {{ data.pricing.baselineReseller }} грн · за обміром {{ data.pricing.reseller ?? '—' }} грн</p><p>Рівно 5% або менше — без погодження. Збільшення й зменшення понад 5% потребують рішення менеджера.</p><template v-if="data.canApprove && ['WAITING', 'REJECTED'].includes(data.pricing.state)"><label>Результат розмови з клієнтом<textarea v-model="note" maxlength="2000" :disabled="busy || disabled"></textarea></label><button type="button" :disabled="busy || disabled" @click="decide(true)">Клієнт погодив нову ціну</button><button type="button" :disabled="busy || disabled" @click="decide(false)">Повернути на уточнення</button></template><details><summary>Історія погодження</summary><p v-for="(e, index) in data.events" :key="index">{{ e.createdAt }} · {{ e.actor }} · {{ states[e.action] || e.action }} · {{ e.note }}</p></details></template><button type="button" :disabled="busy || disabled" @click="load">Оновити перевірку ціни</button></section></template>
<style scoped>.price-approval{padding:12px;margin:12px 0;background:#f5f8fb;border:1px solid #c6d5df;border-radius:8px}label{display:grid;gap:6px}textarea,button{font:inherit;padding:8px;margin:4px;max-width:100%;box-sizing:border-box}[role=alert]{color:#b22}</style>
