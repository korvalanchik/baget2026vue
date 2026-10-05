<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { rewards } from '../services/rewards.js'
import { newRequestKey } from '../services/requestKey.js'
const props = defineProps({ session: { type: Object, required: true }, settingsOnly: Boolean })
const data = ref({ rows: [] }), settings = ref(null), selected = ref(null), journal = ref(null), page = ref(0), reviews = ref([]), reviewUsers = ref([])
const busy = ref(false), error = ref(''), notice = ref(''), pending = ref(null), form = ref(null), personalUser = ref(''), personalRate = ref('')
const dialog = ref(null), loaded = ref(false), reportPeriod = ref('')
const cents = value => Math.round(Number(value || 0) * 100)
const totals = computed(() => data.value.rows.reduce((sum, row) => ({ earned: sum.earned + cents(row.earned), paid: sum.paid + cents(row.paid), due: sum.due + Math.max(0, cents(row.balance)), overpaid: sum.overpaid + Math.max(0, -cents(row.balance)) }), { earned: 0, paid: 0, due: 0, overpaid: 0 }))
const payoutRemaining = computed(() => form.value?.body.kind === 'PAYOUT' && journal.value ? (cents(journal.value.balance) - cents(form.value.body.amount)) / 100 : null)
watch(() => !!form.value || !!pending.value, async show => { await nextTick(); if (show && dialog.value && !dialog.value.open) dialog.value.showModal(); else if (!show && dialog.value?.open) dialog.value.close() })
function cancelDialog(event) { if (busy.value || pending.value) { event?.preventDefault(); return } form.value = null }
async function pay(row) { if (busy.value || pending.value || form.value) return; await open(row); if (journal.value && !error.value && Number(journal.value.balance) > 0) payment() }
const key = `baget.reward.${props.session.nickname || props.session.username || 'session'}.${props.settingsOnly ? 'settings' : 'entries'}`
const dateParts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
const datePart = key => dateParts.find(p => p.type === key).value
const today = `${datePart('year')}-${datePart('month')}-${datePart('day')}`
const from = ref(today.slice(0, 7) + '-01'), to = ref(today)
const period = () => new URLSearchParams({ from: from.value, to: to.value }).toString()
const money = x => Number(x || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const labels = { ACCRUAL: 'Нарахування', PAYOUT: 'Виплата', CORRECTION: 'Коригування', REVERSAL: 'Скасування помилкової виплати' }
const api = (path, body) => rewards(props.session.token, path, body)
async function refresh() {
 if (props.settingsOnly) settings.value = await api('/settings')
 else { data.value = await api('?' + period()); loaded.value = true; reportPeriod.value = `${from.value.split('-').reverse().join('.')} — ${to.value.split('-').reverse().join('.')}`; if (data.value.canEdit) { reviews.value = await api('/review'); reviewUsers.value = await api('/review/users') } if (selected.value) journal.value = await api(`/accounts/${selected.value.id}?page=${page.value}&${period()}`) }
}
async function load() { if (busy.value) return; busy.value = true; error.value = ''; try { await refresh() } catch (e) { error.value = e.message } finally { busy.value = false } }
async function open(row) { if (pending.value || busy.value) return; selected.value = row; page.value = 0; form.value = null; journal.value = null; await load() }
function choosePersonal() { const r = settings.value.users.find(x => String(x.id) === personalUser.value); personalRate.value = r?.rate == null ? '' : String(r.rate) }
function configure() {
 const s = settings.value.settings
 form.value = { path: '/settings', title: 'Зберегти відсотки та стан нарахування', body: { revision: s.revision, enabled: s.enabled === true || Number(s.enabled) === 1, rate: String(s.rate), userId: personalUser.value ? Number(personalUser.value) : null, personalRate: personalRate.value === '' ? null : String(personalRate.value) } }
}
function payment() { form.value = { path: '/entries', title: `Видати винагороду: ${selected.value.username} · ${selected.value.branchName}`, body: { accountId: selected.value.id, revision: journal.value.revision, kind: 'PAYOUT', amount: String(journal.value.balance), method: 'CASH', sourceId: null, note: '' } } }
function correction(row) { form.value = { path: '/entries', title: `Коригування нарахування № ${row.id}: додатна сума додає, від’ємна зменшує`, body: { accountId: selected.value.id, revision: journal.value.revision, kind: 'CORRECTION', amount: '', method: null, sourceId: row.id, note: '' } } }
function reverse(row) { form.value = { path: '/entries', title: `Скасувати помилковий запис виплати № ${row.id}. Це не виконує повернення грошей.`, body: { accountId: selected.value.id, revision: journal.value.revision, kind: 'REVERSAL', amount: String(-Number(row.amount)), method: null, sourceId: row.id, note: '' } } }
function resolve(row) { form.value = { path: '/review', title: `Уточнення автора й остаточної суми виробу № ${row.productId}`, body: { productId: row.productId, userId: row.authorId || '', base: row.baseAmount ?? '', rate: row.rate, note: '' } } }
async function submit() {
 if (busy.value) return
 busy.value = true; error.value = ''; notice.value = ''
 try {
  if (!pending.value) { const request = { ...form.value, body: { ...form.value.body, requestKey: newRequestKey() } }; sessionStorage.setItem(key, JSON.stringify(request)); pending.value = request }
  await api(pending.value.path, pending.value.body)
  sessionStorage.removeItem(key); pending.value = null; form.value = null; notice.value = 'Операцію записано.'; await refresh()
 } catch (e) { error.value = e.message; if ([400, 403, 404, 409, 410, 422].includes(e.status)) { sessionStorage.removeItem(key); pending.value = null; form.value = null; await refresh().catch(() => {}) } }
 finally { busy.value = false }
}
onMounted(() => { try { pending.value = JSON.parse(sessionStorage.getItem(key) || 'null') } catch { error.value = 'Не вдалося прочитати незавершену операцію' } load() })
</script>
<template>
 <section class="rewards">
  <header><h2>{{ settingsOnly ? 'Відсотки винагороди менеджерів' : 'Винагороди менеджерів' }}</h2><button :disabled="busy" @click="load">Оновити</button></header>
  <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p><p v-if="busy">Завантаження / збереження…</p>

  <fieldset :disabled="busy || !!pending || !!form">
   <template v-if="settingsOnly && settings">
    <p>Винагорода належить автору замовлення. Персональний відсоток замінює загальний; порожнє поле означає загальний. Зміни діють на наступні видачі, без перерахунку минулих.</p>
    <label class="check"><input v-model="settings.settings.enabled" type="checkbox"> Нараховувати винагороди за нові видачі</label>
    <div class="fields"><label>Загальний відсоток<input v-model="settings.settings.rate" type="number" min="0" max="100" step="0.0001"></label><label>Персональний відсоток для<select v-model="personalUser" @change="choosePersonal"><option value="">Не змінювати персональні ставки</option><option v-for="u in settings.users" :key="u.id" :value="String(u.id)">{{ u.username }} · № {{ u.id }} · {{ u.rate == null ? 'загальний' : `${u.rate}%` }}</option></select></label><label v-if="personalUser">Персональний %<input v-model="personalRate" type="number" min="0" max="100" step="0.0001" placeholder="Загальний відсоток"></label></div><button @click="configure">Перевірити й зберегти</button>
   </template>
   <template v-if="!settingsOnly">
    <div class="fields"><label>Період з<input v-model="from" type="date"></label><label>по<input v-model="to" type="date"></label><button @click="page = 0; load()">Показати</button></div>
    <p>Нарахування — після видачі виробу. Виплата — запис уже переданих менеджеру грошей. Залишок враховує нарахування, коригування й виплати.</p>
    <div v-if="loaded" class="summary" aria-label="Підсумки винагород">
     <div><span>Нараховано за період</span><strong>{{ money(totals.earned / 100) }} грн</strong></div>
     <div><span>Виплачено за період</span><strong>{{ money(totals.paid / 100) }} грн</strong></div>
     <div class="due"><span>До виплати зараз</span><strong>{{ money(totals.due / 100) }} грн</strong></div>
     <div v-if="totals.overpaid"><span>Переплата</span><strong>{{ money(totals.overpaid / 100) }} грн</strong></div>
    </div><p v-if="loaded" class="muted">Період: {{ reportPeriod }}. Підсумки враховують коригування й скасування виплат. Залишок до виплати — за весь час; переплата показана окремо.</p>
    <article v-for="r in data.rows" :key="r.id"><strong>{{ r.username }} · {{ r.branchName }}</strong><div class="totals"><span>Нараховано за період: {{ money(r.earned) }}</span><span>Виплачено за період: {{ money(r.paid) }}</span><strong>{{ Number(r.balance) < 0 ? 'Переплата' : 'До виплати зараз' }}: {{ money(Math.abs(Number(r.balance))) }} грн</strong></div><div class="tools"><button v-if="data.canEdit" class="primary" :disabled="Number(r.balance) <= 0" @click="pay(r)">Видати винагороду</button><button @click="open(r)">Історія нарахувань і виплат</button></div></article>
    <p v-if="!data.rows.length">Нарахувань ще немає. Адміністратор має ввімкнути їх у налаштуваннях; нарахування з’являться після наступних видач.</p>
   </template>
  </fieldset>
  <section v-if="!settingsOnly && journal" class="journal">
   <h3>{{ selected.username }} · {{ selected.branchName }}</h3><p>Залишок: <strong>{{ money(journal.balance) }} грн</strong></p>
   <button v-if="data.canEdit" :disabled="busy || !!pending || !!form || Number(journal.balance) <= 0" @click="payment">Видати винагороду</button>
   <article v-for="e in journal.rows.slice(0, 50)" :key="e.id"><strong>№ {{ e.id }} · {{ labels[e.kind] }} · {{ money(e.amount) }} грн</strong><p v-if="e.productId">Замовлення № {{ e.orderNo }} · виріб № {{ e.productId }} · база {{ money(e.baseAmount) }} грн · {{ e.rate }}%</p><p v-if="e.sourceId">До запису № {{ e.sourceId }}</p><p>{{ e.note }}</p><small>{{ new Date(e.createdAt).toLocaleString('uk-UA') }} · {{ e.actor }}<span v-if="e.method"> · {{ e.method === 'CASH' ? 'готівка' : 'банківський переказ' }}</span></small><button v-if="data.canEdit && e.kind === 'ACCRUAL'" :disabled="busy || !!pending || !!form" @click="correction(e)">Коригування</button><button v-if="data.canEdit && e.kind === 'PAYOUT'" :disabled="busy || !!pending || !!form" @click="reverse(e)">Скасувати помилковий запис</button></article>
   <div class="tools"><button :disabled="busy || !!pending || !!form || page === 0" @click="page--; load()">Назад</button><span>{{ page + 1 }}</span><button :disabled="busy || !!pending || !!form || journal.rows.length <= 50" @click="page++; load()">Далі</button></div>
  </section>
  <details v-if="!settingsOnly && data.canEdit"><summary>Потребує уточнення ({{ reviews.length }}{{ reviews.length === 200 ? '+' : '' }})</summary><article v-for="r in reviews" :key="r.productId"><strong>Замовлення № {{ r.orderNo }} · виріб № {{ r.productId }}</strong><p>{{ r.reason }}</p><button :disabled="busy || !!pending || !!form" @click="resolve(r)">Уточнити й нарахувати</button></article></details>
  <dialog ref="dialog" class="operation-dialog" aria-label="Операція винагороди" @cancel="cancelDialog">
   <p v-if="error" role="alert">{{ error }}</p>
  <div v-if="pending" class="confirm"><strong>Результат операції ще не підтверджено</strong><p>{{ pending.title }}</p><p>Повторіть той самий запит. Нову операцію до перевірки створювати не потрібно.</p><button :disabled="busy" @click="submit">Перевірити результат</button></div>
  <form v-if="form && !pending" class="confirm" @submit.prevent="submit">
   <h3 id="reward-operation-title">{{ form.title }}</h3>
   <div v-if="form.body.kind === 'PAYOUT'" class="payout-summary"><p>Доступно до виплати: <strong>{{ money(journal.balance) }} грн</strong></p><p>Після виплати залишиться: <strong>{{ money(payoutRemaining) }} грн</strong></p><p class="muted">Можна видати всю суму або її частину. Підтверджуйте після фактичної передачі грошей менеджеру.</p></div>
   <template v-if="form.path === '/settings'"><p>Нарахування: {{ form.body.enabled ? 'увімкнено' : 'вимкнено' }} · загальний {{ form.body.rate }}%</p><p v-if="form.body.userId">Користувач № {{ form.body.userId }}: {{ form.body.personalRate == null ? 'загальний відсоток' : `${form.body.personalRate}%` }}</p></template>
   <template v-else><p v-if="form.body.accountId">{{ selected.username }} · {{ selected.branchName }}</p><div class="fields"><template v-if="form.path === '/review'"><label>Автор замовлення<select v-model.number="form.body.userId" required><option value="">Оберіть менеджера</option><option v-for="u in reviewUsers" :key="u.id" :value="u.id">{{ u.username }} · № {{ u.id }}</option></select></label><label>Остаточна сума виробу, грн<input v-model="form.body.base" type="number" min="0" step="0.01" required></label><label>Відсоток на момент видачі<input v-model="form.body.rate" type="number" min="0" max="100" step="0.0001" required></label></template><label v-else>Сума, грн<input v-model="form.body.amount" :readonly="form.body.kind === 'REVERSAL'" type="number" :max="form.body.kind === 'PAYOUT' ? journal.balance : undefined" :min="form.body.kind === 'PAYOUT' ? '0.01' : undefined" step="0.01" required></label><label v-if="form.body.kind === 'PAYOUT'">Спосіб виплати<select v-model="form.body.method"><option value="CASH">Готівка</option><option value="BANK">Банківський переказ</option></select></label></div><label>Підстава / примітка<input v-model="form.body.note" maxlength="1000" required placeholder="Наприклад: виплата за жовтень, номер платіжного документа"></label></template>
   <button class="primary" :disabled="busy || (form.body.kind === 'PAYOUT' && (payoutRemaining < 0 || Number(form.body.amount) <= 0))">{{ form.body.kind === 'PAYOUT' ? `Підтвердити виплату ${money(form.body.amount)} грн` : 'Підтвердити запис' }}</button><button type="button" :disabled="busy" @click="form = null">Скасувати</button>
  </form>
  </dialog>
 </section>
</template>
<style scoped>
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin:16px 0}.summary>div{display:grid;gap:8px;padding:16px;background:#f1f5f7;border-radius:10px}.summary span{font-size:13px}.summary strong{font-size:22px}.summary .due{background:#e5f3ec}.muted{color:#5f7180;font-size:12px}.primary{background:#185c63;color:white;border-color:#185c63}.operation-dialog{border:0;border-radius:12px;padding:16px;width:min(620px,calc(100vw - 40px));max-height:85dvh;overflow:auto;box-sizing:border-box;color:#233442}.operation-dialog::backdrop{background:rgb(20 35 45 / .5)}.operation-dialog .confirm{margin:0;background:white;padding:0}.operation-dialog h3{margin-top:0}.payout-summary{background:#edf7f2;border-radius:8px;padding:10px 14px}.operation-dialog label input,.operation-dialog label select{width:100%}@media(max-width:600px){.summary{grid-template-columns:1fr}.operation-dialog{padding:14px;width:calc(100vw - 20px)}}

.rewards{max-width:1100px;margin:auto;padding:16px;color:#233442}header,.tools,.totals{display:flex;flex-wrap:wrap;gap:12px;align-items:center}header{justify-content:space-between}h2{font-size:22px}p{font-size:14px;line-height:1.5}fieldset{border:0;padding:0;min-width:0}article{padding:13px;border:1px solid #dce4e9;border-radius:9px;margin:10px 0}.totals{margin:10px 0;font-size:13px}.fields{display:flex;flex-wrap:wrap;gap:12px}label{display:grid;gap:6px;margin:10px 0;font-size:13px}.check{display:flex;align-items:center}button,input,select{font:inherit;box-sizing:border-box;border:1px solid #bdccd4;border-radius:7px;padding:9px;min-height:44px;max-width:100%}button{cursor:pointer;margin:3px}button:disabled{opacity:.5}.confirm{padding:16px;background:#fff4d8;border-radius:9px;margin:14px 0}.journal{border-top:2px solid #185c63;margin-top:20px;padding-top:12px}summary{cursor:pointer;min-height:44px;align-content:center}[role=alert]{color:#a22}[role=status]{color:#276039}@media(max-width:650px){.rewards{padding:10px}.fields{display:grid}input,select{font-size:16px}.totals{display:grid;gap:5px}}
</style>
