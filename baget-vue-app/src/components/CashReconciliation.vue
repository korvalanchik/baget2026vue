<script setup>
import { computed, onMounted, ref } from 'vue'
import { cashApi } from '../services/cash.js'
import { newRequestKey } from '../services/requestKey.js'
const props = defineProps({ session: { type: Object, required: true }, account: { type: Object, required: true } })
const emit = defineEmits(['saved'])
const report = ref(null), history = ref(null), day = ref(''), actual = ref(''), note = ref(''), page = ref(0)
const busy = ref(false), loading = ref(false), error = ref(''), notice = ref(''), pending = ref(null)
const storageKey = `cash-reconciliation:${props.session.username || props.session.nickname || props.session.token}:${props.account.id}`
const money = n => Number(n || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const time = value => String(value || '').replace('T', ' ')
const categories = { CASH_OPENING: 'Початковий залишок, внесений цього дня', CASH_TRANSFER: 'Передача коштів', MANAGER_REWARD: 'Винагорода / скасування помилкової виплати', PAYMENT_RECEIVED: 'Оплата клієнтів', CUSTOMER_ADVANCE: 'Аванси клієнтів', CUSTOMER_REFUND: 'Повернення клієнтам' }
const difference = computed(() => actual.value === '' || !report.value ? null : Math.round((Number(actual.value) - Number(report.value.totals.expected)) * 100) / 100)
function snapshot(row) { try { return typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot } catch { return null } }
async function loadHistory(next = 0) { history.value = await cashApi(props.session.token, `/accounts/${props.account.id}/reconciliations?page=${next}`); page.value = next }
async function load() {
 if (loading.value || busy.value) return
 loading.value = true; error.value = ''; report.value = null; actual.value = ''
 try { report.value = await cashApi(props.session.token, `/accounts/${props.account.id}/day${day.value ? '?day=' + encodeURIComponent(day.value) : ''}`); day.value = report.value.day; await loadHistory() }
 catch (e) { error.value = e.message } finally { loading.value = false }
}
async function turn(next) { if (busy.value || loading.value) return; loading.value = true; try { await loadHistory(next) } catch (e) { error.value = e.message } finally { loading.value = false } }
async function save() {
 if (busy.value || loading.value) return
 busy.value = true; error.value = ''; notice.value = ''
 try {
  if (!pending.value) {
   if (!report.value?.canSave || actual.value === '' || !Number.isFinite(Number(actual.value)) || Number(actual.value) < 0) throw new Error('Введіть фактичну суму для поточного дня')
   if (difference.value !== 0 && !note.value.trim()) throw new Error('Для розбіжності додайте примітку')
   const body = { requestKey: newRequestKey(), accountId: props.account.id, day: report.value.day, lastLedgerId: report.value.totals.lastLedgerId, expectedAmount: report.value.totals.expected, actualAmount: Number(actual.value), note: note.value.trim() }
   sessionStorage.setItem(storageKey, JSON.stringify(body)); pending.value = body
  }
  const result = await cashApi(props.session.token, '/reconciliations', pending.value)
  sessionStorage.removeItem(storageKey); pending.value = null; actual.value = ''; note.value = ''; notice.value = result.message; await loadHistory(); emit('saved')
 } catch (e) {
  error.value = e.message
  if ([400, 403, 404, 409, 422].includes(e.status)) { sessionStorage.removeItem(storageKey); pending.value = null; report.value = null; actual.value = '' }
 } finally { busy.value = false }
}
onMounted(async () => { try { pending.value = JSON.parse(sessionStorage.getItem(storageKey) || 'null') } catch (e) { error.value = 'Не вдалося прочитати збережений запит' } await load() })
</script>
<template>
<section class="reconciliation">
 <header><h3>Звірка каси · {{ account.name }}</h3><button :disabled="busy || loading" @click="load">Оновити дані</button></header>
 <p>Звіряємо готівку на момент перерахунку. Запис не закриває день, не змінює залишок каси й не списує різницю.</p>
 <p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
 <aside v-if="pending">Є непідтверджений запит звірки за {{ pending.day }}: фактично {{ money(pending.actualAmount) }} грн. <button :disabled="busy || loading" @click="save">Перевірити / повторити</button></aside>
 <label>День за київським часом<input v-model="day" type="date" :max="report?.today" :disabled="busy || loading || !!pending" @change="load"></label>
 <p v-if="loading">Завантаження…</p>
 <template v-if="report">
 <div class="metrics"><div>На початок дня<strong>{{ money(report.totals.opening) }} грн</strong></div><div>Надійшло за день<strong>+{{ money(report.totals.incoming) }} грн</strong></div><div>Вибуло за день<strong>−{{ money(report.totals.outgoing) }} грн</strong></div><div>{{ report.canSave ? 'Розрахунковий залишок зараз' : 'На кінець дня' }}<strong>{{ money(report.totals.expected) }} грн</strong></div></div>
 <ul v-if="report.totals.movements.length"><li v-for="m in report.totals.movements" :key="m.category + m.direction">{{ categories[m.category] || m.category }} · {{ m.direction === 'IN' ? 'надходження' : 'вибуття' }}: <b>{{ money(m.amount) }} грн</b></li></ul><p v-else>Руху коштів цього дня немає.</p>
 <form v-if="report.canSave && !pending" @submit.prevent="save"><fieldset :disabled="busy || loading"><div class="fields"><label>Фактично в касі, грн<input v-model="actual" type="number" required min="0" max="999999999.99" step="0.01" placeholder="Перерахуйте готівку"></label><label>Примітка<input v-model="note" :required="difference !== null && difference !== 0" maxlength="1000" placeholder="За наявності різниці — пояснення"></label></div><p v-if="difference !== null" :class="{ discrepancy: difference !== 0 }">{{ difference === 0 ? 'Суми збігаються' : difference < 0 ? 'Нестача' : 'Надлишок' }}<strong v-if="difference !== 0">: {{ money(Math.abs(difference)) }} грн</strong></p><button>Зберегти звірку</button></fieldset></form>
 <p v-else-if="!report.canSave">Минулий день доступний для перегляду. Фактичний залишок фіксуємо лише за сьогодні.</p>
 </template>
 <h4>Історія звірок цієї каси</h4><template v-if="history"><p v-if="!history.rows.length">Звірок ще немає.</p><article v-for="r in history.rows" :key="r.id"><strong>{{ r.day }} · {{ r.actor }}</strong><small>Збережено: {{ time(r.createdAt) }} · №{{ r.id }}</small><p>За обліком: {{ money(r.expected) }} грн · Фактично: {{ money(r.actual) }} грн</p><p :class="{ discrepancy: Number(r.difference) !== 0 }">{{ Number(r.difference) === 0 ? 'Суми збігаються' : Number(r.difference) < 0 ? 'Нестача: ' + money(-Number(r.difference)) + ' грн' : 'Надлишок: ' + money(r.difference) + ' грн' }}</p><p>{{ r.note }}</p><details v-if="snapshot(r)"><summary>Суми на момент звірки</summary><p>На початок дня: {{ money(snapshot(r).opening) }} · Надійшло: {{ money(snapshot(r).incoming) }} · Вибуло: {{ money(snapshot(r).outgoing) }} грн</p></details></article><div><button :disabled="page === 0 || busy || loading" @click="turn(page - 1)">Назад</button> Сторінка {{ page + 1 }} <button :disabled="!history.hasMore || busy || loading" @click="turn(page + 1)">Далі</button></div></template>
</section>
</template>
<style scoped>
.reconciliation{display:grid;gap:12px;border:1px solid #cedce8;border-radius:12px;padding:16px;background:#f8fbff;min-width:0}.reconciliation header{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.reconciliation h3,.reconciliation h4,.reconciliation p{margin:0}.metrics,.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:12px}.metrics>div,article{background:white;padding:12px;border-radius:8px;border:1px solid #dce3ec;overflow-wrap:anywhere}.metrics strong,article small{display:block;margin-top:6px}.reconciliation label{display:grid;gap:6px}.reconciliation input{box-sizing:border-box;min-width:0;width:100%;min-height:44px;padding:9px;border:1px solid #bac7d5;border-radius:6px}.reconciliation button{min-height:44px;padding:8px 14px;border:1px solid #bac7d5;border-radius:6px;background:#edf4ff;cursor:pointer}.reconciliation fieldset{border:0;padding:0;min-width:0;display:grid;gap:12px}.reconciliation button:disabled{opacity:.5}.reconciliation .discrepancy,.error{color:#9e2631}.reconciliation article{display:grid;gap:6px}.reconciliation aside{padding:12px;background:#fff4d6}.reconciliation li{margin:6px 0}.reconciliation small{color:#53687b}
</style>
