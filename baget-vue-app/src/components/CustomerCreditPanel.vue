<script setup>
import { ref, watch } from 'vue'
import { customerCredit } from '../services/customerCredit.js'
import { newRequestKey } from '../services/requestKey.js'
const props = defineProps({ session: { type: Object, required: true }, customerId: { type: Number, required: true }, branchNo: { type: Number, required: true } })
const emit = defineEmits(['changed', 'busy'])
const data = ref(null), busy = ref(false), error = ref(''), note = ref(''), dates = ref({})
let retry = null
const path = () => `/${props.customerId}/branches/${props.branchNo}`
async function run(fn) { if (busy.value) return; busy.value = true; emit('busy', true); error.value = ''; try { await fn() } catch (e) { error.value = e.message } finally { busy.value = false; emit('busy', false) } }
function apply(value) { data.value = value; dates.value = Object.fromEntries(value.invoices.map(i => [i.invoiceId, i.dueDate || ''])) }
function load() { return run(async () => { apply(await customerCredit(props.session.token, path())); retry = null }) }
function save(invoice = null) { return run(async () => {
 if (!note.value.trim()) throw new Error('Вкажіть причину / погоджену домовленість.')
 const suffix = invoice ? `/invoices/${invoice.invoiceId}/terms` : '/policy'
 const body = invoice ? { expectedRevision: invoice.revision, dueDate: dates.value[invoice.invoiceId] || null, note: note.value.trim() } : { expectedRevision: data.value.policy.revision, allowed: !data.value.policy.allowed, note: note.value.trim() }
 const signature = JSON.stringify({ suffix, body })
 if (retry?.signature !== signature) retry = { signature, requestKey: newRequestKey() }
 apply(await customerCredit(props.session.token, path() + suffix, { ...body, requestKey: retry.requestKey })); retry = null; note.value = ''; emit('changed')
}) }
function eventText(event) { try { const p = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload; return `${event.action === 'POLICY' ? (p.allowed ? 'Дозволено видачу з боргом' : 'Дозвіл відкликано') : `Дата оплати: ${p.dueDate || 'не вказана'}`} · ${p.note}` } catch { return event.action } }
watch(() => [props.customerId, props.branchNo], () => { data.value = null; retry = null; load() }, { immediate: true })
</script>
<template>
 <section class="credit"><header><h3>Відстрочка оплати</h3><button type="button" :disabled="busy" @click="load">Оновити умови</button></header>
 <p v-if="error" role="alert">{{ error }}</p>
 <template v-if="data">
  <p><strong>{{ data.policy.allowed ? 'Видача з боргом дозволена у цій філії' : 'Видача лише після оплати' }}</strong>. Дозвіл окремий від ознаки партнера. Для видачі з боргом потрібен чинний рахунок із датою оплати.</p>
  <template v-if="data.canEdit"><label>Причина зміни / домовленість<input v-model="note" maxlength="1000" :disabled="busy"></label><button type="button" :disabled="busy" @click="save()">{{ data.policy.allowed ? 'Відкликати дозвіл' : 'Дозволити видачу з відстрочкою' }}</button></template>
  <article v-for="i in data.invoices" :key="i.invoiceId"><p>Рахунок № {{ i.invoiceNo }} · Борг {{ i.debt }} грн <strong v-if="i.overdue">· Прострочено</strong></p><label>Сплатити до (включно)<input v-model="dates[i.invoiceId]" type="date" :disabled="busy || !data.canEdit"></label><button v-if="data.canEdit" type="button" :disabled="busy" @click="save(i)">Зберегти дату рахунку</button></article>
  <details><summary>Історія умов і видачі з боргом (останні 100 записів кожного виду)</summary><p v-for="(e, idx) in data.events" :key="`e${idx}`">{{ e.createdAt }} · {{ e.actor }} · {{ e.invoiceId ? `Рахунок ID ${e.invoiceId} · ` : '' }}{{ eventText(e) }}</p><p v-for="(e, idx) in data.issues" :key="`i${idx}`">{{ e.createdAt }} · {{ e.actor }} · {{ e.action === 'ACCEPT' ? 'Підтвердив видачу' : 'Підготував передачу' }} виробу {{ e.productId }} · Борг на той момент {{ e.debt }} грн · Строк {{ e.dueDate }}</p></details>
 </template>
 </section>
</template>
<style scoped>
.credit{border:1px solid #b9cbd8;border-radius:8px;padding:14px;margin:14px 0}header{display:flex;gap:12px;flex-wrap:wrap;align-items:center}h3{margin:0}label{display:grid;gap:6px;margin:8px 0}input,button{padding:8px;font:inherit;max-width:100%;box-sizing:border-box}article{border-top:1px solid #ddd;margin-top:12px;padding-top:6px}button:disabled{opacity:.5}[role=alert]{color:#b22}details{margin-top:12px}
</style>
