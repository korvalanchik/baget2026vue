<script setup>
import { ref } from 'vue'
import { warehouse } from '../services/warehouse.js'
const props = defineProps({ session: { type: Object, required: true }, productId: { type: Number, required: true } })
const data = ref(null), busy = ref(false), error = ref('')
const money = value => value == null ? 'Не визначено' : Number(value).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
const units = { METER: 'м', SQUARE_METER: 'м²', PIECE: 'шт.' }
async function load() { if (busy.value) return; busy.value = true; error.value = ''; try { data.value = await warehouse(props.session.token, `/products/${props.productId}/consumption-cost`) } catch (e) { data.value = null; error.value = e.message } finally { busy.value = false } }
function toggle(event) { if (event.target.open && !data.value) load() }
</script>
<template>
 <details class="consumption-cost" @toggle="toggle"><summary>Закупівельна вартість списаних матеріалів</summary>
  <p>За складською собівартістю на момент списання. Без накладних витрат майстерні та вартості робіт. Додаткові витрати доопрацювань включено.</p>
  <button :disabled="busy" @click="load">Оновити дані</button><p v-if="busy">Завантаження…</p><p v-if="error" role="alert">{{ error }}</p>
  <template v-if="data"><p v-if="!data.rows.length">Зафіксованих списань матеріалів немає.</p>
   <template v-else><p><strong>Загальна закупівельна вартість: {{ money(data.total) }}{{ data.total == null ? '' : ' грн' }}</strong></p><p v-if="data.unknownCount">Вартість не визначено для {{ data.unknownCount }} позицій. Відома частина: {{ money(data.knownTotal) }} грн. Старі списання не переоцінюються за поточними цінами.</p></template>
   <article v-for="row in data.rows" :key="row.itemNo"><strong>{{ row.partNo }} · {{ row.description }}</strong><p>{{ money(row.quantity) }} {{ units[row.unit] || row.unit }} × {{ money(row.unitCost) }} → {{ money(row.amount) }} грн</p><small>Замовлення № {{ row.orderNo }} · позиція {{ row.itemNo }} · {{ row.consumedAt }}<span v-if="row.reworkId"> · доопрацювання № {{ row.reworkId }}</span></small></article>
  </template>
 </details>
</template>
<style scoped>
.consumption-cost{margin:14px 0;padding:12px;border:1px solid #ccd5dd;border-radius:8px;overflow-wrap:anywhere}.consumption-cost summary{cursor:pointer;font-weight:600}.consumption-cost article{padding:10px 0;border-top:1px solid #dde4e8}.consumption-cost button{font:inherit;padding:10px;border:1px solid #ccd5dd;border-radius:6px;min-height:44px}.consumption-cost [role=alert]{color:#a22}
</style>
