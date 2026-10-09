<script setup>
import { computed, ref, watch } from 'vue'
import { cashApi } from '../services/cash.js'
import { newRequestKey } from '../services/requestKey.js'
const props = defineProps({ session: { type: Object, required: true }, receiptId: { type: Number, default: null } })
const emit = defineEmits(['changed', 'busy'])
const q = ref(''), page = ref(0), list = ref(null), data = ref(null), selected = ref(null)
const busy = ref(false), error = ref(''), notice = ref(''), pending = ref(null), reversing = ref(null)
const form = ref({ component: 'MATERIALS', accountId: '', amount: '', payee: '', documentRef: '', note: '' })
const reason = ref(''), confirmed = ref(false)
const labels = { MATERIALS: 'Матеріали', DELIVERY: 'Доставка', PROCUREMENT: 'Інші спільні витрати', DIRECT: 'Прямі витрати позицій' }
const money = n => Number(n || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const api = (path = '', body) => cashApi(props.session.token, '/receipt-payments' + path, body)
const key = computed(() => `receipt-payment:${props.session.username || props.session.nickname || props.session.token}:${selected.value}`)
const due = computed(() => data.value?.dues.find(d => d.component === form.value.component))
const totals = computed(() => (data.value?.dues || []).reduce((s, d) => ({ total: s.total + Number(d.total), paid: s.paid + Number(d.paid), remaining: s.remaining + Number(d.remaining) }), { total: 0, paid: 0, remaining: 0 }))
async function run(fn) { if (busy.value) return; busy.value = true; emit('busy', true); error.value = ''; try { await fn() } catch (e) { error.value = e.message } finally { busy.value = false; emit('busy', false); if (props.receiptId && Number(props.receiptId) !== selected.value) open(props.receiptId) } }
function choose() { form.value.amount = due.value?.remaining ?? ''; form.value.payee = form.value.component === 'MATERIALS' ? data.value?.receipt.vendorName || '' : ''; confirmed.value = false }
async function refreshDetail() { data.value = await api('/' + selected.value) }
function open(id) { return run(async () => { selected.value = Number(id); data.value = null; notice.value = ''; reversing.value = null; confirmed.value = false; pending.value = JSON.parse(sessionStorage.getItem(key.value) || 'null'); await refreshDetail(); form.value = { component: data.value.dues.find(d => Number(d.remaining) > 0)?.component || 'MATERIALS', accountId: '', amount: '', payee: '', documentRef: '', note: '' }; choose() }) }
function search(reset = true) { return run(async () => { if (reset) page.value = 0; list.value = await api(`?q=${encodeURIComponent(q.value.trim())}&page=${page.value}`) }) }
function turn(next) { if (busy.value) return; page.value = next; return search(false) }
async function send() {
 const request = pending.value
 try {
  const result = await api(request.path, request.body)
  sessionStorage.removeItem(key.value); pending.value = null; reversing.value = null; confirmed.value = false; notice.value = result.message; data.value = null; emit('changed')
  await refreshDetail(); choose()
 } catch (e) {
  if ([400, 403, 404, 409, 422].includes(e.status)) { sessionStorage.removeItem(key.value); pending.value = null; data.value = null; confirmed.value = false }
  throw e
 }
}
function pay() { return run(async () => {
 if (pending.value) return send()
 const amount = Number(form.value.amount)
 if (!data.value || !form.value.accountId || !Number.isFinite(amount) || amount <= 0 || amount > Number(due.value.remaining)) throw new Error('Оберіть касу / рахунок та суму в межах залишку складової')
 if (!confirmed.value || !form.value.payee.trim() || !form.value.note.trim()) throw new Error('Вкажіть отримувача, підставу і підтвердьте фактичну оплату')
 const request = { path: '/' + selected.value, body: { ...form.value, accountId: Number(form.value.accountId), amount, expectedRevision: data.value.revision, requestKey: newRequestKey() } }
 sessionStorage.setItem(key.value, JSON.stringify(request)); pending.value = request; await send()
}) }
function startReverse(row) { if (busy.value || pending.value) return; reversing.value = row; reason.value = ''; confirmed.value = false }
function reverse() { return run(async () => {
 if (pending.value) return send()
 if (!confirmed.value || !reason.value.trim()) throw new Error('Вкажіть причину та підтвердьте, що гроші не були витрачені')
 const request = { path: `/${selected.value}/reverse`, body: { requestKey: newRequestKey(), paymentId: reversing.value.id, expectedRevision: data.value.revision, note: reason.value.trim() } }
 sessionStorage.setItem(key.value, JSON.stringify(request)); pending.value = request; await send()
}) }
watch(() => props.receiptId, id => { if (id) open(id); else search() }, { immediate: true })
</script>
<template>
<section class="receipt-payments">
 <h3>Оплати закупівлі</h3><p>Оплата списує гроші з каси або банку. Вартість матеріалів і складський залишок при цьому не перераховуються.</p>
 <p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
 <template v-if="!receiptId"><form class="search" @submit.prevent="search()"><label>Накладна, постачальник або номер приходу<input v-model="q" maxlength="120" :disabled="busy"></label><button :disabled="busy">Знайти</button></form><div v-if="list" class="documents"><article v-for="r in list.rows" :key="r.id"><b>Прихід №{{ r.id }} · накладна {{ r.documentNo }}</b><p>{{ r.vendorName }} · {{ r.documentDate }}</p><button :disabled="busy || !!pending" @click="open(r.id)">Оплати закупівлі</button></article><p v-if="!list.rows.length">Проведених приходів за цими умовами немає.</p></div><div v-if="list"><button :disabled="busy || page === 0" @click="turn(page - 1)">Назад</button> {{ page + 1 }} <button :disabled="busy || !list.hasMore" @click="turn(page + 1)">Далі</button></div></template>
 <aside v-if="pending">Результат операції ще не підтверджено. Повторний запит використовує той самий ключ. <button :disabled="busy" @click="run(send)">Перевірити / повторити</button></aside>
 <button v-if="selected && !pending" :disabled="busy" @click="open(selected)">Оновити оплати приходу №{{ selected }}</button>
 <template v-if="data">
 <header><h4>Прихід №{{ data.receipt.id }} · накладна {{ data.receipt.documentNo }}</h4><p>{{ data.receipt.vendorName }} · {{ data.receipt.documentDate }}</p></header>
 <p class="warning">Тут враховано лише зареєстровані нижче оплати. Для старих приходів перевірте попередні розрахунки: не проводьте повторно гроші, які вже враховано в початковому залишку каси / банку.</p>
 <p v-if="!data.accounts.length">Немає доступних налаштованих кас або рахунків. Адміністратор має створити їх, встановити початкові залишки та перевірити ваш доступ.</p>
 <div class="amounts"><article v-for="d in data.dues" :key="d.component"><b>{{ labels[d.component] }}</b><p>За приходом: {{ money(d.total) }} грн</p><p>Оплат зареєстровано: {{ money(d.paid) }} грн</p><strong>Ще не зареєстровано: {{ money(d.remaining) }} грн</strong></article></div>
 <p>Разом за документом: {{ money(totals.total) }} грн · Оплат: {{ money(totals.paid) }} грн · Залишок для реєстрації: {{ money(totals.remaining) }} грн</p>
 <form v-if="!pending && !reversing && totals.remaining > 0" @submit.prevent="pay"><fieldset :disabled="busy"><legend>Зареєструвати фактичну оплату</legend><div class="fields"><label>За що<select v-model="form.component" @change="choose"><option v-for="d in data.dues" :key="d.component" :value="d.component" :disabled="Number(d.remaining) <= 0">{{ labels[d.component] }}</option></select></label><label>Каса / рахунок<select v-model="form.accountId" required><option value="">Оберіть</option><option v-for="a in data.accounts" :key="a.id" :value="a.id">{{ a.name }} · {{ money(a.balance) }} грн</option></select></label><label>Сума, грн<input v-model="form.amount" type="number" min="0.01" step="0.01" :max="Math.min(999999999.99,Number(due?.remaining || 0))" required></label><label>Кому сплачено<input v-model.trim="form.payee" maxlength="255" required></label><label>Номер платіжного документа<input v-model.trim="form.documentRef" maxlength="120"></label><label>Підстава / примітка<input v-model.trim="form.note" maxlength="1000" required></label></div><p>Можна сплатити частину суми. Для доставки й інших витрат вкажіть фактичного отримувача грошей.</p><label class="check"><input v-model="confirmed" type="checkbox" required> Підтверджую фактичну оплату саме з вибраної каси / рахунку</label><button>Провести оплату</button></fieldset></form>
 <form v-if="reversing && !pending" @submit.prevent="reverse"><fieldset :disabled="busy"><legend>Сторнувати помилкову оплату №{{ reversing.id }}</legend><p>{{ money(reversing.amount) }} грн буде повернено в обліку до {{ reversing.accountName }}. Використовуйте лише для помилкового запису, якщо гроші фактично не були витрачені. Реальне повернення від постачальника тут не оформлюється.</p><label>Причина<input v-model.trim="reason" maxlength="1000" required></label><label class="check"><input v-model="confirmed" type="checkbox" required> Це помилковий запис, кошти фактично залишилися в касі / банку</label><button>Підтвердити сторнування</button><button type="button" @click="reversing = null; confirmed = false">Скасувати</button></fieldset></form>
 <h4>Історія оплат</h4><p v-if="!data.payments.length">Оплат у цьому обліку ще немає.</p><article v-for="p in data.payments" :key="p.id" class="entry"><strong>{{ p.kind === 'PAYMENT' ? 'Оплата' : 'Сторно' }} №{{ p.id }} · {{ money(p.amount) }} грн · {{ labels[p.component] }}</strong><p>{{ p.payee }} · {{ p.accountName }}</p><p>{{ p.documentRef }} · {{ p.note }}</p><small>{{ String(p.createdAt).replace('T',' ') }} · {{ p.actor }}<span v-if="p.reversalOf"> · до оплати №{{ p.reversalOf }}</span></small><button v-if="p.canReverse" :disabled="busy || !!pending" @click="startReverse(p)">Сторнувати помилковий запис</button></article>
 </template>
</section>
</template>
<style scoped>
.receipt-payments{padding:16px;border:1px solid #ccdbe4;border-radius:10px;background:#f8fbfe;min-width:0;display:grid;gap:12px}.receipt-payments h3,.receipt-payments h4,.receipt-payments p{margin:0}.documents,.amounts,.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:12px}.documents article,.amounts article,.entry{background:white;border:1px solid #d5e0e8;border-radius:8px;padding:12px;display:grid;gap:8px;overflow-wrap:anywhere}.receipt-payments label{display:grid;gap:6px;min-width:0}.receipt-payments input,.receipt-payments select{min-width:0;width:100%;box-sizing:border-box;padding:9px;min-height:44px;border:1px solid #bac7d5;border-radius:6px;font:inherit}.receipt-payments button{min-height:44px;padding:9px 14px;border:1px solid #bac7d5;border-radius:6px;cursor:pointer;white-space:normal}.receipt-payments button:disabled{opacity:.5}.receipt-payments fieldset{min-width:0;border:0;padding:0;display:grid;gap:12px}.receipt-payments legend{font-weight:600;margin-bottom:10px}.receipt-payments .check{display:flex;align-items:center;gap:10px}.receipt-payments .check input{width:20px;flex-shrink:0}.warning,.receipt-payments aside{background:#fff3d4;padding:12px;border-radius:6px}.error{color:#a22}.search{display:flex;align-items:end;gap:8px;flex-wrap:wrap}.search label{flex:1}
</style>
