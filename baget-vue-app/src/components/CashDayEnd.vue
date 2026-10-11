<script setup>
import { onMounted, ref } from 'vue'
import { cashApi } from '../services/cash.js'
import CashReconciliation from './CashReconciliation.vue'
const props = defineProps({ session: { type: Object, required: true } })
const data = ref(null), day = ref(''), busy = ref(false), error = ref(''), selected = ref(null)
const labels = { NONE: 'Не підтверджено', CONFIRMED: 'Підтверджено', DIFFERENCE: 'Є розбіжність', STALE: 'Потрібна повторна звірка', NOT_INITIALIZED: 'Не встановлено початковий залишок' }
const money = value => Number(value || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
async function load() {
 if (busy.value) return
 busy.value = true; error.value = ''; data.value = null
 try { data.value = await cashApi(props.session.token, '/day-end' + (day.value ? '?day=' + encodeURIComponent(day.value) : '')); day.value = data.value.day }
 catch (e) { error.value = e.message } finally { busy.value = false }
}
function changeDay() { selected.value = null; load() }
onMounted(load)
</script>
<template><section class="day-end"><header><h2>Підсумки дня</h2><button :disabled="busy" @click="load">Оновити</button></header><p>Підтвердження готівки за доступними касами. Банківські рахунки та кошти в дорозі не потребують перерахунку готівки.</p><label>День за київським часом<input v-model="day" type="date" :max="data?.today" :disabled="busy" @change="changeDay"></label><p v-if="error" role="alert">{{ error }}</p><p v-if="busy">Завантаження…</p><template v-if="data"><p>Стан на момент завантаження. Після нових операцій натисніть «Оновити».</p><p v-if="!data.rows.length">Доступних кас немає.</p><div class="cards"><article v-for="a in data.rows" :key="a.id"><h3>{{ a.name }}</h3><small>{{ a.branchName }}</small><p :class="{ warning: a.status !== 'CONFIRMED' }"><strong>{{ labels[a.status] }}</strong></p><p>За обліком: {{ money(a.expected) }} грн</p><template v-if="a.confirmationId"><p>Підтверджено: {{ a.actor }} · {{ String(a.confirmedAt).replace('T', ' ') }}</p><p>На момент звірки: {{ money(a.confirmedExpected) }} грн · Фактично: {{ money(a.actual) }} грн</p><p>Різниця: {{ money(a.difference) }} грн</p><p>{{ a.note }}</p></template><button v-if="a.status !== 'NOT_INITIALIZED'" @click="selected = a">Підсумок та історія</button></article></div><CashReconciliation v-if="selected" :key="selected.id + ':' + data.day" :account="selected" :session="session" :initial-day="data.day" end-of-day @saved="load" /></template></section></template>
<style scoped>.day-end{display:grid;gap:12px;min-width:0}.day-end header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.day-end h2,.day-end h3{margin:0}.day-end label{display:grid;gap:6px;max-width:260px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px}.cards article{padding:14px;border:1px solid #d8e3e8;border-radius:10px;min-width:0;overflow-wrap:anywhere}.day-end p{line-height:1.5}.warning{background:#fff4d6;padding:10px;border-radius:8px}</style>
