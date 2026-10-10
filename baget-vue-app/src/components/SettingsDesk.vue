<script setup>
import { ref } from 'vue'
import DeskLayout from './DeskLayout.vue'
import UserAdministration from './UserAdministration.vue'
import CommercialDesk from './CommercialDesk.vue'
import RewardsDesk from './RewardsDesk.vue'
import CostUpdateDesk from './CostUpdateDesk.vue'
import CashDesk from './CashDesk.vue'
defineProps({ session: { type: Object, required: true } })
const active = ref('branches')
const tabs = [{ id: 'branches', label: 'Філії та прайси' }, { id: 'cash', label: 'Каси та рахунки' }, { id: 'rewards', label: 'Відсотки винагород' }, { id: 'cost', label: 'Собівартість' }, { id: 'users', label: 'Користувачі та доступ' }]
const components = { branches: CommercialDesk, cash: CashDesk, rewards: RewardsDesk, cost: CostUpdateDesk, users: UserAdministration }
</script>
<template><DeskLayout title="Налаштування" description="Параметри підприємства, кас, винагород і доступу користувачів." :tabs="tabs" v-model="active"><KeepAlive><component :is="components[active]" :key="active" :session="session" v-bind="active === 'rewards' || active === 'cash' ? { settingsOnly: true } : {}" /></KeepAlive></DeskLayout></template>
