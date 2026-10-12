<script setup>
import { computed, ref, watch } from 'vue'
import DeskLayout from './DeskLayout.vue'
import ManagementOverview from './ManagementOverview.vue'
import CashFlow from './CashFlow.vue'
import CashDayEnd from './CashDayEnd.vue'
import CashExpenses from './CashExpenses.vue'
import ReceiptPayments from './ReceiptPayments.vue'
import RewardsDesk from './RewardsDesk.vue'
import ResultsDesk from './ResultsDesk.vue'
import CashDifferences from './CashDifferences.vue'
import { financeTabs, isFinanceEditor } from '../services/financeNavigation.js'
const props = defineProps({ session: { type: Object, required: true }, initialTab: String, initialReceiptId: Number })
const tabs = computed(() => financeTabs(props.session))
const active = ref(tabs.value[0].id)
watch(() => props.initialTab, value => { if (tabs.value.some(t => t.id === value)) active.value = value }, { immediate: true })
const components = { overview: ManagementOverview, 'day-end': CashDayEnd, flow: CashFlow, expenses: CashExpenses, purchases: ReceiptPayments, rewards: RewardsDesk, reports: ResultsDesk, differences: CashDifferences }
</script>
<template><DeskLayout title="Фінанси" :description="isFinanceEditor(session) ? 'Рух коштів, виплати й фінансовий контроль підприємства.' : 'Ваші нарахування, виплати та залишок винагороди.'" :tabs="tabs" v-model="active"><KeepAlive><component :is="components[active]" :key="active" :session="session" v-bind="active === 'purchases' ? { receiptId: initialReceiptId } : {}" /></KeepAlive></DeskLayout></template>
