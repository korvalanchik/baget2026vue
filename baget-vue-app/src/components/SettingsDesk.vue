<script setup>
import { computed, ref } from 'vue'
import DeskLayout from './DeskLayout.vue'
import UserAdministration from './UserAdministration.vue'
import CommercialDesk from './CommercialDesk.vue'
import RewardsDesk from './RewardsDesk.vue'
import CostUpdateDesk from './CostUpdateDesk.vue'
import WorkPricesDesk from './WorkPricesDesk.vue'
import CashDesk from './CashDesk.vue'
import TelegramSettings from './TelegramSettings.vue'
import BackupSettings from './BackupSettings.vue'
import LeadTimeSettings from './LeadTimeSettings.vue'
import PrroSettings from './PrroSettings.vue'
import BranchAdministration from './BranchAdministration.vue'
import CompanyDetailsAdministration from './CompanyDetailsAdministration.vue'
const props = defineProps({ session: { type: Object, required: true } })
const active = ref('branches')
const tabs = computed(() => {
  const items = [{ id: 'backups', label: 'Резервні копії' }, { id: 'telegram', label: 'Telegram' }, { id: 'deadlines', label: 'Строки виконання' }, { id: 'branches', label: 'Філії та прайси' }, { id: 'cash', label: 'Каси та рахунки' }, { id: 'rewards', label: 'Відсотки винагород' }, { id: 'cost', label: 'Собівартість матеріалів' }, { id: 'work-prices', label: 'Ціни робіт' }, { id: 'users', label: 'Користувачі та доступ' }, { id: 'prro', label: 'Налаштування ПРРО' }]
  if (props.session.roles?.includes('ROLE_ADMIN')) items.splice(4, 0, { id: 'branch-admin', label: 'Керування філіями' }, { id: 'company-details', label: 'Реквізити підприємства' })
  return items
})
const components = { backups: BackupSettings, telegram: TelegramSettings, deadlines: LeadTimeSettings, branches: CommercialDesk, 'branch-admin': BranchAdministration, 'company-details': CompanyDetailsAdministration, cash: CashDesk, rewards: RewardsDesk, cost: CostUpdateDesk, 'work-prices': WorkPricesDesk, users: UserAdministration, prro: PrroSettings }
</script>
<template><DeskLayout title="Налаштування" description="Параметри підприємства, кас, винагород і доступу." :tabs="tabs" v-model="active"><KeepAlive><component :is="components[active]" :key="active" :session="session" v-bind="active === 'rewards' || active === 'cash' ? { settingsOnly: true } : {}" /></KeepAlive></DeskLayout></template>
