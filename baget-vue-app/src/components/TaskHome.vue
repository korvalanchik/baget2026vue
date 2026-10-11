<script setup>
import { computed, onMounted, ref } from 'vue'
import { apiOrigin, canAccess } from '../services/auth.js'
import PriceApprovalPanel from './PriceApprovalPanel.vue'
import DeadlineTasks from './DeadlineTasks.vue'
const props = defineProps({ session: { type: Object, required: true } })
const emit = defineEmits(['navigate'])
const overview = ref(null), group = ref(''), task = ref(null), rows = ref([]), page = ref(0), more = ref(false)
const busy = ref(false), error = ref(''), selected = ref(null), finance = ref([]), financeBusy = ref(false)
const labels = { manager: 'Менеджер', workshop: 'Майстерня', accountant: 'Бухгалтерія', admin: 'Огляд адміністратора', warehouse: 'Склад' }
const cards = computed(() => (overview.value?.cards || []).filter(c => c.group === group.value))
const money = x => Number(x || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
async function api(path) {
 const r = await fetch(`${apiOrigin}/api${path}`, { headers: { Authorization: `Bearer ${props.session.token}` }, cache: 'no-store' })
 const data = await r.json().catch(() => null)
 if (!r.ok) throw new Error(data?.message || `Не вдалося завантажити завдання (HTTP ${r.status})`)
 return data
}
async function loadFinance() {
 if (financeBusy.value) return
 financeBusy.value = true; finance.value = []
 const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
 const value = key => parts.find(x => x.type === key).value
 const today = `${value('year')}-${value('month')}-${value('day')}`
 const definitions = [
  { key: 'billing', title: 'Готові до рахунку', target: 'accountant', tab: 'ready', path: '/product-invoices/ready?page=0', summarize: d => ({ count: d.length === 100 ? '100+' : d.length, hint: d.length === 100 ? 'Виробів: щонайменше 100. Повний список — у рахунках.' : 'Виробів із підтвердженими витратами та прийманням' }) },
  { key: 'debts', title: 'Борги посередників', target: 'accountant', tab: 'receivables', path: '/partner-receivables?page=0', summarize: d => ({ count: d.groups.reduce((n, g) => n + Number(g.invoiceCount), 0), hint: `Рахунків · ${money(d.groups.reduce((n, g) => n + Number(g.debt), 0))} грн. Аванси не віднято.` }) },
  { key: 'rewards', title: 'Винагороди до виплати', target: 'rewards', path: `/rewards?from=${today.slice(0, 7)}-01&to=${today}`, summarize: d => ({ count: d.rows.filter(r => Number(r.balance) > 0).length, hint: `Рахунків менеджерів · ${money(d.rows.reduce((n, r) => n + Math.max(0, Number(r.balance)), 0))} грн. Поточний залишок.` }) },
 ]
 const results = await Promise.allSettled(definitions.map(d => api(d.path)))
 finance.value = definitions.map((d, i) => ({ ...d, ...(results[i].status === 'fulfilled' ? d.summarize(results[i].value) : { count: '—', error: results[i].reason.message }) }))
 financeBusy.value = false
}
async function refresh() {
 if (busy.value || financeBusy.value) return
 busy.value = true; error.value = ''; overview.value = null; rows.value = []; task.value = null; selected.value = null
 try {
  overview.value = await api('/tasks')
  if (!overview.value.groups.includes(group.value)) group.value = ['admin', 'workshop', 'accountant', 'manager', 'warehouse'].find(g => overview.value.groups.includes(g)) || ''
 } catch (e) { error.value = e.message } finally { busy.value = false }
 if (group.value === 'accountant' && overview.value) await loadFinance()
}
function chooseGroup(value) { if (busy.value || financeBusy.value) return; group.value = value; task.value = null; rows.value = []; selected.value = null; error.value = ''; if (value === 'accountant') loadFinance() }
async function loadQueue(card, next = 0) {
 if (busy.value) return
 busy.value = true; error.value = ''; rows.value = []; selected.value = null; task.value = card; page.value = next
 try { const data = await api(`/tasks/${card.key}?page=${next}`); rows.value = data.rows; more.value = data.hasMore } catch (e) { error.value = e.message; more.value = false } finally { busy.value = false }
}
function open(row) {
 if (task.value.target === 'approval') { selected.value = row; return }
 emit('navigate', { section: task.value.target, orderNo: row.orderNo, tab: task.value.key === 'issue' ? 'READY' : 'RECEIVE', customer: task.value.target === 'customers' ? { ...row, company: row.customerName, mobile: row.phone } : null })
}
function backToQueue() { selected.value = null; loadQueue(task.value, page.value) }
onMounted(refresh)
</script>
<template>
 <section class="task-home">
  <header><div><h1>Мої завдання</h1><p>Поточні справи за доступними вам філіями</p></div><div class="actions"><button v-if="canAccess(session, 'orders:create')" class="primary" :disabled="busy" @click="emit('navigate', {section:'new-order'})">＋ Нове замовлення</button><button :disabled="busy" @click="emit('navigate', {section:'scanning'})">Сканувати QR</button><button :disabled="busy || financeBusy" @click="refresh">Оновити</button></div></header>
  <p v-if="error" role="alert">{{ error }} <button :disabled="busy" @click="task ? loadQueue(task, page) : refresh()">Повторити</button></p>
  <p v-if="busy" role="status">Завантаження…</p>
  <template v-if="overview">
   <nav v-if="overview.groups.length > 1" aria-label="Робоча роль"><button v-for="g in overview.groups" :key="g" :aria-pressed="group === g" :disabled="busy || financeBusy" @click="chooseGroup(g)">{{ labels[g] }}</button></nav>
   <DeadlineTasks v-if="['manager', 'workshop', 'admin'].includes(group)" :session="session" @navigate="emit('navigate', $event)" />
   <p class="scope">{{ overview.scope }} · Оновлено {{ new Date(overview.asOf).toLocaleString('uk-UA', {timeZone:'Europe/Kyiv'}) }}</p>
   <template v-if="!selected">
    <div v-if="cards.length" class="tasks"><button v-for="c in cards" :key="c.key" :aria-pressed="task?.key === c.key" :disabled="busy" @click="loadQueue(c)"><span>{{ c.title }}</span><strong>{{ c.count }}</strong><small>{{ c.unit }}</small></button></div>
    <p v-if="group === 'workshop'" class="scope">Один виріб може бути в кількох чергах. Дефіцит не скасовує замовлення. Старі замовлення без карток виробів — у загальній майстерні.</p>
    <button v-if="group === 'workshop'" :disabled="busy" @click="emit('navigate', {section:'workshop'})">Відкрити всю майстерню</button>
    <p v-if="group === 'manager' && task?.key === 'contacts'" class="scope">Контакти на сьогодні та раніше, які ще мають заплановану дату. Змініть або приберіть дату після розмови.</p>
    <section v-if="task" class="queue" :aria-busy="busy"><header><h2>{{ task.title }}</h2><span>Сторінка {{ page + 1 }}</span></header>
     <p v-if="!busy && !error && !rows.length">Завдань на цій сторінці немає.</p>
     <article v-for="r in rows" :key="`${r.productId || r.orderNo || r.customerId}-${r.branchNo}`"><div><h3>{{ r.orderNo ? `Замовлення № ${r.orderNo}` : r.customerName }}<span v-if="r.productName"> · {{ r.productName }}</span></h3><p v-if="r.orderNo">{{ r.customerName }}</p><p class="scope">{{ r.branchName }}<span v-if="r.contactDate"> · Контакт: {{ r.contactDate }}</span><span v-if="r.phone"> · {{ r.phone }}</span></p></div><button class="primary" :disabled="busy" @click="open(r)">{{ task.target === 'customers' ? 'Контакт та історія' : task.key === 'issue' ? 'Оплата та видача' : task.key === 'receive' ? 'Перевірити й прийняти' : task.target === 'approval' ? 'Погодження ціни' : 'Картка в майстерні' }}</button></article>
     <div class="pages"><button :disabled="busy || page === 0" @click="loadQueue(task, page - 1)">Назад</button><button :disabled="busy || !more" @click="loadQueue(task, page + 1)">Далі</button></div>
    </section>
   </template>
   <section v-else class="queue"><button :disabled="busy" @click="backToQueue">← До черги погоджень</button><h2>Замовлення № {{ selected.orderNo }} · {{ selected.productName }}</h2><p>{{ selected.customerName }} · {{ selected.branchName }}</p><PriceApprovalPanel :session="session" :product-id="Number(selected.productId)" :revision="0" @busy="busy = $event" @changed="refresh" /></section>
   <template v-if="group === 'accountant'"><p v-if="financeBusy" role="status">Завантаження фінансових завдань…</p><div class="tasks"><article v-for="f in finance" :key="f.key"><h2>{{ f.title }}</h2><strong>{{ f.count }}</strong><p v-if="f.error" role="alert">{{ f.error }}</p><p v-else>{{ f.hint }}</p><button class="primary" :disabled="busy" @click="emit('navigate', {section:f.target, tab:f.tab})">Відкрити</button></article></div><button :disabled="financeBusy" @click="loadFinance">Оновити фінансові завдання</button></template>
   <template v-if="group === 'admin'"><h2>Загальний стан виробництва й видачі</h2><p class="scope">Черги можуть перетинатися. Кількість замовлень і виробів показана окремо та не підсумовується.</p><div class="tasks"><button v-for="c in overview.cards.filter(c => ['new','work','transfer','receive','issue','approval','shortage'].includes(c.key))" :key="c.key" @click="chooseGroup(c.group); loadQueue(c)"><span>{{ c.title }}</span><strong>{{ c.count }}</strong><small>{{ c.unit }}</small></button></div><div class="actions"><button class="primary" :disabled="busy" @click="emit('navigate', {section:'owner-results'})">Результати роботи · друк та Excel</button><button @click="chooseGroup('accountant')">Фінансові завдання</button><button :disabled="busy" @click="emit('navigate', {section:'settings'})">Налаштування</button></div></template>
   <div v-if="group === 'warehouse'" class="actions"><button class="primary" :disabled="busy" @click="emit('navigate', {section:'warehouse'})">Приймання та переміщення виробів</button><button :disabled="busy" @click="emit('navigate', {section:'materials'})">Залишки, потреби та постачання</button></div>
   <p v-if="!overview.groups.length">Для вашої ролі доступне сканування виробів. Інші розділи визначаються правами користувача.</p>
  </template>
 </section>
</template>
<style scoped>
.task-home{padding:24px;max-width:1300px;margin:auto;min-width:0;color:#233442}.task-home *{box-sizing:border-box}.task-home header{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}.task-home h1{font-size:26px;margin:0}.task-home h2{font-size:19px;margin:8px 0}.task-home h3{font-size:16px;margin:0}.task-home p{margin:8px 0;line-height:1.5}.task-home button{font:inherit;padding:10px 14px;min-height:44px;border:1px solid #bdccd4;border-radius:8px;background:#fff;color:#233442;cursor:pointer;white-space:normal}.task-home button:disabled{opacity:.55;cursor:wait}.task-home .primary,.task-home nav button[aria-pressed=true]{background:#185c63;color:white;border-color:#185c63}.task-home nav,.task-home .actions,.task-home .pages{display:flex;gap:8px;flex-wrap:wrap}.task-home nav{margin:20px 0}.tasks{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:20px 0}.tasks>button,.tasks>article{text-align:left;padding:18px;border:1px solid #d4e0e4;background:white;border-radius:10px;min-width:0}.tasks strong{display:block;font-size:28px;margin:8px 0;font-variant-numeric:tabular-nums}.tasks small,.scope{color:#526875}.tasks>button[aria-pressed=true]{background:#eef6f6;border-color:#185c63}.queue{margin:20px 0;padding:18px;background:white;border:1px solid #d4e0e4;border-radius:10px}.queue article{display:flex;justify-content:space-between;gap:14px;align-items:center;border-bottom:1px solid #e2e9ec;padding:16px 0;overflow-wrap:anywhere}.queue article>div{min-width:0}.queue article>button{flex-shrink:0}.pages{justify-content:space-between;margin-top:16px}[role=alert]{color:#a22}@media(max-width:600px){.task-home{padding:12px}.tasks{grid-template-columns:1fr 1fr;gap:8px}.tasks>button,.tasks>article{padding:12px}.queue{padding:12px}.queue article{display:block}.queue article>button{width:100%;margin-top:8px}.actions>button{flex:1 1 140px}.tasks>article{grid-column:1/-1}}
</style>
