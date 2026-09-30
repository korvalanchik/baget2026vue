<script setup>
import { ref } from 'vue'
import CrmDesk from './CrmDesk.vue'
import CustomerFinancePanel from './CustomerFinancePanel.vue'
defineProps({ session: { type: Object, required: true } })
const selected = ref(null), busy = ref(false)
</script>
<template>
  <section class="customers-page">
    <CrmDesk v-show="!selected" :session="session" @finance="selected = $event" />
    <template v-if="selected"><button type="button" :disabled="busy" @click="selected = null">← До клієнтів</button>
      <CustomerFinancePanel :key="`${selected.customerId || selected.custNo || selected.id}-${selected.branchNo}`" :session="session" :customer-id="Number(selected.customerId || selected.custNo || selected.id)" :branch-no="Number(selected.branchNo || session.branch.id)" @busy="busy = $event" />
    </template>
  </section>
</template>
