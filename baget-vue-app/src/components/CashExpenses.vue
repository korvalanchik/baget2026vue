<script setup>
import { computed, onMounted, ref } from 'vue'
import { cashApi } from '../services/cash.js'
import { newRequestKey } from '../services/requestKey.js'
const props = defineProps({ session: { type: Object, required: true } })
const emit = defineEmits(['changed'])
const labels = { RENT: 'Оренда', UTILITIES: 'Комунальні послуги', REPAIR: 'Ремонт устаткування', HOUSEHOLD: 'Господарські витрати', OTHER: 'Інші поточні витрати' }
const options = ref(null), journal = ref(null), busy = ref(false), error = ref(''), message = ref(''), pending = ref(null)
const form = ref({ accountId: '', day: '', category: 'RENT', amount: '', payee: '', documentRef: '', note: '' })
const filters = ref({ from: '', to: '', accountId: '', category: '' }), page = ref(0)
const confirmed = ref(false), reversal = ref(null), reversalConfirmed = ref(false)
const key = computed(() => `cash-expense-request:${props.session.username || props.session.user?.username || props.session.token}`)
const blocked = computed(() => busy.value || !!pending.value || !options.value)
const money = n => Number(n || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const isTrue = value => value === true || Number(value) === 1
async function reload(next = page.value) {
 page.value = next; journal.value = null
 const params = new URLSearchParams({ from: filters.value.from, to: filters.value.to, category: filters.value.category, page: String(next) })
 if (filters.value.accountId) params.set('accountId', filters.value.accountId)
 journal.value = await cashApi(props.session.token, `/expenses?${params}`)
}
async function load(next = 0) {
 if (busy.value) return
 busy.value = true; error.value = ''
 try { await reload(next) } catch (e) { error.value = e.message } finally { busy.value = false }
}
async function execute(path, body) {
 if (blocked.value) return
 error.value = ''; message.value = ''
 const request = { path, body: { ...body, requestKey: newRequestKey() } }
 try { sessionStorage.setItem(key.value, JSON.stringify(request)); pending.value = request }
 catch { error.value = 'Не вдалося зберегти ключ операції. Дозвольте зберігання даних у браузері.'; return }
 await retry()
}
function spend() {
 if (!confirmed.value) return
 execute('/expenses', { ...form.value, accountId: Number(form.value.accountId), amount: form.value.amount })
}
function startReverse(row) { reversal.value = { id: row.id, amount: row.amount, accountName: row.accountName, note: '' }; reversalConfirmed.value = false }
function reverse() {
 if (!reversal.value || !reversalConfirmed.value) return
 execute(`/expenses/${reversal.value.id}/reverse`, { note: reversal.value.note })
}
async function retry() {
 if (busy.value || !pending.value) return
 busy.value = true; error.value = ''; message.value = ''
 let committed = false
 try {
  const result = await cashApi(props.session.token, pending.value.path, pending.value.body)
  committed = true
  sessionStorage.removeItem(key.value); pending.value = null
  message.value = result.message; form.value.amount = ''; form.value.documentRef = ''; form.value.note = ''; confirmed.value = false; reversal.value = null
  emit('changed'); await reload(0)
 } catch (e) {
  error.value = committed ? `Операцію проведено, але список не оновлено: ${e.message}. Натисніть «Оновити журнал».` : e.message
  if (!committed && [400, 403, 404, 409, 422].includes(e.status)) {
   try { sessionStorage.removeItem(key.value); pending.value = null } catch {}
   confirmed.value = false; reversalConfirmed.value = false
  }
 } finally { busy.value = false }
}
async function initialize() {
 if (busy.value) return
 busy.value = true; error.value = ''
 try {
  pending.value = JSON.parse(sessionStorage.getItem(key.value) || 'null')
  options.value = await cashApi(props.session.token, '/expenses/options')
  form.value.day = options.value.today; filters.value.from = `${options.value.today.slice(0, 7)}-01`; filters.value.to = options.value.today
  await reload(0)
 } catch (e) { error.value = e.message } finally { busy.value = false }
}
onMounted(initialize)
</script>
<template>
<section class="cash-expenses">
 <h3>Поточні витрати підприємства</h3>
 <p>Оренда, комунальні послуги, ремонт і господарські витрати. Оплати закупівель та винагороди менеджерам проводьте у відповідних формах.</p>
 <p v-if="error" class="error" role="alert">{{ error }}</p><button v-if="!options" :disabled="busy" @click="initialize">{{ busy ? 'Завантаження…' : 'Завантажити форму' }}</button><p v-if="message" class="success" role="status">{{ message }}</p>
 <aside v-if="pending" class="warning">Результат запиту ще не підтверджено. Перевірте його перед новою операцією.<button :disabled="busy" @click="retry">Перевірити / повторити</button></aside>
 <form v-if="options" @submit.prevent="spend">
 <fieldset :disabled="blocked"><legend>Зареєструвати сплачену витрату</legend>
 <div class="fields">
 <label>Каса / рахунок<select v-model="form.accountId" required><option disabled value="">Оберіть</option><option v-for="a in options.accounts" :key="a.id" :value="a.id">{{ a.name }}</option></select></label>
 <label>Дата платежу<input v-model="form.day" type="date" :max="options.today" required></label>
 <label>Категорія<select v-model="form.category"><option v-for="(name, value) in labels" :key="value" :value="value">{{ name }}</option></select></label>
 <label>Сума, грн<input v-model="form.amount" type="number" min="0.01" max="999999999.99" step="0.01" required></label>
 <label>Отримувач<input v-model.trim="form.payee" required maxlength="255"></label>
 <label>Документ (необов’язково)<input v-model.trim="form.documentRef" maxlength="120" placeholder="Номер квитанції / платіжної інструкції"></label>
 <label class="wide">Призначення<input v-model.trim="form.note" required maxlength="1000" placeholder="Наприклад: оренда майстерні за жовтень"></label>
 </div>
 <p class="hint">Залишок зміниться зараз. Дата платежу зберігається окремо; попередні касові звірки не переписуються. Не вносьте витрату, вже враховану в початковому залишку.</p>
 <label class="check"><input v-model="confirmed" type="checkbox" required> Кошти фактично сплачено, цю операцію ще не зареєстровано.</label>
 <button :disabled="!confirmed">Провести витрату</button><p v-if="!options.accounts.length">Немає доступних кас / рахунків із початковим залишком.</p>
 </fieldset></form>
 <section v-if="options">
 <h4>Журнал витрат</h4>
 <form @submit.prevent="load(0)"><fieldset :disabled="busy"><div class="fields">
 <label>Від<input v-model="filters.from" type="date" required></label><label>До<input v-model="filters.to" type="date" :min="filters.from" required></label>
 <label>Каса / рахунок<select v-model="filters.accountId"><option value="">Усі доступні</option><option v-for="a in options.accounts" :key="a.id" :value="a.id">{{ a.name }}</option></select></label>
 <label>Категорія<select v-model="filters.category"><option value="">Усі</option><option v-for="(name, value) in labels" :key="value" :value="value">{{ name }}</option></select></label>
 </div><button>Оновити журнал</button></fieldset></form>
 <p class="hint">Підсумки за датою платежу або сторнування. Сторно враховується датою його проведення.</p>
 <template v-if="journal">
 <div class="totals"><span>Витрати <strong>{{ money(journal.totals.spent) }} грн</strong></span><span>Сторнування <strong>{{ money(journal.totals.reversed) }} грн</strong></span><span>Разом <strong>{{ money(journal.totals.net) }} грн</strong></span></div>
 <p v-if="!journal.rows.length">За цими умовами витрат немає.</p>
 <div class="entries"><article v-for="row in journal.rows" :key="row.id">
 <header><strong>{{ row.kind === 'REVERSAL' ? 'Сторно' : 'Витрата' }} №{{ row.id }} · {{ money(row.amount) }} грн</strong><span>{{ labels[row.category] }}</span></header>
 <p>{{ row.day }} · {{ row.accountName }} · {{ row.payee }}</p><p>{{ row.note }}</p><small v-if="row.documentRef">Документ: {{ row.documentRef }}</small><small>Зареєстрував: {{ row.actor }} · {{ row.createdAt }}</small>
 <small v-if="row.reversalOf">Сторнування витрати №{{ row.reversalOf }}</small><small v-else-if="!isTrue(row.canReverse)">Сторновано</small>
 <button v-if="isTrue(row.canReverse)" :disabled="blocked" @click="startReverse(row)">Сторнувати помилковий запис</button>
 <form v-if="reversal?.id === row.id" @submit.prevent="reverse"><fieldset :disabled="blocked"><legend>Сторно витрати №{{ row.id }}</legend><p>У {{ reversal.accountName }} буде повернуто {{ money(reversal.amount) }} грн. Це виправлення помилкового запису. Повернення коштів від постачальника тут не оформлюється.</p><label>Причина<input v-model.trim="reversal.note" required maxlength="1000"></label><label class="check"><input v-model="reversalConfirmed" type="checkbox" required> Запис помилковий, кошти фактично залишилися в касі / на рахунку.</label><button :disabled="!reversalConfirmed">Підтвердити сторно</button><button type="button" @click="reversal = null">Скасувати</button></fieldset></form>
 </article></div>
 <nav><button :disabled="busy || page === 0" @click="load(page - 1)">Назад</button><span>Сторінка {{ page + 1 }}</span><button :disabled="busy || !journal.hasMore" @click="load(page + 1)">Далі</button></nav>
 </template></section>
</section>
</template>
<style scoped>
.cash-expenses{display:grid;gap:12px;min-width:0}.cash-expenses h3,.cash-expenses h4{margin:8px 0}.cash-expenses p{line-height:1.5;margin:8px 0}.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:12px}.wide{grid-column:1/-1}label{display:grid;gap:5px;min-width:0}fieldset{min-width:0;margin:0;padding:12px;border:1px solid #dce3ec;border-radius:10px}input,select{width:100%;min-width:0;box-sizing:border-box;min-height:44px;padding:9px;border:1px solid #bac7d5;border-radius:7px}.check{display:flex;align-items:center;gap:9px;margin:12px 0}.check input{width:20px;min-height:20px;flex:0 0 20px}button{min-height:44px;padding:8px 14px;margin:5px 5px 0 0;max-width:100%;white-space:normal;border:1px solid #bac7d5;border-radius:7px;background:#edf4ff;color:#163b65;cursor:pointer}button:disabled{opacity:.5;cursor:default}.entries{display:grid;gap:10px}.entries article{min-width:0;overflow-wrap:anywhere;border:1px solid #dce3ec;border-radius:10px;padding:12px}.entries header{display:flex;gap:10px;justify-content:space-between;flex-wrap:wrap}.entries small{display:block;margin:5px 0}.totals{display:flex;flex-wrap:wrap;gap:16px;padding:12px;background:#eff5fb;border-radius:10px}.totals strong{display:block}.hint,small{color:#52657c}.error{color:#a51d2d}.success{color:#21643d}.warning{background:#fff4d6;padding:12px;border-radius:8px}nav{display:flex;gap:10px;align-items:center;flex-wrap:wrap}@media(max-width:600px){.fields{grid-template-columns:1fr}.entries header{display:grid}}
</style>
