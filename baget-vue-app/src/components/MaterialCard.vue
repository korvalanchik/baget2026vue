<script setup>
import MaterialCountUnits from './MaterialCountUnits.vue'
import OpeningMaterialCost from './OpeningMaterialCost.vue'
const openingCostOpen = unitRef(false)
import { ref as unitRef } from 'vue'
const unitSettingsOpen = unitRef(false)
import { ref, watch } from 'vue'
import { warehouse } from '../services/warehouse.js'
import { movementNames, reserveReasons, quantityText as fmt, cardCsv } from '../calculation/materialCard.js'
const props = defineProps({ session: { type: Object, required: true }, partNo: { type: Number, required: true } })
const emit = defineEmits(['document'])
const card = ref(null), error = ref(''), busy = ref(false), page = ref(0), from = ref(''), to = ref(''), type = ref('ALL')
const order = ref(null), orderBusy = ref(false)
let generation = 0
async function openOrder(id) {
  if (orderBusy.value) return
  orderBusy.value = true; error.value = ''; order.value = null
  try { order.value = { id, lines: await warehouse(props.session.token, `/materials/${props.partNo}/orders/${id}`) } }
  catch (e) { error.value = e.message } finally { orderBusy.value = false }
}
async function load(reset = false) {
  if (reset) page.value = 0
  const current = ++generation
  busy.value = true; error.value = ''; card.value = null
  try {
    const query = new URLSearchParams({ page: String(page.value), type: type.value })
    if (from.value) query.set('from', from.value)
    if (to.value) query.set('to', to.value)
    const result = await warehouse(props.session.token, `/materials/${props.partNo}/card?${query}`)
    if (current === generation) card.value = result
  } catch (e) { if (current === generation) error.value = e.message } finally { if (current === generation) busy.value = false }
}
function turn(delta) { page.value += delta; load() }
function csv() {
  const url = URL.createObjectURL(new Blob([cardCsv(card.value.events)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = `material-${props.partNo}-page-${page.value + 1}.csv`; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
watch(() => props.partNo, () => load(true), { immediate: true })
</script>
<template>
  <section class="card">
    <h3>Картка руху матеріалу</h3>
    <p>Залишки та резерви — на момент завантаження. Період фільтрує тільки історію. Події показано від нових до старих; записи з однаковим часом не визначають порядок виконання.</p>
    <div class="controls">
      <label>Від<input v-model="from" type="date" :disabled="busy"></label>
      <label>До включно<input v-model="to" type="date" :disabled="busy"></label>
      <label>Операція<select v-model="type" :disabled="busy"><option value="ALL">Усі</option><option v-for="(name, key) in movementNames" :key="key" :value="key">{{ name }}</option></select></label>
      <button :disabled="busy" @click="load(true)">Оновити</button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="busy">Завантаження…</p>
    <details v-if="session.roles?.includes('ROLE_ADMIN')" @toggle="openingCostOpen=$event.target.open"><summary>Початкова складська собівартість</summary><OpeningMaterialCost v-if="openingCostOpen" :key="partNo" :session="session" :part-no="Number(partNo)" @saved="load()" /></details>
    <template v-if="card"><p><strong>Складська закупівельна собівартість: {{ fmt(card.inventoryUnitCost) }} грн/{{ {METER:'м',SQUARE_METER:'м²',PIECE:'шт'}[card.unit] }}</strong></p>
      <details @toggle="unitSettingsOpen=$event.target.open"><summary>Одиниці підрахунку: рейки, листи, упаковки</summary><MaterialCountUnits v-if="unitSettingsOpen" :key="partNo" :session="session" :part-no="Number(partNo)" :unit="card.unit" settings-only /></details>
      <dl><div v-for="(name, key) in { onHand: 'Фізичний залишок', reserved: 'Резерв', available: 'Вільно', demand: 'Потреба', shortage: 'Незабезпечена потреба', expected: 'Очікується від постачальників' }" :key="key"><dt>{{ name }}</dt><dd>{{ fmt(card[key]) }} {{ { METER: 'м', SQUARE_METER: 'м²', PIECE: 'шт' }[card.unit] }}</dd></div></dl>
      <p>«Невідомо» означає, що залишок не був зафіксований. Історія показує лише записані операції, без відновлення старих залишків. Зміни резервів не є фізичним рухом матеріалу.</p>
      <details><summary>Активні резерви ({{ card.reservations.length }})</summary>
        <p v-for="r in card.reservations" :key="r.productId"><button :disabled="orderBusy" @click="openOrder(r.orderNo)">Замовлення № {{ r.orderNo }}</button> · <button @click="emit('document', { kind: 'product', id: r.productId })">Виріб № {{ r.productId }}</button>: потреба {{ fmt(r.demand) }}, резерв {{ fmt(r.reserved) }}</p>
      </details>
      <details><summary>Очікувані поставки ({{ card.incoming.length }})</summary>
        <p v-for="r in card.incoming" :key="r.supplierOrderId"><button @click="emit('document', { kind: 'supplier', id: r.supplierOrderId })">Постачання № {{ r.supplierOrderId }}</button> · {{ fmt(r.quantity) }} · {{ r.expectedDate || 'Дата не визначена' }}</p>
      </details>
      <button :disabled="!card.events.length" @click="csv">CSV поточної сторінки</button>
      <p v-if="!card.events.length">За цими умовами записів немає.</p>
      <aside v-if="order">
        <h4>Матеріал у замовленні № {{ order.id }}</h4>
        <button @click="order = null">Закрити замовлення</button>
        <p v-if="!order.lines.length">Збережених позицій цього матеріалу в замовленні немає.</p>
        <p v-for="line in order.lines" :key="line.itemNo">Позиція {{ line.itemNo }} · План {{ fmt(line.planned) }} · Факт {{ fmt(line.actual) }}
          <span v-if="line.widthMm != null && line.heightMm != null"> · {{ fmt(line.widthMm) }} × {{ fmt(line.heightMm) }} мм</span>
          <button v-if="line.productId" @click="emit('document', { kind: 'product', id: line.productId })">Виріб № {{ line.productId }}</button>
          <span v-if="line.reworkId"> · Переробка № {{ line.reworkId }}</span>
        </p>
      </aside>
      <ol class="events">
        <li v-for="e in card.events" :key="e.eventKey">
          <strong>{{ movementNames[e.type] || e.type }}</strong> · {{ e.createdAt }} · {{ e.actor }}
          <p>{{ e.type === 'RESERVATION' ? 'Резерв' : 'Залишок' }}: {{ fmt(e.stockBefore) }} → {{ fmt(e.stockAfter) }} · Зміна: {{ fmt(e.delta) }}</p>
          <p v-if="e.note">{{ reserveReasons[e.note] || e.note }}</p>
          <div class="controls">
            <button v-if="e.orderNo" :disabled="orderBusy" @click="openOrder(e.orderNo)">Замовлення № {{ e.orderNo }}</button>
            <button v-if="e.productId" @click="emit('document', { kind: 'product', id: e.productId })">Виріб № {{ e.productId }}</button>
            <span v-if="e.reworkId">Переробка № {{ e.reworkId }}</span>
            <button v-if="e.stocktakeId" @click="emit('document', { kind: 'stocktake', id: e.stocktakeId })">Акт № {{ e.stocktakeId }}</button>
            <button v-if="e.supplierOrderId" @click="emit('document', { kind: 'supplier', id: e.supplierOrderId })">Постачання № {{ e.supplierOrderId }}</button>
            <span v-if="e.receiptNo">Накладна: {{ e.receiptNo }}</span>
          </div>
        </li>
      </ol>
      <div class="controls"><button :disabled="page === 0 || busy" @click="turn(-1)">Назад</button><span>Сторінка {{ page + 1 }}</span><button :disabled="!card.hasMore || busy" @click="turn(1)">Далі</button></div>
    </template>
  </section>
</template>
<style scoped>
.card{margin-top:24px;border-top:1px solid #ccd5dd;padding-top:16px}.controls{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin:12px 0}label{display:grid;gap:6px}input,select,button{font:inherit;padding:8px;border:1px solid #ccd5dd;border-radius:6px}button{cursor:pointer}button:disabled{opacity:.5}dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}dl div{background:#f2f6fa;padding:12px;border-radius:8px}dd{margin:8px 0 0;font-weight:bold}.events{list-style:none;padding:0}.events li{padding:14px 0;border-bottom:1px solid #ddd;overflow-wrap:anywhere}details{margin:12px 0}[role=alert]{color:#a22}
</style>
