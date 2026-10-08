<script setup>
import { computed } from 'vue'
import { workshopSpecification, materialWarnings, numberText } from '../calculation/workshopDocument.js'
const props = defineProps({ product: { type: Object, required: true }, header: { type: Object, default: () => ({}) }, dirty: Boolean })
const spec = computed(() => workshopSpecification(props.product))
const warnings = computed(() => materialWarnings(props.product))
const day = value => value ? String(value).slice(0, 10).split('-').reverse().join('.') : 'Не вказана'
</script>
<template>
 <section class="work-overview">
  <div class="order-meta"><span>Філія: <b>{{ header.branchName || 'Не вказана' }}</b></span><span>Готовність: <b>{{ day(header.shipDate || header.dueDate) }}</b></span></div>
  <div class="sizes"><section><h5>Розміри від філії</h5><p v-for="(s,i) in spec.dimensions" :key="i"><strong>{{ numberText(s.widthMm) }} × {{ numberText(s.heightMm) }} мм</strong><span>{{ s.label }} · {{ numberText(s.quantity) }} шт</span></p><p v-if="!spec.dimensions.length">Не збережено в конфігурації</p></section><section><h5>{{ dirty ? 'Обмір у формі · не збережено' : 'Збережений обмір' }}</h5><p><strong>{{ numberText(product.widthMm) }} × {{ numberText(product.heightMm) }} мм</strong><span>Розміри роботи без полів паспарту</span></p></section></div>
  <dl><div v-for="r in spec.rows" :key="r.label"><dt>{{ r.label }}</dt><dd>{{ r.value }}</dd></div></dl>
  <div class="notes"><p><b>Примітка до замовлення:</b> {{ header.notice || '—' }}</p><p><b>Вказівки менеджера до виробу:</b> {{ spec.managerNote || '—' }}</p><p v-if="product.note"><b>Примітка майстра{{ dirty ? ' (у формі)' : '' }}:</b> {{ product.note }}</p></div>
  <div v-if="warnings.length" class="warnings"><b>Матеріали за останнім збереженням</b><p v-for="w in warnings" :key="w">{{ w }}</p></div>
  <p v-if="product.rework?.active" class="warnings">Відкрите доопрацювання. Додаткові витрати ведуться в окремій формі нижче.</p>
 </section>
</template>
<style scoped>
.work-overview{margin:14px 0;min-width:0}.order-meta{display:flex;flex-wrap:wrap;gap:8px 24px;color:#334b5c}.sizes{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}.sizes section{padding:12px;background:#eef5f7;border-radius:8px}.sizes h5{font-size:13px;margin:0 0 8px}.sizes p{margin:6px 0}.sizes strong{font-size:17px;color:#1d3e50}.sizes span{display:block;font-size:12px;color:#526571;margin-top:5px}dl{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;margin:12px 0}dl>div{display:grid;grid-template-columns:110px 1fr;gap:8px;min-width:0}dt{color:#526571}dd{margin:0;color:#233442;overflow-wrap:anywhere}.notes{border-left:3px solid #bccdd5;padding:2px 12px}.notes p{white-space:pre-wrap;overflow-wrap:anywhere;margin:7px 0}.warnings{background:#fff4df;color:#674d17;padding:10px 12px;border-radius:8px;margin:12px 0}.warnings p{margin:4px 0}@media(max-width:650px){.sizes,dl{grid-template-columns:1fr}dl>div{grid-template-columns:105px minmax(0,1fr)}}
</style>
