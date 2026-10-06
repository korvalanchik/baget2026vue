<script setup>
import SettingsSection from './SettingsSection.vue'
import CommercialDesk from './CommercialDesk.vue'
import RewardsDesk from './RewardsDesk.vue'
import CostUpdateDesk from './CostUpdateDesk.vue'
defineProps({ session: { type: Object, required: true } })
</script>
<template>
 <section class="settings-desk">
  <header><h1>Налаштування</h1><p>Оберіть розділ, щоб переглянути або змінити його параметри.</p></header>
  <div class="sections">
   <SettingsSection title="Філії та ціноутворення" description="Тип філії, фірма-посередник і правила вибору прайсів для нових замовлень."><CommercialDesk :session="session" /></SettingsSection>
   <SettingsSection title="Винагороди менеджерів" description="Увімкнення нарахувань, загальний відсоток і персональні ставки менеджерів."><RewardsDesk :session="session" settings-only /></SettingsSection>
   <SettingsSection title="Розрахункова собівартість матеріалів" description="Накладні витрати, перегляд і підтвердження оновлення Parts.Cost. Доступно адміністратору."><CostUpdateDesk :session="session" /></SettingsSection>
  </div>
 </section>
</template>
<style scoped>
.settings-desk{max-width:1100px;margin:auto;padding:24px;color:#233442}.settings-desk>header{margin-bottom:20px}h1{font-size:26px;margin:0 0 8px}p{font-size:14px;color:#617580;line-height:1.5;margin:0}.sections{display:grid;gap:14px;align-items:start}@media(max-width:650px){.settings-desk{padding:12px}h1{font-size:22px}.sections{gap:10px}}
</style>
