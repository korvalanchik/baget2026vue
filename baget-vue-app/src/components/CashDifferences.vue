<script setup>
import { onMounted, ref } from 'vue'
import { cashApi } from '../services/cash.js'
import CashReconciliation from './CashReconciliation.vue'
const props = defineProps({ session: { type: Object, required: true } })
const rows = ref([]), accounts = ref([]), selected = ref(null), busy = ref(false), error = ref('')
const money = value => Number(value || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
async function load() { if (busy.value) return; busy.value = true; error.value = ''; try { const [data, overview] = await Promise.all([cashApi(props.session.token, '/reconciliation-differences'), cashApi(props.session.token)]); rows.value = data; accounts.value = overview.accounts } catch (e) { rows.value = []; error.value = e.message } finally { busy.value = false } }
onMounted(load)
</script>
<template><section><header class="heading"><h2>Розбіжності кас</h2><button :disabled="busy" @click="load">Оновити</button></header><p>Остання збережена звірка кожної каси. Нові операції після звірки не змінюють її результат.</p><p v-if="error" role="alert">{{ error }}</p><p v-else-if="!busy && !rows.length">Розбіжностей у збережених звірках немає. Каси без звірки цим не підтверджені.</p><div class="cards"><article v-for="r in rows" :key="r.id"><h3>{{ r.accountName }}</h3><p>{{ r.day }} · {{ r.actor }}</p><strong>{{ Number(r.difference) < 0 ? 'Нестача' : 'Надлишок' }}: {{ money(Math.abs(Number(r.difference))) }} грн</strong><p>{{ r.note }}</p><button @click="selected = accounts.find(a => Number(a.id) === Number(r.accountId))">Відкрити звірку</button></article></div><CashReconciliation v-if="selected" :key="selected.id" :account="selected" :session="session" @saved="load" /></section></template>
<style scoped>.heading{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px}.cards article{border:1px solid #d8e3e8;border-radius:10px;padding:14px;min-width:0;overflow-wrap:anywhere}</style>
