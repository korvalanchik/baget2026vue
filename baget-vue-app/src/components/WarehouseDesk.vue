<script setup>
import { onMounted, ref } from 'vue'
import ProductTracking from './ProductTracking.vue'
import { warehouse, locations } from '../services/warehouse.js'
const props = defineProps({ session: { type: Object, required: true } })
const rows = ref([]), token = ref(''), busy = ref(false), error = ref(''), page = ref(0)
async function load(n = page.value) { if (busy.value) return; busy.value = true; error.value = ''; try { rows.value = await warehouse(props.session.token, `/products?page=${n}`); page.value = n } catch (e) { error.value = e.message } finally { busy.value = false } }
onMounted(() => load())
</script>
<template><section class="warehouse"><h1>Готові вироби</h1><p>Завершені вироби дозволених філій. Передачу завершує підтвердження приймання.</p><button :disabled="busy" @click="load()">Оновити</button><p v-if="error" role="alert">{{ error }}</p><div class="table"><table><thead><tr><th>Замовлення / виріб</th><th>Філія</th><th>Місце</th><th>Очікує приймання</th></tr></thead><tbody><tr v-for="p in rows" :key="p.trackingId"><td><button @click="token = p.trackingId">{{ p.orderNo }} · {{ p.productName }}</button></td><td>{{ p.branchName }}</td><td>{{ locations[p.location] }}</td><td>{{ locations[p.pending] || '—' }}</td></tr></tbody></table></div><p v-if="!rows.length">Виробів на цій сторінці немає.</p><button :disabled="busy || !page" @click="load(page - 1)">Назад</button><span> {{ page + 1 }} </span><button :disabled="busy || rows.length < 100" @click="load(page + 1)">Далі</button><ProductTracking v-if="token" :key="token" :session="session" :initial-token="token" /></section></template>
<style scoped>.warehouse{padding:24px}.table{overflow:auto;margin:15px 0}table{width:100%;border-collapse:collapse}td,th{padding:10px;text-align:left;border-bottom:1px solid #ddd}button{padding:9px;cursor:pointer}[role=alert]{color:#a22}</style>
