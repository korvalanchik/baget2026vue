<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import ProductWorkshopCard from './ProductWorkshopCard.vue'
import { loadWorkshopOrders, loadWorkshopOrder, saveWorkshopOrder, workshopColumns, millimeters, urgency } from '../services/workshop.js'

const props = defineProps({ session: { type: Object, required: true } })
const orders = ref([])
const productionDirty = ref(false)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const detailError = ref('')
const notice = ref('')
const search = ref('')
const branch = ref('')
const urgentOnly = ref(false)
const sort = ref('deadline')
const selected = ref(null)
const draft = ref(null)
const extra = ref(true)
const dialog = ref(null)
const discard = ref(false)
const opening = ref(false)
const canChooseBranch = computed(() => props.session.roles.some(role => ['ROLE_ADMIN', 'ROLE_FOREMAN'].includes(role)))
const scoped = computed(() => orders.value.filter(order => canChooseBranch.value || order.branchName === props.session.branch.name))
const branches = computed(() => [...new Set(scoped.value.map(order => order.branchName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'uk')))
const filtered = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('uk-UA')
  return scoped.value.filter(order => (!branch.value || order.branchName === branch.value)
    && (!urgentOnly.value || urgency(order))
    && (!query || [order.orderNo, order.company, order.mobile, order.branchName].some(value => String(value ?? '').toLocaleLowerCase('uk-UA').includes(query))))
    .sort((a, b) => {
      const date = order => {
        const value = new Date((sort.value === 'deadline' ? order.shipDate || order.saleDate : order.saleDate) || '').getTime()
        return Number.isFinite(value) ? value : Infinity
      }
      return date(a) - date(b) || String(a.orderNo).localeCompare(String(b.orderNo), undefined, { numeric: true })
    })
})
const columns = computed(() => workshopColumns.map(column => ({ ...column, orders: filtered.value.filter(order => column.statuses.includes(order.statusOrder)) })))
const count = computed(() => columns.value.reduce((sum, column) => sum + column.orders.length, 0))
const editable = computed(() => [1, 2, 3].includes(Number(selected.value?.statusOrder)))
const dirty = computed(() => productionDirty.value || (selected.value && !selected.value.calculationRevision && JSON.stringify(toDraft(selected.value)) !== JSON.stringify(draft.value)))
const formatDate = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleDateString('uk-UA') : '—'
function toDraft(order) {
  return { statusOrder: Number(order.statusOrder), notice: order.notice || '', items: (order.items || []).map(item => ({ width: millimeters(item.width), height: millimeters(item.height) })) }
}
async function refresh() {
  if (loading.value) return
  loading.value = true; error.value = ''
  try { orders.value = await loadWorkshopOrders(props.session.token) }
  catch (reason) { error.value = reason.message }
  finally { loading.value = false }
}
async function open(order) {
  if (opening.value) return
  opening.value = true; error.value = ''; detailError.value = ''; notice.value = ''
  try {
    selected.value = await loadWorkshopOrder(props.session.token, order.orderNo)
    productionDirty.value = false; draft.value = toDraft(selected.value); extra.value = true; discard.value = false
    await nextTick(); dialog.value.showModal()
  } catch (reason) { error.value = reason.message; selected.value = null }
  finally { opening.value = false }
}
function close(force = false) {
  if (saving.value) return
  if (dirty.value && !force) { discard.value = true; return }
  dialog.value.close(); selected.value = null; draft.value = null
}
function copySizes() {
  const first = draft.value.items[0]
  if (!first || !(Number(first.width) > 0) || !(Number(first.height) > 0)) { detailError.value = 'Спочатку введіть ширину та висоту першої позиції.'; return }
  detailError.value = ''
  draft.value.items.forEach((item, index) => {
    const original = selected.value.items[index]
    if (index && original.estimationWidth != null && original.estimationHeight != null) {
      item.width = Number(first.width) + (extra.value ? 10 : 0)
      item.height = Number(first.height) + (extra.value ? 10 : 0)
    }
  })
}
async function save() {
  if (saving.value || !editable.value || selected.value?.calculationRevision) return
  detailError.value = ''
  if (draft.value.items.some(item => [item.width, item.height].some(value => value !== '' && (!Number.isFinite(Number(value)) || Number(value) <= 0)))) {
    detailError.value = 'Розміри мають бути додатними числами або порожніми.'; return
  }
  saving.value = true
  const payload = { ...selected.value, statusOrder: draft.value.statusOrder, notice: draft.value.notice,
    items: (selected.value.items || []).map((item, index) => ({ ...item,
      width: draft.value.items[index].width === '' ? null : Number(draft.value.items[index].width) / 1000,
      height: draft.value.items[index].height === '' ? null : Number(draft.value.items[index].height) / 1000,
    })) }
  try {
    await saveWorkshopOrder(props.session.token, payload)
    orders.value = orders.value.map(order => String(order.orderNo) === String(payload.orderNo) ? { ...order, statusOrder: payload.statusOrder, notice: payload.notice } : order)
    notice.value = `Замовлення №${payload.orderNo} збережено.`
    saving.value = false; close(true)
  } catch (reason) { detailError.value = reason.message }
  finally { saving.value = false }
}
function productionChanged(data) {
  selected.value.statusOrder = data.status
  orders.value = orders.value.map(o => String(o.orderNo) === String(data.orderNo) ? { ...o, statusOrder: data.status } : o)
}
onMounted(refresh)
</script>

<template>
  <section class="workshop-page">
    <header class="page-head"><div><div class="crumb">Виробництво <span>/</span> Дошка замовлень</div><h1>Майстерня</h1><p>Від першого виміру до готової роботи</p></div><button class="filter" :disabled="loading" @click="refresh">{{ loading ? 'Завантажуємо…' : '↻ Оновити' }}</button></header>
    <div class="workshop-content">
      <div class="workshop-tools">
        <label class="workshop-search">Пошук<input v-model="search" type="search" placeholder="№ замовлення, клієнт або телефон"></label>
        <label v-if="canChooseBranch">Філія<select v-model="branch"><option value="">Усі філії</option><option v-for="name in branches" :key="name">{{ name }}</option></select></label>
        <label>Спочатку<select v-model="sort"><option value="deadline">Найближчий термін</option><option value="oldest">Найстаріші замовлення</option></select></label>
        <label class="workshop-check"><input v-model="urgentOnly" type="checkbox"> Потребують уваги</label>
      </div>
      <p v-if="error" class="form-message" role="alert">{{ error }} <button class="table-button" :disabled="loading" @click="refresh">Повторити</button></p>
      <p v-if="notice" class="form-message success" role="status">{{ notice }}</p>
      <div class="workshop-caption"><span role="status">{{ loading ? 'Завантаження замовлень…' : `На дошці: ${count}` }}</span></div>
      <div class="workshop-board" :aria-busy="loading">
        <section v-for="column in columns" :key="column.id" class="workshop-column" :style="{ '--column-color': column.color }">
          <header><h2><i></i>{{ column.title }}</h2><b>{{ column.orders.length }}</b></header>
          <div class="workshop-cards">
            <button v-for="order in column.orders" :key="order.orderNo" class="workshop-task" :disabled="opening" @click="open(order)">
              <span class="task-heading"><strong>№ {{ order.orderNo }}</strong><span>↗</span></span>
              <span class="task-branch">{{ order.branchName || 'Філію не вказано' }}</span>
              <span class="task-customer">{{ order.company || 'Клієнта не вказано' }}</span>
              <span class="task-phone">{{ order.mobile || 'Телефон не вказано' }}</span>
              <span class="task-date">{{ order.shipDate ? 'Термін' : 'Прийнято' }}: {{ formatDate(order.shipDate || order.saleDate) }}</span>
              <span v-if="urgency(order)" class="task-urgent">{{ urgency(order) }}</span>
              <span v-if="order.statusOrder === 5" class="task-paid">Відмова клієнта</span>
            </button>
            <p v-if="!column.orders.length" class="workshop-empty">{{ loading ? 'Завантажуємо…' : search || branch || urgentOnly ? 'Немає збігів за фільтрами' : 'Замовлень поки немає' }}</p>
          </div>
        </section>
      </div>
      <p class="workshop-hint">Без дати готовності позначаємо замовлення віком понад 3 та 5 днів. Рахунки — у розділі «Рахунки за виробами», приймання та видача — у розділі «Замовлення».</p>
    </div>
    <dialog ref="dialog" class="workshop-dialog" aria-labelledby="workshop-title" @cancel.prevent="close()">
      <form v-if="selected && draft" @submit.prevent="save">
        <header><div><p>Картка виробництва</p><h2 id="workshop-title">Замовлення № {{ selected.orderNo }}</h2></div><button type="button" class="icon-button" aria-label="Закрити" :disabled="saving" @click="close()">×</button></header>
        <div class="workshop-details"><span>Філія<strong>{{ selected.branchName || '—' }}</strong></span><span>Клієнт<strong>{{ selected.company || '—' }}</strong></span><span>Прийнято<strong>{{ formatDate(selected.saleDate) }}</strong></span><span>Термін<strong>{{ formatDate(selected.shipDate) }}</strong></span></div>
        <ProductWorkshopCard v-if="selected.calculationRevision" :session="session" :order-no="Number(selected.orderNo)" @dirty="productionDirty = $event" @busy="saving = $event" @changed="productionChanged" />
        <template v-else>
        <fieldset :disabled="saving || !editable"><legend>Статус виробництва</legend><div class="workshop-statuses"><label v-for="status in [{ id: 1, name: 'Треба зробити' }, { id: 2, name: 'В роботі' }, { id: 3, name: 'Зроблено' }, ...(Number(selected.statusOrder) === 6 ? [{ id: 6, name: 'Пораховано' }] : [])]" :key="status.id"><input v-model="draft.statusOrder" type="radio" :value="status.id">{{ status.name }}</label></div></fieldset>
        <h3>Позиції замовлення <small>Розміри в мм</small></h3>
        <div class="workshop-table"><table><thead><tr><th>Опис / артикул</th><th>Орієнтовний розмір</th><th>К-сть</th><th>Ширина, мм</th><th>Висота, мм</th></tr></thead><tbody><tr v-for="(item, index) in selected.items || []" :key="item.itemNo || index"><td>{{ item.description || item.partNo || '—' }}</td><td>{{ millimeters(item.estimationWidth) || '—' }} × {{ millimeters(item.estimationHeight) || '—' }}</td><td>{{ item.quantity ?? '—' }}</td><td><input v-model="draft.items[index].width" :aria-label="`Ширина позиції ${index + 1}, мм`" type="number" min="0.001" step="any" :disabled="saving || !editable"></td><td><input v-model="draft.items[index].height" :aria-label="`Висота позиції ${index + 1}, мм`" type="number" min="0.001" step="any" :disabled="saving || !editable"></td></tr><tr v-if="!selected.items?.length"><td colspan="5">Позицій немає</td></tr></tbody></table></div>
        <div v-if="editable && draft.items.length > 1" class="workshop-copy"><label><input v-model="extra" type="checkbox" :disabled="saving"> Видима частина: +10 мм</label><button type="button" class="table-button" :disabled="saving" @click="copySizes">Розміри першої → інші позиції</button><small>Копіюємо лише в позиції з орієнтовною шириною та висотою.</small></div>
        <label class="workshop-note">Доповнення<textarea v-model="draft.notice" rows="3" :disabled="saving || !editable"></textarea></label>
        <p v-if="!editable" class="workshop-hint">Замовлення вже пораховано. Виробничі дані доступні для перегляду.</p>
        </template>
        <p v-if="detailError" class="form-message" role="alert">{{ detailError }}</p>
        <div v-if="discard" class="workshop-discard" role="alert">Є незбережені зміни.<button type="button" class="table-button" @click="discard = false">Продовжити редагування</button><button type="button" class="table-button" @click="close(true)">Відкинути зміни</button></div>
        <footer><button type="button" class="filter" :disabled="saving" @click="close()">Закрити</button><button v-if="editable && !selected.calculationRevision" class="primary" :disabled="saving || !dirty">{{ saving ? 'Зберігаємо…' : 'Зберегти зміни' }}</button></footer>
      </form>
    </dialog>
  </section>
</template>

<style scoped>
.workshop-content{margin:0 36px 32px}.workshop-tools{display:flex;align-items:end;gap:14px;flex-wrap:wrap;background:#fff;border:1px solid #e5e9ee;border-radius:10px;padding:16px}.workshop-tools>label{display:grid;gap:7px;font-size:11px;color:#68788b}.workshop-search{flex:1;min-width:200px}input,select,textarea{font:inherit;color:inherit}input:not([type=checkbox],[type=radio]),select,textarea{border:1px solid #dfe5eb;border-radius:6px;padding:9px;background:#fff;min-width:0}input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible{outline:2px solid #cf943f;outline-offset:3px}.workshop-tools .workshop-check{display:flex;align-items:center;min-height:36px}.workshop-caption{display:flex;justify-content:space-between;align-items:center;margin:22px 0 12px;font-size:12px;color:#79899c}.workshop-caption button{margin:0}.workshop-board{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(235px,1fr);gap:16px;overflow-x:auto;padding-bottom:12px;align-items:start}.workshop-column{background:#edf0f5;border:1px solid #e5e9ee;border-radius:10px;min-height:300px}.workshop-column>header{display:flex;justify-content:space-between;align-items:center;padding:17px 14px}.workshop-column h2{font-size:13px;margin:0;display:flex;gap:8px;align-items:center}.workshop-column h2 i{height:8px;width:8px;border-radius:50%;background:var(--column-color)}.workshop-column header b{background:#fff;padding:3px 7px;border-radius:6px;font-size:11px;color:#7d8999}.workshop-cards{display:grid;gap:10px;padding:0 10px 12px}.workshop-task{display:grid;gap:7px;width:100%;text-align:left;background:#fff;border:1px solid #e0e5ec;border-radius:8px;padding:15px;color:#364961;transition:box-shadow .15s,transform .15s}.workshop-task:hover{box-shadow:0 4px 14px #1c304b12;transform:translateY(-1px)}.task-heading{display:flex;justify-content:space-between;font-size:14px}.task-heading>span,.task-branch,.task-phone{color:#8a97a7;font-size:11px}.task-customer{font-size:12px;font-weight:700;margin-top:8px;overflow-wrap:anywhere}.task-date{border-top:1px solid #edf0f4;padding-top:10px;margin-top:5px;font-size:10px;color:#7a899b}.task-urgent,.task-paid{font-size:10px;border-radius:4px;padding:4px 6px;width:fit-content}.task-urgent{background:#fff0e4;color:#a85a2e}.task-paid{background:#eaf5ed;color:#4d8764}.workshop-empty{padding:30px 10px;text-align:center;color:#8b97a7;font-size:11px}.workshop-hint{font-size:11px;color:#7e8c9e;line-height:1.7}.workshop-dialog{border:0;border-radius:12px;padding:24px;width:min(900px,calc(100% - 24px));max-height:90vh;color:#35475e}.workshop-dialog::backdrop{background:#18283f70}.workshop-dialog header{display:flex;justify-content:space-between;align-items:center}.workshop-dialog h2{font-size:20px;margin:0}.workshop-dialog header p{font-size:11px;color:#8491a2;margin:0 0 5px}.workshop-details{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:22px 0;font-size:11px;color:#8995a4}.workshop-details strong{display:block;color:#35475e;margin-top:6px;overflow-wrap:anywhere}.workshop-dialog fieldset{border:0;padding:0;margin:0 0 22px}.workshop-dialog legend,.workshop-note{font-size:12px;font-weight:700}.workshop-statuses{display:flex;flex-wrap:wrap;gap:12px;margin-top:10px;font-size:12px}.workshop-statuses label{display:flex;align-items:center;gap:4px}.workshop-dialog h3{font-size:13px}.workshop-dialog h3 small{font-weight:400;color:#8491a2;margin-left:10px}.workshop-table{overflow:auto}.workshop-table table{border-collapse:collapse;width:100%;font-size:11px}.workshop-table th,.workshop-table td{padding:10px 8px;border-bottom:1px solid #e5e9ee;text-align:left}.workshop-table th{background:#f7f8fb;white-space:nowrap;font-size:10px}.workshop-table input{width:100px}.workshop-copy{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:16px 0;font-size:11px}.workshop-copy small{width:100%;color:#8491a2}.workshop-note{display:grid;gap:8px;margin-top:20px}.workshop-note textarea{resize:vertical;font-weight:400}.workshop-dialog footer{display:flex;gap:10px;justify-content:end;margin-top:20px}.workshop-discard{background:#fff4e7;padding:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:12px}button:disabled{cursor:wait;opacity:.55}@media(max-width:750px){.workshop-content{margin:0 18px 24px}.workshop-details{grid-template-columns:repeat(2,1fr)}.workshop-tools>label{width:100%}.workshop-dialog{padding:16px}.workshop-board{grid-auto-columns:minmax(260px,85vw)}}
</style>
