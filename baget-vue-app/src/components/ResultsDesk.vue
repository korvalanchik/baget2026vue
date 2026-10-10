<script setup>
import { ref } from 'vue'
import DeskTabs from './DeskTabs.vue'
import OwnerResultsDesk from './OwnerResultsDesk.vue'
import PartnerResultsDesk from './PartnerResultsDesk.vue'
import CashReceiptsDesk from './CashReceiptsDesk.vue'
defineProps({ session: { type: Object, required: true } })
const tab = ref('own')
const tabs = [{ id: 'own', label: 'Власні філії' }, { id: 'partner', label: 'Фірми-посередники' }, { id: 'cash', label: 'Надходження від клієнтів' }]
const components = { own: OwnerResultsDesk, partner: PartnerResultsDesk, cash: CashReceiptsDesk }
</script>
<template><section class="reports"><h2>Звіти</h2><DeskTabs :tabs="tabs" v-model="tab" label="Види звітів" /><KeepAlive><component :is="components[tab]" :key="tab" :session="session" /></KeepAlive></section></template>
<style scoped>.reports :deep(>section){padding:0;margin:0;max-width:none}.reports h2{margin-top:0}</style>
