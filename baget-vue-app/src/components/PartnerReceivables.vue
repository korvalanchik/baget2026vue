<script setup>
import { onMounted, ref } from 'vue'
import { apiOrigin } from '../services/auth.js'
const props = defineProps({ session: { type: Object, required: true } })
const emit = defineEmits(['invoice', 'reconcile'])
const data = ref(null), partner = ref(''), page = ref(0), busy = ref(false), error = ref('')
const money = n => Number(n || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
async function load() {
 if (busy.value) return
 busy.value = true; error.value = ''
 try {
  const q = new URLSearchParams({ page: page.value }); if (partner.value) q.set('partner', partner.value)
  const response = await fetch(`${apiOrigin}/api/partner-receivables?${q}`, { headers: { Authorization: `Bearer ${props.session.token}` }, cache: 'no-store' })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(result?.message || `Не вдалося завантажити реєстр (HTTP ${response.status})`)
  data.value = result
 } catch (e) { error.value = e.message; data.value = null }
 finally { busy.value = false }
}
function changePartner() { page.value = 0; load() }
function turn(delta) { page.value += delta; load() }
onMounted(load)
</script>
<template>
 <section class="receivables">
  <h2>Неоплачені рахунки посередників</h2>
  <p>Активні рахунки за виробами з боргом за фінансовими проводками. Об’єднані, скасовані та чернетки сюди не входять. Старі рахунки без збереженої належності фірмі перевіряйте у звірці.</p>
  <div class="tools"><label>Фірма<select v-model="partner" :disabled="busy" @change="changePartner"><option value="">Усі доступні фірми</option><option v-for="p in data?.partners || []" :key="p.id" :value="p.id">{{ p.name }}</option></select></label><button :disabled="busy" @click="load">Оновити</button></div>
  <p v-if="busy" role="status">Завантаження…</p><p v-if="error" role="alert">{{ error }} <button :disabled="busy" @click="load">Повторити</button></p>
  <template v-if="data">
   <p>Станом на {{ new Date(data.asOf).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' }) }}. Кількість днів — календарна, за Києвом, без оцінки прострочення.</p>
   <div class="groups"><article v-for="g in data.groups" :key="g.partnerId"><h3>{{ g.partnerName }}</h3><p>Рахунків з боргом: {{ g.invoiceCount }}<br>Борг за рахунками: <strong>{{ money(g.debt) }} грн</strong><br>Доступний аванс: <strong>{{ money(g.availableAdvance) }} грн</strong></p><button :disabled="busy" @click="emit('reconcile', g.partnerId)">Звірка фірми</button></article></div>
   <p>Підсумки фірм охоплюють усі їхні неоплачені рахунки, а не лише поточну сторінку. Аванс не віднімається автоматично: зарахуйте його через оплату вибраного рахунку.</p>
   <div class="scroll"><table><thead><tr><th>Фірма / рахунок</th><th>Дата</th><th>Днів від виставлення</th><th>Сума документа</th><th>Надійшло оплат</th><th>Зараховано авансу</th><th>Борг</th><th></th></tr></thead><tbody><tr v-for="i in data.rows" :key="i.id"><td>{{ i.partnerName }}<br>№ {{ i.invoiceNo }}</td><td>{{ i.issuedDate }}</td><td>{{ i.ageDays }}</td><td>{{ money(i.amount) }}</td><td>{{ money(i.paid) }}</td><td>{{ money(i.allocated) }}</td><td><strong>{{ money(i.debt) }}</strong></td><td><button :disabled="busy" @click="emit('invoice', i.id)">Рахунок / оплата</button><button :disabled="busy" @click="emit('reconcile', i.partnerId)">Звірка</button></td></tr></tbody></table></div>
   <p v-if="!data.rows.length">На цій сторінці неоплачених рахунків немає.</p>
   <p>Оплати й аванс у рядку стосуються цього рахунку. Об’єднаний рахунок містить перенесений залишок боргу; попередні оплати залишаються в історії вихідних рахунків. Коригування та повернення враховані в боргу й доступні у звірці.</p>
   <div class="tools"><button :disabled="busy || page === 0" @click="turn(-1)">Назад</button><span>Сторінка {{ page + 1 }}</span><button :disabled="busy || !data.hasNext" @click="turn(1)">Далі</button></div>
  </template>
 </section>
</template>
<style scoped>
.receivables{margin:20px 0}.tools{display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin:15px 0}label{display:grid;gap:6px}button,select{font:inherit;min-height:44px;padding:9px;border:1px solid #cdd6df;border-radius:7px;max-width:100%}button{cursor:pointer}button:disabled{opacity:.5}.groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}article{padding:14px;background:#f0f5fa;border-radius:9px}h3{margin-top:0}p{line-height:1.6}.scroll{overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #dce2e8}td button{margin-bottom:5px}[role=alert]{color:#a22}@media(max-width:600px){select{font-size:16px}label{width:100%}}
</style>
