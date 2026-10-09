<script setup>
import { computed, onMounted, ref } from 'vue'
import CashReconciliation from './CashReconciliation.vue'
import { cashApi } from '../services/cash.js'
import { newRequestKey } from '../services/requestKey.js'
const props = defineProps({ session: { type: Object, required: true } })
const data = ref(null), options = ref({ branches: [] }), busy = ref(false), error = ref(''), message = ref('')
const reconciliationAccount = ref(null), differences = ref([])
const selected = ref(null), journal = ref(null), page = ref(0)
const create = ref({ name: '', kind: 'BRANCH_CASH', branchNo: '' })
const opening = ref({ accountId: '', amount: '', note: '' })
const send = ref({ sourceId: '', destinationId: '', amount: '', note: '' })
const receive = ref(null), pending = ref(null)
const storageKey = computed(() => `cash-request:${props.session.username || props.session.user?.username || props.session.token}`)
const types = { BRANCH_CASH: 'Каса філії', CENTRAL_CASH: 'Центральна каса', BANK: 'Банківський рахунок', TRANSIT: 'Кошти в дорозі' }
const categories = { CASH_OPENING: 'Початковий залишок', CASH_TRANSFER: 'Передача коштів', MANAGER_REWARD: 'Винагорода менеджеру', PAYMENT_RECEIVED: 'Оплата клієнта', CUSTOMER_ADVANCE: 'Аванс клієнта' }
const money = n => Number(n || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const initialized = a => a.initialized === true || Number(a.initialized) === 1
const sources = computed(() => (data.value?.accounts || []).filter(a => initialized(a) && a.kind !== 'TRANSIT'))
const destinations = computed(() => (data.value?.canEdit ? sources.value : data.value?.destinations || []).filter(a => Number(a.id) !== Number(send.value.sourceId)))
async function load() {
 error.value = ''
 try { const [overview, settings] = await Promise.all([cashApi(props.session.token), cashApi(props.session.token, '/options')]); data.value = overview; options.value = settings; differences.value = overview.canConfigure ? await cashApi(props.session.token, '/reconciliation-differences') : [] }
 catch (e) { data.value = null; error.value = e.message }
}
async function ledger(account, next = 0) {
 selected.value = account; page.value = next; journal.value = null
 try { const result = await cashApi(props.session.token, `/accounts/${account.id}/journal?page=${next}`); if (selected.value?.id === account.id && page.value === next) journal.value = result }
 catch (e) { error.value = e.message }
}
async function execute(path, payload) {
 if (busy.value || pending.value) return
 try { pending.value = { path, body: { ...payload, requestKey: newRequestKey() } }; sessionStorage.setItem(storageKey.value, JSON.stringify(pending.value)) }
 catch (e) { pending.value = null; error.value = 'Не вдалося зберегти ключ операції. Дозвольте зберігання даних у браузері.'; return }
 await retry()
}
async function retry() {
 if (busy.value || !pending.value) return
 busy.value = true; error.value = ''; message.value = ''
 try {
  const result = await cashApi(props.session.token, pending.value.path, pending.value.body)
  pending.value = null; sessionStorage.removeItem(storageKey.value)
  message.value = result.message || 'Операцію збережено.'; receive.value = null
  send.value.amount = ''; send.value.note = ''; opening.value.amount = ''; opening.value.note = ''
  await load(); if (selected.value) await ledger(selected.value)
 } catch (e) {
  error.value = e.message
  if ([400, 403, 404, 409, 422].includes(e.status)) { pending.value = null; sessionStorage.removeItem(storageKey.value) }
 } finally { busy.value = false }
}
function startReceive(t) { receive.value = { transferId: t.id, amount: '', note: '', expected: t.amount, source: t.sourceName } }
onMounted(async () => { try { pending.value = JSON.parse(sessionStorage.getItem(storageKey.value) || 'null') } catch {} await load() })
</script>
<template>
<section class="cash-desk">
 <header><div><h2>Каси та рахунки</h2><p>Фактичні кошти підприємства. Розрахунки клієнтів філій посередника сюди не входять.</p></div><button :disabled="busy" @click="load">Оновити</button></header>
 <p v-if="error" role="alert" class="error">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
 <aside v-if="pending" class="warning">Є незавершений запит на {{ money(pending.body.amount) }} грн. Повторна перевірка використовує той самий ключ і не дублює операцію. <button :disabled="busy" @click="retry">Перевірити / повторити</button></aside>
 <template v-if="data">
 <div class="accounts"><article v-for="a in data.accounts" :key="a.id"><small>{{ types[a.kind] }} · {{ a.branchName }}</small><h3>{{ a.name }}</h3><strong>{{ money(a.balance) }} грн</strong><p v-if="!initialized(a)">Потрібен початковий залишок</p><button @click="ledger(a)">Рух коштів</button><button v-if="initialized(a) && ['BRANCH_CASH', 'CENTRAL_CASH'].includes(a.kind)" @click="reconciliationAccount = a">Звірити готівку</button></article></div>
 <CashReconciliation v-if="reconciliationAccount" :key="reconciliationAccount.id" :account="reconciliationAccount" :session="session" @saved="load" />
 <section v-if="data.canConfigure"><h3>Розбіжності за останньою звіркою кожної каси</h3><p>Показано останній збережений перерахунок, який може бути за попередній день. Повна історія залишається в касі.</p><p v-if="!differences.length">У останніх збережених звірках розбіжностей немає. Каси без звірок цим не підтверджені.</p><div class="accounts"><article v-for="r in differences" :key="r.id"><strong>{{ r.accountName }}</strong><p>{{ r.day }} · {{ r.actor }}</p><p>{{ Number(r.difference) < 0 ? 'Нестача' : 'Надлишок' }}: {{ money(Math.abs(Number(r.difference))) }} грн</p><p>{{ r.note }}</p><button @click="reconciliationAccount = data.accounts.find(a => Number(a.id) === Number(r.accountId))">Відкрити звірку</button></article></div></section>
 <p v-if="!data.accounts.length">Каси ще не налаштовані або недоступні для вашої філії.</p>
 <details v-if="data.canConfigure"><summary>Налаштувати каси та початкові залишки</summary><p>Спочатку створіть центральну касу, потім каси власних філій і банківські рахунки. Для кожної вкажіть фактичний залишок на момент початку обліку, навіть якщо це 0. Давні платежі автоматично не переносяться.</p>
 <form @submit.prevent="execute('/accounts', { ...create, branchNo: Number(create.branchNo) })"><h3>Нова каса / рахунок</h3><div class="fields"><label>Назва<input v-model.trim="create.name" required maxlength="150"></label><label>Тип<select v-model="create.kind"><option value="BRANCH_CASH">Каса філії</option><option value="CENTRAL_CASH">Центральна каса</option><option value="BANK">Банківський рахунок</option></select></label><label>Власна філія обліку<select v-model="create.branchNo" required><option disabled value="">Оберіть</option><option v-for="b in options.branches" :key="b.id" :value="b.id">{{ b.name }}</option></select></label></div><button :disabled="busy || !!pending">Створити</button></form>
 <form @submit.prevent="execute('/opening', { ...opening, accountId: Number(opening.accountId), amount: Number(opening.amount) })"><h3>Початковий залишок — одноразово</h3><div class="fields"><label>Каса / рахунок<select v-model="opening.accountId" required><option disabled value="">Оберіть</option><option v-for="a in data.accounts.filter(a => !initialized(a))" :key="a.id" :value="a.id">{{ a.name }}</option></select></label><label>Фактична сума, грн<input v-model="opening.amount" required type="number" min="0" max="999999999.99" step="0.01"></label><label>Підстава<input v-model.trim="opening.note" required maxlength="1000" placeholder="Звірено за перерахунком / випискою"></label></div><button :disabled="busy || !!pending">Встановити початковий залишок</button></form></details>
 <form @submit.prevent="execute('/transfers', { ...send, sourceId: Number(send.sourceId), destinationId: Number(send.destinationId), amount: Number(send.amount) })"><h3>{{ data.canEdit ? 'Передати кошти' : 'Передати гроші до офісу' }}</h3><p>Після відправлення сума буде в дорозі до підтвердження отримання іншим бухгалтером або адміністратором.</p><div class="fields"><label>Звідки<select v-model="send.sourceId" required @change="send.destinationId = ''"><option disabled value="">Оберіть касу / рахунок</option><option v-for="a in sources" :key="a.id" :value="a.id">{{ a.name }} — {{ money(a.balance) }} грн</option></select></label><label>Куди<select v-model="send.destinationId" required><option disabled value="">Оберіть</option><option v-for="a in destinations" :key="a.id" :value="a.id">{{ a.name }}</option></select></label><label>Сума, грн<input v-model="send.amount" required type="number" min="0.01" max="999999999.99" step="0.01"></label><label>Примітка<input v-model.trim="send.note" required maxlength="1000" placeholder="Кому передано / документ"></label></div><button :disabled="busy || !!pending">Підтвердити відправлення</button></form>
 <h3>Кошти в дорозі</h3><p v-if="!data.transfers.length">Непідтверджених передач немає.</p><div class="accounts"><article v-for="t in data.transfers" :key="t.id"><h4>Передача №{{ t.id }} · {{ money(t.amount) }} грн</h4><p>{{ t.sourceName }} → {{ t.destinationName }}</p><p>Відправив: {{ t.sent_by }} · {{ t.sent_at }}</p><p>{{ t.note }}</p><p v-if="t.discrepancy" class="warning">Розбіжність: {{ t.discrepancy }}</p><button v-if="data.canEdit" :disabled="busy || !!pending" @click="startReceive(t)">Прийняти / звірити</button></article></div>
 <form v-if="receive" @submit.prevent="execute('/receive', { transferId: receive.transferId, amount: Number(receive.amount), note: receive.note })"><h3>Приймання передачі №{{ receive.transferId }}</h3><p>{{ receive.source }} · Очікується {{ money(receive.expected) }} грн. Введіть фактично отриману суму. Якщо суми різні, записуємо розбіжність, а кошти залишаються в дорозі.</p><div class="fields"><label>Фактично отримано, грн<input v-model="receive.amount" required type="number" min="0" max="999999999.99" step="0.01"></label><label>Примітка<input v-model.trim="receive.note" required maxlength="1000"></label></div><button :disabled="busy || !!pending">Підтвердити результат звірки</button><button type="button" :disabled="busy" @click="receive = null">Закрити</button></form>
 <section v-if="selected"><h3>{{ selected.name }} — рух коштів</h3><p v-if="!journal">Завантаження…</p><template v-else><p v-if="!journal.rows.length">Записів немає.</p><div class="entries"><article v-for="r in journal.rows" :key="r.id"><strong>{{ r.direction === 'IN' ? '+' : '−' }}{{ money(r.amount) }} грн</strong><span>{{ categories[r.category] || r.category }}</span><small>{{ r.createdAt }} · {{ r.actor }}</small><span>{{ r.note }}</span><small v-if="r.transferId">Передача №{{ r.transferId }}</small><small v-if="r.rewardEntryId">Запис винагороди №{{ r.rewardEntryId }}</small></article></div><button :disabled="page === 0" @click="ledger(selected, page - 1)">Назад</button><span> Сторінка {{ page + 1 }} </span><button :disabled="!journal.hasMore" @click="ledger(selected, page + 1)">Далі</button></template></section>
 </template>
</section>
</template>
<style scoped>
.cash-desk{max-width:1200px;margin:auto;display:grid;gap:16px;min-width:0}.cash-desk header{display:flex;align-items:start;justify-content:space-between;gap:12px}.cash-desk h2,.cash-desk h3,.cash-desk h4{margin:0 0 8px}.cash-desk p{margin:6px 0 12px;line-height:1.5}.accounts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px}.accounts article,form,details,.entries article{padding:16px;border:1px solid #dce3ec;border-radius:12px;background:white;min-width:0;overflow-wrap:anywhere}.accounts strong{display:block;font-size:1.5rem;margin:10px 0}.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:12px;margin:12px 0}.fields label{display:grid;gap:5px;min-width:0}.cash-desk input,.cash-desk select{width:100%;min-width:0;box-sizing:border-box;min-height:44px;padding:9px;border:1px solid #bac7d5;border-radius:7px}.cash-desk button{min-height:44px;padding:8px 14px;margin:4px 4px 0 0;white-space:normal;cursor:pointer;border:1px solid #bac7d5;border-radius:7px;background:#edf4ff;color:#163b65}.cash-desk button:disabled{opacity:.5;cursor:default}.error{color:#a51d2d}.warning{background:#fff4d6;padding:12px;border-radius:8px}.entries{display:grid;gap:8px;margin-bottom:12px}.entries article{display:grid;grid-template-columns:140px 1fr;gap:6px}.cash-desk small{color:#52657c}.cash-desk summary{cursor:pointer;min-height:36px;font-weight:600}@media(max-width:600px){.cash-desk header{flex-direction:column}.entries article{grid-template-columns:1fr}.cash-desk button{max-width:100%}}
</style>
