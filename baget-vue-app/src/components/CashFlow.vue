<script setup>
import { computed, onMounted, ref } from 'vue'
import { cashApi } from '../services/cash.js'
const props = defineProps({ session: { type: Object, required: true } })
const report = ref(null), busy = ref(false), error = ref(''), from = ref(''), to = ref(''), today = ref('')
const money = n => Number(n || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nonzero = n => Number(n || 0) !== 0
const types = { BRANCH_CASH: 'Каса філії', CENTRAL_CASH: 'Центральна каса', BANK: 'Банківський рахунок', TRANSIT: 'Кошти в дорозі' }
const categories = { CASH_OPENING: 'Внесення початкового залишку', CASH_TRANSFER: 'Внутрішня передача', MANAGER_REWARD: 'Винагорода менеджеру', PAYMENT_RECEIVED: 'Оплата клієнтів', CUSTOMER_ADVANCE: 'Аванси клієнтів', CUSTOMER_REFUND: 'Повернення клієнтам', MATERIAL_PURCHASE: 'Оплата матеріалів', PURCHASE_DELIVERY: 'Доставка закупівлі', PURCHASE_PROCUREMENT: 'Спільні витрати закупівлі', PURCHASE_DIRECT: 'Прямі витрати закупівлі', OVERHEAD_EXPENSE: 'Поточні витрати' }
const initialized = a => a.initialized === true || Number(a.initialized) === 1
const transit = computed(() => (report.value?.rows || []).filter(a => a.kind === 'TRANSIT').reduce((sum, a) => sum + Number(a.totals.closing), 0))
const filtersChanged = computed(() => !!report.value && (from.value !== report.value.from || to.value !== report.value.to))
async function load() {
 if (busy.value) return
 busy.value = true; error.value = ''; report.value = null
 try {
  const params = new URLSearchParams()
  if (from.value) params.set('from', from.value)
  if (to.value) params.set('to', to.value)
  const result = await cashApi(props.session.token, `/flow?${params}`)
  report.value = result; from.value = result.from; to.value = result.to; today.value = result.today
 } catch (e) { error.value = e.message } finally { busy.value = false }
}
onMounted(load)
</script>
<template>
<section class="cash-flow">
 <header><h3>Рух коштів за період</h3><p>Касові проводки за датою реєстрації, часовий пояс — Київ. Це рух грошей, а не звіт про прибуток.</p></header>
 <form @submit.prevent="load"><fieldset :disabled="busy"><div class="filters"><label>Від<input v-model="from" type="date" :max="to || today || undefined" required></label><label>До<input v-model="to" type="date" :min="from || undefined" :max="today || undefined" required></label><button>{{ busy ? 'Завантаження…' : 'Оновити зведення' }}</button></div></fieldset></form>
 <p v-if="error" class="error" role="alert">{{ error }}</p><button v-if="error && !today" :disabled="busy" @click="load">Повторити завантаження</button>
 <template v-if="report">
 <p v-if="filtersChanged" class="warning">Дати змінено. Натисніть «Оновити зведення», щоб застосувати їх.</p>
 <h4>{{ report.completeScope ? 'Усі каси та рахунки підприємства' : 'Лише доступні вам каси та рахунки' }}</h4>
 <p>{{ report.from }} — {{ report.to }} · Оновлено: {{ new Date(report.generatedAt).toLocaleString('uk-UA') }}</p>
 <p v-if="!report.completeScope" class="warning">Частина кас недоступна за вашими правами. Передачі між доступною та недоступною касою можуть не врівноважуватися в цьому зведенні.</p>
 <p v-if="report.uninitializedCount" class="warning">Кас / рахунків без початкового залишку: {{ report.uninitializedCount }}. Їхні фактичні кошти ще не внесено до обліку.</p>
 <div class="summary">
 <article><small>На початок періоду</small><strong>{{ money(report.totals.opening) }} грн</strong></article>
 <article><small>Надходження</small><strong>{{ money(report.totals.incoming) }} грн</strong></article>
 <article><small>Виплати</small><strong>{{ money(report.totals.outgoing) }} грн</strong></article>
 <article class="balance"><small>На кінець періоду</small><strong>{{ money(report.totals.closing) }} грн</strong><small>Зокрема в дорозі: {{ money(transit) }} грн</small></article>
 </div>
 <div class="adjustments"><p v-if="nonzero(report.totals.initialAdded)">Початкові залишки, внесені протягом періоду: <b>{{ money(report.totals.initialAdded) }} грн</b></p><p v-if="nonzero(report.totals.reversalIn) || nonzero(report.totals.reversalOut)">Сторнування: повернуто {{ money(report.totals.reversalIn) }} грн · списано {{ money(report.totals.reversalOut) }} грн.</p><p>Внутрішні передачі: отримано {{ money(report.totals.transferIn) }} грн · відправлено {{ money(report.totals.transferOut) }} грн. У звичайні надходження та виплати ці суми не входять.</p></div>
 <p v-if="report.completeScope && nonzero(report.transferDifference)" class="warning">Внутрішні передачі не врівноважуються на {{ money(report.transferDifference) }} грн. Перевірте касові проводки.</p>
 <p class="hint">Залишок на кінець = залишок на початок + внесені початкові залишки + надходження − виплати + отримані передачі − відправлені передачі + повернення через сторно − списання через сторно.</p>
 <p v-if="!report.rows.length">Доступних кас або рахунків немає.</p>
 <div class="accounts"><article v-for="a in report.rows" :key="a.id"><header><h4>{{ a.name }}</h4><small>{{ types[a.kind] }} · {{ a.branchName }}</small></header><p v-if="!initialized(a)" class="warning">Початковий залишок не встановлено.</p><dl>
 <div><dt>На початок</dt><dd>{{ money(a.totals.opening) }}</dd></div>
 <div v-if="nonzero(a.totals.initialAdded)"><dt>Внесено початковий залишок</dt><dd>{{ money(a.totals.initialAdded) }}</dd></div>
 <div><dt>Надходження</dt><dd>{{ money(a.totals.incoming) }}</dd></div><div><dt>Виплати</dt><dd>{{ money(a.totals.outgoing) }}</dd></div>
 <div v-if="nonzero(a.totals.transferIn) || nonzero(a.totals.transferOut)"><dt>Передачі: отримано / відправлено</dt><dd>{{ money(a.totals.transferIn) }} / {{ money(a.totals.transferOut) }}</dd></div>
 <div v-if="nonzero(a.totals.reversalIn) || nonzero(a.totals.reversalOut)"><dt>Сторно: повернуто / списано</dt><dd>{{ money(a.totals.reversalIn) }} / {{ money(a.totals.reversalOut) }}</dd></div>
 <div class="closing"><dt>На кінець, грн</dt><dd>{{ money(a.totals.closing) }}</dd></div>
 </dl><details><summary>Склад руху за період</summary><p v-if="!a.movements.length">Руху не було.</p><ul v-else><li v-for="(m, index) in a.movements" :key="index"><span>{{ m.bucket === 'REVERSAL' ? 'Сторно: ' : '' }}{{ categories[m.category] || m.category }}</span><b>{{ m.direction === 'IN' ? '+' : '−' }}{{ money(m.amount) }}</b></li></ul></details></article></div>
 <p class="hint">Історичні проводки без прив’язки до каси не включено. Зарахування авансу в оплату та нарахування боргу за рахунком не є рухом коштів. Оплати клієнтів філій посередника обліковуються окремо.</p>
 </template>
</section>
</template>
<style scoped>
.cash-flow{display:grid;gap:12px;min-width:0}.cash-flow h3,.cash-flow h4{margin:4px 0}.cash-flow p{margin:6px 0;line-height:1.5}.filters{display:flex;flex-wrap:wrap;gap:12px;align-items:end}.filters label{display:grid;gap:5px;flex:1 1 160px;min-width:0}fieldset{border:0;padding:0;margin:0;min-width:0}input{width:100%;min-width:0;box-sizing:border-box;min-height:44px;padding:9px;border:1px solid #bac7d5;border-radius:7px}button{min-height:44px;padding:8px 14px;border:1px solid #bac7d5;border-radius:7px;background:#edf4ff;color:#163b65;cursor:pointer}button:disabled{opacity:.5}.summary,.accounts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px}.summary article,.accounts article{min-width:0;padding:14px;border:1px solid #dce3ec;border-radius:10px;overflow-wrap:anywhere}.summary strong{display:block;font-size:1.35rem;margin:7px 0}.balance{background:#eff7f1}.hint,small{color:#52657c}.warning{padding:10px;background:#fff4d6;border-radius:8px}.error{color:#a51d2d}dl{margin:12px 0}dl>div{display:flex;justify-content:space-between;gap:12px;padding:7px 0}dt{min-width:0}dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}.closing{border-top:1px solid #dce3ec;font-weight:700}.cash-flow summary{cursor:pointer;min-height:40px}.cash-flow ul{padding:0;list-style:none}.cash-flow li{display:flex;justify-content:space-between;gap:12px;margin:10px 0}.cash-flow li b{white-space:nowrap}@media(max-width:600px){.summary,.accounts{grid-template-columns:1fr}.filters button{width:100%}}
</style>
