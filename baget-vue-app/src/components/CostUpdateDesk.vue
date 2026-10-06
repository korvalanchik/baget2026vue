<script setup>
import { onMounted, ref } from 'vue'
import { warehouse } from '../services/warehouse.js'
import { newRequestKey } from '../services/requestKey.js'
const props = defineProps({ session: { type: Object, required: true } })
const rows = ref([]), settings = ref(null), globalRate = ref(''), q = ref(''), page = ref(0), selected = ref([])
const busy = ref(false), error = ref(''), notice = ref(''), history = ref([]), historyPage = ref(0), historyOpen = ref(false), pending = ref(null)
const storageKey = `baget.cost-update.${props.session.username || props.session.nickname || 'user'}`
const api = (path, body) => warehouse(props.session.token, '/cost-update' + path, body)
const money = value => value == null ? '—' : Number(value).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
const units = { METER: 'м', SQUARE_METER: 'м²', PIECE: 'шт.' }
async function refresh() {
 const result = await api(`?q=${encodeURIComponent(q.value)}&page=${page.value}`)
 settings.value = result.settings; globalRate.value = String(result.settings.rate)
 rows.value = result.rows.map(row => ({ ...row, editRate: row.personalRate == null ? '' : String(row.personalRate) })); selected.value = []
 if (historyOpen.value) history.value = await api(`/history?page=${historyPage.value}`)
}
async function load(reset = false) {
 if (busy.value || pending.value) return
 busy.value = true; error.value = ''; if (reset) page.value = 0
 try { await refresh() } catch (e) { error.value = e.message } finally { busy.value = false }
}
function percent(value, nullable = false) {
 const text = String(value).trim().replace(',', '.')
 if (nullable && !text) return null
 if (!/^\d{1,4}(\.\d{1,2})?$/.test(text) || Number(text) > 1000) throw new Error('Відсоток має бути від 0 до 1000, не більше двох знаків після коми.')
 return Number(text)
}
async function send(path, body) {
 if (busy.value || pending.value) return
 try {
  const request = { path, body: { ...body, requestKey: newRequestKey() } }
  sessionStorage.setItem(storageKey, JSON.stringify(request)); pending.value = request
  await retry()
 } catch (e) { error.value = e.message }
}
async function retry() {
 if (busy.value || !pending.value) return
 busy.value = true; error.value = ''; notice.value = ''
 try {
  await api(pending.value.path, pending.value.body)
  pending.value = null; sessionStorage.removeItem(storageKey)
  notice.value = 'Зміни збережено.'
  await refresh()
 } catch (e) {
  error.value = e.message
  if ([400, 403, 404, 409, 422].includes(e.status)) { pending.value = null; sessionStorage.removeItem(storageKey); selected.value = [] }
 } finally { busy.value = false }
}
async function saveRate(row = null) {
 error.value = ''; notice.value = ''
 try { await send('/rate', { revision: settings.value.revision, partNo: row?.partNo || null, rate: percent(row ? row.editRate : globalRate.value, !!row) }) } catch (e) { error.value = e.message }
}
async function apply() {
 if (!selected.value.length || busy.value || pending.value) return
 if (!window.confirm(`Оновити Parts.Cost для ${selected.value.length} матеріалів? Ціни продажу та збережені замовлення залишаться без змін.`)) return
 await send('/apply', { rows: rows.value.filter(row => selected.value.includes(row.partNo)).map(row => ({ partNo: row.partNo, token: row.token })) })
}
async function showHistory(delta = 0) {
 if (busy.value || pending.value) return
 historyOpen.value = true; historyPage.value = Math.max(0, historyPage.value + delta)
 busy.value = true; error.value = ''
 try { history.value = await api(`/history?page=${historyPage.value}`) } catch (e) { error.value = e.message } finally { busy.value = false }
}
onMounted(async () => {
 try { const saved = sessionStorage.getItem(storageKey); if (saved) pending.value = JSON.parse(saved) } catch { error.value = 'Не вдалося прочитати збережений запит.' }
 if (!pending.value) await load()
})
</script>
<template>
 <div class="cost-update">
  <p>Розрахункова собівартість = складська собівартість + відсоток накладних. Доставка вже врахована у складській собівартості. Зміна відсотка оновлює пропозицію; запис у Parts.Cost — лише кнопкою «Застосувати вибрані».</p>
  <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
  <div v-if="pending" class="pending"><p>Результат запиту ще не підтверджено. Повторіть той самий запит: зміни не будуть виконані двічі.</p><button :disabled="busy" @click="retry">Перевірити / повторити запит</button></div>
  <fieldset :disabled="busy || !!pending">
   <div v-if="settings" class="cost-controls"><label>Загальні накладні, %<input v-model="globalRate" inputmode="decimal"></label><button @click="saveRate()">Зберегти відсоток</button></div>
   <form class="cost-controls" @submit.prevent="load(true)"><label>Артикул або назва<input v-model="q" maxlength="100" placeholder="Пошук матеріалу"></label><button>Знайти / оновити</button></form>
   <div class="cost-actions"><button @click="selected = rows.filter(r => r.newCost != null).map(r => r.partNo)">Вибрати доступні на сторінці</button><button @click="selected = []">Зняти вибір</button><button class="primary" :disabled="!selected.length" @click="apply">Застосувати вибрані ({{ selected.length }})</button></div>
   <p v-if="settings && !rows.length">Матеріалів за цим пошуком немає.</p>
   <article v-for="row in rows" :key="row.partNo">
    <label class="cost-title"><input v-model="selected" type="checkbox" :value="row.partNo" :disabled="row.newCost == null"><strong>{{ row.partNo }} · {{ row.description }}</strong></label>
    <div class="cost-values"><div>Складська, грн/{{ units[row.unit] || row.unit }}<strong>{{ money(row.baseCost) }}</strong></div><div>Поточний Cost<strong>{{ money(row.oldCost) }}</strong></div><div>Запропонований Cost<strong>{{ money(row.newCost) }}</strong></div><div>Зміна<strong>{{ row.differencePercent == null ? '—' : `${row.differencePercent}%` }}</strong></div></div>
    <p v-if="row.reason">{{ row.reason }} — оновлення недоступне.</p>
    <div class="cost-controls"><label>Окремі накладні, %<input v-model="row.editRate" inputmode="decimal" :placeholder="`Загальні: ${settings.rate}%`"></label><button @click="saveRate(row)">Зберегти</button><span>Порожнє поле — загальні {{ settings.rate }}%. У розрахунку: {{ row.rate }}%.</span></div>
   </article>
   <div class="cost-actions"><button :disabled="page === 0" @click="page--; load()">Назад</button><span>Сторінка {{ page + 1 }}</span><button :disabled="rows.length < 100" @click="page++; load()">Далі</button><button @click="showHistory()">Історія змін</button></div>
  </fieldset>
  <section v-if="historyOpen"><h3>Історія змін</h3><p v-if="!history.length">Записів немає.</p>
   <article v-for="event in history" :key="event.id"><strong>{{ event.action === 'APPLY' ? 'Оновлення Cost' : 'Зміна відсотка' }}</strong><p>{{ event.createdAt }} · {{ event.actor }}</p>
    <template v-if="event.action === 'RATE'"><p>{{ event.snapshot.partNo ? `Артикул ${event.snapshot.partNo}` : 'Загальний відсоток' }}: {{ event.snapshot.before == null ? 'загальний' : `${event.snapshot.before}%` }} → {{ event.snapshot.after == null ? 'загальний' : `${event.snapshot.after}%` }}</p></template>
    <details v-else><summary>Матеріалів: {{ event.snapshot.rows.length }}</summary><p v-for="row in event.snapshot.rows" :key="row.partNo">{{ row.partNo }} · {{ row.description }}: {{ money(row.oldCost) }} → {{ money(row.newCost) }} грн; складська {{ money(row.baseCost) }}, накладні {{ row.rate }}%</p></details>
   </article>
   <div class="cost-actions"><button :disabled="busy || !!pending || !historyPage" @click="showHistory(-1)">Назад</button><span>Сторінка {{ historyPage + 1 }}</span><button :disabled="busy || !!pending || history.length < 30" @click="showHistory(1)">Далі</button></div>
  </section>
 </div>
</template>
<style scoped>
.cost-update{min-width:0}.cost-update fieldset{border:0;padding:0;margin:16px 0;min-width:0}.cost-controls,.cost-actions{display:flex;flex-wrap:wrap;align-items:end;gap:10px;margin:12px 0}.cost-controls label{display:grid;gap:5px;max-width:100%}.cost-controls span{font-size:13px;flex:1 1 180px}.cost-values{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0}.cost-values div{font-size:13px;overflow-wrap:anywhere}.cost-values strong{display:block;font-size:17px;margin-top:6px}.cost-title{display:flex;align-items:center;gap:10px;overflow-wrap:anywhere}.cost-title input{flex-shrink:0}.cost-update input{min-width:0;width:220px}.pending{padding:12px;background:#fff5d9;border-radius:8px}.cost-update details p{padding:7px 0;border-bottom:1px solid #e1e9ed}@media(max-width:650px){.cost-values{grid-template-columns:repeat(2,minmax(0,1fr))}.cost-controls label,.cost-controls input{width:100%}.cost-actions button{flex:1 1 140px}.cost-controls button{width:100%}}
</style>
