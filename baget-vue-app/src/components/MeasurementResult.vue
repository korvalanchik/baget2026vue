<script setup>
defineProps({ result: { type: Object, default: null }, stale: Boolean })
const units = { METER: 'м', SQUARE_METER: 'м²', PIECE: 'шт' }
</script>
<template>
 <aside v-if="result" class="measurement-result">
  <strong>Розрахунок за обміром {{ result.widthMm }} × {{ result.heightMm }} мм</strong>
  <p>Розмір із полями паспарту: {{ result.outerWidthMm }} × {{ result.outerHeightMm }} мм · Екземплярів: {{ result.productQuantity }}</p>
  <p v-if="stale" role="alert">Обмір змінено після розрахунку. Перерахуйте витрати перед збереженням.</p>
  <p v-for="(w, i) in result.warnings" :key="i">{{ w }}</p>
  <p v-if="result.canApply">Кількість і розміри перенесено в робочу таблицю. Перевірте їх, внесіть фактичні відхилення та збережіть.</p>
  <details :open="!result.canApply"><summary>Розміри та витрата за позиціями</summary>
   <div v-for="(l, i) in result.lines" :key="i"><strong>{{ l.description }}</strong>: {{ l.quantity }} {{ units[l.unit] || l.unit }}
    <span v-if="l.widthMm != null && l.heightMm != null"> · {{ l.widthMm }} × {{ l.heightMm }} мм</span><p>{{ l.note }}</p>
    <p v-for="(s, si) in l.segmentsPerProduct" :key="si">Перемичка {{ s.direction === 'ALONG_WIDTH' ? 'по ширині' : 'по висоті' }}: {{ s.lengthMm }} мм на екземпляр.</p>
   </div>
  </details>
 </aside>
</template>
<style scoped>
.measurement-result{border-left:3px solid #4f7b9f;background:#f3f7fa;padding:12px;margin:14px 0;font-size:13px}.measurement-result p{margin:7px 0;line-height:1.5}.measurement-result details>div{padding:8px 0;border-bottom:1px solid #dbe3e9}[role=alert]{color:#a22}
</style>
