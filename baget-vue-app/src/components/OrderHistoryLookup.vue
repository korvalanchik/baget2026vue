<script setup>
import { ref } from 'vue'
import { orderHistory } from '../services/orderHistory.js'
import { phoneLink, orderStates } from '../calculation/crm.js'
import OrderHistory from './OrderHistory.vue'
const props = defineProps({ session: { type: Object, required: true }, disabled: Boolean })
const emit = defineEmits(['open'])
const query = ref(''), searched = ref(''), rows = ref([]), busy = ref(false), error = ref(''), page = ref(0), more = ref(false), visible = ref(false)
async function search(reset = true) {
 if (busy.value || props.disabled) return
 const q = reset ? query.value.trim() : searched.value
 if (q.length < 2) { error.value = 'Введіть щонайменше 2 символи.'; return }
 if (reset) page.value = 0
 busy.value = true; error.value = ''; visible.value = true; searched.value = q
 try { const data = await orderHistory(props.session.token, `/search?q=${encodeURIComponent(q)}&page=${page.value}`); rows.value = data.rows; more.value = data.hasMore }
 catch (e) { error.value = e.message; rows.value = []; more.value = false } finally { busy.value = false }
}
function turn(delta) { page.value += delta; search(false) }
</script>
<template><section class="order-lookup"><div class="lookup-tools"><label>Пошук серед усіх замовлень<input v-model="query" :disabled="disabled || busy" maxlength="100" placeholder="Номер, ім’я або телефон клієнта" @keydown.enter.prevent="search()"></label><button type="button" :disabled="disabled || busy" @click="search()">Знайти</button><button v-if="visible" type="button" :disabled="busy" @click="visible=false">Сховати результати</button></div><div v-if="visible"><p v-if="busy" role="status">Пошук…</p><p v-if="error" role="alert">{{ error }}</p><p v-if="!busy && !error && !rows.length">Замовлень за цим запитом у доступних філіях немає.</p><article v-for="row in rows" :key="row.orderNo"><header><strong>№{{ row.orderNo }} · {{ row.company }}</strong><button type="button" :disabled="disabled || busy" @click="emit('open', row)">Відкрити замовлення</button></header><p>{{ row.branchName }} · {{ orderStates[row.status] || row.status }} · <a v-if="phoneLink(row.phone)" :href="phoneLink(row.phone)">{{ row.phone }}</a><span v-else>Телефон не вказано</span></p><OrderHistory :session="session" :order-no="row.orderNo" /></article><nav v-if="rows.length || page"><button type="button" :disabled="disabled || busy || !page" @click="turn(-1)">Назад</button><span>{{ page + 1 }}</span><button type="button" :disabled="disabled || busy || !more" @click="turn(1)">Далі</button></nav></div></section></template>
<style scoped>.order-lookup{padding:12px;border:1px solid #cbd9df;border-radius:9px;margin:12px 0;min-width:0}.lookup-tools{display:flex;gap:10px;align-items:end;flex-wrap:wrap}label{display:grid;gap:6px;flex:1;min-width:180px}button,input{font:inherit;min-height:44px;padding:9px;border:1px solid #b9cbd1;border-radius:7px;box-sizing:border-box;max-width:100%}input{width:100%}button{background:white;cursor:pointer}button:disabled{opacity:.5}article{border-top:1px solid #dde5ea;padding-top:12px;margin-top:12px;overflow-wrap:anywhere}header,nav{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}[role=alert]{color:#a22}@media(max-width:600px){.lookup-tools{display:grid;grid-template-columns:minmax(0,1fr)}label{min-width:0}input{font-size:16px}header{align-items:stretch;flex-direction:column}}</style>
