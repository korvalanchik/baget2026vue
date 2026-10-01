<script setup>
import { ref, onMounted } from 'vue'
import { commercial } from '../services/commercial.js'
import { searchCustomers } from '../services/orders.js'
const props = defineProps({ session: { type: Object, required: true } })
const rows = ref([]), error = ref(''), busy = ref(false), query = ref(''), matches = ref([]), note = ref('')
const admin = props.session.roles?.includes('ROLE_ADMIN')
async function load() { if (!admin || busy.value) return; busy.value = true; error.value = ''; try { rows.value = await commercial(props.session.token, '/branches') } catch (e) { error.value = e.message } finally { busy.value = false } }
async function search() { try { matches.value = await searchCustomers(props.session.token, query.value) } catch (e) { error.value = e.message } }
async function save(row) {
 if (!admin || busy.value) return
 if (!note.value.trim()) { error.value = 'Вкажіть причину зміни налаштувань.'; return }
 busy.value = true; error.value = ''
 try { rows.value = await commercial(props.session.token, `/branches/${row.branchNo}`, { expectedRevision: row.revision, mode: row.mode, partnerId: row.mode === 'RESELLER' ? Number(row.partnerId) || null : null, note: note.value.trim() }, 'PUT'); note.value = '' } catch (e) { error.value = e.message } finally { busy.value = false }
}
onMounted(load)
</script>
<template><section v-if="admin"><h2>Філії та ціноутворення</h2><p v-if="error" role="alert">{{ error }}</p><button type="button" :disabled="busy" @click="load">Оновити</button>
<div><p>Налаштування застосовуються до нових замовлень. Для власних філій діє свій роздрібний прайс. Для філій посередника — окремий роздрібний прайс для клієнта та реселлерський прайс для розрахунків із фірмою.</p><label>Пошук фірми у клієнтах за телефоном<input v-model="query"><button type="button" @click="search">Знайти</button></label><p v-for="c in matches" :key="c.custNo || c.id">{{ c.company || c.name }} · код клієнта {{ c.custNo || c.id }}</p><label>Причина зміни<input v-model="note" maxlength="1000"></label><article v-for="row in rows" :key="row.branchNo"><strong>{{ row.branchName }}</strong><select v-model="row.mode" :disabled="busy"><option :value="null">Не налаштовано</option><option value="OWN">Своя філія</option><option value="RESELLER">Філія реселлера</option></select><label v-if="row.mode === 'RESELLER'">Код фірми у клієнтах<input v-model="row.partnerId" type="number" min="1"><span>{{ row.partnerName }}</span></label><button type="button" :disabled="busy || !row.mode" @click="save(row)">Зберегти філію</button></article></div>
</section></template>
<style scoped>article{padding:12px;border:1px solid #cad8e2;border-radius:8px;margin:10px 0}label{display:grid;gap:6px;margin:8px 0}button,input,select{padding:8px;font:inherit;margin:4px;max-width:100%;box-sizing:border-box}[role=alert]{color:#b22}</style>
