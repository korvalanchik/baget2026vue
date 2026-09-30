<script setup>
import { ref, onMounted } from 'vue'
import { crm } from '../services/crm.js'
import { customerCredit } from '../services/customerCredit.js'
const props = defineProps({ session: { type: Object, required: true } })
const emit = defineEmits(['customer'])
const branch = ref(''), overdue = ref(false), page = ref(0), rows = ref([]), hasMore = ref(false), branches = ref([]), busy = ref(false), error = ref('')
async function load(reset = false) {
 if (busy.value) return
 if (reset) page.value = 0
 busy.value = true; error.value = ''
 try { const params = new URLSearchParams({ overdue: overdue.value, page: page.value }); if (branch.value) params.set('branch', branch.value); const result = await customerCredit(props.session.token, `/receivables?${params}`); rows.value = result.rows; hasMore.value = result.hasMore } catch (e) { error.value = e.message } finally { busy.value = false }
}
onMounted(async () => { try { branches.value = await crm(props.session.token, '/branches'); await load() } catch (e) { error.value = e.message } })
</script>
<template><section><h2>Контроль оплати рахунків</h2><div class="tools"><label>Філія<select v-model="branch" :disabled="busy" @change="load(true)"><option value="">Усі доступні</option><option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option></select></label><label>Показати<select v-model="overdue" :disabled="busy" @change="load(true)"><option :value="false">Очікується оплата</option><option :value="true">Прострочено</option></select></label><button :disabled="busy" @click="load()">Оновити</button></div>
 <p>Показані чинні рахунки з боргом. Без дати рахунок залишається в «Очікується оплата». Прострочення починається наступного дня за київським часом. Об’єднаний рахунок може бути показаний у кількох філіях — його борг не слід підсумовувати між рядками.</p><p v-if="error" role="alert">{{ error }}</p><p v-if="busy">Завантаження…</p>
 <article v-for="i in rows" :key="`${i.invoiceId}-${i.branchNo}`"><strong>{{ i.company }}</strong> · {{ i.branchName }}<p>Рахунок № {{ i.invoiceNo }} · Борг {{ i.debt }} грн · Сплатити до {{ i.dueDate || 'не вказано' }} <strong v-if="i.overdue">· Прострочено</strong></p><button @click="emit('customer', i)">Картка клієнта / записати контакт</button></article><p v-if="!busy && !rows.length">Рахунків за цими умовами немає.</p><div class="tools"><button :disabled="busy || !page" @click="page--; load()">Назад</button><span>Сторінка {{ page + 1 }}</span><button :disabled="busy || !hasMore" @click="page++; load()">Далі</button></div>
</section></template>
<style scoped>.tools{display:flex;gap:12px;flex-wrap:wrap;align-items:end}label{display:grid;gap:6px}button,select{padding:9px;font:inherit}article{border:1px solid #ccd8e0;padding:14px;border-radius:8px;margin:10px 0}[role=alert]{color:#b22}</style>
