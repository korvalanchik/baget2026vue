<script setup>
import { computed, onMounted, ref } from 'vue'
import { warehouse } from '../services/warehouse.js'
const props = defineProps({ session: { type: Object, required: true } })
const isCourier = computed(() => props.session.roles?.includes('ROLE_COURIER') && !props.session.roles?.includes('ROLE_ADMIN'))
const data = ref({ rows: [], branches: [] }), q = ref(''), page = ref(0), activeOnly = ref(false), busy = ref(false), error = ref(''), editing = ref(null), history = ref(null)
const states = { ACTIVE: 'Активний', PAUSED: 'Призупинений', REMOVED: 'Вилучений', NONE: 'Немає', ALLOWED: 'Дозволено', DISCONTINUED: 'Знято з виробництва', BLOCKED: 'Закупівлю заборонено' }
const branchPage = ref(0)
const cell = (row, branch) => row.samples.find(s => s.branchNo === branch.id) || { status: 'NONE', revision: 0 }
const api = (path = '', body) => warehouse(props.session.token, `/assortment${path}`, body)
async function run(fn) { if (busy.value) return; busy.value = true; error.value = ''; try { await fn() } catch (e) { error.value = e.message } finally { busy.value = false } }
async function load() { data.value = await api(`?q=${encodeURIComponent(q.value)}&page=${page.value}&activeOnly=${activeOnly.value}`) }
function refresh(reset = false) { if (reset) page.value = 0; return run(load) }
function edit(row, branch) {
  const old = branch ? cell(row, branch) : { status: row.purchaseStatus, revision: row.purchaseRevision }
  editing.value = { partNo: row.partNo, description: row.description, branch, revision: old.revision, status: old.status === 'NONE' ? 'ACTIVE' : old.status, note: '' }
}
function save() { return run(async () => {
  const e = editing.value
  if (isCourier.value && !e.branch) throw new Error('Кур’єр може змінювати лише стан зразка у призначеній філії.')
  if (!e.note.trim()) throw new Error('Вкажіть причину зміни стану.')
  await api(`/${e.partNo}/${e.branch ? `branches/${e.branch.id}` : 'purchase'}`, { expectedRevision: e.revision, status: e.status, note: e.note.trim() })
  editing.value = null; history.value = null; await load()
}) }
function showHistory(row) { return run(async () => { history.value = { description: row.description, events: await api(`/${row.partNo}/history`) } }) }
function turn(n) { page.value += n; refresh() }
onMounted(() => refresh())
</script>
<template>
  <section class="samples">
    <h2>Зразки багету по філіях</h2>
    <p v-if="isCourier">Перелік зразків багету у філіях, до яких адміністратор надав вам доступ. Тут можна оновити стан зразка та переглянути історію змін.</p>
    <template v-else>
      <p>Зразки визначають асортимент для поповнення запасу. Наявність зразка не змінює кількість метрів на складі.</p>
      <p>Активний хоча б на одній філії — поповнюємо до заданого запасу. Без активних зразків — закуповуємо лише для потреб замовлень. Норми запасу задаються у «Потреби та постачання».</p>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="tools"><input v-model="q" :disabled="busy" placeholder="Артикул або назва" @keydown.enter="refresh(true)"><label><input v-model="activeOnly" type="checkbox" :disabled="busy" @change="refresh(true)"> Лише активний асортимент</label><button :disabled="busy" @click="refresh(true)">Оновити</button></div>
    <p v-if="!data.branches.length">Немає доступних філій. Адміністратор має надати доступ до потрібних філій.</p>
    <div v-if="data.branches.length > 3" class="tools"><button :disabled="busy || branchPage === 0" @click="branchPage--">Попередні філії</button><button :disabled="busy || (branchPage + 1) * 3 >= data.branches.length" @click="branchPage++">Наступні філії</button></div>
    <div class="matrix"><table><thead><tr><th>Профіль</th><th v-for="b in data.branches.slice(branchPage * 3, branchPage * 3 + 3)" :key="b.id">{{ b.name }}</th><th v-if="!isCourier">Усього активних філій</th><th v-if="!isCourier">Закупівля</th></tr></thead><tbody>
      <tr v-for="row in data.rows" :key="row.partNo"><td><strong>{{ row.description }}</strong><small v-if="!isCourier">На складі: {{ row.stock ?? 'невідомо' }} {{ row.unit === 'METER' ? 'м' : '' }}</small><button :disabled="busy" @click="showHistory(row)">Історія</button></td><td v-for="b in data.branches.slice(branchPage * 3, branchPage * 3 + 3)" :key="b.id"><button :class="{ active: cell(row, b).status === 'ACTIVE' }" :disabled="busy" @click="edit(row, b)">{{ states[cell(row, b).status] }}</button></td><td v-if="!isCourier">{{ row.activeCount }}</td><td v-if="!isCourier"><button :disabled="busy" @click="edit(row, null)">{{ states[row.purchaseStatus] }}</button></td></tr>
    </tbody></table></div>
    <p v-if="!data.rows.length && !busy">Профілів за цими умовами не знайдено.</p>
    <div class="tools"><button :disabled="busy || page === 0" @click="turn(-1)">Назад</button><span>Сторінка {{ page + 1 }}</span><button :disabled="busy || data.rows.length < 50" @click="turn(1)">Далі</button></div>
    <article v-if="editing"><h3>{{ editing.description }} · {{ editing.branch?.name || 'Стан закупівлі для всіх філій' }}</h3><label>Стан<select v-model="editing.status" :disabled="busy"><option v-for="s in (editing.branch ? ['ACTIVE','PAUSED','REMOVED'] : ['ALLOWED','DISCONTINUED','BLOCKED'])" :key="s" :value="s">{{ states[s] }}</option></select></label><p v-if="!editing.branch">Зміна впливає на нові закупівлі по всьому складу. Уже отримані матеріали та клієнтські замовлення зберігаються.</p><label>Причина<textarea v-model="editing.note" :disabled="busy" maxlength="1000"></textarea></label><div class="tools"><button :disabled="busy" @click="save">Зберегти</button><button :disabled="busy" @click="editing = null">Скасувати</button></div></article>
    <article v-if="history"><h3>{{ history.description }} — історія (останні 200 подій)</h3><p v-if="!history.events.length">Змін ще немає.</p><p v-for="(e, i) in history.events" :key="i">{{ e.createdAt }} · {{ e.actor }} · {{ isCourier ? (e.branchName || 'Невідома філія') : (e.branchName || 'Закупівля') }}: {{ states[e.previousStatus] || 'Не задано' }} → {{ states[e.status] }} · {{ e.note }}</p><button @click="history = null">Закрити</button></article>
  </section>
</template>
<style scoped>
.samples{padding:0 24px 24px}.tools{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:16px 0}button,input,select,textarea{font:inherit;padding:8px;border:1px solid #cbd5df;border-radius:6px;box-sizing:border-box;max-width:100%}button{cursor:pointer}button:disabled{opacity:.5}.matrix{overflow:auto}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{text-align:left;padding:9px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}th:first-child{width:28%}td button{white-space:normal}.active{background:#e1f1e5;color:#17572a}small{display:block;margin:8px 0}article{padding:16px;border:1px solid #ccd5dd;border-radius:9px;margin:16px 0}article label{display:grid;gap:8px;margin:10px 0}textarea{min-height:65px}p{line-height:1.5}[role=alert]{color:#a32929}
</style>
